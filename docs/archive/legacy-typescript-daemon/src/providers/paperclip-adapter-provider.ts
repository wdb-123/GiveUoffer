import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import type {
  AgentCapabilities,
  AgentProvider,
  AgentSessionHandle,
  AgentSessionInput,
  InstallStatus,
} from "@ucareer/agent-core";
import type { AgentEvent, ProviderContextWindow } from "@ucareer/shared";
import type { TaskStore } from "../stores/task-store";
import type { AgentToolCall, AgentToolExecutor } from "../tools/tool-executor";
import * as claudeServer from "../paperclip-adapters/claude-local/server/index.js";
import { parseClaudeStdoutLine } from "../paperclip-adapters/claude-local/ui/parse-stdout.js";
import * as codexServer from "../paperclip-adapters/codex-local/server/index.js";
import { parseCodexStdoutLine } from "../paperclip-adapters/codex-local/ui/parse-stdout.js";
import * as geminiServer from "../paperclip-adapters/gemini-local/server/index.js";
import { parseGeminiStdoutLine } from "../paperclip-adapters/gemini-local/ui/parse-stdout.js";
import * as openclawServer from "../paperclip-adapters/openclaw-gateway/server/index.js";
import { parseOpenClawGatewayStdoutLine } from "../paperclip-adapters/openclaw-gateway/ui/parse-stdout.js";
import * as opencodeServer from "../paperclip-adapters/opencode-local/server/index.js";
import { parseOpenCodeStdoutLine } from "../paperclip-adapters/opencode-local/ui/parse-stdout.js";
import { buildToolResultFollowupInstruction } from "../workflow/prompt-builder";
import { getSkill } from "../skills/registry";

const execFileAsync = promisify(execFile);

type TranscriptEntry = {
  kind: string;
  text?: string;
  name?: string;
  toolUseId?: string;
  input?: unknown;
  content?: string;
  isError?: boolean;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
};

type PaperclipServerModule = {
  execute(ctx: Record<string, unknown>): Promise<{
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    errorMessage?: string | null;
    usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number };
    model?: string | null;
  }>;
  testEnvironment?: (ctx: Record<string, unknown>) => Promise<{
    status: "pass" | "warn" | "fail";
    checks: Array<{ level: "info" | "warn" | "error"; message: string; detail?: string | null }>;
  }>;
};

export interface PaperclipAdapterDefinition {
  id: string;
  label: string;
  adapterType: string;
  packageDir: string;
  command: string;
  config?: Record<string, unknown>;
  contextWindow?: ProviderContextWindow;
  capabilities: AgentCapabilities;
}

const embeddedPaperclipAdapters: Record<string, {
  server: PaperclipServerModule;
  parseStdoutLine(line: string, ts: string): TranscriptEntry[];
}> = {
  "claude-local": { server: claudeServer as unknown as PaperclipServerModule, parseStdoutLine: parseClaudeStdoutLine },
  "codex-local": { server: codexServer as unknown as PaperclipServerModule, parseStdoutLine: parseCodexStdoutLine },
  "gemini-local": { server: geminiServer as unknown as PaperclipServerModule, parseStdoutLine: parseGeminiStdoutLine },
  "openclaw-gateway": { server: openclawServer as unknown as PaperclipServerModule, parseStdoutLine: parseOpenClawGatewayStdoutLine },
  "opencode-local": { server: opencodeServer as unknown as PaperclipServerModule, parseStdoutLine: parseOpenCodeStdoutLine },
};

export class PaperclipAdapterProvider implements AgentProvider {
  id: string;
  label: string;
  capabilities: AgentCapabilities;
  contextWindow?: ProviderContextWindow;
  private definition: PaperclipAdapterDefinition;

  constructor(definition: PaperclipAdapterDefinition) {
    this.definition = definition;
    this.id = definition.id;
    this.label = definition.label;
    this.capabilities = definition.capabilities;
    if (definition.contextWindow) this.contextWindow = definition.contextWindow;
  }

  async checkInstalled(): Promise<InstallStatus> {
    const config = this.buildConfig(process.cwd());
    const server = await this.loadServerModule();
    if (server.testEnvironment) {
      const result = await server.testEnvironment({
        adapterType: this.definition.adapterType,
        config,
        executionTarget: null,
        environmentName: "local",
      });
      const errorCheck = result.checks.find((check) => check.level === "error");
      return {
        installed: result.status !== "fail",
        message: errorCheck?.message || result.checks.map((check) => check.message).join(" / "),
      };
    }

    try {
      const result = await execFileAsync(this.definition.command, ["--version"], { timeout: 5000 });
      const version = (result.stdout || result.stderr).trim();
      return { installed: true, ...(version ? { version } : {}) };
    } catch (error) {
      return {
        installed: false,
        message: error instanceof Error ? error.message : `${this.label} is not available`,
      };
    }
  }

