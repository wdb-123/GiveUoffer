import { randomUUID } from "node:crypto";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type {
  AgentEvent,
  AgentTask,
  ApprovalDecisionRequest,
  ApprovalRequest,
  EntityId,
  RouteDecision,
} from "@ucareer/shared";
import type { ApprovalDecisionRecord, CreateApprovalInput, CreateTaskInput, TaskStore } from "./task-store";
import { publishTaskChange } from "./task-change-bus";
import { openDaemonDatabase } from "../db/sqlite";
import { agentEvents, agentTasks, approvalDecisions, approvalGrants, approvalRequests, syncEvents } from "../db/schema";

export interface SyncOutboxEvent {
  id: number;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export function createSqliteTaskStore(path: string): TaskStore {
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);

  recoverInterruptedTasks();

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
      db.insert(agentTasks).values(toTaskRow(task)).run();
      writeSyncEvent("agent_task", task.id, "created", task);
      this.appendEvent(task.id, { type: "task_status", taskId: task.id, status: "queued", createdAt: now });
      this.appendEvent(task.id, { type: "message", role: "user", text: extractDisplayPrompt(task.prompt), createdAt: now });
      return task;
    },

    listTasks() {
      return db.select().from(agentTasks).orderBy(desc(agentTasks.createdAt)).all().map(fromTaskRow);
    },

    getTask(taskId) {
      const row = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
      return row ? fromTaskRow(row) : undefined;
    },

    deleteTask(taskId) {
      const task = this.getTask(taskId);
      if (!task) return undefined;
      db.delete(agentEvents).where(eq(agentEvents.taskId, taskId)).run();
      db.delete(approvalRequests).where(eq(approvalRequests.taskId, taskId)).run();
      db.delete(approvalDecisions).where(eq(approvalDecisions.taskId, taskId)).run();
      db.delete(agentTasks).where(eq(agentTasks.id, taskId)).run();
      writeSyncEvent("agent_task", taskId, "deleted", task);
      return task;
    },

    updateTaskPrompt(taskId, prompt) {
      const task = this.getTask(taskId);
      if (!task) return undefined;
      const updated: AgentTask = { ...task, prompt, updatedAt: new Date().toISOString() };
      db.update(agentTasks)
        .set({ prompt: updated.prompt, updatedAt: updated.updatedAt })
        .where(eq(agentTasks.id, taskId))
        .run();
      writeSyncEvent("agent_task", taskId, "prompt_updated", updated);
      publishTaskChange(taskId);
      return updated;
    },

    updateTaskStatus(taskId, status) {
      const task = this.getTask(taskId);
      if (!task) return undefined;
      const updated: AgentTask = { ...task, status, updatedAt: new Date().toISOString() };
      db.update(agentTasks)
        .set({ status: updated.status, updatedAt: updated.updatedAt })
        .where(eq(agentTasks.id, taskId))
        .run();
      writeSyncEvent("agent_task", taskId, "status_updated", updated);
      this.appendEvent(taskId, { type: "task_status", taskId, status, createdAt: updated.updatedAt });
      return updated;
    },

    appendEvent(taskId, event) {
      db.insert(agentEvents)
        .values({
          id: randomUUID(),
          taskId,
          eventType: event.type,
          payload: JSON.stringify(event),
          createdAt: event.createdAt,
        })
        .run();
      writeSyncEvent("agent_event", taskId, event.type, event);
      publishTaskChange(taskId);
    },

    listEvents(taskId) {
      return sqlite.prepare(`
        SELECT payload
        FROM agent_events
        WHERE task_id = ?
        ORDER BY created_at ASC, rowid ASC
      `).all(taskId).map((row) => JSON.parse((row as { payload: string }).payload) as AgentEvent);
    },

    createApproval(input) {
      const approval = createApprovalRecord(input);
      db.insert(approvalRequests)
        .values({
          id: approval.id,
          taskId: approval.taskId,
          action: approval.action,
          risk: approval.risk,
          summary: approval.summary,
          command: approval.command ?? null,
          cwd: approval.cwd ?? null,
          affectedPaths: approval.affectedPaths ? JSON.stringify(approval.affectedPaths) : null,
          createdAt: approval.createdAt,
        })
        .run();
      writeSyncEvent("approval_request", approval.id, "created", approval);
      this.appendEvent(input.taskId, { type: "approval_request", approval, createdAt: approval.createdAt });
      this.updateTaskStatus(input.taskId, "waiting_approval");
      return approval;
    },

    listApprovals() {
      return db.select().from(approvalRequests).orderBy(desc(approvalRequests.createdAt)).all().map(fromApprovalRow);
    },

    getApproval(approvalId) {
      const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalId)).get();
      return row ? fromApprovalRow(row) : undefined;
    },

    decideApproval(approvalId, decision) {
      const approval = this.getApproval(approvalId);
      if (!approval) return undefined;
      const record: ApprovalDecisionRecord = {
        approvalId,
        taskId: approval.taskId,
        decision: decision.decision,
        ...(decision.note ? { note: decision.note } : {}),
        decidedAt: new Date().toISOString(),
      };
      db.insert(approvalDecisions)
        .values({
          approvalId: record.approvalId,
          taskId: record.taskId,
          decision: record.decision,
          note: record.note ?? null,
          decidedAt: record.decidedAt,
        })
        .run();
      writeSyncEvent("approval_decision", record.approvalId, record.decision, record);
      db.delete(approvalRequests).where(eq(approvalRequests.id, approvalId)).run();
      if (record.decision === "allow_workspace") {
        const grant = parseStartAgentGrant(approval.command, approval.id);
        if (grant) this.createWorkspaceApprovalGrant(grant);
      }
      this.appendEvent(approval.taskId, {
        type: "message",
        role: "system",
        text: `Approval ${decision.decision}: ${approval.summary}`,
        createdAt: record.decidedAt,
      });
      this.updateTaskStatus(approval.taskId, decision.decision === "deny" ? "cancelled" : "queued");
      return record;
    },

    hasWorkspaceApprovalGrant(input) {
      const row = db
        .select()
        .from(approvalGrants)
        .where(eq(approvalGrants.action, input.action))
        .all()
        .find((grant) => grant.providerId === input.providerId && grant.workspacePath === input.workspacePath);
      return Boolean(row);
    },

    createWorkspaceApprovalGrant(input) {
      const now = new Date().toISOString();
      const grant = {
        id: randomUUID(),
        action: input.action,
        providerId: input.providerId,
        workspacePath: input.workspacePath,
        sourceApprovalId: input.sourceApprovalId ?? null,
        createdAt: now,
      };
      sqlite.prepare(`
        INSERT OR REPLACE INTO approval_grants
          (id, action, provider_id, workspace_path, source_approval_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(grant.id, grant.action, grant.providerId, grant.workspacePath, grant.sourceApprovalId, grant.createdAt);
      writeSyncEvent("approval_grant", grant.id, "created", grant);
    },
  };

  function writeSyncEvent(entityType: string, entityId: string, eventType: string, payload: unknown): void {
    db.insert(syncEvents)
      .values({
        entityType,
        entityId,
        eventType,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
        pushedAt: null,
      })
      .run();
  }

  function recoverInterruptedTasks(): void {
    const interrupted = db.select().from(agentTasks).where(eq(agentTasks.status, "running")).all();
    for (const row of interrupted) {
      const now = new Date().toISOString();
      const task = fromTaskRow(row);
      const updated: AgentTask = { ...task, status: "failed", updatedAt: now };
      db.update(agentTasks)
        .set({ status: updated.status, updatedAt: updated.updatedAt })
        .where(eq(agentTasks.id, task.id))
        .run();
      const event: AgentEvent = {
        type: "error",
        message: "本地 Codex 执行在 daemon 重启或进程退出时中断，请重新发送这条消息。",
        provider: task.providerId,
        createdAt: now,
      };
      db.insert(agentEvents)
        .values({
          id: randomUUID(),
          taskId: task.id,
          eventType: event.type,
          payload: JSON.stringify(event),
          createdAt: now,
        })
        .run();
      writeSyncEvent("agent_task", task.id, "recovered_interrupted", updated);
      writeSyncEvent("agent_event", task.id, event.type, event);
    }
  }
}

function extractDisplayPrompt(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const markerMatch = normalized.match(/(?:最新输入|输入内容)\s*[:：]\s*([\s\S]*)$/u);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();
  if (/你是\s+Ucareer\s+职业旅程工作台的统一入口\s+Agent/u.test(normalized)) return "";
  return normalized;
}

function parseStartAgentGrant(command: string | undefined, sourceApprovalId: string) {
  if (!command) return undefined;
  try {
    const parsed = JSON.parse(command) as { providerId?: unknown; workspacePath?: unknown };
    if (typeof parsed.providerId !== "string" || typeof parsed.workspacePath !== "string") return undefined;
    return {
      action: "start_agent" as const,
      providerId: parsed.providerId,
      workspacePath: parsed.workspacePath,
      sourceApprovalId,
    };
  } catch {
    return undefined;
  }
}

export function listSyncOutbox(path: string, limit = 100): SyncOutboxEvent[] {
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);
  return db
    .select()
    .from(syncEvents)
    .where(isNull(syncEvents.pushedAt))
    .orderBy(syncEvents.id)
    .limit(limit)
    .all()
    .map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      eventType: row.eventType,
      payload: JSON.parse(row.payload) as unknown,
      createdAt: row.createdAt,
    }));
}

export function markSyncEventsPushed(path: string, ids: number[]): number {
  if (ids.length === 0) return 0;
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);
  const pushedAt = new Date().toISOString();
  db.update(syncEvents).set({ pushedAt }).where(inArray(syncEvents.id, ids)).run();
  return ids.length;
}

function toTaskRow(task: AgentTask) {
  return {
    id: task.id,
    providerId: task.providerId,
    workspacePath: task.workspacePath,
    prompt: task.prompt,
    mode: task.mode,
    status: task.status,
    skillId: task.skillId ?? null,
    workflowId: task.workflowId ?? null,
    workflowRunId: task.workflowRunId ?? null,
    inputKind: task.inputKind ?? null,
    sourceText: task.sourceText ?? null,
    routeDecision: task.routeDecision ? JSON.stringify(task.routeDecision) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function fromTaskRow(row: typeof agentTasks.$inferSelect): AgentTask {
  const routeDecision = row.routeDecision ? (JSON.parse(row.routeDecision) as RouteDecision) : undefined;
  return {
    id: row.id,
    providerId: row.providerId,
    workspacePath: row.workspacePath,
    prompt: row.prompt,
    mode: row.mode as AgentTask["mode"],
    status: row.status as AgentTask["status"],
    ...(row.skillId ? { skillId: row.skillId } : {}),
    ...(row.workflowId ? { workflowId: row.workflowId } : {}),
    ...(row.workflowRunId ? { workflowRunId: row.workflowRunId } : {}),
    ...(row.inputKind ? { inputKind: row.inputKind } : {}),
    ...(row.sourceText ? { sourceText: row.sourceText } : {}),
    ...(routeDecision ? { routeDecision } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function createApprovalRecord(input: CreateApprovalInput): ApprovalRequest {
  const now = new Date().toISOString();
  return {
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
}

function fromApprovalRow(row: typeof approvalRequests.$inferSelect): ApprovalRequest {
  return {
    id: row.id,
    taskId: row.taskId,
    action: row.action as ApprovalRequest["action"],
    risk: row.risk as ApprovalRequest["risk"],
    summary: row.summary,
    ...(row.command ? { command: row.command } : {}),
    ...(row.cwd ? { cwd: row.cwd } : {}),
    ...(row.affectedPaths ? { affectedPaths: JSON.parse(row.affectedPaths) as string[] } : {}),
    createdAt: row.createdAt,
  };
}
