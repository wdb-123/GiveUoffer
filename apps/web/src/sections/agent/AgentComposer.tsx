import type {
  AgentAttachment,
  CreateAgentTaskRequest,
  JobSearchResult,
  JobSearchSource,
  ProviderInstallStatus,
  ProviderSummary,
} from "@ucareer/shared";
import type { ClipboardEvent as ReactClipboardEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { AgentConnectorBar } from "./AgentConnectorBar";
import { AgentJourneyLine } from "./AgentJourneyLine";
import { formatTokenCount, providerLabel } from "./agentConversation";
import type { ContextUsage } from "./agentConversation";

interface AgentComposerProps {
  agentBusy: boolean;
  attachmentPreviewUrls: Record<string, string>;
  attachments: AgentAttachment[];
  attachmentStatus: string;
  canContinueSelectedTask: boolean;
  contextUsage: ContextUsage;
  fileInputRef: RefObject<HTMLInputElement | null>;
  installStatus: Record<string, ProviderInstallStatus>;
  intakeText: string;
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
  };
  permissionMenuOpen: boolean;
  permissionMenuRef: RefObject<HTMLDivElement | null>;
  permissionMode: CreateAgentTaskRequest["permissionMode"];
  providerMenuOpen: boolean;
  providerMenuRef: RefObject<HTMLDivElement | null>;
  providerOptions: ProviderSummary[];
  selectedProvider: string;
  visibleMessagesHaveUser: boolean;
  onCancelCurrentTask(): void;
  onCheckProvider(providerId: string): void;
  onEditLastUserMessage(): void;
  onImportMailboxMessages(): void | Promise<void>;
  onIntakeTextChange(value: string): void;
  onOpenFilePreview(path: string): void | Promise<void>;
  onProviderChange(providerId: string): void;
  onRemoveAttachment(attachmentId: string): void;
  onRunJobSearch(input?: Partial<import("@ucareer/shared").JobSearchRequest>): void | Promise<void>;
  onSetPermissionMenuOpen(open: boolean | ((current: boolean) => boolean)): void;
  onSetPermissionMode(mode: NonNullable<CreateAgentTaskRequest["permissionMode"]>): void;
  onSetProviderMenuOpen(open: boolean | ((current: boolean) => boolean)): void;
  onSubmit(): void;
  onUploadFiles(files: FileList | File[] | null, source?: "picker" | "paste"): void | Promise<void>;
}