  async startSession(input: AgentSessionInput): Promise<AgentSessionHandle> {
    return {
      id: randomUUID(),
      providerId: this.id,
      status: input.prompt ? "queued" : "waiting_approval",
    };
  }

  async sendMessage(_sessionId: string, _message: string): Promise<void> {
    throw new Error(`${this.label} is executed through the Paperclip adapter`);
  }

  async stopSession(_sessionId: string): Promise<void> {
    return;
  }

  async executePaperclipTask(input: {
    taskId: string;
    prompt: string;
    workspacePath: string;
    taskStore: TaskStore;
    toolExecutor?: AgentToolExecutor;
  }): Promise<void> {
    const totalStartMs = performance.now();
    const loadStartMs = performance.now();
    const server = await this.loadServerModule();
    const parser = await this.loadStdoutParser();
    const config = this.buildConfig(input.workspacePath);
    appendTimingEvent(input.taskStore, input.taskId, "provider.load_adapter", performance.now() - loadStartMs, `provider=${this.id}`);
    logTiming("provider.load_adapter", performance.now() - loadStartMs, { taskId: input.taskId, providerId: this.id });

    input.taskStore.updateTaskStatus(input.taskId, "running");
    input.taskStore.appendEvent(input.taskId, {
      type: "message",
      role: "system",
      text: `Paperclip adapter ${this.definition.adapterType} 已启动。`,
      createdAt: new Date().toISOString(),
    });

    let prompt = input.prompt;
    let firstAssistantOutputMs: number | null = null;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      appendProcessStatus(
        input.taskStore,
        input.taskId,
        iteration === 0 ? "正在分析请求" : "正在基于工具结果整理回答",
      );
      const assistantOutput: string[] = [];
      const lineBuffers: Record<"stdout" | "stderr", string> = { stdout: "", stderr: "" };
      const iterationStartMs = performance.now();
      let iterationSawUsage = false;
      const result = await server.execute({
        runId: input.taskId,
        agent: {
          id: this.id,
          companyId: "ucareer",
          name: this.label,
          adapterType: this.definition.adapterType,
          adapterConfig: config,
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: input.taskId,
        },
        config,
        context: {
          ucareerPrompt: prompt,
          paperclipWorkspace: {
            cwd: input.workspacePath,
            source: "configured",
            strategy: "local",
            workspaceId: "ucareer",
          },
        },
        onMeta: async (meta: unknown) => {
          const command = readString((meta as Record<string, unknown>)?.command);
          if (!command) return;
          input.taskStore.appendEvent(input.taskId, {
            type: "command",
            command,
            cwd: input.workspacePath,
            status: "running",
            createdAt: new Date().toISOString(),
          });
        },
        onSpawn: async () => {},
        onLog: async (stream: "stdout" | "stderr", chunk: string) => {
          lineBuffers[stream] = consumeAdapterChunk({
            buffer: lineBuffers[stream],
            chunk,
            stream,
            parseStdoutLine: parser,
            onEntry: (entry) => {
              if (entry.kind === "assistant" && entry.text) {
                assistantOutput.push(entry.text);
                if (firstAssistantOutputMs === null) {
                  firstAssistantOutputMs = performance.now() - totalStartMs;
                  appendTimingEvent(input.taskStore, input.taskId, "provider.first_assistant_output", firstAssistantOutputMs, `iteration=${iteration + 1}`);
                  logTiming("provider.first_assistant_output", firstAssistantOutputMs, { taskId: input.taskId, providerId: this.id, iteration: iteration + 1 });
                }
              }
              if (isUsageTranscriptEntry(entry)) iterationSawUsage = true;
              appendTranscriptEntry(input.taskStore, input.taskId, entry, stream);
            },
          });
        },
      });
      const iterationMs = performance.now() - iterationStartMs;
      appendTimingEvent(input.taskStore, input.taskId, "provider.iteration_execute", iterationMs, `iteration=${iteration + 1} exitCode=${result.exitCode}`);
      logTiming("provider.iteration_execute", iterationMs, { taskId: input.taskId, providerId: this.id, iteration: iteration + 1, exitCode: result.exitCode });

      for (const stream of ["stdout", "stderr"] as const) {
        const remainder = lineBuffers[stream].trim();
        if (!remainder) continue;
        const ts = new Date().toISOString();
        const entries = stream === "stdout" ? parser(remainder, ts) : [{ kind: "stderr", ts, text: remainder }];
        for (const entry of entries) {
          if (entry.kind === "assistant" && entry.text) {
            assistantOutput.push(entry.text);
            if (firstAssistantOutputMs === null) {
              firstAssistantOutputMs = performance.now() - totalStartMs;
              appendTimingEvent(input.taskStore, input.taskId, "provider.first_assistant_output", firstAssistantOutputMs, `iteration=${iteration + 1} remainder=${stream}`);
              logTiming("provider.first_assistant_output", firstAssistantOutputMs, { taskId: input.taskId, providerId: this.id, iteration: iteration + 1, stream });
            }
          }
          if (isUsageTranscriptEntry(entry)) iterationSawUsage = true;
          appendTranscriptEntry(input.taskStore, input.taskId, entry, stream);
        }
      }

      if (!iterationSawUsage) appendUsageEvent(input.taskStore, input.taskId, this.id, result.usage, result.model);

      if (result.errorMessage) {
        input.taskStore.appendEvent(input.taskId, {
          type: "error",
          message: normalizeRuntimeDiagnostic(result.errorMessage),
          provider: this.id,
          createdAt: new Date().toISOString(),
        });
      }
      if (result.exitCode !== 0) {
        input.taskStore.updateTaskStatus(input.taskId, "failed");
        appendTimingEvent(input.taskStore, input.taskId, "provider.total", performance.now() - totalStartMs, "status=failed");
        logTiming("provider.total", performance.now() - totalStartMs, { taskId: input.taskId, providerId: this.id, status: "failed" });
        return;
      }

      const toolCall = parseAgentToolCall(assistantOutput.join("\n"));
      if (!toolCall || !input.toolExecutor) {
        input.taskStore.updateTaskStatus(input.taskId, "completed");
        appendTimingEvent(input.taskStore, input.taskId, "provider.total", performance.now() - totalStartMs, "status=completed");
        logTiming("provider.total", performance.now() - totalStartMs, { taskId: input.taskId, providerId: this.id, status: "completed" });
        return;
      }

      input.taskStore.appendEvent(input.taskId, {
        type: "message",
        role: "system",
        text: `UC_TOOL_CALL ${JSON.stringify(toolCall)}`,
        createdAt: new Date().toISOString(),
      });
      appendProcessStatus(input.taskStore, input.taskId, `正在调用工具：${toolCall.tool}`);
      try {
        const toolStartMs = performance.now();
        const toolResult = await input.toolExecutor.execute(toolCall);
        const toolMs = performance.now() - toolStartMs;
        appendTimingEvent(input.taskStore, input.taskId, "tool.execute", toolMs, `tool=${toolCall.tool}`);
        logTiming("tool.execute", toolMs, { taskId: input.taskId, providerId: this.id, tool: toolCall.tool });
        input.taskStore.appendEvent(input.taskId, {
          type: "message",
          role: "system",
          text: `UC_TOOL_RESULT ${toolResult}`,
          createdAt: new Date().toISOString(),
        });
        if (toolCall.tool === "jobsearch.search_jobs") {
          input.taskStore.appendEvent(input.taskId, {
            type: "message",
            role: "assistant",
            text: formatJobSearchAnswer(toolResult),
            createdAt: new Date().toISOString(),
          });
          input.taskStore.updateTaskStatus(input.taskId, "completed");
          appendTimingEvent(input.taskStore, input.taskId, "provider.total", performance.now() - totalStartMs, "status=completed");
          logTiming("provider.total", performance.now() - totalStartMs, { taskId: input.taskId, providerId: this.id, status: "completed" });
          return;
        }
        appendProcessStatus(input.taskStore, input.taskId, summarizeToolResult(toolCall.tool, toolResult));
        const currentTask = input.taskStore.getTask(input.taskId);
        prompt = `${prompt}\n\n---\nUC_TOOL_RESULT for ${toolCall.tool}:\n${toolResult}\n\n${buildToolResultFollowupInstruction(currentTask?.skillId ? getSkill(currentTask.skillId) : undefined)}`;
      } catch (cause) {
        const failureMessage = formatToolExecutionFailureMessage(toolCall.tool, cause);
        input.taskStore.appendEvent(input.taskId, {
          type: "error",
          message: failureMessage,
          provider: this.id,
          createdAt: new Date().toISOString(),
        });
        input.taskStore.appendEvent(input.taskId, {
          type: "message",
          role: "assistant",
          text: failureMessage,
          createdAt: new Date().toISOString(),
        });
        input.taskStore.updateTaskStatus(input.taskId, "failed");
        appendTimingEvent(input.taskStore, input.taskId, "provider.total", performance.now() - totalStartMs, "status=failed");
        logTiming("provider.total", performance.now() - totalStartMs, { taskId: input.taskId, providerId: this.id, status: "failed" });
        return;
      }
    }

