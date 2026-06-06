import { randomUUID } from "node:crypto";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type {
  AgentEvent,
  AgentTask,
  ApprovalDecisionRequest,
  ApprovalRequest,
  EntityId,
} from "@offeru/shared";
import type { ApprovalDecisionRecord, CreateApprovalInput, CreateTaskInput, TaskStore } from "./task-store";
import { openDaemonDatabase } from "./db/sqlite";
import { agentEvents, agentTasks, approvalDecisions, approvalRequests, syncEvents } from "./db/schema";

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
      db.insert(agentTasks).values(toTaskRow(task)).run();
      writeSyncEvent("agent_task", task.id, "created", task);
      this.appendEvent(task.id, { type: "task_status", taskId: task.id, status: "queued", createdAt: now });
      this.appendEvent(task.id, { type: "message", role: "user", text: task.prompt, createdAt: now });
      return task;
    },

    listTasks() {
      return db.select().from(agentTasks).orderBy(desc(agentTasks.createdAt)).all().map(fromTaskRow);
    },

    getTask(taskId) {
      const row = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
      return row ? fromTaskRow(row) : undefined;
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
    },

    listEvents(taskId) {
      return db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.taskId, taskId))
        .orderBy(agentEvents.createdAt)
        .all()
        .map((row) => JSON.parse(row.payload) as AgentEvent);
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
      this.appendEvent(approval.taskId, {
        type: "message",
        role: "system",
        text: `Approval ${decision.decision}: ${approval.summary}`,
        createdAt: record.decidedAt,
      });
      this.updateTaskStatus(approval.taskId, decision.decision === "deny" ? "cancelled" : "queued");
      return record;
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
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function fromTaskRow(row: typeof agentTasks.$inferSelect): AgentTask {
  return {
    id: row.id,
    providerId: row.providerId,
    workspacePath: row.workspacePath,
    prompt: row.prompt,
    mode: row.mode as AgentTask["mode"],
    status: row.status as AgentTask["status"],
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
