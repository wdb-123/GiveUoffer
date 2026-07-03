import { AgentMarkdown } from "./AgentMarkdown";
import { AgentJourneyLine } from "./AgentJourneyLine";
import { useEffect, useMemo, useState } from "react";
import { getWorkspaceFilePreview } from "../../api";
import {
  extractTaskUserQuestion,
  findLastMessageIndex,
  type AgentChatMessage,
  type AgentConversationTurn,
} from "./agentConversation";

const streamedAssistantMessageIds = new Set<string>();
const STREAMABLE_MESSAGE_AGE_MS = 45_000;
const RUNNING_PROCESS_PLACEHOLDER_CREATED_AT = "1970-01-01T00:00:00.000Z";

interface MessageAttachmentPreview {
  kind: string;
  fileName: string;
  storedPath: string;
  mimeType: string;
  summary: string;
}

interface ProcessTimingMark {
  phase: string;
  durationMs: number;
  detail: string;
}

export function AgentTurnView({
  turn,
  onOpenFilePreview,
  runningProcessLabel = "",
  runningProcessMessages = [],
}: {
  turn: AgentConversationTurn;
  onOpenFilePreview?: ((path: string) => void) | undefined;
  runningProcessLabel?: string;
  runningProcessMessages?: AgentChatMessage[];
}) {
  const finalAssistantIndex = findLastMessageIndex(turn.messages, (message) => message.role === "assistant");
  const processMessages = turn.messages.filter((message, index) => {
    if (message.role === "user" || message.role === "pending") return false;
    return index !== finalAssistantIndex;
  });

  return (
    <section className="agent-turn">
      {turn.messages.map((message, index) => {
        if (message.role === "pending") return null;
        if (message.role === "user") return <AgentBubble key={message.id} message={message} />;
        if (index !== finalAssistantIndex) return null;
        return (
          <AssistantAnswerGroup
            key={message.id}
            message={message}
            processMessages={processMessages}
            onOpenFilePreview={onOpenFilePreview}
          />
        );
      })}
      {finalAssistantIndex < 0 && processMessages.length ? (
        <ProcessOnlyGroup
          processMessages={processMessages}
          onOpenFilePreview={onOpenFilePreview}
        />
      ) : null}
      {runningProcessLabel || runningProcessMessages.length ? (
        <RunningProcessPanel label={runningProcessLabel} messages={runningProcessMessages} />
      ) : null}
    </section>
  );
}

function ProcessOnlyGroup({
  processMessages,
  onOpenFilePreview,
}: {
  processMessages: AgentChatMessage[];
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  const visibleProcessMessages = getVisibleProcessMessages(processMessages);
  const displayProcessMessages = visibleProcessMessages.length
    ? visibleProcessMessages
    : getInspectableProcessMessages(processMessages);
  const timingMarks = getProcessTimingMarks(processMessages);
  return (
    <div className="agent-answer-group">
      <ProcessLogPanel
        messages={displayProcessMessages}
        timingMarks={timingMarks}
        onOpenFilePreview={onOpenFilePreview}
      />
    </div>
  );
}

function AssistantAnswerGroup({
  message,
  processMessages,
  onOpenFilePreview,
}: {
  message: AgentChatMessage;
  processMessages: AgentChatMessage[];
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  const visibleProcessMessages = getVisibleProcessMessages(processMessages);
  const timingMarks = getProcessTimingMarks(processMessages);
  const displayProcessMessages = visibleProcessMessages.length
    ? visibleProcessMessages
    : getInspectableProcessMessages(processMessages);
  if (!displayProcessMessages.length && !timingMarks.length) {
    return (
      <div className="agent-answer-group">
        <AgentBubble message={message} onOpenFilePreview={onOpenFilePreview} />
      </div>
    );
  }

  return (
    <div className="agent-answer-group">
      <details className="agent-answer-disclosure">
        <summary className="agent-response-meta is-toggle">
          <span>{message.durationLabel || "已处理"} ›</span>
        </summary>
        <ProcessLogPanel
          messages={displayProcessMessages}
          timingMarks={timingMarks}
          onOpenFilePreview={onOpenFilePreview}
        />
      </details>
      <AgentBubble
        message={message}
        hideDuration
        onOpenFilePreview={onOpenFilePreview}
      />
    </div>
  );
}

export function getVisibleProcessMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((message) => {
    const normalized = message.text.replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    if (isLowSignalRuntimeLog(normalized)) return false;
    if (isRoutineExecutionLog(normalized)) return false;
    return true;
  });
}

function getInspectableProcessMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((message) => {
    const normalized = message.text.replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    if (isLowSignalRuntimeLog(normalized)) return false;
    return true;
  });
}

