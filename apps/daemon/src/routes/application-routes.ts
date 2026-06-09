import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";

export function registerApplicationRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/applications", async () => {
    return ok(await stores.applicationStore.listApplications());
  });

  app.post<{
    Body: import("@ucareer/shared").CreateApplicationEventRequest;
  }>("/api/application-events", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    return ok({
      event: await stores.applicationStore.createApplicationEvent(request.body),
    });
  });

  app.post<{
    Body: import("@ucareer/shared").UpdateApplicationEventRequest;
  }>("/api/application-events/update", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    return ok({
      event: await stores.applicationStore.updateApplicationEvent(request.body),
    });
  });

  app.post<{
    Body: import("@ucareer/shared").DeleteApplicationEventRequest;
  }>("/api/application-events/delete", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    return ok({
      deleted: await stores.applicationStore.deleteApplicationEvent(request.body),
    });
  });
}
