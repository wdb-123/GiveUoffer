import type { AgentEvent, AgentTask, ProviderSummary } from "@ucareer/shared";

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "pending";
  text: string;
  createdAt: string;
  durationLabel?: string;
}

export interface AgentConversationTurn {
  id: string;
  messages: AgentChatMessage[];
}

export interface ContextUsage {
  limit: number;
  percent: number;
  level: "low" | "medium" | "high";
  model?: string;
  source: "model_default" | "configured" | "provider_default" | "unknown";
  note?: string;
}

export function buildTaskTranscript(task: AgentTask | null, events: AgentEvent[]): AgentChatMessage[] {
  if (!task) return [];
  const fullPrompt = extractTaskUserQuestion(task.prompt);
  const eventMessages = events
    .map((event, index) => agentEventToMessage(event, index))
    .filter((message) => {
      if (!message || message.role !== "user") return true;
      return extractTaskUserQuestion(message.text) !== fullPrompt;
    })
    .filter((message): message is AgentChatMessage => Boolean(message));
  const userQuestion = extractTaskUserQuestion(task.prompt);
  const firstUserIndex = eventMessages.findIndex((message) => message.role === "user");
  const leadingMessages = firstUserIndex > 0 ? eventMessages.slice(firstUserIndex) : eventMessages;
  if (!userQuestion) return leadingMessages;
  const hasMatchingUser = leadingMessages.some((message) => message.role === "user" && message.text.trim() === userQuestion);
  if (hasMatchingUser) return leadingMessages;
  return [{
    id: `${task.id}-question`,
    role: "user",
    text: userQuestion,
    createdAt: task.createdAt,
  }, ...leadingMessages];
}

export function groupConversationTurns(messages: AgentChatMessage[]): AgentConversationTurn[] {
  return messages.reduce<AgentConversationTurn[]>((turns, message) => {
    if (message.role === "user" || turns.length === 0) {
      turns.push({ id: message.id, messages: [message] });
      return turns;
    }
    const currentTurn = turns[turns.length - 1];
    if (currentTurn) {
      const userMessage = currentTurn.messages.find((item) => item.role === "user");
      if (message.role === "assistant") {
        currentTurn.messages.push({
          ...message,
          durationLabel: formatProcessingDuration(userMessage?.createdAt, message.createdAt),
        });
      } else {
        currentTurn.messages.push(message);
      }
    }
    return turns;
  }, []);
}

export function findLastMessageIndex(messages: AgentChatMessage[], predicate: (message: AgentChatMessage) => boolean): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && predicate(message)) return index;
  }
  return -1;
}

export function resolveContextUsage(input: {
  providerId: string;
  providers: ProviderSummary[];
}): ContextUsage {
  const provider = input.providers.find((item) => item.id === input.providerId);
  const contextWindow = provider?.contextWindow;
  const limit = contextWindow?.tokens || contextLimitForProvider(input.providerId);
  const percent = Math.min(100, Math.max(8, Math.round((limit / 1_000_000) * 100)));
  return {
    limit,
    percent,
    level: limit >= 1_000_000 ? "high" : limit >= 400_000 ? "medium" : "low",
    ...(contextWindow?.model ? { model: contextWindow.model } : {}),
    source: contextWindow?.source || "provider_default",
    ...(contextWindow?.note ? { note: contextWindow.note } : {}),
  };
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

export function summarizeTaskPrompt(prompt: string): string {
  const inputContent = extractTaskUserQuestion(prompt);
  return (inputContent || prompt)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36) || "未命名对话";
}

export function formatTaskName(prompt: string): string {
  const inputContent = extractTaskUserQuestion(prompt)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("要求："));
  return (inputContent || summarizeTaskPrompt(prompt)).slice(0, 42) || "未命名任务";
}

export function formatTaskTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function providerLabel(providers: ProviderSummary[], providerId: string): string {
  return providers.find((provider) => provider.id === providerId)?.label || providerId;
}

