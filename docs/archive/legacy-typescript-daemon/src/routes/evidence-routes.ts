import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerEvidenceRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/evidence-requests", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.evidenceStore.listEvidenceRequests());
  });

  app.post<{
    Body: import("@ucareer/shared").FulfillEvidenceRequestInput;
  }>("/api/evidence-requests/fulfill", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.evidenceStore.fulfillEvidenceRequest(request.body));
  });

  app.post<{
    Body: import("@ucareer/shared").SaveEvidenceNoteInput;
  }>("/api/evidence-notes", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.evidenceStore.saveEvidenceNote(request.body));
  });
}
