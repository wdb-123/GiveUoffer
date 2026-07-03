import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { isInsideDir } from "../path-guards";
import { workspaceDataPath } from "../workspace-paths";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerResumeRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/resumes", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.resumeStore.listResumes());
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/resume", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const file = request.query.file || "";
    const resume = await scope.stores.resumeStore.getResume(file);
    if (!resume) return error("resume_not_found", `Resume not found: ${file}`);
    return ok(resume);
  });

  app.get<{
    Querystring: { resumeFile?: string };
  }>("/api/resumes/diagnostics", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.resumeStore.listDiagnosisReports(request.query.resumeFile));
  });

  app.post<{
    Body: import("@ucareer/shared").GenerateResumePreviewRequest;
  }>("/api/resumes/generate-preview", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const market = await scope.stores.marketStore.getRecruitmentMarket();
    return ok(await scope.stores.resumeStore.generatePreview(request.body, market.jobs));
  });

  app.post<{
    Body: import("@ucareer/shared").SaveGeneratedResumeRequest;
  }>("/api/resumes/save-generated", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.resumeStore.saveGeneratedResume(request.body));
  });

  app.post<{
    Body: import("@ucareer/shared").SaveResumeRequest;
  }>("/api/resumes/save", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.resumeStore.saveResume(request.body));
  });

  app.post<{
    Body: import("@ucareer/shared").ExportResumeRequest;
  }>("/api/resumes/export", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.services.resumeExportService.exportResume(request.body));
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/resumes/export-file", async (request, reply) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const file = basename(request.query.file || "");
    if (!isExportedResumeFile(file)) return error("invalid_export_file", "Invalid exported resume file");

    const outputDir = workspaceDataPath(scope.workspaceRoot, "resumeExports");
    const outputPath = resolve(outputDir, file);
    if (!isInsideDir(outputDir, outputPath)) return error("invalid_export_file", "Invalid exported resume path");

    const info = await stat(outputPath, { throwIfNoEntry: false });
    if (!info?.isFile()) return error("export_file_not_found", `Export file not found: ${file}`);

    reply
      .header("content-type", exportContentType(file))
      .header("content-length", String(info.size))
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file)}`);
    return reply.send(createReadStream(outputPath));
  });
}

function isExportedResumeFile(file: string): boolean {
  return Boolean(file)
    && !file.startsWith(".")
    && !/[\\/]/u.test(file)
    && /\.(md|html|pdf|docx)$/iu.test(file);
}

function exportContentType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "text/markdown; charset=utf-8";
  }
}
