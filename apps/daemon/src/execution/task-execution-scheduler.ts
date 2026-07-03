import type { AgentTask } from "@ucareer/shared";
import type { TaskStore } from "../stores/task-store";

export interface TaskExecutionScheduler {
  enqueue(input: EnqueueTaskExecutionInput): EnqueueTaskExecutionResult;
  cancel(taskId: string): boolean;
  runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T>;
  snapshot(): TaskExecutionSchedulerSnapshot;
}

export interface EnqueueTaskExecutionInput {
  task: AgentTask;
  taskStore: TaskStore;
  label: string;
  run: (callbacks: { onTaskSettled: () => void }) => void;
}

export type EnqueueTaskExecutionResult =
  | { accepted: true }
  | { accepted: false; task: AgentTask };

export interface TaskExecutionSchedulerSnapshot {
  maxConcurrent: number;
  maxConcurrentPerTenant: number;
  maxQueued: number;
  maxQueuedPerTenant: number;
  running: number;
  queued: number;
  queuedExclusive: number;
  runningByTenant: Record<string, number>;
  queuedByTenant: Record<string, number>;
}

interface QueueItem extends EnqueueTaskExecutionInput {
  kind: "task";
  sequence: number;
}

interface ExclusiveQueueItem<T = unknown> {
  kind: "exclusive";
  id: string;
  label: string;
  sequence: number;
  run: () => Promise<T>;
  resolve: (value: unknown) => void;
  reject: (cause: unknown) => void;
}

type QueuedExecution = QueueItem | ExclusiveQueueItem;

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_QUEUED = 100;
const DEFAULT_MAX_QUEUED_PER_TENANT = 25;

