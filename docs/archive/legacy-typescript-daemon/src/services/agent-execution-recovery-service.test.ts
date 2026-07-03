import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDaemonDatabase } from "../db/sqlite";
import { createSqliteTaskStore } from "../stores/sqlite-task-store";
import { createSqliteWorkflowRunStore } from "../stores/workflow-run-store";
import { getWorkflow } from "../workflow/workflow-registry";
import { createWorkflowRunService } from "./workflow-run-service";
import { recoverInterruptedAgentExecutions } from "./agent-execution-recovery-service";

function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "ucareer-recovery-test-")), "daemon.sqlite");
}

test("recoverInterruptedAgentExecutions fails approved queued tasks and syncs workflow state", () => {
  const dbPath = tempDbPath();
  const workflow = getWorkflow("job.auto_pipeline");
  assert.ok(workflow);
  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const workflowStore = createSqliteWorkflowRunStore(dbPath, { tenantId: "tenant_a" });
  const workflowRun = workflowStore.createRun({ workflow, skillId: "job.evaluate", sourceText: "recover me" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "recover me",
    mode: "structured",
    routeMetadata: {
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      skillId: "job.evaluate",
      inputKind: "job_description",
    },
  });
  createWorkflowRunService({ workflowRunStore: workflowStore }).attachTask(task);

  const result = recoverInterruptedAgentExecutions({ daemonDbPath: dbPath });

  assert.deepEqual(result, { failedRunning: 0, failedQueued: 1 });
  assert.equal(taskStore.getTask(task.id)?.status, "failed");
  assert.equal(taskStore.listEvents(task.id).some((event) => event.type === "error" && /启动前重启/.test(event.message)), true);
  assert.equal(workflowStore.getRun(workflowRun.id)?.status, "failed");
  assert.equal(workflowStore.listStepRuns(workflowRun.id).find((step) => step.stepId === "extract_jd")?.status, "failed");
});

test("recoverInterruptedAgentExecutions leaves waiting approvals untouched", () => {
  const dbPath = tempDbPath();
  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "needs approval",
    mode: "structured",
  });
  taskStore.createApproval({
    taskId: task.id,
    action: "start_agent",
    risk: "medium",
    summary: "Start agent",
  });

  const result = recoverInterruptedAgentExecutions({ daemonDbPath: dbPath });

  assert.deepEqual(result, { failedRunning: 0, failedQueued: 0 });
  assert.equal(taskStore.getTask(task.id)?.status, "waiting_approval");
  assert.equal(taskStore.listApprovals().length, 1);
});

test("recoverInterruptedAgentExecutions keeps tenant recovery scoped", () => {
  const dbPath = tempDbPath();
  const tenantA = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const tenantB = createSqliteTaskStore(dbPath, { tenantId: "tenant_b" });
  const taskA = tenantA.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "tenant a queued",
    mode: "structured",
  });
  const taskB = tenantB.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-b",
    prompt: "tenant b queued",
    mode: "structured",
  });

  const result = recoverInterruptedAgentExecutions({ daemonDbPath: dbPath });

  assert.deepEqual(result, { failedRunning: 0, failedQueued: 2 });
  assert.equal(tenantA.getTask(taskA.id)?.status, "failed");
  assert.equal(tenantB.getTask(taskB.id)?.status, "failed");
  assert.equal(tenantA.getTask(taskB.id), undefined);
  assert.equal(tenantB.getTask(taskA.id), undefined);
});

test("recoverInterruptedAgentExecutions fails interrupted running tasks", () => {
  const dbPath = tempDbPath();
  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "running task",
    mode: "structured",
  });
  taskStore.updateTaskStatus(task.id, "running");

  const result = recoverInterruptedAgentExecutions({ daemonDbPath: dbPath });

  assert.deepEqual(result, { failedRunning: 1, failedQueued: 0 });
  assert.equal(taskStore.getTask(task.id)?.status, "failed");
  assert.equal(taskStore.listEvents(task.id).some((event) => event.type === "error" && /中断/.test(event.message)), true);
});

test("constructing a scoped sqlite task store does not recover active running tasks", () => {
  const dbPath = tempDbPath();
  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "active running task",
    mode: "structured",
  });
  taskStore.updateTaskStatus(task.id, "running");

  const anotherStoreHandle = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });

  assert.equal(anotherStoreHandle.getTask(task.id)?.status, "running");
  assert.equal(anotherStoreHandle.listEvents(task.id).some((event) => event.type === "error" && /中断/.test(event.message)), false);
});

test("recoverInterruptedAgentExecutions does not recover cancelled tasks", () => {
  const dbPath = tempDbPath();
  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-a",
    prompt: "cancelled task",
    mode: "structured",
  });
  taskStore.updateTaskStatus(task.id, "cancelled");

  const result = recoverInterruptedAgentExecutions({ daemonDbPath: dbPath });
  const db = openDaemonDatabase(dbPath);
  const errorCount = db.prepare("SELECT COUNT(*) AS count FROM agent_events WHERE task_id = ? AND event_type = 'error'")
    .get(task.id) as { count: number };

  assert.deepEqual(result, { failedRunning: 0, failedQueued: 0 });
  assert.equal(taskStore.getTask(task.id)?.status, "cancelled");
  assert.equal(errorCount.count, 0);
});
