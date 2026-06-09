import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

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
}
