import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import type { AgentProvider } from "@ucareer/agent-core";
import type {
  AgentEvent,
  AgentTask,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  CreateLocalCommandRequest,
  CreateLocalCommandResult,
} from "@ucareer/shared";
import { getProvider, type DaemonRuntime } from "../index";
import { isInsideOrSameDir } from "../path-guards";
import { evaluateActionPolicy, evaluateAgentExecutionPolicy } from "../policy/agent-execution-policy";
import { runApprovedLocalCommand, runApprovedTask } from "../execution/runner";
import { defaultTaskExecutionScheduler, type TaskExecutionScheduler } from "../execution/task-execution-scheduler";
import { runWithAgentExecutionSlot } from "./agent-execution-queue-service";
import { isPaperclipAdapterProvider } from "../providers/paperclip-adapter-provider";
import type { TaskStore } from "../stores/task-store";
import type { AgentToolExecutor } from "../tools/tool-executor";
import { classifyIntake, isSimpleGeneralConversation } from "../workflow/classify-intake";
import type { WorkflowRunService } from "./workflow-run-service";

export interface AgentTaskService {
  createOrContinueTask(input: CreateAgentTaskRequest): Promise<AgentTask | { task: AgentTask; approval: ApprovalRequest } | ServiceError>;
  createLocalCommand(input: CreateLocalCommandRequest): CreateLocalCommandResult | ServiceError;
  decideApproval(approvalId: string, input: ApprovalDecisionRequest): unknown | ServiceError;
}

export interface ServiceError {
  errorCode: string;
  message: string;
}

type TimingMark = {
  phase: string;
  durationMs: number;
  detail?: string;
};

