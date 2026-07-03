import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AgentProvider } from "@ucareer/agent-core";
import type { AgentTask } from "@ucareer/shared";
import { createDaemonRuntime } from "../index";
import type { TaskExecutionScheduler } from "../execution/task-execution-scheduler";
import { createInMemoryTaskStore } from "../stores/task-store";
import { tenantWorkspaceRoot } from "../workspace-paths";
import { createAgentTaskService, isServiceError } from "./agent-task-service";

const testProvider: AgentProvider = {
  id: "test-provider",
  label: "Test Provider",
  capabilities: {
    structuredRunner: true,
    ptyRunner: false,
    resumeSession: false,
    approvals: true,
    mcp: false,
  },
  async checkInstalled() {
    return { installed: true };
  },
  async startSession(input) {
    return {
      id: `session_${input.taskId}`,
      providerId: "test-provider",
      status: "running",
    };
  },
  async sendMessage() {},
  async stopSession() {},
};

function createTenantService(tenantId = "tenant_a") {
  const projectRoot = mkdtempSync(join(tmpdir(), "ucareer-agent-service-test-"));
  const workspaceRoot = tenantWorkspaceRoot(projectRoot, tenantId);
  const taskStore = createInMemoryTaskStore();
  const service = createAgentTaskService({
    runtime: createDaemonRuntime({
      providers: [testProvider],
      workspaceRoot: projectRoot,
    }),
    taskStore,
    workspaceRoot,
  });
  return { service, taskStore, workspaceRoot };
}

test("new agent tasks default to the scoped tenant workspace root", async () => {
  const { service, workspaceRoot } = createTenantService();
  const result = await service.createOrContinueTask({
    providerId: "test-provider",
    prompt: "Evaluate this role",
    routeMetadata: {
      skillId: "agent.general",
      inputKind: "general",
      sourceText: "Evaluate this role",
    },
  });

  if (isServiceError(result)) throw new Error(result.message);
  const task = "task" in result ? result.task : result;
  assert.equal(task.workspacePath, workspaceRoot);
});

test("new agent tasks reject workspacePath outside the tenant workspace root", async () => {
  const { service } = createTenantService();
  const result = await service.createOrContinueTask({
    providerId: "test-provider",
    prompt: "Evaluate this role",
    workspacePath: "/tmp",
    routeMetadata: {
      skillId: "agent.general",
      inputKind: "general",
      sourceText: "Evaluate this role",
    },
  });

  assert.equal(isServiceError(result), true);
  if (isServiceError(result)) {
    assert.equal(result.errorCode, "invalid_workspace_path");
  }
});

test("queue capacity rejection syncs the attached workflow to failed", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "ucareer-agent-service-test-"));
  const workspaceRoot = tenantWorkspaceRoot(projectRoot, "tenant_a");
  const taskStore = createInMemoryTaskStore();
  const syncedStatuses: string[] = [];
  const rejectingScheduler: TaskExecutionScheduler = {
    enqueue(input) {
      const failed = input.taskStore.updateTaskStatus(input.task.id, "failed") ?? input.task;
      return { accepted: false, task: failed };
    },
    cancel() {
      return false;
    },
    runExclusive(_label, fn) {
      return fn();
    },
    snapshot() {
      return {
        maxConcurrent: 1,
        maxConcurrentPerTenant: 1,
        maxQueued: 0,
        maxQueuedPerTenant: 0,
        running: 0,
        queued: 0,
        queuedExclusive: 0,
        runningByTenant: {},
        queuedByTenant: {},
      };
    },
  };
  const service = createAgentTaskService({
    runtime: createDaemonRuntime({
      providers: [testProvider],
      workspaceRoot: projectRoot,
    }),
    taskStore,
    workspaceRoot,
    executionScheduler: rejectingScheduler,
    workflowRunService: {
      createRunMetadata(routeMetadata) {
        return routeMetadata;
      },
      attachTask() {},
      attachApproval() {},
      syncTaskStatus(task: AgentTask) {
        syncedStatuses.push(task.status);
      },
      listRuns() {
        return [];
      },
      getRun() {
        return undefined;
      },
      listStepRuns() {
        return [];
      },
    },
  });

  const result = await service.createOrContinueTask({
    providerId: "test-provider",
    prompt: "Run this without approval",
    permissionMode: "full_access",
    routeMetadata: {
      skillId: "agent.general",
      inputKind: "agent_request",
      sourceText: "Run this without approval",
    },
  });

  if (isServiceError(result)) throw new Error(result.message);
  assert.equal(syncedStatuses.includes("failed"), true);
});
