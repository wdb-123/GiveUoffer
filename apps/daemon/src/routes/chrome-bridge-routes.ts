import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

export function registerChromeBridgeRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/chrome-bridge/tasks/next", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    return ok(ctx.services.chromeBridgeService.nextTask());
  });

  app.post<{
    Params: { taskId: string };
    Body: import("../services/chrome-bridge-service").ChromeBridgeResult;
  }>("/api/chrome-bridge/tasks/:taskId/result", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    try {
      return ok(ctx.services.chromeBridgeService.completeTask(request.params.taskId, request.body || { ok: false }));
    } catch (cause) {
      return error("chrome_bridge_task_failed", cause instanceof Error ? cause.message : "Chrome bridge task failed");
    }
  });
}