export function createAgentTaskService(input: {
  runtime: DaemonRuntime;
  taskStore: TaskStore;
  workspaceRoot: string;
  tenantId?: string;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
  executionScheduler?: TaskExecutionScheduler;
}): AgentTaskService {
  const {
    runtime,
    taskStore,
    workspaceRoot,
    tenantId,
    workflowRunService,
    toolExecutor,
    executionScheduler = defaultTaskExecutionScheduler,
  } = input;

  return {
    async createOrContinueTask(body) {
      if (!body?.providerId || !body.prompt?.trim()) {
        return serviceError("invalid_task", "providerId and prompt are required");
      }

      if (body.continueTaskId) {
        const provider = getProvider(runtime, body.providerId);
        if (!provider) {
          return serviceError("provider_not_found", `Provider not found: ${body.providerId}`);
        }
        return await continueTask({
          body,
          provider,
          runtime,
          taskStore,
          workspaceRoot,
          ...(workflowRunService ? { workflowRunService } : {}),
          ...(toolExecutor ? { toolExecutor } : {}),
          executionScheduler,
        });
      }

      const provider = getProvider(runtime, body.providerId);
      if (!provider) {
        return serviceError("provider_not_found", `Provider not found: ${body.providerId}`);
      }
      const taskWorkspacePath = resolveTaskWorkspacePath(workspaceRoot, body.workspacePath);
      if (isServiceError(taskWorkspacePath)) return taskWorkspacePath;
      const requestStartMs = performance.now();
      const routedTask = await resolveNewTaskRoute({ body, provider, runtime, workspacePath: taskWorkspacePath });

      const routeMetadata = workflowRunService?.createRunMetadata(routedTask.routeMetadata) ?? routedTask.routeMetadata;
      const createTaskStartMs = performance.now();
      const task = taskStore.createTask({
        ...(tenantId ? { tenantId } : {}),
        providerId: routedTask.providerId,
        workspacePath: taskWorkspacePath,
        prompt: routedTask.prompt,
        mode: body.mode || "structured",
        routeMetadata,
      });
      const taskCreateMs = performance.now() - createTaskStartMs;
      appendTimingEvents(taskStore, task.id, [
        ...routedTask.timings,
        { phase: "task.create", durationMs: taskCreateMs },
        {
          phase: "task.pre_approval_total",
          durationMs: performance.now() - requestStartMs,
          detail: `skill=${routeMetadata.skillId || "unknown"} provider=${routedTask.providerId}`,
        },
      ]);
      logTiming("task.create", taskCreateMs, { taskId: task.id, providerId: routedTask.providerId });
      workflowRunService?.attachTask(task);

      const localFastReply = buildLocalFastReply(routeMetadata, body.prompt);
      if (localFastReply) {
        const fastReplyStartMs = performance.now();
        taskStore.appendEvent(task.id, {
          type: "message",
          role: "assistant",
          text: localFastReply,
          createdAt: new Date().toISOString(),
        });
        const updatedTask = taskStore.updateTaskStatus(task.id, "completed") ?? task;
        const fastReplyMs = performance.now() - fastReplyStartMs;
        appendTimingEvent(taskStore, task.id, "local.fast_reply", fastReplyMs, "reason=simple_general_conversation");
        logTiming("local.fast_reply", fastReplyMs, { taskId: task.id, skillId: routeMetadata.skillId });
        workflowRunService?.syncTaskStatus(updatedTask);
        return updatedTask;
      }

      taskStore.appendEvent(task.id, {
        type: "message",
        role: "system",
        text: `${provider.label} 本地会话已创建，等待启动审批。`,
        createdAt: new Date().toISOString(),
      });

      const approval = requestAgentExecutionApproval({
        task,
        provider,
        taskStore,
        ...(workflowRunService ? { workflowRunService } : {}),
        ...(toolExecutor ? { toolExecutor } : {}),
        executionScheduler,
        isContinuation: false,
        permissionMode: body.permissionMode,
      });
      if (approval) workflowRunService?.attachApproval(taskStore.getTask(task.id) ?? task, approval);

      return approval ? { task: taskStore.getTask(task.id) ?? task, approval } : taskStore.getTask(task.id) ?? task;
    },

    createLocalCommand(body) {
      const command = String(body?.command || "").trim();
      if (!command) return serviceError("invalid_local_command", "command is required");
      const args = Array.isArray(body.args) ? body.args.map((arg) => String(arg)) : [];
      const cwd = resolve(workspaceRoot, body.cwd || ".");
      if (!isInsideOrSameDir(workspaceRoot, cwd)) return serviceError("invalid_cwd", "cwd must stay inside workspace");

      const task = taskStore.createTask({
        ...(tenantId ? { tenantId } : {}),
        providerId: "local-shell",
        workspacePath: cwd,
        prompt: body.label || [command, ...args].join(" "),
        mode: "structured",
      });
      const policy = evaluateActionPolicy({
        action: "run_shell",
        summary: `Run local command: ${[command, ...args].join(" ")}`,
        command: JSON.stringify({ command, args, cwd }),
        affectedPaths: [cwd],
      });
      const approval = taskStore.createApproval({
        taskId: task.id,
        action: policy.action,
        risk: policy.risk,
        summary: policy.summary,
        command: policy.command,
        cwd,
        affectedPaths: policy.affectedPaths,
      });

      return { task: taskStore.getTask(task.id) ?? task, approval };
    },

    decideApproval(approvalId, body) {
      if (!body?.decision) {
        return serviceError("invalid_approval_decision", "decision is required");
      }

      const approval = taskStore.getApproval(approvalId);
      const approvalTask = approval ? taskStore.getTask(approval.taskId) : undefined;
      if (approvalTask && !isInsideOrSameDir(workspaceRoot, approvalTask.workspacePath)) {
        return serviceError("approval_not_found", `Approval not found: ${approvalId}`);
      }
      const decision = taskStore.decideApproval(approvalId, body);
      if (!decision) return serviceError("approval_not_found", `Approval not found: ${approvalId}`);
      const decidedTask = taskStore.getTask(decision.taskId);
      if (decidedTask) workflowRunService?.syncTaskStatus(decidedTask);

      if (decision.decision !== "deny") {
        const task = taskStore.getTask(decision.taskId);
        const provider = task ? getProvider(runtime, task.providerId) : undefined;
        if (task?.providerId === "local-shell" && approval?.command) {
          startApprovedLocalCommand({
            task,
            taskStore,
            ...(workflowRunService ? { workflowRunService } : {}),
            executionScheduler,
            approvalCommand: approval.command,
          });
        } else if (task && provider) {
          startApprovedProviderTask({
            task,
            provider,
            taskStore,
            ...(workflowRunService ? { workflowRunService } : {}),
            ...(toolExecutor ? { toolExecutor } : {}),
            executionScheduler,
          });
        }
      }

      return decision;
    },
  };
}

