import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentEvent,
  AgentTask,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  EntityId,
  PermissionAction,
  RiskLevel,
  TaskStatus,
} from "@offeru/shared";

export interface TaskStore {
  createTask(input: CreateTaskInput): AgentTask;
  listTasks(): AgentTask[];
  getTask(taskId: EntityId): AgentTask | undefined;
  updateTaskStatus(taskId: EntityId, status: TaskStatus): AgentTask | undefined;
  appendEvent(taskId: EntityId, event: AgentEvent): void;
  listEvents(taskId: EntityId): AgentEvent[];
  createApproval(input: CreateApprovalInput): ApprovalRequest;
  listApprovals(): ApprovalRequest[];
  getApproval(approvalId: EntityId): ApprovalRequest | undefined;
  decideApproval(approvalId: EntityId, decision: ApprovalDecisionRequest): ApprovalDecisionRecord | undefined;
}

export interface CreateTaskInput extends Required<CreateAgentTaskRequest> {}

export interface CreateApprovalInput {
  taskId: EntityId;
  action: PermissionAction;
  risk: RiskLevel;
  summary: string;
  command?: string;
  cwd?: string;
  affectedPaths?: string[];
}

export interface ApprovalDecisionRecord {
  approvalId: EntityId;
  taskId: EntityId;
  decision: ApprovalDecisionRequest["decision"];
  note?: string;
  decidedAt: string;
}

interface PersistedTaskState {
  tasks: AgentTask[];
  events: Array<{ taskId: EntityId; events: AgentEvent[] }>;
  approvals: ApprovalRequest[];
  decisions: ApprovalDecisionRecord[];
}

export function createInMemoryTaskStore(persistPath?: string): TaskStore {
  const tasks = new Map<EntityId, AgentTask>();
  const events = new Map<EntityId, AgentEvent[]>();
  const approvals = new Map<EntityId, ApprovalRequest>();
  const decisions = new Map<EntityId, ApprovalDecisionRecord>();

  loadPersistedState();

  return {
    createTask(input) {
      const now = new Date().toISOString();
      const task: AgentTask = {
        id: randomUUID(),
        providerId: input.providerId,
        workspacePath: input.workspacePath,
        prompt: input.prompt,
        mode: input.mode,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      };
      tasks.set(task.id, task);
      events.set(task.id, [
        { type: "task_status", taskId: task.id, status: "queued", createdAt: now },
        { type: "message", role: "user", text: task.prompt, createdAt: now },
      ]);
      persist();
      return task;
    },

    listTasks() {
      return [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    getTask(taskId) {
      return tasks.get(taskId);
    },

    updateTaskStatus(taskId, status) {
      const task = tasks.get(taskId);
      if (!task) return undefined;
      const updated: AgentTask = {
        ...task,
        status,
        updatedAt: new Date().toISOString(),
      };
      tasks.set(taskId, updated);
      this.appendEvent(taskId, {
        type: "task_status",
        taskId,
        status,
        createdAt: updated.updatedAt,
      });
      persist();
      return updated;
    },

    appendEvent(taskId, event) {
      const taskEvents = events.get(taskId) ?? [];
      taskEvents.push(event);
      events.set(taskId, taskEvents);
      persist();
    },

    listEvents(taskId) {
      return events.get(taskId) ?? [];
    },

    createApproval(input) {
      const now = new Date().toISOString();
      const approval: ApprovalRequest = {
        id: randomUUID(),
        taskId: input.taskId,
        action: input.action,
        risk: input.risk,
        summary: input.summary,
        ...(input.command ? { command: input.command } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.affectedPaths ? { affectedPaths: input.affectedPaths } : {}),
        createdAt: now,
      };
      approvals.set(approval.id, approval);
      this.appendEvent(input.taskId, {
        type: "approval_request",
        approval,
        createdAt: now,
      });
      this.updateTaskStatus(input.taskId, "waiting_approval");
      persist();
      return approval;
    },

    listApprovals() {
      return [...approvals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    getApproval(approvalId) {
      return approvals.get(approvalId);
    },

    decideApproval(approvalId, decision) {
      const approval = approvals.get(approvalId);
      if (!approval) return undefined;
      const record: ApprovalDecisionRecord = {
        approvalId,
        taskId: approval.taskId,
        decision: decision.decision,
        ...(decision.note ? { note: decision.note } : {}),
        decidedAt: new Date().toISOString(),
      };
      decisions.set(approvalId, record);
      approvals.delete(approvalId);
      this.appendEvent(approval.taskId, {
        type: "message",
        role: "system",
        text: `Approval ${decision.decision}: ${approval.summary}`,
        createdAt: record.decidedAt,
      });
      this.updateTaskStatus(approval.taskId, decision.decision === "deny" ? "cancelled" : "queued");
      persist();
      return record;
    },
  };

  function loadPersistedState() {
    if (!persistPath || !existsSync(persistPath)) return;
    try {
      const parsed = JSON.parse(readFileSync(persistPath, "utf8")) as PersistedTaskState;
      for (const task of parsed.tasks ?? []) tasks.set(task.id, task);
      for (const taskEvents of parsed.events ?? []) events.set(taskEvents.taskId, taskEvents.events);
      for (const approval of parsed.approvals ?? []) approvals.set(approval.id, approval);
      for (const decision of parsed.decisions ?? []) decisions.set(decision.approvalId, decision);
    } catch {
      return;
    }
  }

  function persist() {
    if (!persistPath) return;
    const state: PersistedTaskState = {
      tasks: [...tasks.values()],
      events: [...events.entries()].map(([taskId, taskEvents]) => ({ taskId, events: taskEvents })),
      approvals: [...approvals.values()],
      decisions: [...decisions.values()],
    };
    mkdirSync(dirname(persistPath), { recursive: true });
    writeFileSync(persistPath, JSON.stringify(state, null, 2));
  }
}
