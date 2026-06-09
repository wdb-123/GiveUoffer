import { toProviderInstallStatus } from "@ucareer/agent-core";
import type {
  AgentEvent,
  AgentTaskTurn,
  AgentTask,
  ApiEnvelope,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  CreateLocalCommandRequest,
  ProviderInstallStatus,
  ProviderSummary,
} from "@ucareer/shared";
import { getProvider } from "../index";
import { createAgentTaskService, isServiceError } from "../services/agent-task-service";
import { subscribeTaskChange } from "../stores/task-change-bus";
import { createAgentToolExecutor } from "../tools/tool-executor";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission, toProviderSummary } from "./context";

export function registerAgentRoutes(ctx: DaemonRouteContext): void {
  const { app, runtime, taskStore, workspaceRoot, services } = ctx;
  const agentTaskService = createAgentTaskService({
    runtime,
    taskStore,
    workspaceRoot,
    workflowRunService: services.workflowRunService,
    toolExecutor: createAgentToolExecutor({
      connectorCredentialStore: ctx.stores.connectorCredentialStore,
      jobSearchService: services.jobSearchService,
    }),
  });

  app.get("/api/providers", async (): Promise<ApiEnvelope<ProviderSummary[]>> => {
    return ok(runtime.providers.map(toProviderSummary));
  });

  app.post<{
    Params: { providerId: string };
  }>("/api/providers/:providerId/check", async (request): Promise<ApiEnvelope<ProviderInstallStatus>> => {
    const provider = getProvider(runtime, request.params.providerId);
    if (!provider) {
      return error("provider_not_found", `Provider not found: ${request.params.providerId}`);
    }

    return ok(toProviderInstallStatus(provider.id, await provider.checkInstalled()));
  });

  app.get("/api/agent-tasks", async (): Promise<ApiEnvelope<AgentTask[]>> => {
    return ok(taskStore.listTasks());
  });

  app.post<{
    Body: CreateAgentTaskRequest;
  }>("/api/agent-tasks", async (request): Promise<ApiEnvelope<AgentTask | { task: AgentTask; approval: ApprovalRequest }>> => {
    const authError = requirePermission(ctx, request, "agent.run");
    if (authError) return authError;
    const result = await agentTaskService.createOrContinueTask(request.body);
    if (isServiceError(result)) return error(result.errorCode, result.message);
    return ok(result);
  });

  app.post<{
    Body: CreateLocalCommandRequest;
  }>("/api/local-commands", async (request): Promise<ApiEnvelope<import("@ucareer/shared").CreateLocalCommandResult>> => {
    const authError = requirePermission(ctx, request, "agent.run");
    if (authError) return authError;
    const result = agentTaskService.createLocalCommand(request.body);
    if (isServiceError(result)) return error(result.errorCode, result.message);
    return ok(result);
  });

  app.get<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId", async (request): Promise<ApiEnvelope<AgentTask>> => {
    const task = taskStore.getTask(request.params.taskId);
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    return ok(task);
  });

  app.delete<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId", async (request): Promise<ApiEnvelope<AgentTask>> => {
    const authError = requirePermission(ctx, request, "agent.run");
    if (authError) return authError;
    const existingTask = taskStore.getTask(request.params.taskId);
    if (!existingTask) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    if (existingTask.status === "queued" || existingTask.status === "running" || existingTask.status === "waiting_approval") {
      return error("task_busy", "Cannot delete a task while it is queued, running, or waiting for approval");
    }
    const task = taskStore.deleteTask(request.params.taskId);
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    return ok(task);
  });

  app.get<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId/events", async (request): Promise<ApiEnvelope<AgentEvent[]>> => {
    const task = taskStore.getTask(request.params.taskId);
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    return ok(taskStore.listEvents(task.id));
  });

  app.get<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId/turns", async (request): Promise<ApiEnvelope<AgentTaskTurn[]>> => {
    const task = taskStore.getTask(request.params.taskId);
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    return ok(buildAgentTaskTurns(task.id, taskStore.listEvents(task.id)));
  });

  app.get<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId/events/stream", async (request, reply) => {
    const task = taskStore.getTask(request.params.taskId);
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.flushHeaders?.();

    let lastPayload = "";
    const writeSnapshot = () => {
      const nextTask = taskStore.getTask(task.id);
      if (!nextTask || reply.raw.destroyed) return;
      const events = taskStore.listEvents(task.id);
      const payload = JSON.stringify({
        task: nextTask,
        events,
        turns: buildAgentTaskTurns(task.id, events),
        approvals: taskStore.listApprovals().filter((approval) => approval.taskId === task.id),
      });
      if (payload === lastPayload) return;
      lastPayload = payload;
      reply.raw.write(`event: agent_snapshot\ndata: ${payload}\n\n`);
    };

    writeSnapshot();
    const unsubscribe = subscribeTaskChange(task.id, writeSnapshot);
    const timer = setInterval(writeSnapshot, 15000);
    request.raw.on("close", () => {
      unsubscribe();
      clearInterval(timer);
      if (!reply.raw.destroyed) reply.raw.end();
    });
  });

  app.post<{
    Params: { taskId: string };
  }>("/api/agent-tasks/:taskId/cancel", async (request): Promise<ApiEnvelope<AgentTask>> => {
    const task = taskStore.updateTaskStatus(request.params.taskId, "cancelled");
    if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
    services.workflowRunService.syncTaskStatus(task);
    return ok(task);
  });

  app.get("/api/approvals", async (): Promise<ApiEnvelope<ApprovalRequest[]>> => {
    return ok(taskStore.listApprovals());
  });

  app.post<{
    Params: { approvalId: string };
    Body: ApprovalDecisionRequest;
  }>("/api/approvals/:approvalId/decision", async (request) => {
    const authError = requirePermission(ctx, request, "agent.approve");
    if (authError) return authError;
    const result = agentTaskService.decideApproval(request.params.approvalId, request.body);
    if (isServiceError(result)) return error(result.errorCode, result.message);
    return ok(result);
  });
}