async function resolveNewTaskRoute(input: {
  body: CreateAgentTaskRequest;
  provider: AgentProvider;
  runtime: DaemonRuntime;
  workspacePath: string;
}): Promise<{
  providerId: string;
  prompt: string;
  routeMetadata: NonNullable<CreateAgentTaskRequest["routeMetadata"]>;
  timings: TimingMark[];
}> {
  const totalStartMs = performance.now();
  const timings: TimingMark[] = [];
  const displaySourceText = input.body.routeMetadata?.sourceText?.trim() || composeDisplaySourceText(input.body);
  if (input.body.routeMetadata) {
    timings.push({
      phase: "route.reuse_metadata",
      durationMs: performance.now() - totalStartMs,
      detail: `skill=${input.body.routeMetadata.skillId || "unknown"}`,
    });
    return {
      providerId: input.body.providerId,
      prompt: composePromptWithAttachments(input.body.prompt.trim(), input.body.attachments),
      routeMetadata: input.body.routeMetadata,
      timings,
    };
  }

  const routeStartMs = performance.now();
  const route = await classifyIntake({
    text: displaySourceText,
    promptText: displaySourceText,
    preferredProviderId: input.body.providerId,
    ...(input.body.pageContext ? { pageContext: input.body.pageContext } : {}),
    routeWithAgent: (prompt) => runAgentRouterPrompt({
      provider: input.provider,
      workspacePath: input.workspacePath,
      prompt,
    }),
  });
  const routeMs = performance.now() - routeStartMs;
  timings.push({
    phase: "route.classify",
    durationMs: routeMs,
    detail: `skill=${route.skillId} inputKind=${route.inputKind} confidence=${route.confidence}`,
  });
  logTiming("route.classify", routeMs, {
    providerId: input.body.providerId,
    skillId: route.skillId,
    inputKind: route.inputKind,
  });
  const providerSelectStartMs = performance.now();
  const recommendedProvider = getProvider(input.runtime, route.recommendedProviderId);
  timings.push({
    phase: "route.provider_select",
    durationMs: performance.now() - providerSelectStartMs,
    detail: `recommended=${route.recommendedProviderId} selected=${recommendedProvider ? route.recommendedProviderId : input.body.providerId}`,
  });
  timings.push({
    phase: "route.total",
    durationMs: performance.now() - totalStartMs,
  });
  return {
    providerId: recommendedProvider ? route.recommendedProviderId : input.body.providerId,
    prompt: composePromptWithAttachments(route.agentPrompt || displaySourceText, input.body.attachments),
    routeMetadata: {
      skillId: route.skillId,
      ...(route.workflowId ? { workflowId: route.workflowId } : {}),
      inputKind: route.inputKind,
      sourceText: displaySourceText,
      routeDecision: route,
    },
    timings,
  };
}

export function isServiceError(value: unknown): value is ServiceError {
  return Boolean(value && typeof value === "object" && "errorCode" in value && "message" in value);
}

function resolveTaskWorkspacePath(workspaceRoot: string, value: unknown): string | ServiceError {
  const workspacePath = resolve(workspaceRoot, String(value || "."));
  if (!isInsideOrSameDir(workspaceRoot, workspacePath)) {
    return serviceError("invalid_workspace_path", "workspacePath must stay inside tenant workspace");
  }
  return workspacePath;
}

