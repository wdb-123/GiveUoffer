import type { JobSearchRequest } from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerSearchRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/search/jobsearch/sources", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.services.jobSearchService.listSources());
  });

  app.post<{
    Body: JobSearchRequest;
  }>("/api/search/jobsearch", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    try {
      return ok(await scope.services.jobSearchService.search(request.body));
    } catch (cause) {
      return error("jobsearch_failed", cause instanceof Error ? cause.message : "jobsearch 运行失败");
    }
  });
}
