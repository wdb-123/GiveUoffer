import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerExperienceRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/experience-overview", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.experienceStore.getExperienceOverview());
  });

  app.post<{
    Body: import("@ucareer/shared").SaveExperienceMetadataInput;
  }>("/api/experience-metadata", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.experienceStore.saveExperienceMetadata(request.body));
  });
}
