import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerReportRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/reports", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.stores.reportStore.listReports());
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/report", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const file = request.query.file || "";
    const report = await scope.stores.reportStore.getReport(file);
    if (!report) return error("report_not_found", `Report not found: ${file}`);
    return ok(report);
  });
}