export function createTaskExecutionScheduler(input: {
  maxConcurrent?: number;
  maxConcurrentPerTenant?: number;
  maxQueued?: number;
  maxQueuedPerTenant?: number;
} = {}): TaskExecutionScheduler {
  const maxConcurrent = normalizeMaxConcurrent(input.maxConcurrent ?? Number(process.env.UCAREER_AGENT_MAX_CONCURRENT));
  const maxConcurrentPerTenant = normalizeMaxConcurrent(input.maxConcurrentPerTenant ?? Number(process.env.UCAREER_AGENT_MAX_CONCURRENT_PER_TENANT), maxConcurrent);
  const maxQueued = normalizeQueueLimit(input.maxQueued ?? Number(process.env.UCAREER_AGENT_MAX_QUEUED), DEFAULT_MAX_QUEUED);
  const maxQueuedPerTenant = normalizeQueueLimit(input.maxQueuedPerTenant ?? Number(process.env.UCAREER_AGENT_MAX_QUEUED_PER_TENANT), DEFAULT_MAX_QUEUED_PER_TENANT);
  const queue: QueuedExecution[] = [];
  const runningTasks = new Map<string, () => void>();
  const runningTenants = new Map<string, number>();
  let running = 0;
  let sequence = 0;

  return {
    enqueue(item) {
      if (!canAcceptTask(item.task)) {
        return {
          accepted: false,
          task: rejectTask(item, "本地执行队列已满，请稍后重试。"),
        };
      }
      queue.push({ ...item, kind: "task", sequence: sequence++ });
      if (running >= maxConcurrent || !canRunTenant(item.task.tenantId)) {
        appendQueueEvent(item, queue.length);
      }
      drain();
      return { accepted: true };
    },

    cancel(taskId) {
      const queuedIndex = queue.findIndex((item) => item.kind === "task" && item.task.id === taskId);
      if (queuedIndex >= 0) {
        queue.splice(queuedIndex, 1);
        return true;
      }
      return runningTasks.has(taskId);
    },

    runExclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (!canAcceptExclusive()) {
          reject(new Error("Local execution queue is full"));
          return;
        }
        queue.push({
          kind: "exclusive",
          id: `exclusive-${sequence}`,
          label,
          sequence: sequence++,
          run: fn,
          resolve: (value) => resolve(value as T),
          reject,
        });
        drain();
      });
    },

    snapshot() {
      return {
        maxConcurrent,
        maxConcurrentPerTenant,
        maxQueued,
        maxQueuedPerTenant,
        running,
        queued: queue.length,
        queuedExclusive: queue.filter((item) => item.kind === "exclusive").length,
        runningByTenant: Object.fromEntries(runningTenants.entries()),
        queuedByTenant: countQueuedByTenant(queue),
      };
    },
  };

  function drain(): void {
    while (running < maxConcurrent && queue.length > 0) {
      const nextIndex = findNextRunnableIndex();
      if (nextIndex < 0) return;
      const item = queue.splice(nextIndex, 1)[0];
      if (!item) return;
      const current = item;
      running += 1;
      let settled = false;

      if (current.kind === "exclusive") {
        void Promise.resolve()
          .then(current.run)
          .then(
            (value) => {
              settle();
              current.resolve(value);
            },
            (cause) => {
              settle();
              current.reject(cause);
            },
          );
      } else {
        runningTasks.set(current.task.id, settle);
        incrementTenant(current.task.tenantId);
        const latestTask = current.taskStore.getTask(current.task.id);
        if (latestTask?.status === "cancelled") {
          settle();
          continue;
        }
        try {
          current.run({ onTaskSettled: settle });
        } catch (cause) {
          current.taskStore.appendEvent(current.task.id, {
            type: "error",
            message: cause instanceof Error ? cause.message : "Task execution failed before start",
            provider: current.task.providerId,
            createdAt: new Date().toISOString(),
          });
          const latestTask = current.taskStore.getTask(current.task.id);
          if (latestTask?.status !== "cancelled") current.taskStore.updateTaskStatus(current.task.id, "failed");
          settle();
        }
      }

      function settle(): void {
        if (settled) return;
        settled = true;
        if (current.kind === "task") {
          runningTasks.delete(current.task.id);
          decrementTenant(current.task.tenantId);
        }
        running = Math.max(0, running - 1);
        drain();
      }
    }
  }

  function findNextRunnableIndex(): number {
    return queue.findIndex((item) => item.kind === "exclusive" || canRunTenant(item.task.tenantId));
  }

  function canRunTenant(tenantId: string | undefined): boolean {
    if (!tenantId) return true;
    return (runningTenants.get(tenantId) ?? 0) < maxConcurrentPerTenant;
  }

  function canAcceptTask(task: AgentTask): boolean {
    const willQueue = running >= maxConcurrent || !canRunTenant(task.tenantId);
    if (!willQueue) return true;
    if (queue.length >= maxQueued) return false;
    if (!task.tenantId) return true;
    return countQueuedTenant(queue, task.tenantId) < maxQueuedPerTenant;
  }

  function canAcceptExclusive(): boolean {
    return running < maxConcurrent || queue.length < maxQueued;
  }

  function incrementTenant(tenantId: string | undefined): void {
    if (!tenantId) return;
    runningTenants.set(tenantId, (runningTenants.get(tenantId) ?? 0) + 1);
  }

  function decrementTenant(tenantId: string | undefined): void {
    if (!tenantId) return;
    const next = (runningTenants.get(tenantId) ?? 0) - 1;
    if (next <= 0) runningTenants.delete(tenantId);
    else runningTenants.set(tenantId, next);
  }
}

export const defaultTaskExecutionScheduler = createTaskExecutionScheduler();

function appendQueueEvent(item: EnqueueTaskExecutionInput, position: number): void {
  item.taskStore.appendEvent(item.task.id, {
    type: "message",
    role: "system",
    text: `任务已进入本地执行队列：${item.label}。当前排队位置 ${position}。`,
    createdAt: new Date().toISOString(),
  });
}

function countQueuedByTenant(queue: QueuedExecution[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of queue) {
    if (item.kind !== "task" || !item.task.tenantId) continue;
    counts[item.task.tenantId] = (counts[item.task.tenantId] ?? 0) + 1;
  }
  return counts;
}

function countQueuedTenant(queue: QueuedExecution[], tenantId: string): number {
  return queue.filter((item) => item.kind === "task" && item.task.tenantId === tenantId).length;
}

function rejectTask(item: EnqueueTaskExecutionInput, message: string): AgentTask {
  item.taskStore.appendEvent(item.task.id, {
    type: "error",
    message,
    provider: item.task.providerId,
    createdAt: new Date().toISOString(),
  });
  const latestTask = item.taskStore.getTask(item.task.id);
  if (latestTask?.status === "cancelled") return latestTask;
  return item.taskStore.updateTaskStatus(item.task.id, "failed") ?? latestTask ?? item.task;
}

function normalizeMaxConcurrent(value: number, fallback = DEFAULT_MAX_CONCURRENT): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

function normalizeQueueLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1000, Math.floor(value)));
}
