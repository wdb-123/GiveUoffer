import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEvent, AgentTask } from "@ucareer/shared";
import { createTaskExecutionScheduler } from "./task-execution-scheduler";
import { createInMemoryTaskStore } from "../stores/task-store";

function createTask(id: string, tenantId?: string): AgentTask {
  const now = new Date().toISOString();
  return {
    id,
    ...(tenantId ? { tenantId } : {}),
    providerId: "provider",
    workspacePath: "/tmp/workspace",
    prompt: `task ${id}`,
    mode: "structured",
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
}

test("task execution scheduler caps concurrent starts and drains queued work", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 2 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  const settleCallbacks = new Map<string, () => void>();

  for (const task of [createTask("task-1"), createTask("task-2"), createTask("task-3")]) {
    scheduler.enqueue({
      task,
      taskStore,
      label: "test-provider",
      run: ({ onTaskSettled }) => {
        started.push(task.id);
        settleCallbacks.set(task.id, onTaskSettled);
      },
    });
  }

  assert.deepEqual(started, ["task-1", "task-2"]);
  assert.deepEqual(scheduler.snapshot(), {
    maxConcurrent: 2,
    maxConcurrentPerTenant: 2,
    maxQueued: 100,
    maxQueuedPerTenant: 25,
    running: 2,
    queued: 1,
    queuedExclusive: 0,
    runningByTenant: {},
    queuedByTenant: {},
  });
  const queuedEvents = taskStore.listEvents("task-3").filter(isSystemMessage);
  assert.equal(queuedEvents.length, 1);
  assert.match(queuedEvents[0]?.text || "", /执行队列/);

  settleCallbacks.get("task-1")?.();

  assert.deepEqual(started, ["task-1", "task-2", "task-3"]);
  assert.deepEqual(scheduler.snapshot(), {
    maxConcurrent: 2,
    maxConcurrentPerTenant: 2,
    maxQueued: 100,
    maxQueuedPerTenant: 25,
    running: 2,
    queued: 0,
    queuedExclusive: 0,
    runningByTenant: {},
    queuedByTenant: {},
  });

  settleCallbacks.get("task-1")?.();
  assert.deepEqual(scheduler.snapshot(), {
    maxConcurrent: 2,
    maxConcurrentPerTenant: 2,
    maxQueued: 100,
    maxQueuedPerTenant: 25,
    running: 2,
    queued: 0,
    queuedExclusive: 0,
    runningByTenant: {},
    queuedByTenant: {},
  });

  settleCallbacks.get("task-2")?.();
  settleCallbacks.get("task-3")?.();
  assert.deepEqual(scheduler.snapshot(), {
    maxConcurrent: 2,
    maxConcurrentPerTenant: 2,
    maxQueued: 100,
    maxQueuedPerTenant: 25,
    running: 0,
    queued: 0,
    queuedExclusive: 0,
    runningByTenant: {},
    queuedByTenant: {},
  });
});

test("task execution scheduler removes cancelled queued tasks", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  let settleFirst: (() => void) | undefined;

  for (const task of [createTask("task-1"), createTask("task-2")]) {
    scheduler.enqueue({
      task,
      taskStore,
      label: "test-provider",
      run: ({ onTaskSettled }) => {
        started.push(task.id);
        if (task.id === "task-1") settleFirst = onTaskSettled;
      },
    });
  }

  assert.equal(scheduler.cancel("task-2"), true);
  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 0);
  settleFirst?.();

  assert.deepEqual(started, ["task-1"]);
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(scheduler.snapshot().queued, 0);
});

