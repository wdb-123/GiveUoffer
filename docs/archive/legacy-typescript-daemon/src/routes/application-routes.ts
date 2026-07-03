import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerApplicationRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/applications", async (request) => {
    const authError = requirePermission(ctx, request, "applications.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.applicationStore.listApplications());
  });

  app.post<{
    Body: import("@ucareer/shared").CreateApplicationEventRequest;
  }>("/api/application-events", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok({
      event: await scope.stores.applicationStore.createApplicationEvent(request.body),
    });
  });

  app.post<{
    Body: import("@ucareer/shared").UpdateApplicationEventRequest;
  }>("/api/application-events/update", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok({
      event: await scope.stores.applicationStore.updateApplicationEvent(request.body),
    });
  });

  app.post<{
    Body: import("@ucareer/shared").DeleteApplicationEventRequest;
  }>("/api/application-events/delete", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok({
      deleted: await scope.stores.applicationStore.deleteApplicationEvent(request.body),
    });
  });
}
