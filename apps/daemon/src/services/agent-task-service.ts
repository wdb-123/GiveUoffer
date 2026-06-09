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
import type { TaskStore } from "../stores/task-store";
import type { AgentToolExecutor } from "../tools/tool-executor";
import { classifyIntake } from "../workflow/classify-intake";
import type { WorkflowRunService } from "./workflow-run-service";

export interface AgentTaskService {
  createOrContinueTask(input: CreateAgentTaskRequest): AgentTask | { task: AgentTask; approval: ApprovalRequest } | ServiceError;
  createLocalCommand(input: CreateLocalCommandRequest): CreateLocalCommandResult | ServiceError;
  decideApproval(approvalId: string, input: ApprovalDecisionRequest): unknown | ServiceError;
}

export interface ServiceError {
  errorCode: string;
  message: string;
}

export function createAgentTaskService(input: {
  runtime: DaemonRuntime;
  taskStore: TaskStore;
  workspaceRoot: string;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
}): AgentTaskService {
  const { runtime, taskStore, workspaceRoot, workflowRunService, toolExecutor } = input;

  return {
    createOrContinueTask(body) {
      if (!body?.providerId || !body.prompt?.trim()) {
        return serviceError("invalid_task", "providerId and prompt are required");
      }

      if (body.continueTaskId) {
        const provider = getProvider(runtime, body.providerId);
        if (!provider) {
          return serviceError("provider_not_found", `Provider not found: ${body.providerId}`);
        }
        return continueTask({
          body,
          provider,
          runtime,
          taskStore,
          ...(workflowRunService ? { workflowRunService } : {}),
          ...(toolExecutor ? { toolExecutor } : {}),
        });
      }

      const routedTask = resolveNewTaskRoute({ body, runtime });
      const provider = getProvider(runtime, routedTask.providerId);
      if (!provider) {
        return serviceError("provider_not_found", `Provider not found: ${routedTask.providerId}`);
      }

      const routeMetadata = workflowRunService?.createRunMetadata(routedTask.routeMetadata) ?? routedTask.routeMetadata;
      const task = taskStore.createTask({
        providerId: routedTask.providerId,
        workspacePath: body.workspacePath || runtime.workspaceRoot,
        prompt: routedTask.prompt,
        mode: body.mode || "structured",
        routeMetadata,
      });
      workflowRunService?.attachTask(task);

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
            approvalCommand: approval.command,
          });
        } else if (task && provider) {
          startApprovedProviderTask({
            task,
            provider,
            taskStore,
            ...(workflowRunService ? { workflowRunService } : {}),
            ...(toolExecutor ? { toolExecutor } : {}),
          });
        }
      }

      return decision;
    },
  };
}

function resolveNewTaskRoute(input: {
  body: CreateAgentTaskRequest;
  runtime: DaemonRuntime;
}): {
  providerId: string;
  prompt: string;
  routeMetadata: NonNullable<CreateAgentTaskRequest["routeMetadata"]>;
} {
  const sourceText = input.body.routeMetadata?.sourceText?.trim() || composeSourceText(input.body);
  if (input.body.routeMetadata) {
    return {
      providerId: input.body.providerId,
      prompt: composePromptWithAttachments(input.body.prompt.trim(), input.body.attachments),
      routeMetadata: input.body.routeMetadata,
    };
  }

  const route = classifyIntake({
    text: sourceText,
    preferredProviderId: input.body.providerId,
  });
  const recommendedProvider = getProvider(input.runtime, route.recommendedProviderId);
  return {
    providerId: recommendedProvider ? route.recommendedProviderId : input.body.providerId,
    prompt: composePromptWithAttachments(route.agentPrompt || sourceText, input.body.attachments),
    routeMetadata: {
      skillId: route.skillId,
      ...(route.workflowId ? { workflowId: route.workflowId } : {}),
      inputKind: route.inputKind,
      sourceText,
      routeDecision: route,
    },
  };
}

export function isServiceError(value: unknown): value is ServiceError {
  return Boolean(value && typeof value === "object" && "errorCode" in value && "message" in value);
}

function continueTask(input: {
  body: CreateAgentTaskRequest;
  provider: AgentProvider;
  runtime: DaemonRuntime;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
}): AgentTask | { task: AgentTask; approval: ApprovalRequest } | ServiceError {
  const { body, provider, taskStore, workflowRunService, toolExecutor } = input;
  const existingTask = taskStore.getTask(body.continueTaskId || "");
  if (!existingTask) return serviceError("task_not_found", `Task not found: ${body.continueTaskId}`);
  if (existingTask.providerId !== body.providerId) {
    return serviceError("provider_mismatch", "Cannot continue a task with a different provider");
  }
  if (existingTask.status === "queued" || existingTask.status === "running" || existingTask.status === "waiting_approval") {
    return serviceError("task_busy", "Wait for the current agent run to finish before sending another message");
  }

  const now = new Date().toISOString();
  const userText = composePromptWithAttachments(body.prompt.trim(), body.attachments);
  const sourceText = composeSourceText(body);
  const route = classifyIntake({
    text: buildContinuationRouteText(existingTask, sourceText),
    preferredProviderId: body.providerId,
    promptText: sourceText,
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
      workspacePath: body.workspacePath || existingTask.workspacePath,
      mode: body.mode || existingTask.mode,
    },
    provider,
    taskStore,
    ...(workflowRunService ? { workflowRunService } : {}),
    ...(toolExecutor ? { toolExecutor } : {}),
    isContinuation: true,
    permissionMode: body.permissionMode,
  });
  if (approval) workflowRunService?.attachApproval(taskStore.getTask(existingTask.id) ?? continuedTask, approval);
  return approval
    ? { task: taskStore.getTask(existingTask.id) ?? continuedTask, approval }
    : taskStore.getTask(existingTask.id) ?? continuedTask;
}

function composeSourceText(body: CreateAgentTaskRequest): string {
  const attachmentSummary = (body.attachments || [])
    .map((attachment) => `[${attachment.kind}] ${attachment.fileName}: ${attachment.parsed.summary}`)
    .join("\n");
  return [body.prompt.trim(), attachmentSummary].filter(Boolean).join("\n\n");
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

function requestAgentExecutionApproval(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
  isContinuation: boolean;
  permissionMode?: "default" | "auto_review" | "full_access" | undefined;
}): ApprovalRequest | undefined {
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
    runApprovedTask({
      task: input.task,
      provider: input.provider,
      taskStore: input.taskStore,
      ...(input.toolExecutor ? { toolExecutor: input.toolExecutor } : {}),
      onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
    });
    return undefined;
  }
  return input.taskStore.createApproval({
    taskId: input.task.id,
    action: policy.action,
    risk: policy.risk,
    summary: policy.summary,
    command: policy.command,
    cwd: input.task.workspacePath,
    affectedPaths: policy.affectedPaths,
  });
}

function startApprovedLocalCommand(input: {
  task: AgentTask;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
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
    runApprovedLocalCommand({
      task: input.task,
      taskStore: input.taskStore,
      execution,
      onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
    });
  }
}

function startApprovedProviderTask(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  workflowRunService?: WorkflowRunService;
  toolExecutor?: AgentToolExecutor;
}): void {
  if (input.task.status === "queued" || input.task.status === "waiting_approval") {
    runApprovedTask({
      task: input.task,
      provider: input.provider,
      taskStore: input.taskStore,
      ...(input.toolExecutor ? { toolExecutor: input.toolExecutor } : {}),
      onTaskStatusChange: (task) => input.workflowRunService?.syncTaskStatus(task),
    });
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
