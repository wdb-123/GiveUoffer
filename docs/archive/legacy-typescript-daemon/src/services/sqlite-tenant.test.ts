import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { WorkflowDefinition } from "@ucareer/shared";
import { openDaemonDatabase } from "../db/sqlite";
import { createWorkflowRunService } from "./workflow-run-service";
import { getWorkflow } from "../workflow/workflow-registry";
import { createAuthStore } from "../stores/auth-store";
import { createBillingStore } from "../stores/billing-store";
import { createConnectorCredentialStore } from "../stores/connector-credential-store";
import { createSqliteTaskStore, listSyncOutbox, markSyncEventsPushed } from "../stores/sqlite-task-store";
import { createSqliteWorkflowRunStore } from "../stores/workflow-run-store";

function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "ucareer-sqlite-tenant-test-")), "daemon.sqlite");
}

const workflow: WorkflowDefinition = {
  id: "test.workflow",
  label: "Test Workflow",
  description: "Test workflow",
  skillIds: ["agent.general"],
  inputKinds: ["general"],
  risk: "low",
  steps: [
    { id: "route", label: "Route", kind: "route" },
    { id: "agent", label: "Agent", kind: "agent_task" },
  ],
};

test("sqlite task store filters tasks, events, approvals, and sync outbox by tenant", () => {
  const dbPath = tempDbPath();
  const tenantA = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const tenantB = createSqliteTaskStore(dbPath, { tenantId: "tenant_b" });

  const taskA = tenantA.createTask({
    providerId: "provider",
    workspacePath: "/tmp/tenant-a",
    prompt: "tenant a task",
    mode: "structured",
  });
  tenantB.createTask({
    providerId: "provider",
    workspacePath: "/tmp/tenant-b",
    prompt: "tenant b task",
    mode: "structured",
  });
  const approvalA = tenantA.createApproval({
    taskId: taskA.id,
    action: "start_agent",
    risk: "medium",
    summary: "Start tenant A agent",
  });

  assert.equal(tenantA.listTasks().length, 1);
  assert.equal(tenantB.listTasks().length, 1);
  assert.equal(tenantB.getTask(taskA.id), undefined);
  assert.throws(() => tenantB.appendEvent(taskA.id, { type: "message", role: "system", text: "bad write", createdAt: new Date().toISOString() }));
  assert.throws(() => tenantB.createApproval({
    taskId: taskA.id,
    action: "start_agent",
    risk: "medium",
    summary: "Bad cross-tenant approval",
  }));
  assert.equal(tenantA.listEvents(taskA.id).length > 0, true);
  assert.deepEqual(tenantB.listEvents(taskA.id), []);
  assert.equal(tenantA.getApproval(approvalA.id)?.id, approvalA.id);
  assert.equal(tenantB.getApproval(approvalA.id), undefined);
  assert.equal(listSyncOutbox(dbPath, 100, "tenant_a").every((event) => event.tenantId === "tenant_a"), true);
  assert.equal(listSyncOutbox(dbPath, 100, "tenant_b").every((event) => event.tenantId === "tenant_b"), true);
  const tenantAEventId = listSyncOutbox(dbPath, 100, "tenant_a")[0]?.id;
  assert.equal(markSyncEventsPushed(dbPath, tenantAEventId ? [tenantAEventId] : [], "tenant_b"), 0);
});

test("sqlite workflow run store filters runs and steps by tenant", () => {
  const dbPath = tempDbPath();
  const tenantA = createSqliteWorkflowRunStore(dbPath, { tenantId: "tenant_a" });
  const tenantB = createSqliteWorkflowRunStore(dbPath, { tenantId: "tenant_b" });

  const runA = tenantA.createRun({ workflow, skillId: "agent.general", sourceText: "tenant a" });
  tenantB.createRun({ workflow, skillId: "agent.general", sourceText: "tenant b" });

  assert.equal(tenantA.listRuns().length, 1);
  assert.equal(tenantB.listRuns().length, 1);
  assert.equal(tenantA.getRun(runA.id)?.id, runA.id);
  assert.equal(tenantB.getRun(runA.id), undefined);
  assert.equal(tenantA.listStepRuns(runA.id).length, 2);
  assert.deepEqual(tenantB.listStepRuns(runA.id), []);
});

test("scoped workflow service does not sync a task into another tenant run", () => {
  const dbPath = tempDbPath();
  const tenantATasks = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const tenantAWorkflowStore = createSqliteWorkflowRunStore(dbPath, { tenantId: "tenant_a" });
  const tenantBWorkflowStore = createSqliteWorkflowRunStore(dbPath, { tenantId: "tenant_b" });
  const realWorkflow = getWorkflow("job.auto_pipeline");
  assert.ok(realWorkflow);
  const tenantBRun = tenantBWorkflowStore.createRun({
    workflow: realWorkflow,
    skillId: "job.evaluate",
    sourceText: "tenant b workflow",
  });
  const taskA = tenantATasks.createTask({
    providerId: "provider",
    workspacePath: "/tmp/tenant-a",
    prompt: "tenant a task with foreign workflow run id",
    mode: "structured",
    routeMetadata: {
      workflowId: realWorkflow.id,
      workflowRunId: tenantBRun.id,
      skillId: "job.evaluate",
    },
  });
  const cancelledTaskA = tenantATasks.updateTaskStatus(taskA.id, "cancelled");
  assert.ok(cancelledTaskA);

  createWorkflowRunService({ workflowRunStore: tenantAWorkflowStore }).syncTaskStatus(cancelledTaskA);

  assert.equal(tenantBWorkflowStore.getRun(tenantBRun.id)?.status, "queued");
  assert.equal(tenantBWorkflowStore.listStepRuns(tenantBRun.id).find((step) => step.stepId === "extract_jd")?.status, "queued");
});

