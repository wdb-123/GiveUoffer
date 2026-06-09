import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";

export function registerEvidenceRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/evidence-requests", async () => {
    return ok(await stores.evidenceStore.listEvidenceRequests());
  });

  app.post<{
    Body: import("@ucareer/shared").FulfillEvidenceRequestInput;
  }>("/api/evidence-requests/fulfill", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    return ok(await stores.evidenceStore.fulfillEvidenceRequest(request.body));
  });
}