function ProcessLogPanel({
  messages,
  timingMarks = [],
  onOpenFilePreview,
}: {
  messages: AgentChatMessage[];
  timingMarks?: ProcessTimingMark[];
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  const timingSummary = formatTimingSummary(timingMarks);
  return (
    <div className="agent-process-stream is-complete" aria-label="执行过程">
      <div className="agent-process-stream-head">
        <span className="agent-process-status-dot" aria-hidden="true" />
        <strong>执行过程</strong>
        <small>{[messages.length ? `${messages.length} 条日志` : "", timingSummary].filter(Boolean).join(" · ")}</small>
      </div>
      {timingMarks.length ? <ProcessTimingSummary marks={timingMarks} /> : null}
      <div className="agent-process-list">
        {messages.length ? messages.map((log) => (
          <article className={`agent-process-item is-${log.role}`} key={log.id}>
            <AgentMarkdown text={formatProcessLogText(log.text)} onOpenFilePreview={onOpenFilePreview} />
          </article>
        )) : (
          <article className="agent-process-item is-system">
            本轮没有工具调用或长流程日志。
          </article>
        )}
      </div>
    </div>
  );
}

function ProcessTimingSummary({ marks }: { marks: ProcessTimingMark[] }) {
  return (
    <div className="agent-process-timing" aria-label="耗时埋点">
      {marks.map((mark) => (
        <span className="agent-process-timing-chip" key={`${mark.phase}-${mark.durationMs}-${mark.detail}`}>
          <strong>{formatTimingPhase(mark.phase)}</strong>
          <small>{formatDurationMs(mark.durationMs)}</small>
        </span>
      ))}
    </div>
  );
}

export function RunningProcessPanel({ label, messages }: { label: string; messages: AgentChatMessage[] }) {
  const visibleProcessMessages = getVisibleProcessMessages(messages);
  const inspectableProcessMessages = visibleProcessMessages.length
    ? visibleProcessMessages
    : getInspectableProcessMessages(messages);
  const timingMarks = getProcessTimingMarks(messages);
  const latestProcessMessages = inspectableProcessMessages.slice(-10);
  const currentStatus = formatCurrentProcessStatus(visibleProcessMessages)
    || formatCurrentProcessStatus(messages)
    || label
    || "Agent 正在执行中";
  const processRows = latestProcessMessages.length
    ? latestProcessMessages
    : [{
      id: "running-process-placeholder",
      role: "system" as const,
      text: formatRunningPlaceholder(currentStatus),
      createdAt: RUNNING_PROCESS_PLACEHOLDER_CREATED_AT,
    }];
  return (
    <div className="agent-process-stream is-running" aria-live="polite" aria-label="执行过程">
      <div className="agent-process-stream-head">
        <span className="agent-process-status-dot" aria-hidden="true" />
        <strong>执行过程</strong>
        <small>{[processRows.length ? `${processRows.length} 条日志` : "", timingMarks.length ? "实时耗时" : ""].filter(Boolean).join(" · ")}</small>
        <AgentJourneyLine className="agent-process-running-line" loop />
      </div>
      {timingMarks.length ? <ProcessTimingSummary marks={timingMarks} /> : null}
      <div className="agent-process-list" aria-label="当前执行日志">
        {processRows.map((log) => (
          <article className={`agent-process-item is-${log.role}`} key={log.id}>
            <AgentMarkdown text={formatProcessLogText(log.text)} />
          </article>
        ))}
      </div>
    </div>
  );
}

function formatRunningPlaceholder(status: string): string {
  if (!status.trim()) return "正在等待第一条执行日志";
  return `${status}，等待第一条执行日志`;
}

function isPluginSyncWarning(text: string): boolean {
  return text.startsWith("插件同步提示：")
    || text.includes("codex_core_plugins::manager: failed to sync curated plugins repo");
}

function formatProcessLogText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.startsWith("UC_TOOL_CALL")) return formatToolCallLog(normalized);
  if (normalized.startsWith("UC_TOOL_RESULT")) return formatToolResultLog(normalized);
  if (normalized.startsWith("执行状态：")) return normalized.replace(/^执行状态[:：]\s*/u, "");
  if (isPluginSyncWarning(text)) {
    return "Codex 启动时尝试同步插件仓库失败，已使用本地缓存继续执行。常见原因是代理端口不可用或 GitHub API 限流。";
  }
  return text;
}

