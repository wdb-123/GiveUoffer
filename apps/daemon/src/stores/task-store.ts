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
} from "@ucareer/shared";

export interface TaskStore {
  createTask(input: CreateTaskInput): AgentTask;
  listTasks(): AgentTask[];
  getTask(taskId: EntityId): AgentTask | undefined;
  deleteTask(taskId: EntityId): AgentTask | undefined;
  updateTaskPrompt(taskId: EntityId, prompt: string): AgentTask | undefined;
  updateTaskStatus(taskId: EntityId, status: TaskStatus): AgentTask | undefined;
  appendEvent(taskId: EntityId, event: AgentEvent): void;
  listEvents(taskId: EntityId): AgentEvent[];
  createApproval(input: CreateApprovalInput): ApprovalRequest;
  listApprovals(): ApprovalRequest[];
  getApproval(approvalId: EntityId): ApprovalRequest | undefined;
  decideApproval(approvalId: EntityId, decision: ApprovalDecisionRequest): ApprovalDecisionRecord | undefined;
  hasWorkspaceApprovalGrant(input: WorkspaceApprovalGrantInput): boolean;
  createWorkspaceApprovalGrant(input: WorkspaceApprovalGrantInput & { sourceApprovalId?: string }): void;
}

export interface CreateTaskInput {
  providerId: EntityId;
  workspacePath: string;
  prompt: string;
  mode: "structured" | "pty";
  routeMetadata?: CreateAgentTaskRequest["routeMetadata"];
}

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

export interface WorkspaceApprovalGrantInput {
  action: PermissionAction;
  providerId: string;
  workspacePath: string;
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
        ...(input.routeMetadata?.skillId ? { skillId: input.routeMetadata.skillId } : {}),
        ...(input.routeMetadata?.workflowId ? { workflowId: input.routeMetadata.workflowId } : {}),
        ...(input.routeMetadata?.workflowRunId ? { workflowRunId: input.routeMetadata.workflowRunId } : {}),
        ...(input.routeMetadata?.inputKind ? { inputKind: input.routeMetadata.inputKind } : {}),
        ...(input.routeMetadata?.sourceText ? { sourceText: input.routeMetadata.sourceText } : {}),
        ...(input.routeMetadata?.routeDecision ? { routeDecision: input.routeMetadata.routeDecision } : {}),
        createdAt: now,
        updatedAt: now,
      };
      tasks.set(task.id, task);
      events.set(task.id, [
        { type: "task_status", taskId: task.id, status: "queued", createdAt: now },
        { type: "message", role: "user", text: extractDisplayPrompt(task.prompt), createdAt: now },
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

    deleteTask(taskId) {
      const task = tasks.get(taskId);
      if (!task) return undefined;
      tasks.delete(taskId);
      events.delete(taskId);
      for (const [approvalId, approval] of approvals.entries()) {
        if (approval.taskId === taskId) approvals.delete(approvalId);
      }
      for (const [decisionId, decision] of decisions.entries()) {
        if (decision.taskId === taskId) decisions.delete(decisionId);
      }
      persist();
      return task;
    },

    updateTaskPrompt(taskId, prompt) {
      const task = tasks.get(taskId);
      if (!task) return undefined;
      const updated: AgentTask = {
        ...task,
        prompt,
        updatedAt: new Date().toISOString(),
      };
      tasks.set(taskId, updated);
      persist();
      return updated;
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

    hasWorkspaceApprovalGrant() {
      return false;
    },

    createWorkspaceApprovalGrant() {
      return;
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

function extractDisplayPrompt(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const markerMatch = normalized.match(/(?:最新输入|输入内容)\s*[:：]\s*([\s\S]*)$/u);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();
  if (/你是\s+Ucareer\s+职业旅程工作台的统一入口\s+Agent/u.test(normalized)) return "";
  return normalized;
}