function buildAgentTaskTurns(taskId: string, events: AgentEvent[]): AgentTaskTurn[] {
  const turns: AgentTaskTurn[] = [];
  let current: AgentTaskTurn | null = null;
  let leadingEvents: AgentEvent[] = [];

  events.forEach((event) => {
    if (event.type === "message" && event.role === "user") {
      if (current) turns.push(finalizeTurn(current));
      current = createTurn(taskId, turns.length, event);
      if (leadingEvents.length) {
        current.events.unshift(...leadingEvents);
        current.processEvents.unshift(...leadingEvents);
        current.startedAt = leadingEvents[0]?.createdAt || current.startedAt;
        leadingEvents = [];
      }
      return;
    }

    if (!current) {
      leadingEvents.push(event);
      return;
    }
    current.events.push(event);
    current.updatedAt = event.createdAt;

    if (event.type === "message" && event.role === "assistant" && !isAssistantExecutionLog(event.text)) {
      if (current.answer) current.processEvents.push(current.answer);
      current.answer = event;
    } else {
      current.processEvents.push(event);
    }
  });

  if (current) turns.push(finalizeTurn(current));
  else if (leadingEvents.length) {
    const systemTurn = createTurn(taskId, turns.length, null);
    systemTurn.events.push(...leadingEvents);
    systemTurn.processEvents.push(...leadingEvents);
    systemTurn.startedAt = leadingEvents[0]?.createdAt || systemTurn.startedAt;
    systemTurn.updatedAt = leadingEvents.at(-1)?.createdAt || systemTurn.updatedAt;
    turns.push(finalizeTurn(systemTurn));
  }
  return turns.filter((turn) => turn.question || turn.answer || turn.processEvents.length);
}

function isAssistantExecutionLog(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.startsWith("command:")
    || normalized.startsWith("UC_TOOL_CALL")
    || normalized.startsWith("UC_TOOL_RESULT")
    || normalized.startsWith("status:")
    || /^任务状态[:：]/u.test(normalized)
    || /^命令\s/u.test(normalized)
    || normalized.includes(" exit_code:")
    || normalized.includes("Paperclip adapter")
    || normalized.includes("Paperclip-managed Codex home");
}

function createTurn(taskId: string, index: number, question: Extract<AgentEvent, { type: "message" }> | null): AgentTaskTurn {
  const startedAt = question?.createdAt || new Date(0).toISOString();
  return {
    id: question ? `${taskId}:turn:${index}:${question.createdAt}` : `${taskId}:turn:${index}:system`,
    taskId,
    index,
    question,
    answer: null,
    processEvents: [],
    events: question ? [question] : [],
    startedAt,
    updatedAt: startedAt,
    status: question ? "pending" : "system",
  };
}

function finalizeTurn(turn: AgentTaskTurn): AgentTaskTurn {
  const hasRunningEvent = turn.events.some((event) => (
    (event.type === "task_status" && (event.status === "queued" || event.status === "running" || event.status === "waiting_approval"))
    || (event.type === "command" && (event.status === "requested" || event.status === "running"))
  ));
  const hasFailure = turn.events.some((event) => (
    event.type === "error"
    || (event.type === "task_status" && (event.status === "failed" || event.status === "cancelled"))
    || (event.type === "command" && event.status === "failed")
  ));
  return {
    ...turn,
    status: turn.answer ? "answered" : hasFailure ? "failed" : hasRunningEvent ? "running" : turn.question ? "pending" : "system",
  };
}
