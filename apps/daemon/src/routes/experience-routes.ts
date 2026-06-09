import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";

export function registerExperienceRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/experience-overview", async () => {
    return ok(await stores.experienceStore.getExperienceOverview());
  });

  app.post<{
    Body: import("@ucareer/shared").SaveExperienceMetadataInput;
  }>("/api/experience-metadata", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    return ok(await stores.experienceStore.saveExperienceMetadata(request.body));
  });
}
