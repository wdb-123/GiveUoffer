import { spawn } from "node:child_process";
import type { AgentProvider } from "@ucareer/agent-core";
import type { AgentTask } from "@ucareer/shared";
import { isPaperclipAdapterProvider } from "../providers/paperclip-adapter-provider";
import type { TaskStore } from "../stores/task-store";
import type { AgentToolCall, AgentToolExecutor } from "../tools/tool-executor";

export interface RunApprovedTaskInput {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
  toolExecutor?: AgentToolExecutor;
  onTaskStatusChange?: (task: AgentTask) => void;
}

export function runApprovedTask({ task, provider, taskStore, toolExecutor, onTaskStatusChange }: RunApprovedTaskInput): void {
  if (isPaperclipAdapterProvider(provider)) {
    void provider.executePaperclipTask({
      taskId: task.id,
      prompt: task.prompt,
      workspacePath: task.workspacePath,
      taskStore: withTaskStatusCallback(taskStore, onTaskStatusChange),
      ...(toolExecutor ? { toolExecutor } : {}),
    });
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
    return;
  }

  runStructuredProviderIteration({
    task,
    provider,
    taskStore,
    ...(toolExecutor ? { toolExecutor } : {}),
    ...(onTaskStatusChange ? { onTaskStatusChange } : {}),
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
      return;
    }
    const toolCall = parseAgentToolCall(assistantOutput);
    if (!toolCall || !input.toolExecutor || input.iteration >= 3) {
      updateTaskStatus(input.taskStore, input.task.id, "completed", input.onTaskStatusChange);
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
      prompt: `${input.prompt}\n\n---\nUC_TOOL_RESULT for ${input.toolCall.tool}:\n${toolResult}\n\n请基于工具结果回答用户。不要再次输出同一个工具调用，除非确实需要分页读取更多结果。`,
      iteration: input.iteration + 1,
    });
  } catch (cause) {
    input.taskStore.appendEvent(input.task.id, {
      type: "error",
      message: cause instanceof Error ? cause.message : "Tool execution failed",
      provider: input.provider.id,
      createdAt: new Date().toISOString(),
    });
    updateTaskStatus(input.taskStore, input.task.id, "failed", input.onTaskStatusChange);
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

export interface RunApprovedLocalCommandInput {
  task: AgentTask;
  taskStore: TaskStore;
  onTaskStatusChange?: (task: AgentTask) => void;
  execution: {
    command: string;
    args: string[];
    cwd: string;
  };
}

export function runApprovedLocalCommand({ task, taskStore, onTaskStatusChange, execution }: RunApprovedLocalCommandInput): void {
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
  });
}

function updateTaskStatus(
  taskStore: TaskStore,
  taskId: string,
  status: AgentTask["status"],
  onTaskStatusChange?: (task: AgentTask) => void,
): AgentTask | undefined {
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
