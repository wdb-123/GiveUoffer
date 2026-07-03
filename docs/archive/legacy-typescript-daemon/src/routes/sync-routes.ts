import process from "node:process";
import { createSyncService, type SyncService } from "../sync/sync-service";
import type { ApiEnvelope } from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerSyncRoutes(ctx: DaemonRouteContext): void {
  const { app, daemonDbPath } = ctx;

  app.get<{
    Querystring: { limit?: string };
  }>("/api/sync/outbox", async (request) => {
    const authError = requirePermission(ctx, request, "sync.cloud");
    if (authError) return authError;
    const syncService = createScopedSyncService(ctx, request);
    if (isSyncServiceError(syncService)) return syncService;
    const limit = Number(request.query.limit || 100);
    return ok(syncService.listOutbox(limit));
  });

  app.post<{
    Body: { ids?: number[] };
  }>("/api/sync/mark-pushed", async (request) => {
    const authError = requirePermission(ctx, request, "sync.cloud");
    if (authError) return authError;
    const syncService = createScopedSyncService(ctx, request);
    if (isSyncServiceError(syncService)) return syncService;
    return ok(syncService.markPushed(Array.isArray(request.body?.ids) ? request.body.ids : []));
  });

  app.post<{
    Body: import("@ucareer/shared").PushSyncRequest;
  }>("/api/sync/push-to-cloud", async (request) => {
    const authError = requirePermission(ctx, request, "sync.cloud");
    if (authError) return authError;
    const syncService = createScopedSyncService(ctx, request);
    if (isSyncServiceError(syncService)) return syncService;
    try {
      return ok(await syncService.pushToCloud(request.body));
    } catch (cause) {
      return error("sync_push_failed", cause instanceof Error ? cause.message : "Cloud sync push failed");
    }
  });
}

function createScopedSyncService(
  ctx: DaemonRouteContext,
  request: { headers: Record<string, string | string[] | undefined> },
): SyncService | ApiEnvelope<never> {
  const scope = getTenantRouteScope(ctx, request);
  if (isScopeError(scope)) return scope;
  return createSyncService({
    daemonDbPath: ctx.daemonDbPath,
    tenantId: scope.session.activeTenant.id,
    defaultCloudUrl: process.env.UCAREER_CLOUD_URL || "http://127.0.0.1:4191",
  });
}

function isSyncServiceError(value: SyncService | ApiEnvelope<never>): value is ApiEnvelope<never> {
  return "ok" in value && value.ok === false;
}
