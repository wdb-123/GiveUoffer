import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { isInsideDir } from "../path-guards";

export function registerResumeRoutes(ctx: DaemonRouteContext): void {
  const { app, services, stores } = ctx;

  app.get("/api/resumes", async () => {
    return ok(await stores.resumeStore.listResumes());
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/resume", async (request) => {
    const file = request.query.file || "";
    const resume = await stores.resumeStore.getResume(file);
    if (!resume) return error("resume_not_found", `Resume not found: ${file}`);
    return ok(resume);
  });

  app.post<{
    Body: import("@ucareer/shared").GenerateResumePreviewRequest;
  }>("/api/resumes/generate-preview", async (request) => {
    const market = await stores.marketStore.getRecruitmentMarket();
    return ok(await stores.resumeStore.generatePreview(request.body, market.jobs));
  });

  app.post<{
    Body: import("@ucareer/shared").SaveGeneratedResumeRequest;
  }>("/api/resumes/save-generated", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    return ok(await stores.resumeStore.saveGeneratedResume(request.body));
  });

  app.post<{
    Body: import("@ucareer/shared").ExportResumeRequest;
  }>("/api/resumes/export", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    return ok(await services.resumeExportService.exportResume(request.body));
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/resumes/export-file", async (request, reply) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const file = basename(request.query.file || "");
    if (!isExportedResumeFile(file)) return error("invalid_export_file", "Invalid exported resume file");

    const outputDir = join(ctx.workspaceRoot, "workspace/ops/exports/resumes");
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
  return /^\d{2}-.+\.(md|html|pdf|docx)$/u.test(file);
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
