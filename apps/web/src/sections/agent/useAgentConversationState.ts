import { useEffect, useMemo } from "react";
import type { AgentEvent, AgentTask, AgentTaskTurn } from "@ucareer/shared";
import {
  buildTaskTranscript,
  extractTaskUserQuestion,
  findLastMessageIndex,
  groupConversationTurns,
} from "./agentConversation";
import type { AgentChatMessage, AgentConversationTurn } from "./agentConversation";

export interface AgentPendingDraft {
  user: AgentChatMessage;
  pending: AgentChatMessage;
  sentAt: number;
  taskId?: string;
}

export function useAgentConversationState(input: {
  localMessages: AgentChatMessage[];
  pendingDraft: AgentPendingDraft | null;
  selectedTask: AgentTask | null;
  selectedTaskEvents: AgentEvent[];
  selectedTaskTurns: AgentTaskTurn[];
  onClearPendingDraft(): void;
}) {
  const taskMessages = useMemo(
    () => buildTaskTranscript(input.selectedTask, input.selectedTaskEvents),
    [input.selectedTask, input.selectedTaskEvents],
  );
  const baseMessages = input.selectedTask ? taskMessages : input.localMessages;
  const selectedPendingTask = Boolean(input.pendingDraft?.taskId && input.selectedTask?.id === input.pendingDraft.taskId);
  const pendingMessages = input.pendingDraft && selectedPendingTask
    ? hasBackendAssistantAfterTimestamp(baseMessages, input.pendingDraft.sentAt) ? [] : [input.pendingDraft.pending]
    : input.pendingDraft && !hasBackendUserMessageAfter(baseMessages, input.pendingDraft.user.text, input.pendingDraft.sentAt)
      ? [input.pendingDraft.user, input.pendingDraft.pending]
      : input.pendingDraft && !hasBackendAssistantAfterUserAfter(baseMessages, input.pendingDraft.user.text, input.pendingDraft.sentAt)
        ? [input.pendingDraft.pending]
        : [];
  const visibleMessages = pendingMessages.length
    ? [...baseMessages, ...pendingMessages]
    : baseMessages;
  const backendConversationTurns = input.selectedTask && input.selectedTaskTurns.length
    ? input.selectedTaskTurns.map(agentTaskTurnToConversationTurn)
    : groupConversationTurns(visibleMessages);
  const conversationTurns = pendingMessages.length
    ? mergePendingMessagesIntoTurns(backendConversationTurns, pendingMessages)
    : backendConversationTurns;
  const agentBusy = Boolean(
    input.pendingDraft
      || input.selectedTask?.status === "queued"
      || input.selectedTask?.status === "running"
      || input.selectedTask?.status === "waiting_approval",
  );
  const executionStatusLabel = input.pendingDraft
    ? "正在启动对话"
    : input.selectedTask?.status === "waiting_approval"
      ? "等待执行审批"
      : input.selectedTask?.status === "queued"
        ? "正在排队准备执行"
        : input.selectedTask?.status === "running"
          ? "Agent 正在执行中"
          : "";
  const currentProcessMessages = agentBusy
    ? getCurrentProcessMessages(conversationTurns)
    : [];
  const showCurrentProcess = agentBusy && (currentProcessMessages.length > 0 || Boolean(executionStatusLabel));

  useEffect(() => {
    if (!input.pendingDraft) return;
    const taskFinished = input.selectedTaskEvents.some((event) => {
      if (!isCreatedAtOrAfter(event.createdAt, input.pendingDraft!.sentAt)) return false;
      if (event.type === "error") return true;
      if (event.type !== "task_status") return false;
      return event.status === "completed" || event.status === "failed" || event.status === "cancelled";
    });
    if (taskFinished
      || (input.pendingDraft.taskId && input.selectedTask?.id === input.pendingDraft.taskId && hasBackendAssistantAfterTimestamp(baseMessages, input.pendingDraft.sentAt))
      || hasBackendAssistantAfterUserAfter(baseMessages, input.pendingDraft.user.text, input.pendingDraft.sentAt)) {
      input.onClearPendingDraft();
    }
  }, [baseMessages, input]);

  return {
    agentBusy,
    baseMessages,
    conversationTurns,
    currentProcessMessages,
    executionStatusLabel,
    showCurrentProcess,
    visibleMessages,
  };
}

function hasBackendUserMessageAfter(messages: AgentChatMessage[], text: string, sentAt: number): boolean {
  const normalized = normalizeMessageText(text);
  if (!normalized) return false;
  return messages.some((message) => (
    message.role === "user"
      && isCreatedAtOrAfter(message.createdAt, sentAt)
      && normalizeMessageText(message.text) === normalized
  ));
}

function hasBackendAssistantAfterUserAfter(messages: AgentChatMessage[], text: string, sentAt: number): boolean {
  const normalized = normalizeMessageText(text);
  if (!normalized) return false;
  const userIndex = messages.findIndex((message) => (
    message.role === "user"
      && isCreatedAtOrAfter(message.createdAt, sentAt)
      && normalizeMessageText(message.text) === normalized
  ));
  if (userIndex < 0) return false;
  return messages.slice(userIndex + 1).some((message) => message.role === "assistant");
}