export function riskLabel(risk: string): string {
  if (risk === "critical") return "高危审批";
  if (risk === "high") return "高风险";
  if (risk === "medium") return "需确认";
  if (risk === "low") return "低风险";
  return "需确认";
}

export function taskStatusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "running") return "处理中";
  if (status === "blocked") return "等待确认";
  if (status === "failed") return "失败";
  if (status === "queued") return "排队中";
  if (status === "waiting_approval") return "待审批";
  return status;
}

function agentEventToMessage(event: AgentEvent, index: number): AgentChatMessage | null {
  const eventKey = `${event.createdAt}-${index}`;
  if (event.type === "message") {
    const text = event.role === "user" ? extractTaskUserQuestion(event.text) : event.text;
    if (event.role === "assistant" && isToolProtocolMessage(text)) {
      return { id: `${eventKey}-tool`, role: "system", text, createdAt: event.createdAt };
    }
    return { id: `${eventKey}-${event.role}`, role: event.role, text, createdAt: event.createdAt };
  }
  if (event.type === "error") {
    return { id: `${eventKey}-error`, role: "system", text: event.message, createdAt: event.createdAt };
  }
  if (event.type === "task_status") {
    return { id: `${eventKey}-status`, role: "system", text: `任务状态：${taskStatusLabel(event.status)}`, createdAt: event.createdAt };
  }
  if (event.type === "command") {
    return { id: `${eventKey}-command`, role: "system", text: `命令 ${event.status}：${event.command}`, createdAt: event.createdAt };
  }
  if (event.type === "approval_request") {
    return { id: `${eventKey}-approval`, role: "system", text: `等待审批：${event.approval.summary}`, createdAt: event.createdAt };
  }
  if (event.type === "file_change") {
    return {
      id: `${eventKey}-file`,
      role: "system",
      text: event.summary || `文件变更：${event.path}`,
      createdAt: event.createdAt,
    };
  }
  return null;
}

function isToolProtocolMessage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.startsWith("UC_TOOL_CALL") || normalized.startsWith("UC_TOOL_RESULT");
}

function formatProcessingDuration(startAt?: string, endAt?: string): string {
  if (!startAt || !endAt) return "已处理";
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "已处理";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  if (seconds < 60) return `已处理 ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `已处理 ${minutes}m ${rest}s` : `已处理 ${minutes}m`;
}

function contextLimitForProvider(providerId: string): number {
  if (providerId.includes("gemini")) return 1_000_000;
  if (providerId.includes("claude")) return 200_000;
  return 400_000;
}

export function extractTaskUserQuestion(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").trim();
  const markerMatch = normalized.match(/(?:最新输入|输入内容)\s*[:：]\s*([\s\S]*)$/u);
  if (markerMatch?.[1]?.trim()) return stripLeakedPageContext(markerMatch[1]);

  const wrapperIndex = normalized.search(/你是\s+Ucareer\s+职业旅程工作台的统一入口\s+Agent/u);
  if (wrapperIndex >= 0) {
    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    const lastInputLine = [...lines].reverse().find((line) => line.startsWith("输入内容") || line.startsWith("最新输入"));
    if (lastInputLine) {
      const inlineInput = lastInputLine.replace(/^(?:最新输入|输入内容)\s*[:：]\s*/u, "").trim();
      if (inlineInput) return stripLeakedPageContext(inlineInput);
    }
    return "";
  }

  return stripLeakedPageContext(normalized);
}

function stripLeakedPageContext(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("page: ")) return normalized;
  const lines = normalized.split("\n");
  const writePathsIndex = lines.findIndex((line) => line.trim().startsWith("write paths:"));
  if (writePathsIndex >= 0) return lines.slice(writePathsIndex + 1).join("\n").trim();
  return normalized.replace(/^page:\s+[\s\S]*?(?:write paths:\s*[^\n]*(?:\n|$))/u, "").trim();
}
