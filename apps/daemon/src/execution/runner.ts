import { spawn } from "node:child_process";
import type { AgentProvider } from "@ucareer/agent-core";
import type { AgentTask } from "@ucareer/shared";
import { isPaperclipAdapterProvider } from "../providers/paperclip-adapter-provider";
import type { TaskStore } from "../stores/task-store";
import type { AgentToolCall, AgentToolExecutor } from "../tools/tool-executor";
import { buildToolResultFollowupInstruction } from "../workflow/prompt-builder";
import { getSkill } from "../skills/registry";

export interface RunApprovedTaskInput {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  toolExecutor?: AgentToolExecutor;
  onTaskStatusChange?: (task: AgentTask) => void;
  onTaskSettled?: (taskId: string) => void;
}

export function runApprovedTask({ task, provider, taskStore, toolExecutor, onTaskStatusChange, onTaskSettled }: RunApprovedTaskInput): void {
  let settled = false;
  const settleTask = () => {
    if (settled) return;
    settled = true;
    onTaskSettled?.(task.id);
  };
  if (isPaperclipAdapterProvider(provider)) {
    void provider.executePaperclipTask({
      taskId: task.id,
      prompt: task.prompt,
      workspacePath: task.workspacePath,
      taskStore: withTaskStatusCallback(taskStore, onTaskStatusChange),
      ...(toolExecutor ? { toolExecutor } : {}),
    }).finally(settleTask);
    return;
  }

  if (task.mode !== "structured") {
    taskStore.appendEvent(task.id, {
      type: "error",
      message: "PTY execution is not implemented yet",
      provider: provider.id,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(taskStore, task.id, "failed", onTaskStatusChange);
    settleTask();
    return;
  }

  if (!provider.createStructuredCommand) {
    taskStore.appendEvent(task.id, {
      type: "error",
      message: `Provider ${provider.id} does not support structured execution`,
      provider: provider.id,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(taskStore, task.id, "failed", onTaskStatusChange);
    settleTask();
    return;
  }

  runStructuredProviderIteration({
    task,
    provider,
    taskStore,
    ...(toolExecutor ? { toolExecutor } : {}),
    ...(onTaskStatusChange ? { onTaskStatusChange } : {}),
    settleTask,
    prompt: task.prompt,
    iteration: 0,
  });
}

function runStructuredProviderIteration(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  toolExecutor?: AgentToolExecutor;
  onTaskStatusChange?: (task: AgentTask) => void;
  settleTask: () => void;
  prompt: string;
  iteration: number;
}): void {
  const execution = input.provider.createStructuredCommand?.({
    taskId: input.task.id,
    workspacePath: input.task.workspacePath,
    prompt: input.prompt,
    mode: input.task.mode,
  });
  if (!execution) {
    input.taskStore.appendEvent(input.task.id, {
      type: "error",
      message: `Provider ${input.provider.id} does not support structured execution`,
      provider: input.provider.id,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(input.taskStore, input.task.id, "failed", input.onTaskStatusChange);
    input.settleTask();
    return;
  }

  const startedAt = new Date().toISOString();
  input.taskStore.appendEvent(input.task.id, {
    type: "command",
    command: [execution.command, ...execution.args].join(" "),
    cwd: execution.cwd,
    status: "running",
    createdAt: startedAt,
  });
  updateTaskStatus(input.taskStore, input.task.id, "running", input.onTaskStatusChange);

  const child = spawn(execution.command, execution.args, {
    cwd: execution.cwd,
    shell: false,
    env: process.env,
  });
  let assistantOutput = "";

  child.stdout.on("data", (chunk: Buffer) => {
    assistantOutput += chunk.toString("utf8");
    appendOutput(input.taskStore, input.task.id, "assistant", chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    appendOutput(input.taskStore, input.task.id, "system", chunk);
  });

  child.on("error", (error) => {
    input.taskStore.appendEvent(input.task.id, {
      type: "error",
      message: error.message,
      provider: input.provider.id,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(input.taskStore, input.task.id, "failed", input.onTaskStatusChange);
    input.settleTask();
  });

  child.on("close", (code) => {
    const createdAt = new Date().toISOString();
    input.taskStore.appendEvent(input.task.id, {
      type: "command",
      command: [execution.command, ...execution.args].join(" "),
      cwd: execution.cwd,
      status: code === 0 ? "done" : "failed",
      createdAt,
    });
    if (code !== 0) {
      updateTaskStatus(input.taskStore, input.task.id, "failed", input.onTaskStatusChange);
      input.settleTask();
      return;
    }
    const toolCall = parseAgentToolCall(assistantOutput);
    if (!toolCall || !input.toolExecutor || input.iteration >= 3) {
      updateTaskStatus(input.taskStore, input.task.id, "completed", input.onTaskStatusChange);
      input.settleTask();
      return;
    }
    void executeToolAndContinue({
      ...input,
      toolCall,
    });
  });
}

async function executeToolAndContinue(input: {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  toolExecutor?: AgentToolExecutor;
  onTaskStatusChange?: (task: AgentTask) => void;
  settleTask: () => void;
  prompt: string;
  iteration: number;
  toolCall: AgentToolCall;
}): Promise<void> {
  try {
    input.taskStore.appendEvent(input.task.id, {
      type: "message",
      role: "system",
      text: `Tool call requested: ${JSON.stringify(input.toolCall)}`,
      createdAt: new Date().toISOString(),
    });
    const result = await input.toolExecutor?.execute(input.toolCall);
    const toolResult = result || "{}";
    input.taskStore.appendEvent(input.task.id, {
      type: "message",
      role: "system",
      text: `UC_TOOL_RESULT ${toolResult}`,
      createdAt: new Date().toISOString(),
    });
    runStructuredProviderIteration({
      ...input,
      prompt: `${input.prompt}\n\n---\nUC_TOOL_RESULT for ${input.toolCall.tool}:\n${toolResult}\n\n${buildToolResultFollowupInstruction(input.task.skillId ? getSkill(input.task.skillId) : undefined)}`,
      iteration: input.iteration + 1,
    });
  } catch (cause) {
    const failureMessage = formatToolExecutionFailureMessage(input.toolCall.tool, cause);
    input.taskStore.appendEvent(input.task.id, {
      type: "error",
      message: failureMessage,
      provider: input.provider.id,
      createdAt: new Date().toISOString(),
    });
    input.taskStore.appendEvent(input.task.id, {
      type: "message",
      role: "assistant",
      text: failureMessage,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(input.taskStore, input.task.id, "failed", input.onTaskStatusChange);
    input.settleTask();
  }
}

function parseAgentToolCall(output: string): AgentToolCall | undefined {
  const matches = [...output.matchAll(/UC_TOOL_CALL\s+({[^\n\r]+})/g)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as AgentToolCall;
    if (!parsed || typeof parsed.tool !== "string") return undefined;
    return {
      tool: parsed.tool,
      ...(parsed.input && typeof parsed.input === "object" ? { input: parsed.input } : {}),
    };
  } catch {
    return undefined;
  }
}

function formatToolExecutionFailureMessage(tool: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : "Tool execution failed";
  if (tool === "mailbox.search_messages" && /QQ 邮箱尚未连接|IMAP 授权码|qq_email_credential_missing/u.test(detail)) {
    return "我没法读取 QQ 邮箱：当前租户还没有连接 QQ 邮箱 IMAP 授权码。请先在输入框旁边的邮箱连接器里保存授权码，然后再让我搜索邮件。";
  }
  return detail;
}

export interface RunApprovedLocalCommandInput {
  task: AgentTask;
  taskStore: TaskStore;
  onTaskStatusChange?: (task: AgentTask) => void;
  onTaskSettled?: (taskId: string) => void;
  execution: {
    command: string;
    args: string[];
    cwd: string;
  };
}

export function runApprovedLocalCommand({ task, taskStore, onTaskStatusChange, onTaskSettled, execution }: RunApprovedLocalCommandInput): void {
  let settled = false;
  const settleTask = () => {
    if (settled) return;
    settled = true;
    onTaskSettled?.(task.id);
  };
  const startedAt = new Date().toISOString();
  taskStore.appendEvent(task.id, {
    type: "command",
    command: [execution.command, ...execution.args].join(" "),
    cwd: execution.cwd,
    status: "running",
    createdAt: startedAt,
  });
  updateTaskStatus(taskStore, task.id, "running", onTaskStatusChange);

  const child = spawn(execution.command, execution.args, {
    cwd: execution.cwd,
    shell: false,
    env: process.env,
  });

  child.stdout.on("data", (chunk: Buffer) => {
    appendOutput(taskStore, task.id, "assistant", chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    appendOutput(taskStore, task.id, "system", chunk);
  });

  child.on("error", (error) => {
    taskStore.appendEvent(task.id, {
      type: "error",
      message: error.message,
      provider: "local-shell",
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(taskStore, task.id, "failed", onTaskStatusChange);
    settleTask();
  });

  child.on("close", (code) => {
    const createdAt = new Date().toISOString();
    taskStore.appendEvent(task.id, {
      type: "command",
      command: [execution.command, ...execution.args].join(" "),
      cwd: execution.cwd,
      status: code === 0 ? "done" : "failed",
      createdAt,
    });
    updateTaskStatus(taskStore, task.id, code === 0 ? "completed" : "failed", onTaskStatusChange);
    settleTask();
  });
}

function updateTaskStatus(
  taskStore: TaskStore,
  taskId: string,
  status: AgentTask["status"],
  onTaskStatusChange?: (task: AgentTask) => void,
): AgentTask | undefined {
  const current = taskStore.getTask(taskId);
  if (current?.status === "cancelled" && status !== "cancelled") return current;
  const updated = taskStore.updateTaskStatus(taskId, status);
  if (updated) onTaskStatusChange?.(updated);
  return updated;
}

function withTaskStatusCallback(
  taskStore: TaskStore,
  onTaskStatusChange?: (task: AgentTask) => void,
): TaskStore {
  if (!onTaskStatusChange) return taskStore;
  return {
    ...taskStore,
    updateTaskStatus(taskId, status) {
      return updateTaskStatus(taskStore, taskId, status, onTaskStatusChange);
    },
  };
}

function appendOutput(taskStore: TaskStore, taskId: string, role: "assistant" | "system", chunk: Buffer): void {
  const text = chunk.toString("utf8").trim();
  if (!text) return;
  taskStore.appendEvent(taskId, {
    type: "message",
    role,
    text,
    createdAt: new Date().toISOString(),
  });
}