test("task execution scheduler keeps a running cancelled task in its slot until the runner settles", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  const settleCallbacks = new Map<string, () => void>();

  for (const task of [createTask("task-1"), createTask("task-2")]) {
    scheduler.enqueue({
      task,
      taskStore,
      label: "test-provider",
      run: ({ onTaskSettled }) => {
        started.push(task.id);
        settleCallbacks.set(task.id, onTaskSettled);
      },
    });
  }

  assert.deepEqual(started, ["task-1"]);
  assert.equal(scheduler.cancel("task-1"), true);
  assert.deepEqual(started, ["task-1"]);
  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 1);
  settleCallbacks.get("task-1")?.();
  assert.deepEqual(started, ["task-1", "task-2"]);
  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 0);
  settleCallbacks.get("task-2")?.();
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(scheduler.snapshot().queued, 0);
});

test("task execution scheduler recovers when a task throws before settling", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  let settleSecond: (() => void) | undefined;

  scheduler.enqueue({
    task: createTask("task-1"),
    taskStore,
    label: "test-provider",
    run: () => {
      started.push("task-1");
      throw new Error("boom");
    },
  });
  scheduler.enqueue({
    task: createTask("task-2"),
    taskStore,
    label: "test-provider",
    run: ({ onTaskSettled }) => {
      started.push("task-2");
      settleSecond = onTaskSettled;
    },
  });

  assert.deepEqual(started, ["task-1", "task-2"]);
  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 0);
  settleSecond?.();
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(scheduler.snapshot().queued, 0);
});

test("exclusive executions share the same concurrency slots as tasks", async () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  let resolveExclusive: ((value: string) => void) | undefined;
  const exclusive = scheduler.runExclusive("router:test", () => new Promise<string>((resolve) => {
    started.push("exclusive");
    resolveExclusive = resolve;
  }));

  scheduler.enqueue({
    task: createTask("task-1"),
    taskStore,
    label: "test-provider",
    run: ({ onTaskSettled }) => {
      started.push("task-1");
      onTaskSettled();
    },
  });

  await Promise.resolve();
  assert.deepEqual(started, ["exclusive"]);
  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 1);
  assert.equal(scheduler.snapshot().queuedExclusive, 0);
  resolveExclusive?.("done");
  assert.equal(await exclusive, "done");
  assert.deepEqual(started, ["exclusive", "task-1"]);
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(scheduler.snapshot().queued, 0);
});

test("exclusive executions recover when the function throws synchronously", async () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];

  const exclusive = scheduler.runExclusive("router:test", () => {
    started.push("exclusive");
    throw new Error("router boom");
  });
  scheduler.enqueue({
    task: createTask("task-1"),
    taskStore,
    label: "test-provider",
    run: ({ onTaskSettled }) => {
      started.push("task-1");
      onTaskSettled();
    },
  });

  await Promise.resolve();
  await assert.rejects(exclusive, /router boom/);
  assert.deepEqual(started, ["exclusive", "task-1"]);
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(scheduler.snapshot().queued, 0);
});

test("snapshot counts queued exclusive executions separately", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1 });
  const taskStore = createInMemoryTaskStore();

  scheduler.enqueue({
    task: createTask("task-1"),
    taskStore,
    label: "test-provider",
    run: () => undefined,
  });
  void scheduler.runExclusive("router:test", async () => "done");

  assert.equal(scheduler.snapshot().running, 1);
  assert.equal(scheduler.snapshot().queued, 1);
  assert.equal(scheduler.snapshot().queuedExclusive, 1);
});

