import type { AgentTask, AgentTaskRouteMetadata, ApprovalRequest, EntityId } from "@ucareer/shared";
import { evaluateWorkflowStepPolicy } from "../policy/agent-execution-policy";
import type { WorkflowRunStore } from "../stores/workflow-run-store";
import { getWorkflow } from "../workflow/workflow-registry";

export interface WorkflowRunService {
  createRunMetadata(routeMetadata: AgentTaskRouteMetadata | undefined): AgentTaskRouteMetadata | undefined;
  attachTask(task: AgentTask): void;
  attachApproval(task: AgentTask, approval: ApprovalRequest): void;
  syncTaskStatus(task: AgentTask): void;
  listRuns: WorkflowRunStore["listRuns"];
  getRun: WorkflowRunStore["getRun"];
  listStepRuns: WorkflowRunStore["listStepRuns"];
}

export function createWorkflowRunService(input: {
  workflowRunStore: WorkflowRunStore;
}): WorkflowRunService {
  const { workflowRunStore } = input;

  return {
    createRunMetadata(routeMetadata) {
      if (!routeMetadata?.workflowId || routeMetadata.workflowRunId) return routeMetadata;
      const workflow = getWorkflow(routeMetadata.workflowId);
      if (!workflow) return routeMetadata;

      const run = workflowRunStore.createRun({
        workflow,
        ...(routeMetadata.skillId ? { skillId: routeMetadata.skillId } : {}),
        ...(routeMetadata.sourceText ? { sourceText: routeMetadata.sourceText } : {}),
        ...(routeMetadata.routeDecision ? { routeDecision: routeMetadata.routeDecision } : {}),
      });
      markRouteStepCompleted(workflowRunStore, run.id);
      return {
        ...routeMetadata,
        workflowRunId: run.id,
      };
    },

    attachTask(task) {
      if (!task.workflowRunId || !task.workflowId) return;
      const workflow = getWorkflow(task.workflowId);
      if (!workflow) return;
      const step = findAgentTaskStep(workflow, task.skillId);
      workflowRunStore.attachTask(task.workflowRunId, task.id);
      if (step) {
        workflowRunStore.updateRunStatus(task.workflowRunId, "running", step.id);
        workflowRunStore.updateStepRun({
          workflowRunId: task.workflowRunId,
          stepId: step.id,
          status: task.status === "waiting_approval" ? "waiting_approval" : "running",
          taskId: task.id,
        });
      }
    },

    attachApproval(task, approval) {
      if (!task.workflowRunId || !task.workflowId) return;
      const workflow = getWorkflow(task.workflowId);
      if (!workflow) return;
      const step = findAgentTaskStep(workflow, task.skillId);
      if (!step) return;
      const stepPolicy = evaluateWorkflowStepPolicy({
        step,
        summary: approval.summary,
        ...(approval.command ? { command: approval.command } : {}),
        ...(approval.affectedPaths ? { affectedPaths: approval.affectedPaths } : {}),
      });
      if (!stepPolicy) return;
      workflowRunStore.updateRunStatus(task.workflowRunId, "waiting_approval", step.id);
      workflowRunStore.updateStepRun({
        workflowRunId: task.workflowRunId,
        stepId: step.id,
        status: "waiting_approval",
        taskId: task.id,
        approvalId: approval.id,
      });
    },

    syncTaskStatus(task) {
      if (!task.workflowRunId || !task.workflowId) return;
      const workflow = getWorkflow(task.workflowId);
      if (!workflow) return;
      const step = findAgentTaskStep(workflow, task.skillId);
      if (!step) return;
      if (task.status === "failed" || task.status === "cancelled") {
        workflowRunStore.updateStepRun({
          workflowRunId: task.workflowRunId,
          stepId: step.id,
          status: task.status,
          taskId: task.id,
        });
        workflowRunStore.updateRunStatus(task.workflowRunId, task.status, step.id);
        return;
      }
      if (task.status === "waiting_approval" || task.status === "running") {
        workflowRunStore.updateStepRun({
          workflowRunId: task.workflowRunId,
          stepId: step.id,
          status: task.status,
          taskId: task.id,
        });
        workflowRunStore.updateRunStatus(task.workflowRunId, task.status, step.id);
        return;
      }
      if (task.status === "completed") {
        workflowRunStore.updateStepRun({
          workflowRunId: task.workflowRunId,
          stepId: step.id,
          status: "completed",
          taskId: task.id,
        });
        const nextStep = findNextStep(workflow, step.id);
        workflowRunStore.updateRunStatus(task.workflowRunId, nextStep ? "queued" : "completed", nextStep?.id);
      }
    },

    listRuns: workflowRunStore.listRuns,
    getRun: workflowRunStore.getRun,
    listStepRuns: workflowRunStore.listStepRuns,
  };
}

function markRouteStepCompleted(workflowRunStore: WorkflowRunStore, workflowRunId: EntityId): void {
  workflowRunStore.updateStepRun({
    workflowRunId,
    stepId: "route",
    status: "completed",
  });
}

function findAgentTaskStep(
  workflow: NonNullable<ReturnType<typeof getWorkflow>>,
  skillId: EntityId | undefined,
) {
  return workflow.steps.find((step) => step.kind === "agent_task" && (!skillId || step.skillId === skillId))
    || workflow.steps.find((step) => step.kind === "agent_task");
}

function findNextStep(
  workflow: NonNullable<ReturnType<typeof getWorkflow>>,
  currentStepId: EntityId,
) {
  const currentIndex = workflow.steps.findIndex((step) => step.id === currentStepId);
  if (currentIndex < 0) return undefined;
  return workflow.steps[currentIndex + 1];
}
