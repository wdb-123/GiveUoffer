import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type {
  EntityId,
  RouteDecision,
  TaskStatus,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStepRun,
} from "@ucareer/shared";
import { openDaemonDatabase } from "../db/sqlite";
import { syncEvents, workflowRuns, workflowStepRuns } from "../db/schema";

export interface WorkflowRunStore {
  createRun(input: CreateWorkflowRunInput): WorkflowRun;
  listRuns(): WorkflowRun[];
  getRun(runId: EntityId): WorkflowRun | undefined;
  attachTask(runId: EntityId, taskId: EntityId): WorkflowRun | undefined;
  updateRunStatus(runId: EntityId, status: TaskStatus, currentStepId?: EntityId): WorkflowRun | undefined;
  listStepRuns(runId: EntityId): WorkflowStepRun[];
  updateStepRun(input: UpdateWorkflowStepRunInput): WorkflowStepRun | undefined;
}

export interface CreateWorkflowRunInput {
  workflow: WorkflowDefinition;
  skillId?: EntityId;
  sourceText?: string;
  routeDecision?: RouteDecision;
}

export interface UpdateWorkflowStepRunInput {
  workflowRunId: EntityId;
  stepId: EntityId;
  status: TaskStatus;
  taskId?: EntityId;
  approvalId?: EntityId;
}

export function createSqliteWorkflowRunStore(path: string): WorkflowRunStore {
  const sqlite = openDaemonDatabase(path);
  const db = drizzle(sqlite);

  return {
    createRun(input) {
      const now = new Date().toISOString();
      const firstStep = input.workflow.steps[0];
      const run: WorkflowRun = {
        id: randomUUID(),
        workflowId: input.workflow.id,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(firstStep ? { currentStepId: firstStep.id } : {}),
        status: "queued",
        ...(input.sourceText ? { sourceText: input.sourceText } : {}),
        ...(input.routeDecision ? { routeDecision: input.routeDecision } : {}),
        createdAt: now,
        updatedAt: now,
      };

      db.insert(workflowRuns).values(toRunRow(run)).run();
      writeSyncEvent("workflow_run", run.id, "created", run);

      for (const step of input.workflow.steps) {
        const stepRun: WorkflowStepRun = {
          id: randomUUID(),
          workflowRunId: run.id,
          stepId: step.id,
          status: step.id === firstStep?.id ? "queued" : "queued",
          createdAt: now,
          updatedAt: now,
        };
        db.insert(workflowStepRuns).values(toStepRunRow(stepRun)).run();
        writeSyncEvent("workflow_step_run", stepRun.id, "created", stepRun);
      }

      return run;
    },

    listRuns() {
      return db.select().from(workflowRuns).orderBy(desc(workflowRuns.updatedAt)).all().map(fromRunRow);
    },

    getRun(runId) {
      const row = db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get();
      return row ? fromRunRow(row) : undefined;
    },

    attachTask(runId, taskId) {
      const run = this.getRun(runId);
      if (!run) return undefined;
      const updated: WorkflowRun = { ...run, taskId, updatedAt: new Date().toISOString() };
      db.update(workflowRuns)
        .set({ taskId, updatedAt: updated.updatedAt })
        .where(eq(workflowRuns.id, runId))
        .run();
      writeSyncEvent("workflow_run", runId, "task_attached", updated);
      return updated;
    },

    updateRunStatus(runId, status, currentStepId) {
      const run = this.getRun(runId);
      if (!run) return undefined;
      const updated: WorkflowRun = {
        ...run,
        status,
        ...(currentStepId ? { currentStepId } : {}),
        updatedAt: new Date().toISOString(),
      };
      db.update(workflowRuns)
        .set({
          status: updated.status,
          currentStepId: updated.currentStepId ?? null,
          updatedAt: updated.updatedAt,
        })
        .where(eq(workflowRuns.id, runId))
        .run();
      writeSyncEvent("workflow_run", runId, "status_updated", updated);
      return updated;
    },

    listStepRuns(runId) {
      return db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, runId)).all().map(fromStepRunRow);
    },

    updateStepRun(input) {
      const stepRun = db
        .select()
        .from(workflowStepRuns)
        .where(eq(workflowStepRuns.workflowRunId, input.workflowRunId))
        .all()
        .map(fromStepRunRow)
        .find((item) => item.stepId === input.stepId);
      if (!stepRun) return undefined;
      const updated: WorkflowStepRun = {
        ...stepRun,
        status: input.status,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.approvalId ? { approvalId: input.approvalId } : {}),
        updatedAt: new Date().toISOString(),
      };
      db.update(workflowStepRuns)
        .set({
          status: updated.status,
          taskId: updated.taskId ?? null,
          approvalId: updated.approvalId ?? null,
          updatedAt: updated.updatedAt,
        })
        .where(eq(workflowStepRuns.id, updated.id))
        .run();
      writeSyncEvent("workflow_step_run", updated.id, "status_updated", updated);
      return updated;
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

function toRunRow(run: WorkflowRun) {
  return {
    id: run.id,
    workflowId: run.workflowId,
    skillId: run.skillId ?? null,
    taskId: run.taskId ?? null,
    currentStepId: run.currentStepId ?? null,
    status: run.status,
    sourceText: run.sourceText ?? null,
    routeDecision: run.routeDecision ? JSON.stringify(run.routeDecision) : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function fromRunRow(row: typeof workflowRuns.$inferSelect): WorkflowRun {
  const routeDecision = row.routeDecision ? (JSON.parse(row.routeDecision) as RouteDecision) : undefined;
  return {
    id: row.id,
    workflowId: row.workflowId,
    ...(row.skillId ? { skillId: row.skillId } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.currentStepId ? { currentStepId: row.currentStepId } : {}),
    status: row.status as WorkflowRun["status"],
    ...(row.sourceText ? { sourceText: row.sourceText } : {}),
    ...(routeDecision ? { routeDecision } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStepRunRow(stepRun: WorkflowStepRun) {
  return {
    id: stepRun.id,
    workflowRunId: stepRun.workflowRunId,
    stepId: stepRun.stepId,
    status: stepRun.status,
    taskId: stepRun.taskId ?? null,
    approvalId: stepRun.approvalId ?? null,
    createdAt: stepRun.createdAt,
    updatedAt: stepRun.updatedAt,
  };
}

function fromStepRunRow(row: typeof workflowStepRuns.$inferSelect): WorkflowStepRun {
  return {
    id: row.id,
    workflowRunId: row.workflowRunId,
    stepId: row.stepId,
    status: row.status as WorkflowStepRun["status"],
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.approvalId ? { approvalId: row.approvalId } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
