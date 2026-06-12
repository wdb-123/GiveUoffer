import type { MarketJob } from "@ucareer/shared";

type ChromeBridgeTaskStatus = "pending" | "running" | "completed" | "failed";

export interface ChromeBossSearchPayload {
  city: string;
  queries: string[];
  max: number;
  dryRun: boolean;
}

export interface ChromeBridgeTask {
  id: string;
  type: "boss_search";
  status: ChromeBridgeTaskStatus;
  createdAt: string;
  updatedAt: string;
  payload: ChromeBossSearchPayload;
  result?: ChromeBridgeResult;
}

export interface ChromeBridgeResult {
  ok: boolean;
  added?: number;
  stats?: {
    queries?: number;
    candidatesSeen?: number;
    duplicatesSkipped?: number;
    failedQueries?: number;
  };
  queries?: string[];
  discovered?: MarketJob[];
  message?: string;
}

type PendingWaiter = {
  resolve(result: ChromeBridgeResult): void;
  timer: NodeJS.Timeout;
};

export interface ChromeBridgeService {
  runBossSearch(input: ChromeBossSearchPayload, timeoutMs?: number): Promise<ChromeBridgeResult>;
  nextTask(): ChromeBridgeTask | null;
  completeTask(id: string, result: ChromeBridgeResult): ChromeBridgeTask;
}

export function createChromeBridgeService(): ChromeBridgeService {
  const tasks = new Map<string, ChromeBridgeTask>();
  const waiters = new Map<string, PendingWaiter>();

  return {
    runBossSearch(input, timeoutMs = 180_000) {
      const now = new Date().toISOString();
      const task: ChromeBridgeTask = {
        id: `chrome_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        type: "boss_search",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        payload: input,
      };
      tasks.set(task.id, task);
      pruneOldTasks(tasks);

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const failed: ChromeBridgeResult = {
            ok: false,
            added: 0,
            stats: {
              queries: input.queries.length,
              candidatesSeen: 0,
              duplicatesSkipped: 0,
              failedQueries: input.queries.length,
            },
            queries: input.queries,
            discovered: [],
            message: "等待 Ucareer Chrome 扩展执行 Boss 搜索超时。请确认扩展已加载、已连接本地 Ucareer，并保持 Chrome 运行。",
          };
          waiters.delete(task.id);
          this.completeTask(task.id, failed);
          resolve(failed);
        }, timeoutMs);
        waiters.set(task.id, { resolve, timer });
      });
    },

    nextTask() {
      const task = Array.from(tasks.values())
        .filter((item) => item.status === "pending")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!task) return null;
      task.status = "running";
      task.updatedAt = new Date().toISOString();
      tasks.set(task.id, task);
      return task;
    },

    completeTask(id, result) {
      const task = tasks.get(id);
      if (!task) throw new Error(`Chrome bridge task not found: ${id}`);
      task.status = result.ok ? "completed" : "failed";
      task.updatedAt = new Date().toISOString();
      task.result = result;
      tasks.set(task.id, task);
      const waiter = waiters.get(id);
      if (waiter) {
        clearTimeout(waiter.timer);
        waiters.delete(id);
        waiter.resolve(result);
      }
      return task;
    },
  };
}

function pruneOldTasks(tasks: Map<string, ChromeBridgeTask>): void {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, task] of tasks) {
    if (Date.parse(task.updatedAt || task.createdAt) < cutoff) tasks.delete(id);
  }
}
