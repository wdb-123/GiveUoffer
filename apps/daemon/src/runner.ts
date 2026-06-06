import { spawn } from "node:child_process";
import type { AgentProvider } from "@offeru/agent-core";
import type { AgentTask } from "@offeru/shared";
import type { TaskStore } from "./task-store";

export interface RunApprovedTaskInput {
  task: AgentTask;
  provider: AgentProvider;
  taskStore: TaskStore;
}

export function runApprovedTask({ task, provider, taskStore }: RunApprovedTaskInput): void {
  if (task.mode !== "structured") {
    taskStore.appendEvent(task.id, {
      type: "error",
      message: "PTY execution is not implemented yet",
      provider: provider.id,
      createdAt: new Date().toISOString(),
    });
    taskStore.updateTaskStatus(task.id, "failed");
    return;
  }

  if (!provider.createStructuredCommand) {
    taskStore.appendEvent(task.id, {
      type: "error",
      message: `Provider ${provider.id} does not support structured execution`,
      provider: provider.id,
      createdAt: new Date().toISOString(),
    });
    taskStore.updateTaskStatus(task.id, "failed");
    return;
  }

  const execution = provider.createStructuredCommand({
    taskId: task.id,
    workspacePath: task.workspacePath,
    prompt: task.prompt,
    mode: task.mode,
  });

  const startedAt = new Date().toISOString();
  taskStore.appendEvent(task.id, {
    type: "command",
    command: [execution.command, ...execution.args].join(" "),
    cwd: execution.cwd,
    status: "running",
    createdAt: startedAt,
  });
  taskStore.updateTaskStatus(task.id, "running");

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
      provider: provider.id,
      createdAt: new Date().toISOString(),
    });
    taskStore.updateTaskStatus(task.id, "failed");
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
    taskStore.updateTaskStatus(task.id, code === 0 ? "completed" : "failed");
  });
}

export interface RunApprovedLocalCommandInput {
  task: AgentTask;
  taskStore: TaskStore;
  execution: {
    command: string;
    args: string[];
    cwd: string;
  };
}

export function runApprovedLocalCommand({ task, taskStore, execution }: RunApprovedLocalCommandInput): void {
  const startedAt = new Date().toISOString();
  taskStore.appendEvent(task.id, {
    type: "command",
    command: [execution.command, ...execution.args].join(" "),
    cwd: execution.cwd,
    status: "running",
    createdAt: startedAt,
  });
  taskStore.updateTaskStatus(task.id, "running");

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
    taskStore.updateTaskStatus(task.id, "failed");
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
    taskStore.updateTaskStatus(task.id, code === 0 ? "completed" : "failed");
  });
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