    input.taskStore.appendEvent(input.taskId, {
      type: "error",
      message: "工具调用次数过多，已停止当前 Agent 任务。",
      provider: this.id,
      createdAt: new Date().toISOString(),
    });
    input.taskStore.updateTaskStatus(input.taskId, "failed");
    appendTimingEvent(input.taskStore, input.taskId, "provider.total", performance.now() - totalStartMs, "status=failed_too_many_tool_calls");
    logTiming("provider.total", performance.now() - totalStartMs, { taskId: input.taskId, providerId: this.id, status: "failed_too_many_tool_calls" });
  }

  async executeRouterPrompt(input: {
    prompt: string;
    workspacePath: string;
  }): Promise<string> {
    const server = await this.loadServerModule();
    const parser = await this.loadStdoutParser();
    const config = this.buildConfig(input.workspacePath);
    const assistantOutput: string[] = [];
    const lineBuffers: Record<"stdout" | "stderr", string> = { stdout: "", stderr: "" };
    const stderrOutput: string[] = [];

    const result = await server.execute({
      runId: `router_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      agent: {
        id: this.id,
        companyId: "ucareer",
        name: this.label,
        adapterType: this.definition.adapterType,
        adapterConfig: config,
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: "ucareer-router",
      },
      config: {
        ...config,
        timeoutSec: readPositiveInteger(process.env.UCAREER_ROUTER_TIMEOUT_SEC, 120),
      },
      context: {
        ucareerPrompt: input.prompt,
        paperclipWorkspace: {
          cwd: input.workspacePath,
          source: "configured",
          strategy: "local",
          workspaceId: "ucareer",
        },
      },
      onMeta: async () => {},
      onSpawn: async () => {},
      onLog: async (stream: "stdout" | "stderr", chunk: string) => {
        if (stream === "stderr") stderrOutput.push(chunk);
        lineBuffers[stream] = consumeAdapterChunk({
          buffer: lineBuffers[stream],
          chunk,
          stream,
          parseStdoutLine: parser,
          onEntry: (entry) => {
            if (entry.kind === "assistant" && entry.text) assistantOutput.push(entry.text);
            if ((entry.kind === "stdout" || entry.kind === "result") && entry.text) assistantOutput.push(entry.text);
          },
        });
      },
    });

    for (const stream of ["stdout", "stderr"] as const) {
      const remainder = lineBuffers[stream].trim();
      if (!remainder) continue;
      const ts = new Date().toISOString();
      const entries = stream === "stdout" ? parser(remainder, ts) : [{ kind: "stderr", ts, text: remainder }];
      for (const entry of entries) {
        if (entry.kind === "assistant" && entry.text) assistantOutput.push(entry.text);
        if ((entry.kind === "stdout" || entry.kind === "result") && entry.text) assistantOutput.push(entry.text);
      }
    }

    if (result.exitCode !== 0) {
      throw new Error(normalizeRuntimeDiagnostic(result.errorMessage || stderrOutput.join("").trim() || `${this.label} router exited with ${result.exitCode}`));
    }
    const output = assistantOutput.join("\n").trim();
    if (!output) throw new Error(`${this.label} router returned no output`);
    return output;
  }

  private buildConfig(cwd: string): Record<string, unknown> {
    return {
      command: this.definition.command,
      cwd,
      promptTemplate: "{{context.ucareerPrompt}}",
      timeoutSec: readPositiveInteger(process.env.UCAREER_AGENT_TIMEOUT_SEC, 240),
      graceSec: 20,
      ...(this.definition.config || {}),
    };
  }

  private async loadServerModule(): Promise<PaperclipServerModule> {
    return this.loadEmbeddedAdapter().server;
  }

  private async loadStdoutParser(): Promise<(line: string, ts: string) => TranscriptEntry[]> {
    return this.loadEmbeddedAdapter().parseStdoutLine;
  }

  private loadEmbeddedAdapter(): {
    server: PaperclipServerModule;
    parseStdoutLine(line: string, ts: string): TranscriptEntry[];
  } {
    const adapter = embeddedPaperclipAdapters[this.definition.packageDir];
    if (!adapter) throw new Error(`Embedded Paperclip adapter not found: ${this.definition.packageDir}`);
    return adapter;
  }
}

export function createPaperclipAdapterProviders(input: {
  definitions: PaperclipAdapterDefinition[];
}): AgentProvider[] {
  return input.definitions.map((definition) => new PaperclipAdapterProvider(definition));
}

export function isPaperclipAdapterProvider(provider: AgentProvider): provider is AgentProvider & {
  executePaperclipTask(input: {
    taskId: string;
    prompt: string;
    workspacePath: string;
    taskStore: TaskStore;
    toolExecutor?: AgentToolExecutor;
  }): Promise<void>;
  executeRouterPrompt(input: {
    prompt: string;
    workspacePath: string;
  }): Promise<string>;
} {
  const candidate = provider as { executePaperclipTask?: unknown; executeRouterPrompt?: unknown };
  return typeof candidate.executePaperclipTask === "function"
    && typeof candidate.executeRouterPrompt === "function";
}

function consumeAdapterChunk(input: {
  buffer: string;
  chunk: string;
  stream: "stdout" | "stderr";
  parseStdoutLine(line: string, ts: string): TranscriptEntry[];
  onEntry(entry: TranscriptEntry): void;
}): string {
  const merged = input.buffer + input.chunk;
  const lines = merged.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const ts = new Date().toISOString();
    const entries = input.stream === "stdout"
      ? input.parseStdoutLine(line, ts)
      : [{ kind: "stderr", ts, text: line }];
    for (const entry of entries) input.onEntry(entry);
  }
  return remainder;
}

function appendTranscriptEntry(taskStore: TaskStore, taskId: string, entry: TranscriptEntry, stream: "stdout" | "stderr"): void {
  const createdAt = new Date().toISOString();
  const events = transcriptEntryToEvents(entry, stream, createdAt);
  for (const event of events) taskStore.appendEvent(taskId, event);
}

function appendProcessStatus(taskStore: TaskStore, taskId: string, status: string): void {
  taskStore.appendEvent(taskId, {
    type: "message",
    role: "system",
    text: `执行状态：${status}`,
    createdAt: new Date().toISOString(),
  });
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

function transcriptEntryToEvents(entry: TranscriptEntry, stream: "stdout" | "stderr", createdAt: string): AgentEvent[] {
  if (entry.kind === "assistant" && entry.text) {
    return [{ type: "message", role: "assistant", text: entry.text, createdAt }];
  }
  if (entry.kind === "stderr" || stream === "stderr") {
    const text = entry.text || "stderr";
    return [{ type: "message", role: "system", text: normalizeRuntimeDiagnostic(text), createdAt }];
  }
  if (entry.kind === "tool_call") {
    return [{
      type: "command",
      command: entry.name || "tool_call",
      cwd: "",
      status: "running",
      createdAt,
    }];
  }
  if (entry.kind === "tool_result") {
    return [{
      type: "message",
      role: entry.isError ? "system" : "assistant",
      text: entry.content || entry.text || "tool completed",
      createdAt,
    }];
  }
  if (entry.kind === "thinking") {
    return [{ type: "message", role: "system", text: entry.text ? `执行状态：${entry.text}` : "执行状态：正在推理", createdAt }];
  }
  if (entry.kind === "init") {
    return [{ type: "message", role: "system", text: "执行状态：本地 Agent 会话已建立", createdAt }];
  }
  if (entry.kind === "result") {
    const inputTokens = normalizeTokenCount(entry.inputTokens);
    const cachedInputTokens = normalizeTokenCount(entry.cachedTokens);
    const outputTokens = normalizeTokenCount(entry.outputTokens);
    const events: AgentEvent[] = [];
    if (inputTokens || cachedInputTokens || outputTokens) {
      events.push({
        type: "usage",
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens: inputTokens + cachedInputTokens + outputTokens,
        createdAt,
      });
    }
    if (entry.isError) {
      events.push({ type: "message", role: "system", text: `执行状态：本轮执行失败${entry.text ? `：${entry.text}` : ""}`, createdAt });
      return events;
    }
    events.push({ type: "message", role: "system", text: "执行状态：本轮输出完成", createdAt });
    return events;
  }
  if (entry.kind === "system") {
    return [];
  }
  const text = entry.text || entry.content;
  return text ? [{ type: "message", role: "system", text, createdAt }] : [];
}

function appendUsageEvent(
  taskStore: TaskStore,
  taskId: string,
  providerId: string,
  usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number } | undefined,
  model?: string | null,
): void {
  const inputTokens = normalizeTokenCount(usage?.inputTokens);
  const cachedInputTokens = normalizeTokenCount(usage?.cachedInputTokens);
  const outputTokens = normalizeTokenCount(usage?.outputTokens);
  if (!inputTokens && !cachedInputTokens && !outputTokens) return;
  taskStore.appendEvent(taskId, {
    type: "usage",
    providerId,
    ...(model ? { model } : {}),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + cachedInputTokens + outputTokens,
    createdAt: new Date().toISOString(),
  });
}

function normalizeTokenCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function isUsageTranscriptEntry(entry: TranscriptEntry): boolean {
  return entry.kind === "result" && Boolean(
    normalizeTokenCount(entry.inputTokens)
    || normalizeTokenCount(entry.cachedTokens)
    || normalizeTokenCount(entry.outputTokens),
  );
}

function summarizeToolResult(toolName: string, toolResult: string): string {
  try {
    const parsed = JSON.parse(toolResult) as { messages?: unknown[] };
    if (Array.isArray(parsed.messages)) return `工具 ${toolName} 返回 ${parsed.messages.length} 条结果，正在整理`;
  } catch {
    return `工具 ${toolName} 已返回结果，正在整理`;
  }
  return `工具 ${toolName} 已返回结果，正在整理`;
}

function formatJobSearchAnswer(toolResult: string): string {
  try {
    const parsed = JSON.parse(toolResult) as {
      status?: string;
      stats?: { added?: number; candidatesSeen?: number; duplicatesSkipped?: number; failedQueries?: number };
      message?: string;
      jobs?: Array<Record<string, unknown>>;
      omittedJobs?: number;
    };
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    const stats = parsed.stats || {};
    const lines = [
      parsed.status === "failed" ? "岗位搜索没有成功完成。" : "岗位搜索已完成。",
      `新增 ${Number(stats.added || 0)} 个，候选 ${Number(stats.candidatesSeen || 0)} 个，重复 ${Number(stats.duplicatesSkipped || 0)} 个。`,
      parsed.message ? `说明：${parsed.message}` : "",
      jobs.length ? "" : "这次没有拿到可展示岗位。系统已尝试可用来源；建议减少关键词、换城市，或确认招聘平台登录态/当前页面可读取后重试。",
      ...jobs.slice(0, 12).map((job, index) => {
        const company = stringField(job.company) || "公司待复核";
        const role = stringField(job.role) || stringField(job.title) || "岗位待复核";
        const location = stringField(job.location);
        const salary = stringField(job.salary);
        const url = stringField(job.url);
        return `${index + 1}. ${company}｜${role}${location ? `｜${location}` : ""}${salary ? `｜${salary}` : ""}${url ? `\n   ${url}` : ""}`;
      }),
      parsed.omittedJobs ? `还有 ${parsed.omittedJobs} 个结果已省略，可在岗位列表查看。` : "",
    ].filter(Boolean);
    return lines.join("\n");
  } catch {
    return "岗位搜索工具已返回结果，但结果格式无法直接展示。请在岗位列表查看最新入库岗位。";
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRuntimeDiagnostic(text: string): string {
  if (/codex_core_plugins::manager: failed to sync curated plugins repo/i.test(text)) {
    return `插件同步提示：${text}`;
  }
  if (/Failed to connect to 127\.0\.0\.1 port \d+/i.test(text)) {
    return `网络/代理异常：${text}`;
  }
  if (/Timed out after \d+s/i.test(text)) {
    return `执行超时：${text}`;
  }
  return text;
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
      ...(parsed.input && typeof parsed.input === "object" ? { input: parsed.input as Record<string, unknown> } : {}),
    };
  } catch {
    return undefined;
  }
}

function formatToolExecutionFailureMessage(tool: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : "工具执行失败";
  if (tool === "mailbox.search_messages" && /QQ 邮箱尚未连接|IMAP 授权码|qq_email_credential_missing/u.test(detail)) {
    return "我没法读取 QQ 邮箱：当前租户还没有连接 QQ 邮箱 IMAP 授权码。请先在输入框旁边的邮箱连接器里保存授权码，然后再让我搜索邮件。";
  }
  return detail;
}