function formatCurrentProcessStatus(messages: AgentChatMessage[]): string {
  const latest = [...messages].reverse().find((message) => {
    const normalized = message.text.replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    if (isLowSignalRuntimeLog(normalized)) return false;
    return true;
  });
  if (!latest) return "";
  const normalized = latest.text.replace(/\s+/g, " ").trim();
  if (normalized.startsWith("UC_TOOL_CALL")) return "正在调用邮箱搜索工具";
  if (normalized.startsWith("UC_TOOL_RESULT")) return "邮箱搜索完成，正在整理结果";
  if (normalized.startsWith("执行状态：")) return normalized.replace(/^执行状态[:：]\s*/u, "");
  if (normalized.startsWith("任务状态：")) return normalized;
  if (normalized.startsWith("命令 running")) return "正在执行本地 Agent";
  if (normalized.startsWith("Paperclip adapter")) return "正在启动本地 Agent";
  if (normalized.startsWith("等待审批")) return normalized;
  if (normalized.length > 56) return `${normalized.slice(0, 56)}...`;
  return normalized;
}

function isLowSignalRuntimeLog(text: string): boolean {
  return isPluginSyncWarning(text)
    || text.startsWith("性能埋点：")
    || text.includes("codex_core_plugins::")
    || text.includes("codex_core_skills::")
    || text.includes("failed to load plugin")
    || text.includes("ignoring interface.")
    || text.includes("Paperclip-managed Codex home")
    || text.includes("[paperclip] Using")
    || text.includes("/.paperclip/instances/")
    || text.includes("/.local/bin/codex");
}

function getProcessTimingMarks(messages: AgentChatMessage[]): ProcessTimingMark[] {
  return messages
    .map((message) => parseTimingMark(message.text))
    .filter((mark): mark is ProcessTimingMark => Boolean(mark));
}

function parseTimingMark(text: string): ProcessTimingMark | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized.startsWith("性能埋点：")) return null;
  const phase = normalized.match(/\bphase=([^\s]+)/u)?.[1] || "";
  const durationText = normalized.match(/\bdurationMs=(\d+)/u)?.[1] || "";
  const durationMs = Number(durationText);
  if (!phase || !Number.isFinite(durationMs)) return null;
  const detail = normalized
    .replace(/^性能埋点：/u, "")
    .replace(/\bphase=[^\s]+\s*/u, "")
    .replace(/\bdurationMs=\d+\s*/u, "")
    .trim();
  return { phase, durationMs, detail };
}

function formatTimingSummary(marks: ProcessTimingMark[]): string {
  if (!marks.length) return "";
  const total = marks.find((mark) => mark.phase === "provider.total")
    || marks.find((mark) => mark.phase === "local.fast_reply")
    || marks.find((mark) => mark.phase === "task.pre_approval_total")
    || marks.at(-1);
  if (!total) return "";
  const label = total.phase === "provider.total" ? "执行耗时" : "耗时";
  return `${label} ${formatDurationMs(total.durationMs)}`;
}