export function AgentComposer(props: AgentComposerProps) {
  const selectedProviderLabel = providerLabel(props.providerOptions, props.selectedProvider);
  const selectedProviderStatus = providerConnectionState(props.installStatus[props.selectedProvider]);
  const submit = () => {
    if (props.agentBusy) return;
    props.onSubmit();
  };
  return (
    <form
      className="agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {props.attachments.length || props.attachmentStatus ? (
        <div className="agent-attachment-strip" aria-label="已上传附件">
          {props.attachments.map((attachment) => (
            <div className={attachment.kind === "image" ? "agent-attachment-chip is-image" : "agent-attachment-chip"} key={attachment.id}>
              <button
                type="button"
                className="agent-attachment-preview"
                title={`${attachment.parsed.summary}。点击预览`}
                onClick={() => void props.onOpenFilePreview(attachment.storedPath)}
              >
                {attachment.kind === "image" && props.attachmentPreviewUrls[attachment.id] ? (
                  <img src={props.attachmentPreviewUrls[attachment.id]} alt={attachment.fileName} />
                ) : null}
                {attachment.kind !== "image" ? (
                  <>
                    <span>{attachment.kind}</span>
                    <strong>{attachment.fileName}</strong>
                  </>
                ) : null}
              </button>
              <button
                type="button"
                className="agent-attachment-remove"
                aria-label={`移除 ${attachment.fileName}`}
                onClick={() => props.onRemoveAttachment(attachment.id)}
              >
                ×
              </button>
            </div>
          ))}
          {props.attachmentStatus ? <small>{props.attachmentStatus}</small> : null}
        </div>
      ) : null}
      <textarea
        aria-label="输入给 Agent 的内容"
        placeholder={props.agentBusy ? "可以先输入，当前步骤完成后再发送" : props.canContinueSelectedTask ? "继续追问当前 Agent 对话" : "随心输入"}
        value={props.intakeText}
        onChange={(event) => props.onIntakeTextChange(event.target.value)}
        onPaste={(event) => handleComposerPaste(event, props.onUploadFiles)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            if (isComposingText(event)) return;
            if (props.agentBusy) return;
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="agent-composer-actions">
        <div className="agent-composer-left">
          <input
            ref={props.fileInputRef}
            className="agent-file-input"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.json,image/png,image/jpeg,image/webp"
            onChange={(event) => void props.onUploadFiles(event.target.files)}
          />
          <button type="button" className="agent-icon-button" aria-label="添加上下文" onClick={() => props.fileInputRef.current?.click()}>+</button>
          {props.visibleMessagesHaveUser ? (
            <button
              type="button"
              className="agent-edit-last-button"
              onClick={props.onEditLastUserMessage}
              title={props.agentBusy ? "先停止当前执行，再发送修改后的内容" : "把上一条用户消息填回输入框"}
            >
              修改上一句
            </button>
          ) : null}
          <AgentConnectorBar
            connectionState={selectedProviderStatus}
            jobSearch={props.jobSearch}
            onImportMessages={props.onImportMailboxMessages}
            onRunJobSearch={props.onRunJobSearch}
          />
          <div className="agent-permission-menu" ref={props.permissionMenuRef}>
            <button
              type="button"
              className={`agent-permission-trigger is-${props.permissionMode}`}
              aria-label="权限模式"
              aria-haspopup="menu"
              aria-expanded={props.permissionMenuOpen}
              onClick={() => props.onSetPermissionMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{permissionModeIcon(props.permissionMode)}</span>
              <strong>{permissionModeLabel(props.permissionMode)}</strong>
              <b aria-hidden="true">⌄</b>
            </button>
            {props.permissionMenuOpen ? (
              <div className="agent-permission-options" role="menu" aria-label="选择权限模式">
                {permissionModes.map((mode) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={props.permissionMode === mode.id}
                    className={props.permissionMode === mode.id ? "is-selected" : ""}
                    key={mode.id}
                    onClick={() => {
                      props.onSetPermissionMode(mode.id);
                      props.onSetPermissionMenuOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{mode.icon}</span>
                    <strong>{mode.label}</strong>
                    {props.permissionMode === mode.id ? <small aria-hidden="true">✓</small> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="agent-composer-right">
          {props.agentBusy ? (
            <AgentJourneyLine ariaLabel="Agent 正在执行" className="agent-composer-loading-line" loop />
          ) : (
            <ContextUsageBadge usage={props.contextUsage} />
          )}
          <div className="agent-provider-menu" ref={props.providerMenuRef}>
            <button
              type="button"
              className="agent-provider-trigger"
              aria-expanded={props.providerMenuOpen}
              aria-haspopup="listbox"
              onClick={() => {
                if (selectedProviderStatus !== "connected") props.onCheckProvider(props.selectedProvider);
                props.onSetProviderMenuOpen((open) => !open);
              }}
            >
              <span className={`agent-provider-status is-${selectedProviderStatus}`} aria-hidden="true" />
              <span>{selectedProviderLabel}</span>
              <b aria-hidden="true">⌄</b>
            </button>
            {props.providerMenuOpen ? (
              <div className="agent-provider-options" role="listbox" aria-label="选择 AI 助手">
                {props.providerOptions.map((provider) => {
                  const selected = provider.id === props.selectedProvider;
                  const connectionState = providerConnectionState(props.installStatus[provider.id]);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? "is-selected" : ""}
                      key={provider.id}
                      onClick={() => {
                        props.onCheckProvider(provider.id);
                        props.onProviderChange(provider.id);
                        props.onSetProviderMenuOpen(false);
                      }}
                    >
                      <span className={`agent-provider-status is-${connectionState}`} aria-hidden="true" />
                      <span>{provider.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            className={`agent-send-button${props.agentBusy ? " is-stop" : ""}`}
            type={props.agentBusy ? "button" : "submit"}
            aria-label={props.agentBusy ? "停止当前 Agent 执行" : props.canContinueSelectedTask ? "追问 Agent" : "发送给 Agent"}
            disabled={!props.agentBusy && !props.intakeText.trim() && props.attachments.length === 0}
            onClick={props.agentBusy ? props.onCancelCurrentTask : undefined}
          >
            <span aria-hidden="true">{props.agentBusy ? "■" : "↑"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

function isComposingText(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
  return Boolean(nativeEvent.isComposing || nativeEvent.keyCode === 229);
}

export function providerConnectionState(status?: ProviderInstallStatus): "connected" | "disconnected" | "unknown" {
  if (!status) return "unknown";
  return status.installed ? "connected" : "disconnected";
}

function handleComposerPaste(
  event: ReactClipboardEvent<HTMLTextAreaElement>,
  onUploadFiles: AgentComposerProps["onUploadFiles"],
): void {
  const imageFiles = imageFilesFromClipboard(event.clipboardData);
  if (!imageFiles.length) return;
  void onUploadFiles(imageFiles, "paste");
}

function ContextUsageBadge({ usage }: { usage: ContextUsage }) {
  const style = {
    "--agent-context-pct": `${usage.percent}%`,
    "--agent-context-color": usage.level === "high" ? "#22c55e" : usage.level === "medium" ? "#4f8cff" : "#94a3b8",
  } as CSSProperties;
  const usedLabel = formatTokenCount(usage.used);
  const limitLabel = formatTokenCount(usage.limit);
  const sourceLabel = contextWindowSourceLabel(usage.source);
  const visibleLabel = usage.hasActualUsage ? `${usedLabel}/${limitLabel}` : "等待用量";
  return (
    <div
      className={`agent-context-meter is-${usage.level}`}
      style={style}
      tabIndex={0}
      aria-label={usage.hasActualUsage ? `Agent 真实 token 用量 ${usedLabel} / ${limitLabel}` : "Agent 暂无真实 token 用量"}
    >
      <span aria-hidden="true" />
      <b>{visibleLabel}</b>
      <div className="agent-context-tooltip" role="tooltip">
        <strong>{usage.hasActualUsage ? "真实 token 用量" : "暂无真实用量"}</strong>
        <small>{usage.model ? `${usage.model} · ${sourceLabel}` : sourceLabel}</small>
        {usage.hasActualUsage ? (
          <>
            <em>{usedLabel} / {limitLabel} tokens</em>
            <small>输入 {formatTokenCount(usage.inputTokens)} · 缓存 {formatTokenCount(usage.cachedInputTokens)} · 输出 {formatTokenCount(usage.outputTokens)}</small>
          </>
        ) : (
          <em>模型窗口 {limitLabel} tokens，等待 CLI 返回真实 usage</em>
        )}
      </div>
    </div>
  );
}

function contextWindowSourceLabel(source: ContextUsage["source"]): string {
  if (source === "configured") return "配置读取";
  if (source === "model_default") return "模型默认";
  if (source === "provider_default") return "Provider 默认";
  return "未声明";
}

const permissionModes: Array<{
  id: NonNullable<CreateAgentTaskRequest["permissionMode"]>;
  label: string;
  icon: string;
}> = [
  { id: "default", label: "默认权限", icon: "♙" },
  { id: "auto_review", label: "自动审查", icon: "♧" },
  { id: "full_access", label: "完整访问权限", icon: "♢" },
];

function permissionModeIcon(mode: CreateAgentTaskRequest["permissionMode"]): string {
  return permissionModes.find((item) => item.id === mode)?.icon || "♧";
}

function permissionModeLabel(mode: CreateAgentTaskRequest["permissionMode"]): string {
  return permissionModes.find((item) => item.id === mode)?.label || "自动审查";
}

function imageFilesFromClipboard(data: DataTransfer): File[] {
  const files: File[] = [];
  Array.from(data.items || []).forEach((item, index) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return;
    const file = item.getAsFile();
    if (!file) return;
    files.push(normalizePastedImageFile(file, index));
  });
  return files;
}

function normalizePastedImageFile(file: File, index: number): File {
  if (file.name && !/^image\.(png|jpe?g|webp|gif)$/i.test(file.name)) return file;
  const ext = mimeTypeToImageExtension(file.type);
  return new File([file], `pasted-screenshot-${Date.now()}-${index + 1}.${ext}`, {
    type: file.type || `image/${ext}`,
    lastModified: file.lastModified || Date.now(),
  });
}

function mimeTypeToImageExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}
