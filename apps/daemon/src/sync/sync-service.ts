import type { ApiEnvelope, PushSyncRequest, PushSyncResult } from "@ucareer/shared";
import { listSyncOutbox, markSyncEventsPushed } from "../stores/sqlite-task-store";

export interface SyncService {
  listOutbox(limit?: number): { events: ReturnType<typeof listSyncOutbox> };
  markPushed(ids: number[]): { marked: number };
  pushToCloud(input: PushSyncRequest): Promise<PushSyncResult>;
}

export function createSyncService(input: {
  daemonDbPath: string;
  defaultCloudUrl?: string;
}): SyncService {
  const { daemonDbPath } = input;
  const defaultCloudUrl = input.defaultCloudUrl || "http://127.0.0.1:4191";

  return {
    listOutbox(limit = 100) {
      return {
        events: listSyncOutbox(daemonDbPath, Number.isFinite(limit) ? limit : 100),
      };
    },

    markPushed(ids) {
      return {
        marked: markSyncEventsPushed(daemonDbPath, Array.isArray(ids) ? ids : []),
      };
    },

    async pushToCloud(body) {
      const cloudUrl = String(body?.cloudUrl || defaultCloudUrl).replace(/\/+$/, "");
      const limit = Number(body?.limit || 100);
      const events = listSyncOutbox(daemonDbPath, Number.isFinite(limit) ? limit : 100);
      const response = await fetch(`${cloudUrl}/sync/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
      });
      const envelope = await response.json() as ApiEnvelope<{ acceptedIds?: number[]; cursor?: string }>;
      if (!envelope.ok) {
        throw new Error(envelope.error?.message || "Cloud sync push failed");
      }
      const acceptedIds = Array.isArray(envelope.data?.acceptedIds) ? envelope.data.acceptedIds : [];
      const marked = markSyncEventsPushed(daemonDbPath, acceptedIds);
      return {
        cloudUrl,
        sent: events.length,
        acceptedIds,
        marked,
        cursor: envelope.data?.cursor || "",
      };
    },
  };
}