async function continueTask(input: {
  body: CreateAgentTaskRequest;
  provider: AgentProvider;
  runtime: DaemonRuntime;
  taskStore: TaskStore;
  workspaceRoot: string;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
  executionScheduler: TaskExecutionScheduler;
}): Promise<AgentTask | { task: AgentTask; approval: ApprovalRequest } | ServiceError> {
  const { body, provider, taskStore, workspaceRoot, workflowRunService, toolExecutor } = input;
  const existingTask = taskStore.getTask(body.continueTaskId || "");
  if (!existingTask) return serviceError("task_not_found", `Task not found: ${body.continueTaskId}`);
  if (!isInsideOrSameDir(workspaceRoot, existingTask.workspacePath)) {
    return serviceError("task_not_found", `Task not found: ${body.continueTaskId}`);
  }
  const continuationWorkspacePath = body.workspacePath
    ? resolveTaskWorkspacePath(workspaceRoot, body.workspacePath)
    : existingTask.workspacePath;
  if (isServiceError(continuationWorkspacePath)) return continuationWorkspacePath;
  if (existingTask.providerId !== body.providerId) {
    return serviceError("provider_mismatch", "Cannot continue a task with a different provider");
  }
  if (existingTask.status === "queued" || existingTask.status === "running" || existingTask.status === "waiting_approval") {
    return serviceError("task_busy", "Wait for the current agent run to finish before sending another message");
  }

  const now = new Date().toISOString();
  const userText = composePromptWithAttachments(body.prompt.trim(), body.attachments);
  const displaySourceText = composeDisplaySourceText(body);
  const route = await classifyIntake({
    text: buildContinuationRouteText(existingTask, displaySourceText),
    preferredProviderId: body.providerId,
    promptText: displaySourceText,
    ...(body.pageContext ? { pageContext: body.pageContext } : {}),
    routeWithAgent: (prompt) => runAgentRouterPrompt({
      provider,
      workspacePath: continuationWorkspacePath,
      prompt,
    }),
  });
  taskStore.appendEvent(existingTask.id, {
    type: "message",
    role: "user",
    text: extractDisplayPrompt(userText),
    createdAt: now,
  });

  const continuedTask = taskStore.updateTaskPrompt(
    existingTask.id,
    buildContinuationPrompt(taskStore.listEvents(existingTask.id), userText, route.agentPrompt),
  ) ?? existingTask;

  taskStore.appendEvent(existingTask.id, {
    type: "message",
    role: "system",
    text: `${provider.label} 继续当前对话，等待启动审批。`,
    createdAt: new Date().toISOString(),
  });

  const approval = requestAgentExecutionApproval({
    task: {
      ...continuedTask,
      workspacePath: continuationWorkspacePath,
      mode: body.mode || existingTask.mode,
    },
    provider,
    taskStore,
    ...(workflowRunService ? { workflowRunService } : {}),
    ...(toolExecutor ? { toolExecutor } : {}),
    executionScheduler: input.executionScheduler,
    isContinuation: true,
    permissionMode: body.permissionMode,
  });
  if (approval) workflowRunService?.attachApproval(taskStore.getTask(existingTask.id) ?? continuedTask, approval);
  return approval
    ? { task: taskStore.getTask(existingTask.id) ?? continuedTask, approval }
    : taskStore.getTask(existingTask.id) ?? continuedTask;
}

function composeDisplaySourceText(body: CreateAgentTaskRequest): string {
  const attachmentSummary = (body.attachments || [])
    .map((attachment) => `[${attachment.kind}] ${attachment.fileName}: ${attachment.parsed.summary}`)
    .join("\n");
  return [body.prompt.trim(), attachmentSummary].filter(Boolean).join("\n\n");
}

async function runAgentRouterPrompt(input: {
  provider: AgentProvider;
  workspacePath: string;
  prompt: string;
}): Promise<string> {
  if (!isPaperclipAdapterProvider(input.provider)) {
    throw new Error(`Provider ${input.provider.id} does not support agent router execution`);
  }
  const provider = input.provider;
  return await runWithAgentExecutionSlot(`router:${provider.id}`, () => provider.executeRouterPrompt({
    prompt: input.prompt,
    workspacePath: input.workspacePath,
  }));
}

function buildContinuationRouteText(existingTask: AgentTask, latestSourceText: string): string {
  return [
    existingTask.skillId ? `previous skill: ${existingTask.skillId}` : "",
    existingTask.inputKind ? `previous input kind: ${existingTask.inputKind}` : "",
    existingTask.sourceText ? `previous source: ${existingTask.sourceText}` : "",
    `latest input: ${latestSourceText}`,
  ].filter(Boolean).join("\n");
}

function composePromptWithAttachments(prompt: string, attachments: CreateAgentTaskRequest["attachments"]): string {
  if (!attachments?.length) return prompt;
  const attachmentText = attachments.map((attachment, index) => {
    const parsedText = attachment.parsed.text
      ? `\nParsed text:\n${attachment.parsed.text}`
      : "";
    return [
      `Attachment ${index + 1}: ${attachment.fileName}`,
      `Kind: ${attachment.kind}`,
      `MIME: ${attachment.mimeType}`,
      `Stored path: ${attachment.storedPath}`,
      `Summary: ${attachment.parsed.summary}${parsedText}`,
    ].join("\n");
  }).join("\n\n");
  return `${prompt}\n\n---\nUser uploaded attachments:\n${attachmentText}`;
}

