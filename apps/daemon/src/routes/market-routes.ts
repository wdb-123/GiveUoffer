import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerMarketRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/recruitment-market", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.marketStore.getRecruitmentMarket());
  });

  app.post<{ Body: { url?: string; description?: string; source?: string } }>("/api/recruitment-market/import", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.marketStore.importJob(request.body || {}));
  });

  app.post<{ Body: { url?: string; rawText?: string; description?: string; source?: string } }>("/api/recruitment-market/manual-jobs", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const body = request.body || {};
    const input: import("@ucareer/shared").ImportJobRequest = {
      source: body.source || "手工网页读取",
    };
    const description = body.rawText || body.description || "";
    if (body.url) input.url = body.url;
    if (description) input.description = description;
    return ok(await scope.stores.marketStore.importJob(input));
  });

  app.delete<{ Params: { id: string } }>("/api/recruitment-market/:id", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok({ deletedJobId: await scope.stores.marketStore.deleteJob(request.params.id) });
  });
}