function formatTimingPhase(phase: string): string {
  const labels: Record<string, string> = {
    "route.classify": "路由",
    "route.provider_select": "Provider",
    "route.total": "路由总计",
    "task.create": "建任务",
    "task.pre_approval_total": "启动前",
    "approval.policy": "审批策略",
    "approval.create": "审批创建",
    "local.fast_reply": "本地快答",
    "provider.load_adapter": "加载 Agent",
    "provider.first_assistant_output": "首段回复",
    "provider.iteration_execute": "执行",
    "provider.total": "执行总计",
    "tool.execute": "工具调用",
  };
  return labels[phase] || phase;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2).replace(/\.0+$/u, "")}s`;
}

function isRoutineExecutionLog(text: string): boolean {
  const statusText = text.replace(/^执行状态[:：]\s*/u, "");
  return /^Codex CLI .*等待启动审批/u.test(text)
    || text === "Agent start allowed by remembered workspace permission."
    || text === "Agent started with full workspace access from composer permissions."
    || text.startsWith("Agent auto-start enabled by")
    || text.startsWith("Paperclip adapter")
    || text.startsWith("命令 running")
    || /^任务状态[:：]\s*(queued|running|completed)$/u.test(text)
    || statusText === "本地 Agent 会话已建立"
    || statusText === "本轮输出完成"
    || statusText === "正在分析请求";
}

function formatToolCallLog(text: string): string {
  const parsed = parseToolProtocolPayload(text, "UC_TOOL_CALL");
  if (!parsed) return "调用后端工具";
  const tool = typeof parsed.tool === "string" ? parsed.tool : "后端工具";
  return `调用工具：${tool}`;
}

function formatToolResultLog(text: string): string {
  const parsed = parseToolProtocolPayload(text, "UC_TOOL_RESULT");
  if (!parsed) return "工具已返回结果";
  const tool = typeof parsed.tool === "string" ? parsed.tool : "后端工具";
  const connectorLabel = typeof parsed.connectorLabel === "string" ? parsed.connectorLabel : "";
  const messages = Array.isArray(parsed.messages) ? parsed.messages.length : null;
  if (messages !== null && connectorLabel) return `${connectorLabel} 返回 ${messages} 条结果`;
  if (messages !== null) return `${tool} 返回 ${messages} 条结果`;
  return `${tool} 已返回结果`;
}

function parseToolProtocolPayload(text: string, prefix: "UC_TOOL_CALL" | "UC_TOOL_RESULT"): Record<string, unknown> | null {
  const raw = text.slice(prefix.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isAssistantProcessNote(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return /^我会(?:先|直接|做|把|从|继续|检查|改|处理|整理|实现|接着|开始)/u.test(normalized)
    || /^我先(?:看|检查|定位|处理|改|整理|把|从|确认)/u.test(normalized)
    || /^我(?:现在|接下来|下一步)(?:会|先|把|从|继续|检查|处理|改|整理|实现)/u.test(normalized)
    || /^接下来我(?:会|先|把|从|继续|检查|处理|改|整理|实现)/u.test(normalized)
    || /^准备(?:先|开始|处理|修改|检查|实现)/u.test(normalized)
    || /^(I(?:'ll| will)|I am going to|Next I will)\b/i.test(normalized);
}

function AgentBubble({
  message,
  hideDuration = false,
  onOpenFilePreview,
}: {
  message: AgentChatMessage;
  hideDuration?: boolean;
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  const userDisplay = message.role === "user" ? parseUserMessageDisplay(message) : null;
  const displayText = userDisplay ? userDisplay.text : message.text;
  const isProcessNote = message.role === "assistant" && isAssistantProcessNote(message.text);
  const shouldStream = message.role === "assistant"
    && !hideDuration
    && !isProcessNote
    && !streamedAssistantMessageIds.has(message.id)
    && Date.now() - Date.parse(message.createdAt) < STREAMABLE_MESSAGE_AGE_MS;
  const { text: renderedText, streaming } = useStreamingText(message.id, displayText, shouldStream);
  const hasUserAttachments = Boolean(userDisplay?.attachments.length);
  const bubbleClassName = [
    "agent-chat-bubble",
    `is-${message.role}`,
    isProcessNote ? "is-process-note" : "",
    hasUserAttachments ? "has-attachments" : "",
  ].filter(Boolean).join(" ");
  return (
    <article className={bubbleClassName}>
      {message.role === "assistant" && message.durationLabel && !hideDuration && !isProcessNote ? (
        <span className="agent-response-meta">{message.durationLabel} ›</span>
      ) : null}
      {hasUserAttachments ? (
        <UserAttachmentPreviews
          attachments={userDisplay?.attachments || []}
          onOpenFilePreview={onOpenFilePreview}
        />
      ) : null}
      {renderedText ? (
        hasUserAttachments && message.role === "user" ? (
          <div className="agent-user-text-bubble">
            <AgentMarkdown
              text={renderedText}
              streaming={streaming}
              onOpenFilePreview={onOpenFilePreview}
            />
          </div>
        ) : (
          <AgentMarkdown
            text={renderedText}
            streaming={streaming}
            onOpenFilePreview={onOpenFilePreview}
          />
        )
      ) : null}
    </article>
  );
}

function UserAttachmentPreviews({
  attachments,
  onOpenFilePreview,
}: {
  attachments: MessageAttachmentPreview[];
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  return (
    <div className="agent-message-attachments" aria-label="消息附件">
      {attachments.map((attachment) => (
        <UserAttachmentPreview
          attachment={attachment}
          key={`${attachment.storedPath}-${attachment.fileName}`}
          onOpenFilePreview={onOpenFilePreview}
        />
      ))}
    </div>
  );
}

function UserAttachmentPreview({
  attachment,
  onOpenFilePreview,
}: {
  attachment: MessageAttachmentPreview;
  onOpenFilePreview?: ((path: string) => void) | undefined;
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDataUrl("");
    if (attachment.kind !== "image") return undefined;
    void getWorkspaceFilePreview(attachment.storedPath)
      .then((preview) => {
        if (!cancelled && preview.previewType === "image" && preview.dataUrl) {
          setDataUrl(preview.dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.kind, attachment.storedPath]);

  if (attachment.kind === "image") {
    return (
      <button
        type="button"
        className="agent-message-image-attachment"
        aria-label={`查看图片附件 ${attachment.fileName}`}
        onClick={() => onOpenFilePreview?.(attachment.storedPath)}
      >
        {dataUrl ? <img src={dataUrl} alt="" /> : <span />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="agent-message-file-attachment"
      onClick={() => onOpenFilePreview?.(attachment.storedPath)}
    >
      {attachment.fileName}
    </button>
  );
}

function parseUserMessageDisplay(message: AgentChatMessage): { text: string; attachments: MessageAttachmentPreview[] } {
  const question = extractTaskUserQuestion(message.text);
  const structuredAttachments = normalizeMessageAttachments(message);
  const attachments = structuredAttachments.length ? structuredAttachments : parsePromptAttachments(question);
  return {
    text: stripAttachmentDisplayText(question, attachments),
    attachments,
  };
}

function normalizeMessageAttachments(message: AgentChatMessage): MessageAttachmentPreview[] {
  return (message.attachments || []).map((attachment) => ({
    kind: attachment.kind,
    fileName: attachment.fileName,
    storedPath: attachment.storedPath,
    mimeType: attachment.mimeType,
    summary: attachment.parsed.summary,
  }));
}

function parsePromptAttachments(text: string): MessageAttachmentPreview[] {
  const attachmentSection = text.match(/(?:^|\n)---\s*\nUser uploaded attachments:\s*\n([\s\S]*)$/u)?.[1] || "";
  if (!attachmentSection.trim()) return [];

  const blocks = attachmentSection
    .split(/\n\s*\n(?=Attachment\s+\d+:)/u)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block): MessageAttachmentPreview | null => {
    const fileName = block.match(/^Attachment\s+\d+:\s*(.+)$/mu)?.[1]?.trim() || "";
    const kind = block.match(/^Kind:\s*(.+)$/mu)?.[1]?.trim() || "unknown";
    const mimeType = block.match(/^MIME:\s*(.+)$/mu)?.[1]?.trim() || "";
    const storedPath = block.match(/^Stored path:\s*(.+)$/mu)?.[1]?.trim() || "";
    const summary = block.match(/^Summary:\s*(.+)$/mu)?.[1]?.trim() || "";
    if (!fileName || !storedPath) return null;
    return { fileName, kind, mimeType, storedPath, summary };
  }).filter((attachment): attachment is MessageAttachmentPreview => Boolean(attachment));
}

function stripAttachmentDisplayText(text: string, attachments: MessageAttachmentPreview[]): string {
  let cleaned = text
    .replace(/\n*---\s*\nUser uploaded attachments:\s*[\s\S]*$/u, "")
    .trim();
  if (!attachments.length) return cleaned;

  attachments.forEach((attachment) => {
    const escapedName = escapeRegExp(attachment.fileName);
    cleaned = cleaned
      .replace(new RegExp(`\\n?\\[${escapeRegExp(attachment.kind)}\\]\\s+${escapedName}:.*`, "giu"), "")
      .replace(new RegExp(`\\n?图片附件[:：]\\s*${escapedName}.*`, "giu"), "")
      .trim();
  });
  return cleaned;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useStreamingText(messageId: string, text: string, enabled: boolean): { text: string; streaming: boolean } {
  const units = useMemo(() => Array.from(text), [text]);
  const [visibleCount, setVisibleCount] = useState(enabled ? 0 : units.length);

  useEffect(() => {
    if (!enabled) {
      setVisibleCount(units.length);
      streamedAssistantMessageIds.add(messageId);
      return undefined;
    }

    setVisibleCount(0);
    let cancelled = false;
    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        const next = Math.min(units.length, current + streamingStep(units.length, current));
        if (next >= units.length) {
          window.clearInterval(timer);
          streamedAssistantMessageIds.add(messageId);
        }
        return next;
      });
      if (cancelled) window.clearInterval(timer);
    }, 18);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, messageId, units.length]);

  const streaming = enabled && visibleCount < units.length;
  return {
    text: streaming ? units.slice(0, visibleCount).join("") : text,
    streaming,
  };
}

function streamingStep(total: number, current: number): number {
  if (total > 1200) return 28;
  if (total > 600) return 18;
  if (current < 24) return 2;
  return 6;
}
