import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerProfileRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/profile-overview", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.profileStore.getProfileOverview());
  });
}
