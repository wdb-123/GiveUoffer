import process from "node:process";
import { createSyncService } from "../sync/sync-service";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

export function registerSyncRoutes(ctx: DaemonRouteContext): void {
  const { app, daemonDbPath } = ctx;
  const syncService = createSyncService({
    daemonDbPath,
    defaultCloudUrl: process.env.UCAREER_CLOUD_URL || "http://127.0.0.1:4191",
  });

  app.get<{
    Querystring: { limit?: string };
  }>("/api/sync/outbox", async (request) => {
    const limit = Number(request.query.limit || 100);
    return ok(syncService.listOutbox(limit));
  });

  app.post<{
    Body: { ids?: number[] };
  }>("/api/sync/mark-pushed", async (request) => {
    return ok(syncService.markPushed(Array.isArray(request.body?.ids) ? request.body.ids : []));
  });

  app.post<{
    Body: import("@ucareer/shared").PushSyncRequest;
  }>("/api/sync/push-to-cloud", async (request) => {
    const authError = requirePermission(ctx, request, "sync.cloud");
    if (authError) return authError;
    try {
      return ok(await syncService.pushToCloud(request.body));
    } catch (cause) {
      return error("sync_push_failed", cause instanceof Error ? cause.message : "Cloud sync push failed");
    }
  });
}