test("connector credentials are isolated by tenant", () => {
  const dbPath = tempDbPath();
  const tenantARoot = mkdtempSync(join(tmpdir(), "ucareer-tenant-a-"));
  const tenantBRoot = mkdtempSync(join(tmpdir(), "ucareer-tenant-b-"));
  const tenantA = createConnectorCredentialStore(dbPath, tenantARoot, { tenantId: "tenant_a" });
  const tenantB = createConnectorCredentialStore(dbPath, tenantBRoot, { tenantId: "tenant_b" });

  tenantA.saveQqEmail({ email: "a@example.com", authorizationCode: "code-a" });
  tenantB.saveQqEmail({ email: "b@example.com", authorizationCode: "code-b" });

  assert.equal(tenantA.getSecret("qq-email")?.account, "a@example.com");
  assert.equal(tenantA.getSecret("qq-email")?.secret, "code-a");
  assert.equal(tenantB.getSecret("qq-email")?.account, "b@example.com");
  assert.equal(tenantB.getSecret("qq-email")?.secret, "code-b");
});

test("approval grants with the same key are isolated by tenant", () => {
  const dbPath = tempDbPath();
  const tenantA = createSqliteTaskStore(dbPath, { tenantId: "tenant_a" });
  const tenantB = createSqliteTaskStore(dbPath, { tenantId: "tenant_b" });
  const grant = { action: "start_agent" as const, providerId: "provider", workspacePath: "/same/path" };

  tenantA.createWorkspaceApprovalGrant({ ...grant, sourceApprovalId: "approval-a" });
  tenantB.createWorkspaceApprovalGrant({ ...grant, sourceApprovalId: "approval-b" });

  assert.equal(tenantA.hasWorkspaceApprovalGrant(grant), true);
  assert.equal(tenantB.hasWorkspaceApprovalGrant(grant), true);
  const db = openDaemonDatabase(dbPath);
  const count = db.prepare("SELECT COUNT(*) AS count FROM approval_grants WHERE action = ? AND provider_id = ? AND workspace_path = ?")
    .get(grant.action, grant.providerId, grant.workspacePath) as { count: number };
  assert.equal(count.count, 2);
});

test("first account creation assigns legacy null tenant rows to the new tenant", () => {
  const dbPath = tempDbPath();
  const db = openDaemonDatabase(dbPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_tasks (id, provider_id, workspace_path, prompt, mode, status, created_at, updated_at)
    VALUES ('legacy-task', 'provider', '/tmp/legacy', 'legacy prompt', 'structured', 'queued', ?, ?)
  `).run(now, now);
  db.prepare(`
    INSERT INTO agent_events (id, task_id, event_type, payload, created_at)
    VALUES ('legacy-event', 'legacy-task', 'message', ?, ?)
  `).run(JSON.stringify({ type: "message", role: "user", text: "legacy prompt", createdAt: now }), now);

  const session = createAuthStore(dbPath).createAccount({
    email: "legacy@example.com",
    password: "strong-password-123",
    displayName: "Legacy User",
    tenantName: "Migrated Workspace",
  });
  const tenantStore = createSqliteTaskStore(dbPath, { tenantId: session.activeTenant.id });

  assert.equal(tenantStore.getTask("legacy-task")?.id, "legacy-task");
  assert.equal(tenantStore.listEvents("legacy-task").length, 1);
});

test("tenant billing aggregates usage events and enforces monthly token quota", () => {
  const dbPath = tempDbPath();
  const db = openDaemonDatabase(dbPath);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run("tenant_usage", "Usage Tenant", "usage-tenant", now);

  const taskStore = createSqliteTaskStore(dbPath, { tenantId: "tenant_usage" });
  const task = taskStore.createTask({
    providerId: "codex",
    workspacePath: "/tmp/tenant-usage",
    prompt: "measure usage",
    mode: "structured",
  });
  taskStore.appendEvent(task.id, {
    type: "usage",
    providerId: "codex",
    model: "gpt-5.5",
    inputTokens: 1000,
    cachedInputTokens: 200,
    outputTokens: 300,
    totalTokens: 1500,
    createdAt: now,
  });

  const billing = createBillingStore(dbPath);
  const overview = billing.getTenantBilling("tenant_usage", now.slice(0, 7));
  assert.equal(overview.plan.id, "free");
  assert.equal(overview.usage.inputTokens, 1000);
  assert.equal(overview.usage.cachedInputTokens, 200);
  assert.equal(overview.usage.outputTokens, 300);
  assert.equal(overview.usage.totalTokens, 1500);
  assert.equal(overview.usage.taskCount, 1);
  assert.equal(overview.quota.monthlyTokenLimit, 200_000);

  const pro = billing.updateTenantPlan("tenant_usage", "pro");
  assert.equal(pro.plan.id, "pro");
  assert.equal(pro.quota.monthlyTokenLimit, 2_000_000);

  db.prepare(`
    UPDATE tenant_token_usage_monthly
    SET total_tokens = ?, input_tokens = ?
    WHERE tenant_id = ? AND month = ?
  `).run(2_000_000, 2_000_000, "tenant_usage", now.slice(0, 7));
  assert.throws(() => billing.assertTenantCanRunAgent("tenant_usage"), /quota exceeded/i);
});
