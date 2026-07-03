import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
import { createBillingStore } from "./billing-store";

export interface SyncOutboxEvent {
  id: number;
  tenantId?: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export function createSqliteTaskStore(path: string, options: { tenantId?: string } = {}): TaskStore {
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);
  const tenantId = options.tenantId;
  const billingStore = createBillingStore(path);

  return {
    createTask(input) {
      const now = new Date().toISOString();
      const task: AgentTask = {
        id: randomUUID(),
        ...(tenantId ? { tenantId } : {}),
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
      const query = db.select().from(agentTasks).where(tenantFilter(agentTasks.tenantId)).orderBy(desc(agentTasks.createdAt));
      return query.all().map(fromTaskRow);
    },

    getTask(taskId) {
      const row = db.select().from(agentTasks).where(and(eq(agentTasks.id, taskId), tenantFilter(agentTasks.tenantId))).get();
      return row ? fromTaskRow(row) : undefined;
    },

    deleteTask(taskId) {
      const task = this.getTask(taskId);
      if (!task) return undefined;
      db.delete(agentEvents).where(and(eq(agentEvents.taskId, taskId), tenantFilter(agentEvents.tenantId))).run();
      db.delete(approvalRequests).where(and(eq(approvalRequests.taskId, taskId), tenantFilter(approvalRequests.tenantId))).run();
      db.delete(approvalDecisions).where(and(eq(approvalDecisions.taskId, taskId), tenantFilter(approvalDecisions.tenantId))).run();
      db.delete(agentTasks).where(and(eq(agentTasks.id, taskId), tenantFilter(agentTasks.tenantId))).run();
      writeSyncEvent("agent_task", taskId, "deleted", task);
      return task;
    },

    updateTaskPrompt(taskId, prompt) {
      const task = this.getTask(taskId);
      if (!task) return undefined;
      const updated: AgentTask = { ...task, prompt, updatedAt: new Date().toISOString() };
      db.update(agentTasks)
        .set({ prompt: updated.prompt, updatedAt: updated.updatedAt })
        .where(and(eq(agentTasks.id, taskId), tenantFilter(agentTasks.tenantId)))
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
        .where(and(eq(agentTasks.id, taskId), tenantFilter(agentTasks.tenantId)))
        .run();
      writeSyncEvent("agent_task", taskId, "status_updated", updated);
      this.appendEvent(taskId, { type: "task_status", taskId, status, createdAt: updated.updatedAt });
      return updated;
    },

    appendEvent(taskId, event) {
      const eventTenantId = requireScopedTaskTenantId(taskId);
      db.insert(agentEvents)
        .values({
          id: randomUUID(),
          tenantId: eventTenantId,
          taskId,
          eventType: event.type,
          payload: JSON.stringify(event),
          createdAt: event.createdAt,
        })
        .run();
      if (event.type === "usage" && eventTenantId) {
        billingStore.recordUsage({ tenantId: eventTenantId, taskId, event });
      }
      writeSyncEvent("agent_event", taskId, event.type, event);
      publishTaskChange(taskId);
    },

    listEvents(taskId) {
      return sqlite.prepare(`
        SELECT payload
        FROM agent_events
        WHERE task_id = ?
          ${tenantId ? "AND tenant_id = ?" : ""}
        ORDER BY created_at ASC, rowid ASC
      `).all(...(tenantId ? [taskId, tenantId] : [taskId])).map((row) => sanitizeDisplayEvent(JSON.parse((row as { payload: string }).payload) as AgentEvent));
    },

    createApproval(input) {
      const approvalTenantId = requireScopedTaskTenantId(input.taskId);
      const approval = createApprovalRecord(input);
      db.insert(approvalRequests)
        .values({
          id: approval.id,
          tenantId: approvalTenantId,
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
      return db.select().from(approvalRequests)
        .where(tenantFilter(approvalRequests.tenantId))
        .orderBy(desc(approvalRequests.createdAt))
        .all()
        .map(fromApprovalRow);
    },

    getApproval(approvalId) {
      const row = db.select().from(approvalRequests)
        .where(and(eq(approvalRequests.id, approvalId), tenantFilter(approvalRequests.tenantId)))
        .get();
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
          tenantId: approval.tenantId ?? requireScopedTaskTenantId(record.taskId),
          taskId: record.taskId,
          decision: record.decision,
          note: record.note ?? null,
          decidedAt: record.decidedAt,
        })
        .run();
      writeSyncEvent("approval_decision", record.approvalId, record.decision, record);
      db.delete(approvalRequests).where(and(eq(approvalRequests.id, approvalId), tenantFilter(approvalRequests.tenantId))).run();
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
        .where(and(eq(approvalGrants.action, input.action), tenantFilter(approvalGrants.tenantId)))
        .all()
        .find((grant) => grant.providerId === input.providerId && grant.workspacePath === input.workspacePath);
      return Boolean(row);
    },

    createWorkspaceApprovalGrant(input) {
      const now = new Date().toISOString();
      const grant = {
        id: randomUUID(),
        tenantId: tenantId ?? null,
        action: input.action,
        providerId: input.providerId,
        workspacePath: input.workspacePath,
        sourceApprovalId: input.sourceApprovalId ?? null,
        createdAt: now,
      };
      sqlite.prepare(`
        INSERT OR REPLACE INTO approval_grants
          (id, tenant_id, action, provider_id, workspace_path, source_approval_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(grant.id, grant.tenantId, grant.action, grant.providerId, grant.workspacePath, grant.sourceApprovalId, grant.createdAt);
      writeSyncEvent("approval_grant", grant.id, "created", grant);
    },
  };

  function writeSyncEvent(entityType: string, entityId: string, eventType: string, payload: unknown): void {
    db.insert(syncEvents)
      .values({
        tenantId: tenantId ?? null,
        entityType,
        entityId,
        eventType,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
        pushedAt: null,
      })
      .run();
  }

  function tenantFilter(column: any) {
    return tenantId ? eq(column, tenantId) : undefined;
  }

  function requireScopedTaskTenantId(taskId: string): string | null {
    const row = db.select({ tenantId: agentTasks.tenantId })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), tenantFilter(agentTasks.tenantId)))
      .get();
    if (!row) throw new Error(`Task not found in tenant scope: ${taskId}`);
    return row.tenantId ?? tenantId ?? null;
  }
}

function extractDisplayPrompt(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const markerMatch = normalized.match(/(?:最新输入|输入内容)\s*[:：]\s*([\s\S]*)$/u);
  if (markerMatch?.[1]?.trim()) return stripLeakedPageContext(markerMatch[1]);
  if (/你是\s+Ucareer\s+职业旅程工作台的统一入口\s+Agent/u.test(normalized)) return "";
  return stripLeakedPageContext(normalized);
}

function sanitizeDisplayEvent(event: AgentEvent): AgentEvent {
  if (event.type !== "message" || event.role !== "user") return event;
  return { ...event, text: stripLeakedPageContext(event.text) };
}

function stripLeakedPageContext(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("page: ")) return normalized;
  const lines = normalized.split("\n");
  const writePathsIndex = lines.findIndex((line) => line.trim().startsWith("write paths:"));
  if (writePathsIndex >= 0) return lines.slice(writePathsIndex + 1).join("\n").trim();
  return normalized.replace(/^page:\s+[\s\S]*?(?:write paths:\s*[^\n]*(?:\n|$))/u, "").trim();
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

export function listSyncOutbox(path: string, limit = 100, tenantId?: string): SyncOutboxEvent[] {
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);
  return db
    .select()
    .from(syncEvents)
    .where(and(isNull(syncEvents.pushedAt), tenantId ? eq(syncEvents.tenantId, tenantId) : undefined))
    .orderBy(syncEvents.id)
    .limit(limit)
    .all()
    .map((row) => ({
      id: row.id,
      ...(row.tenantId ? { tenantId: row.tenantId } : {}),
      entityType: row.entityType,
      entityId: row.entityId,
      eventType: row.eventType,
      payload: JSON.parse(row.payload) as unknown,
      createdAt: row.createdAt,
    }));
}

export function markSyncEventsPushed(path: string, ids: number[], tenantId?: string): number {
  if (ids.length === 0) return 0;
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);
  const pushedAt = new Date().toISOString();
  const result = db.update(syncEvents)
    .set({ pushedAt })
    .where(and(inArray(syncEvents.id, ids), tenantId ? eq(syncEvents.tenantId, tenantId) : undefined))
    .run();
  return result.changes;
}

function toTaskRow(task: AgentTask) {
  return {
    id: task.id,
    tenantId: task.tenantId ?? null,
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
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
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
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
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