function composePageContextSummary(context: NonNullable<CreateAgentTaskRequest["pageContext"]>): string {
  const selected = context.selectedEntity
    ? [
      `selected type: ${context.selectedEntity.type}`,
      context.selectedEntity.id ? `selected id: ${context.selectedEntity.id}` : "",
      context.selectedEntity.title ? `selected title: ${context.selectedEntity.title}` : "",
      context.selectedEntity.file ? `selected file: ${context.selectedEntity.file}` : "",
      context.selectedEntity.path ? `selected path: ${context.selectedEntity.path}` : "",
    ].filter(Boolean).join("\n")
    : "";
  return [
    `page: ${context.pageLabel} (${context.pageId})`,
    context.suggestedSkillId ? `suggested skill: ${context.suggestedSkillId}` : "",
    context.suggestedInputKind ? `suggested input kind: ${context.suggestedInputKind}` : "",
    `page summary: ${context.summary}`,
    selected,
    `read paths: ${context.readPaths.join(", ")}`,
    `write paths: ${context.writePaths.join(", ")}`,
  ].filter(Boolean).join("\n");
}

function requestAgentExecutionApproval(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
  executionScheduler: TaskExecutionScheduler;
  isContinuation: boolean;
  permissionMode?: "default" | "auto_review" | "full_access" | undefined;
}): ApprovalRequest | undefined {
  const policyStartMs = performance.now();
  const hasWorkspaceGrant = input.taskStore.hasWorkspaceApprovalGrant({
    action: "start_agent",
    providerId: input.provider.id,
    workspacePath: input.task.workspacePath,
  });
  const policy = evaluateAgentExecutionPolicy({
    provider: input.provider,
    workspacePath: input.task.workspacePath,
    isContinuation: input.isContinuation,
    permissionMode: input.permissionMode,
    hasWorkspaceGrant,
  });
  const policyMs = performance.now() - policyStartMs;
  appendTimingEvent(input.taskStore, input.task.id, "approval.policy", policyMs, `required=${policy.required}`);
  logTiming("approval.policy", policyMs, {
    taskId: input.task.id,
    providerId: input.provider.id,
    required: policy.required,
  });
  if (!policy.required) {
    input.taskStore.appendEvent(input.task.id, {
      type: "message",
      role: "system",
      text: input.permissionMode === "full_access"
        ? "Agent started with full workspace access from composer permissions."
        : hasWorkspaceGrant
          ? "Agent start allowed by remembered workspace permission."
          : "Agent auto-start enabled by UCAREER_AGENT_AUTO_START=1.",
      createdAt: new Date().toISOString(),
    });
    const enqueueResult = input.executionScheduler.enqueue({
      task: input.task,
      taskStore: input.taskStore,
      label: input.provider.id,
      run: ({ onTaskSettled }) => runApprovedTask({
        task: input.task,
        provider: input.provider,
        taskStore: input.taskStore,
        ...(input.toolExecutor ? { toolExecutor: input.toolExecutor } : {}),
        onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
        onTaskSettled,
      }),
    });
    if (!enqueueResult.accepted) input.workflowRunService?.syncTaskStatus(enqueueResult.task);
    return undefined;
  }
  const approvalStartMs = performance.now();
  const approval = input.taskStore.createApproval({
    taskId: input.task.id,
    action: policy.action,
    risk: policy.risk,
    summary: policy.summary,
    command: policy.command,
    cwd: input.task.workspacePath,
    affectedPaths: policy.affectedPaths,
  });
  const approvalMs = performance.now() - approvalStartMs;
  appendTimingEvent(input.taskStore, input.task.id, "approval.create", approvalMs);
  logTiming("approval.create", approvalMs, { taskId: input.task.id, providerId: input.provider.id });
  return approval;
}

function startApprovedLocalCommand(input: {
  task: AgentTask;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  executionScheduler: TaskExecutionScheduler;
  approvalCommand: string;
}): void {
  const execution = parseLocalCommandApproval(input.approvalCommand);
  if (!execution) {
    input.taskStore.appendEvent(input.task.id, {
      type: "error",
      message: "Local command approval payload is invalid",
      provider: "local-shell",
      createdAt: new Date().toISOString(),
    });
    const updated = input.taskStore.updateTaskStatus(input.task.id, "failed");
    if (updated) input.workflowRunService?.syncTaskStatus(updated);
  } else if (input.task.status === "queued" || input.task.status === "waiting_approval") {
    const enqueueResult = input.executionScheduler.enqueue({
      task: input.task,
      taskStore: input.taskStore,
      label: "local command",
      run: ({ onTaskSettled }) => runApprovedLocalCommand({
        task: input.task,
        taskStore: input.taskStore,
        execution,
        onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
        onTaskSettled,
      }),
    });
    if (!enqueueResult.accepted) input.workflowRunService?.syncTaskStatus(enqueueResult.task);
  }
}

