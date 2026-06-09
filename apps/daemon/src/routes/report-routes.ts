import type { DaemonRouteContext } from "./context";
import { error, ok } from "./context";

export function registerReportRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/reports", async () => {
    return ok(await stores.reportStore.listReports());
  });

  app.get<{
    Querystring: { file?: string };
  }>("/api/report", async (request) => {
    const file = request.query.file || "";
    const report = await stores.reportStore.getReport(file);
    if (!report) return error("report_not_found", `Report not found: ${file}`);
    return ok(report);
  });
}