test("task execution scheduler rejects tasks when the global wait queue is full", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1, maxQueued: 1 });
  const taskStore = createInMemoryTaskStore();
  const task1 = taskStore.createTask({ providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 1", mode: "structured" });
  const task2 = taskStore.createTask({ providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 2", mode: "structured" });
  const task3 = taskStore.createTask({ providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 3", mode: "structured" });

  assert.equal(scheduler.enqueue({ task: task1, taskStore, label: "test-provider", run: () => undefined }).accepted, true);
  assert.equal(scheduler.enqueue({ task: task2, taskStore, label: "test-provider", run: () => undefined }).accepted, true);
  assert.equal(scheduler.enqueue({ task: task3, taskStore, label: "test-provider", run: () => undefined }).accepted, false);

  assert.equal(scheduler.snapshot().queued, 1);
  assert.equal(taskStore.getTask(task3.id)?.status, "failed");
  assert.equal(taskStore.listEvents(task3.id).some((event) => event.type === "error" && /队列已满/.test(event.message)), true);
});

test("task execution scheduler rejects tasks when the tenant wait queue is full", () => {
  const scheduler = createTaskExecutionScheduler({
    maxConcurrent: 2,
    maxConcurrentPerTenant: 1,
    maxQueued: 10,
    maxQueuedPerTenant: 1,
  });
  const taskStore = createInMemoryTaskStore();
  const tasks = [
    taskStore.createTask({ tenantId: "tenant_a", providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 1", mode: "structured" }),
    taskStore.createTask({ tenantId: "tenant_a", providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 2", mode: "structured" }),
    taskStore.createTask({ tenantId: "tenant_a", providerId: "provider", workspacePath: "/tmp/workspace", prompt: "task 3", mode: "structured" }),
  ];

  for (const task of tasks.slice(0, 2)) {
    assert.equal(scheduler.enqueue({ task, taskStore, label: "test-provider", run: () => undefined }).accepted, true);
  }
  assert.equal(scheduler.enqueue({ task: tasks[2]!, taskStore, label: "test-provider", run: () => undefined }).accepted, false);

  assert.deepEqual(scheduler.snapshot().queuedByTenant, { tenant_a: 1 });
  assert.equal(taskStore.getTask(tasks[2]!.id)?.status, "failed");
});

test("exclusive executions reject when the wait queue is full", async () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 1, maxQueued: 1 });
  const taskStore = createInMemoryTaskStore();
  const task = createTask("task-1");

  assert.equal(scheduler.enqueue({ task, taskStore, label: "test-provider", run: () => undefined }).accepted, true);
  void scheduler.runExclusive("router:one", async () => "one");
  await assert.rejects(scheduler.runExclusive("router:two", async () => "two"), /queue is full/);
  assert.equal(scheduler.snapshot().queuedExclusive, 1);
});

test("task execution scheduler enforces per-tenant concurrency while keeping global slots busy", () => {
  const scheduler = createTaskExecutionScheduler({ maxConcurrent: 2, maxConcurrentPerTenant: 1 });
  const taskStore = createInMemoryTaskStore();
  const started: string[] = [];
  const settleCallbacks = new Map<string, () => void>();

  for (const task of [
    createTask("tenant-a-1", "tenant_a"),
    createTask("tenant-a-2", "tenant_a"),
    createTask("tenant-b-1", "tenant_b"),
  ]) {
    scheduler.enqueue({
      task,
      taskStore,
      label: "test-provider",
      run: ({ onTaskSettled }) => {
        started.push(task.id);
        settleCallbacks.set(task.id, onTaskSettled);
      },
    });
  }

  assert.deepEqual(started, ["tenant-a-1", "tenant-b-1"]);
  assert.deepEqual(scheduler.snapshot().runningByTenant, { tenant_a: 1, tenant_b: 1 });
  assert.deepEqual(scheduler.snapshot().queuedByTenant, { tenant_a: 1 });
  const queuedEvents = taskStore.listEvents("tenant-a-2").filter(isSystemMessage);
  assert.equal(queuedEvents.length, 1);
  assert.match(queuedEvents[0]?.text || "", /执行队列/);

  settleCallbacks.get("tenant-a-1")?.();

  assert.deepEqual(started, ["tenant-a-1", "tenant-b-1", "tenant-a-2"]);
  assert.deepEqual(scheduler.snapshot().runningByTenant, { tenant_b: 1, tenant_a: 1 });
  assert.deepEqual(scheduler.snapshot().queuedByTenant, {});
});

function isSystemMessage(event: AgentEvent): event is Extract<AgentEvent, { type: "message" }> {
  return event.type === "message" && event.role === "system";
}