function startApprovedProviderTask(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
  executionScheduler: TaskExecutionScheduler;
}): void {
  if (input.task.status === "queued" || input.task.status === "waiting_approval") {
    const enqueueResult = input.executionScheduler.enqueue({
      task: input.task,
      taskStore: input.taskStore,
      label: input.provider.id,
      run: ({ onTaskSettled }) => runApprovedTask({
        task: input.task,
        provider: input.provider,
        taskStore: input.taskStore,
        ...(input.toolExecutor ? { toolExecutor: input.toolExecutor } : {}),
        onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
        onTaskSettled,
      }),
    });
    if (!enqueueResult.accepted) input.workflowRunService?.syncTaskStatus(enqueueResult.task);
  } else {
    input.taskStore.appendEvent(input.task.id, {
      type: "message",
      role: "system",
      text: `Approval accepted but task is already ${input.task.status}; runner was not started again.`,
      createdAt: new Date().toISOString(),
    });
  }
}

function parseLocalCommandApproval(payload: string): { command: string; args: string[]; cwd: string } | undefined {
  try {
    const parsed = JSON.parse(payload) as { command?: unknown; args?: unknown; cwd?: unknown };
    if (typeof parsed.command !== "string" || typeof parsed.cwd !== "string") return undefined;
    return {
      command: parsed.command,
      args: Array.isArray(parsed.args) ? parsed.args.map((arg) => String(arg)) : [],
      cwd: parsed.cwd,
    };
  } catch {
    return undefined;
  }
}

function buildContinuationPrompt(events: AgentEvent[], latestPrompt: string, routedPrompt?: string): string {
  const transcript = events
    .filter((event): event is Extract<AgentEvent, { type: "message" }> => event.type === "message")
    .filter((event) => event.role === "user" || event.role === "assistant")
    .map((event) => `${event.role === "user" ? "用户" : "Agent"}：${event.text.trim()}`)
    .filter(Boolean)
    .join("\n\n");

  return [
    routedPrompt?.trim() || "",
    routedPrompt?.trim() ? "---" : "",
    "这是 Ucareer Agent 控制台里的同一个对话任务。请基于已有上下文继续处理，不要把它当成全新任务。",
    transcript ? `已有对话：\n${transcript}` : "",
    `最新输入：\n${latestPrompt.trim()}`,
  ].filter(Boolean).join("\n\n");
}

function extractDisplayPrompt(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const markerMatch = normalized.match(/(?:最新输入|输入内容)\s*[:：]\s*([\s\S]*)$/u);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();
  if (/你是\s+Ucareer\s+职业旅程工作台的统一入口\s+Agent/u.test(normalized)) return "";
  return normalized;
}

function serviceError(errorCode: string, message: string): ServiceError {
  return { errorCode, message };
}

function buildLocalFastReply(routeMetadata: CreateAgentTaskRequest["routeMetadata"], prompt: string): string | null {
  if (routeMetadata?.skillId !== "agent.general" || routeMetadata.inputKind !== "general") return null;
  if (!isSimpleGeneralConversation(prompt)) return null;
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (/^(?:谢谢|感谢|thanks|thank you)/iu.test(normalized)) return "不客气。";
  if (/^(?:在吗|在不在)/u.test(normalized)) return "在的。你可以直接发岗位、简历、截图或问题。";
  return "你好！你可以直接发岗位、简历、截图或问题。";
}

function appendTimingEvents(taskStore: TaskStore, taskId: string, timings: TimingMark[]): void {
  for (const timing of timings) {
    appendTimingEvent(taskStore, taskId, timing.phase, timing.durationMs, timing.detail);
  }
}

function appendTimingEvent(taskStore: TaskStore, taskId: string, phase: string, durationMs: number, detail?: string): void {
  taskStore.appendEvent(taskId, {
    type: "message",
    role: "system",
    text: `性能埋点：phase=${phase} durationMs=${Math.round(durationMs)}${detail ? ` ${detail}` : ""}`,
    createdAt: new Date().toISOString(),
  });
}

function logTiming(phase: string, durationMs: number, detail: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({
    event: "ucareer.agent_timing",
    phase,
    durationMs: Math.round(durationMs),
    ...detail,
  }));
}
