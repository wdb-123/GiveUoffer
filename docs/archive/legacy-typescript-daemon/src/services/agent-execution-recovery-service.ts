import { randomUUID } from "node:crypto";
import type { AgentEvent, AgentTask, RouteDecision } from "@ucareer/shared";
import { openDaemonDatabase } from "../db/sqlite";
import { createWorkflowRunService } from "./workflow-run-service";
import { createSqliteWorkflowRunStore } from "../stores/workflow-run-store";

interface AgentTaskRow {
  id: string;
  tenant_id: string | null;
  provider_id: string;
  workspace_path: string;
  prompt: string;
  mode: string;
  status: string;
  skill_id: string | null;
  workflow_id: string | null;
  workflow_run_id: string | null;
  input_kind: string | null;
  source_text: string | null;
  route_decision: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentExecutionRecoveryResult {
  failedRunning: number;
  failedQueued: number;
}

export function recoverInterruptedAgentExecutions(input: { daemonDbPath: string }): AgentExecutionRecoveryResult {
  const db = openDaemonDatabase(input.daemonDbPath);
  const rows = db.prepare(`
    SELECT *
    FROM agent_tasks AS task
    WHERE task.status IN ('running', 'queued')
      AND NOT EXISTS (
        SELECT 1
        FROM approval_requests AS approval
        WHERE approval.task_id = task.id
          AND (
            approval.tenant_id = task.tenant_id
            OR (approval.tenant_id IS NULL AND task.tenant_id IS NULL)
          )
      )
    ORDER BY task.updated_at ASC
  `).all() as AgentTaskRow[];
  let failedRunning = 0;
  let failedQueued = 0;

  for (const row of rows) {
    const task = taskFromRow(row);
    const wasRunning = task.status === "running";
    const message = wasRunning
      ? "本地 Agent 执行在 daemon 重启或进程退出时中断，请重新发送这条消息。"
      : "本地 Agent 任务已获准但 daemon 在启动前重启。为避免无人确认时自动执行本地操作，已标记失败；请重新发送或继续该任务。";
    const failedTask = markTaskFailed(db, task, message);
    syncWorkflow(input.daemonDbPath, failedTask);
    if (wasRunning) failedRunning += 1;
    else failedQueued += 1;
  }

  return { failedRunning, failedQueued };
}

function markTaskFailed(db: ReturnType<typeof openDaemonDatabase>, task: AgentTask, message: string): AgentTask {
  const now = new Date().toISOString();
  const failedTask: AgentTask = { ...task, status: "failed", updatedAt: now };
  db.prepare(`
    UPDATE agent_tasks
    SET status = 'failed', updated_at = ?
    WHERE id = ?
      AND (
        tenant_id = ?
        OR (tenant_id IS NULL AND ? IS NULL)
      )
  `).run(now, task.id, task.tenantId ?? null, task.tenantId ?? null);

  insertAgentEvent(db, task, {
    type: "error",
    message,
    provider: task.providerId,
    createdAt: now,
  });
  insertAgentEvent(db, task, {
    type: "task_status",
    taskId: task.id,
    status: "failed",
    createdAt: now,
  });
  writeSyncEvent(db, task.tenantId, "agent_task", task.id, "status_updated", failedTask);
  return failedTask;
}

function insertAgentEvent(db: ReturnType<typeof openDaemonDatabase>, task: AgentTask, event: AgentEvent): void {
  db.prepare(`
    INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), task.tenantId ?? null, task.id, event.type, JSON.stringify(event), event.createdAt);
  writeSyncEvent(db, task.tenantId, "agent_event", task.id, event.type, event);
}

function writeSyncEvent(
  db: ReturnType<typeof openDaemonDatabase>,
  tenantId: string | undefined,
  entityType: string,
  entityId: string,
  eventType: string,
  payload: unknown,
): void {
  db.prepare(`
    INSERT INTO sync_events (tenant_id, entity_type, entity_id, event_type, payload, created_at, pushed_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(tenantId ?? null, entityType, entityId, eventType, JSON.stringify(payload), new Date().toISOString());
}

function syncWorkflow(dbPath: string, task: AgentTask): void {
  if (!task.workflowId || !task.workflowRunId) return;
  createWorkflowRunService({
    workflowRunStore: createSqliteWorkflowRunStore(dbPath, task.tenantId ? { tenantId: task.tenantId } : {}),
  }).syncTaskStatus(task);
}

function taskFromRow(row: AgentTaskRow): AgentTask {
  const routeDecision = row.route_decision ? (JSON.parse(row.route_decision) as RouteDecision) : undefined;
  return {
    id: row.id,
    ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
    providerId: row.provider_id,
    workspacePath: row.workspace_path,
    prompt: row.prompt,
    mode: row.mode as AgentTask["mode"],
    status: row.status as AgentTask["status"],
    ...(row.skill_id ? { skillId: row.skill_id } : {}),
    ...(row.workflow_id ? { workflowId: row.workflow_id } : {}),
    ...(row.workflow_run_id ? { workflowRunId: row.workflow_run_id } : {}),
    ...(row.input_kind ? { inputKind: row.input_kind } : {}),
    ...(row.source_text ? { sourceText: row.source_text } : {}),
    ...(routeDecision ? { routeDecision } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