function hasBackendAssistantAfterTimestamp(messages: AgentChatMessage[], sentAt: number): boolean {
  return messages.some((message) => (
    message.role === "assistant"
      && isCreatedAtOrAfter(message.createdAt, sentAt)
  ));
}

function isCreatedAtOrAfter(createdAt: string, timestamp: number): boolean {
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= timestamp - 1000;
}

function mergePendingMessagesIntoTurns(
  turns: AgentConversationTurn[],
  pendingMessages: AgentChatMessage[],
): AgentConversationTurn[] {
  if (!pendingMessages.length) return turns;
  const pendingUser = pendingMessages.find((message) => message.role === "user");
  if (pendingUser) {
    return [...turns, { id: pendingUser.id, messages: pendingMessages }];
  }
  const pendingOnly = pendingMessages.filter((message) => message.role === "pending");
  if (!pendingOnly.length) return turns;
  if (!turns.length) return [{ id: pendingOnly[0]?.id || "pending-turn", messages: pendingOnly }];
  return turns.map((turn, index) => index === turns.length - 1
    ? { ...turn, messages: [...turn.messages, ...pendingOnly] }
    : turn);
}

function normalizeMessageText(text: string): string {
  return extractTaskUserQuestion(text).replace(/\s+/g, " ").trim();
}

function agentTaskTurnToConversationTurn(turn: AgentTaskTurn): AgentConversationTurn {
  const messages: AgentChatMessage[] = [];
  const questionMessage = turn.question ? agentEventToChatMessage(turn.question, `${turn.id}:question`) : null;
  if (questionMessage) messages.push(questionMessage);
  turn.processEvents.forEach((event, index) => {
    const message = agentEventToChatMessage(event, `${turn.id}:process:${index}`);
    if (message) messages.push(message);
  });
  const answerMessage = turn.answer ? agentEventToChatMessage(
    turn.answer,
    `${turn.id}:answer`,
    formatTurnDurationFromEvents(turn.processEvents, turn.question?.createdAt, turn.answer.createdAt),
  ) : null;
  if (answerMessage) messages.push(answerMessage);
  return { id: turn.id, messages };
}

function getCurrentProcessMessages(turns: AgentConversationTurn[]): AgentChatMessage[] {
  const latestTurn = turns.at(-1);
  if (!latestTurn) return [];
  const finalAssistantIndex = findLastMessageIndex(latestTurn.messages, (message) => message.role === "assistant");
  return latestTurn.messages.filter((message, index) => {
    if (message.role === "user" || message.role === "pending") return false;
    return index !== finalAssistantIndex;
  });
}

function agentEventToChatMessage(event: AgentEvent, fallbackId: string, durationLabel?: string): AgentChatMessage | null {
  if (event.type === "message") {
    return {
      id: fallbackId,
      role: event.role,
      text: event.text,
      createdAt: event.createdAt,
      ...(durationLabel ? { durationLabel } : {}),
    };
  }
  if (event.type === "error") {
    return { id: fallbackId, role: "system", text: event.message, createdAt: event.createdAt };
  }
  if (event.type === "task_status") {
    return { id: fallbackId, role: "system", text: `任务状态：${event.status}`, createdAt: event.createdAt };
  }
  if (event.type === "command") {
    return { id: fallbackId, role: "system", text: `命令 ${event.status}：${event.command}`, createdAt: event.createdAt };
  }
  if (event.type === "approval_request") {
    return { id: fallbackId, role: "system", text: `等待审批：${event.approval.summary}`, createdAt: event.createdAt };
  }
  if (event.type === "file_change") {
    return { id: fallbackId, role: "system", text: event.summary || `文件变更：${event.path}`, createdAt: event.createdAt };
  }
  return null;
}

function formatTurnDuration(startAt?: string, endAt?: string): string {
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

function formatTurnDurationFromEvents(events: AgentEvent[], startAt?: string, endAt?: string): string {
  const timingDuration = getPrimaryTimingDuration(events);
  if (timingDuration !== null) return `已处理 ${formatDurationValue(timingDuration)}`;
  return formatTurnDuration(startAt, endAt);
}

function getPrimaryTimingDuration(events: AgentEvent[]): number | null {
  const marks = events
    .map((event) => event.type === "message" && event.role === "system" ? parseTimingEvent(event.text) : null)
    .filter((mark): mark is { phase: string; durationMs: number } => Boolean(mark));
  const primary = marks.find((mark) => mark.phase === "provider.total")
    || marks.find((mark) => mark.phase === "local.fast_reply")
    || marks.find((mark) => mark.phase === "task.pre_approval_total")
    || marks.find((mark) => mark.phase === "route.total");
  return primary?.durationMs ?? null;
}

function parseTimingEvent(text: string): { phase: string; durationMs: number } | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized.startsWith("性能埋点：")) return null;
  const phase = normalized.match(/\bphase=([^\s]+)/u)?.[1] || "";
  const durationText = normalized.match(/\bdurationMs=(\d+)/u)?.[1] || "";
  const durationMs = Number(durationText);
  if (!phase || !Number.isFinite(durationMs)) return null;
  return { phase, durationMs };
}

function formatDurationValue(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2).replace(/\.0+$/u, "")}s`;
}
