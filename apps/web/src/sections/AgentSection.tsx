import type {
  AgentEvent,
  AgentAttachment,
  AgentPageContext,
  AgentTask,
  AgentTaskTurn,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  ProviderInstallStatus,
  ProviderSummary,
  JobSearchRequest,
  JobSearchResult,
  JobSearchSource,
  WorkflowRunDetail,
} from "@ucareer/shared";
import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AppView } from "../views";
import { getWorkspaceFilePreview, importEmailMessages, uploadAgentAttachment } from "../api";
import { AgentFilePreviewDrawer } from "./agent/AgentFilePreviewDrawer";
import { AgentConnectorBar } from "./agent/AgentConnectorBar";
import { AgentGuidePrompts, type AgentGuidePrompt } from "./agent/AgentGuidePrompts";
import { AgentJourneyLine } from "./agent/AgentJourneyLine";
import { AgentTurnView, getVisibleProcessMessages } from "./agent/AgentTurnView";
import {
  buildTaskTranscript,
  extractTaskUserQuestion,
  findLastMessageIndex,
  formatTokenCount,
  groupConversationTurns,
  providerLabel,
  resolveContextUsage,
  riskLabel,
} from "./agent/agentConversation";
import type { AgentChatMessage, AgentConversationTurn, ContextUsage } from "./agent/agentConversation";
const continuableTaskStatuses = new Set(["completed", "failed", "cancelled"]);
interface AgentSectionProps {
  providers: ProviderSummary[];
  installStatus: Record<string, ProviderInstallStatus>;
  selectedProvider: string;
  prompt: string;
  selectedTaskId: string;
  selectedTaskEvents: AgentEvent[];
  selectedTaskTurns: AgentTaskTurn[];
  tasks: AgentTask[];
  workflowRunDetail: WorkflowRunDetail | null;
  approvals: ApprovalRequest[];
  workspaceViews: AppView[];
  onCheckProvider(providerId: string): void;
  onCancelTask(taskId?: string): void | Promise<void>;
  onProviderChange(value: string): void;
  onPromptChange(value: string): void;
  onCreateTask(promptOverride?: string, permissionMode?: CreateAgentTaskRequest["permissionMode"], attachments?: AgentAttachment[], pageContext?: AgentPageContext): void | Promise<void>;
  onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]): void;
  onRunJobSearch(input?: Partial<JobSearchRequest>): void | Promise<void>;
  onSelectTask(taskId: string): void;
  onStartNewTask(): void;
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
  };
  pageContext?: AgentPageContext;
}
export function AgentSection(props: AgentSectionProps) {
  const [intakeText, setIntakeText] = useState("");
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [localMessages, setLocalMessages] = useState<AgentChatMessage[]>([]);
  const [pendingDraft, setPendingDraft] = useState<{
    user: AgentChatMessage;
    pending: AgentChatMessage;
    sentAt: number;
  } | null>(null);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<CreateAgentTaskRequest["permissionMode"]>("auto_review");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<import("@ucareer/shared").WorkspaceFilePreview | null>(null);
  const [filePreviewLoadingPath, setFilePreviewLoadingPath] = useState("");
  const [filePreviewError, setFilePreviewError] = useState("");
  const [filePreviewWidth, setFilePreviewWidth] = useState(460);
  const [filePreviewResizing, setFilePreviewResizing] = useState(false);
  const permissionMenuRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dialogueRef = useRef<HTMLDivElement | null>(null);
  const dialogueEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToLatestRef = useRef(true);
  const turnRefs = useRef(new Map<string, HTMLElement>());
  const checkedProviderIds = useRef(new Set<string>());
  const providerOptions = props.providers.length ? props.providers : fallbackProviders;
  const selectedProviderLabel = providerLabel(providerOptions, props.selectedProvider);
  const selectedProviderStatus = providerConnectionState(props.installStatus[props.selectedProvider]);
  const selectedTask = props.tasks.find((task) => task.id === props.selectedTaskId) || null;
  const canContinueSelectedTask = Boolean(
    selectedTask
      && selectedTask.providerId === props.selectedProvider
      && continuableTaskStatuses.has(selectedTask.status),
  );
  const conversationKey = selectedTask?.id || "agent-empty";
  const workspaceViews = props.workspaceViews.filter((view) => view.id !== "agent");
  const guidePrompts = workspaceGuidePrompts.filter((prompt) =>
    workspaceViews.some((view) => view.id === prompt.viewId),
  );
  const taskMessages = useMemo(
    () => buildTaskTranscript(selectedTask, props.selectedTaskEvents),
    [selectedTask, props.selectedTaskEvents],
  );
  const baseMessages = selectedTask ? taskMessages : localMessages;
  const pendingMessages = pendingDraft && !hasBackendUserMessageAfter(baseMessages, pendingDraft.user.text, pendingDraft.sentAt)
    ? [pendingDraft.user, pendingDraft.pending]
    : pendingDraft && !hasBackendAssistantAfterUserAfter(baseMessages, pendingDraft.user.text, pendingDraft.sentAt)
      ? [pendingDraft.pending]
      : [];
  const visibleMessages = pendingMessages.length
    ? [...baseMessages, ...pendingMessages]
    : baseMessages;
  const backendConversationTurns = selectedTask && props.selectedTaskTurns.length
    ? props.selectedTaskTurns.map(agentTaskTurnToConversationTurn)
    : groupConversationTurns(visibleMessages);
  const conversationTurns = pendingMessages.length
    ? mergePendingMessagesIntoTurns(backendConversationTurns, pendingMessages)
    : backendConversationTurns;
  const visibleApprovals = selectedTask
    ? props.approvals.filter((approval) => approval.taskId === selectedTask.id)
    : props.approvals.slice(0, 3);
  const agentBusy = Boolean(
    pendingDraft
      || selectedTask?.status === "queued"
      || selectedTask?.status === "running"
      || selectedTask?.status === "waiting_approval",
  );
  const executionStatusLabel = pendingDraft
    ? "正在启动对话"
    : selectedTask?.status === "waiting_approval"
      ? "等待执行审批"
      : selectedTask?.status === "queued"
        ? "正在排队准备执行"
        : selectedTask?.status === "running"
          ? "Agent 正在执行中"
          : "";
  const currentProcessMessages = agentBusy
    ? getCurrentProcessMessages(conversationTurns)
    : [];
  const showCurrentProcess = agentBusy && (currentProcessMessages.length > 0 || executionStatusLabel);
  const contextUsage = resolveContextUsage({
    providerId: props.selectedProvider,
    providers: providerOptions,
  });
  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      const target = event.target as Node;
      if (!permissionMenuRef.current?.contains(target)) setPermissionMenuOpen(false);
      if (!providerMenuRef.current?.contains(target)) setProviderMenuOpen(false);
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);
  useEffect(() => {
    if (!pendingDraft) return;
    const taskFinished = props.selectedTaskEvents.some((event) => {
      if (!isCreatedAtOrAfter(event.createdAt, pendingDraft.sentAt)) return false;
      if (event.type === "error") return true;
      if (event.type !== "task_status") return false;
      return event.status === "completed" || event.status === "failed" || event.status === "cancelled";
    });
    if (taskFinished || hasBackendAssistantAfterUserAfter(baseMessages, pendingDraft.user.text, pendingDraft.sentAt)) {
      setPendingDraft(null);
    }
  }, [baseMessages, pendingDraft, props.selectedTaskEvents]);
  useEffect(() => {
    providerOptions.forEach((provider) => {
      if (props.installStatus[provider.id] || checkedProviderIds.current.has(provider.id)) return;
      checkedProviderIds.current.add(provider.id);
      props.onCheckProvider(provider.id);
    });
  }, [providerOptions, props.installStatus, props.onCheckProvider]);
  useEffect(() => {
    shouldStickToLatestRef.current = true;
    scrollDialogueToLatest("auto");
  }, [conversationKey]);
  useEffect(() => {
    if (!shouldStickToLatestRef.current) return;
    scrollDialogueToLatest(agentBusy ? "auto" : "smooth");
  }, [
    agentBusy,
    visibleMessages.length,
    conversationTurns.length,
    selectedTask?.status,
    props.selectedTaskEvents.length,
    props.selectedTaskTurns.length,
    pendingDraft,
  ]);
  function handleDialogueScroll() {
    const node = dialogueRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToLatestRef.current = distanceFromBottom < 96;
  }
  function scrollDialogueToLatest(behavior: ScrollBehavior) {
    window.requestAnimationFrame(() => {
      const node = dialogueRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
      dialogueEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }
  function sendIntake() {
    const text = intakeText.trim();
    if ((!text && attachments.length === 0) || agentBusy) return;
    const currentAttachments = attachments;
    const sentAt = Date.now();
    const userMessage: AgentChatMessage = { id: `local-user-${sentAt}`, role: "user", text, createdAt: new Date(sentAt).toISOString() };
    const pendingMessage: AgentChatMessage = { id: `local-pending-${sentAt}`, role: "pending", text: "", createdAt: new Date(sentAt).toISOString() };
    shouldStickToLatestRef.current = true;
    setLocalMessages((current) => [
      ...current,
      userMessage,
    ]);
    setPendingDraft({ user: userMessage, pending: pendingMessage, sentAt });
    props.onPromptChange(text);
    Promise.resolve(props.onCreateTask(text, permissionMode, currentAttachments, props.pageContext)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Agent 创建任务失败";
      setPendingDraft(null);
      setLocalMessages((current) => [
        ...current,
        {
          id: `local-error-${sentAt}`,
          role: "system",
          text: `本地 Codex 没有成功启动：${message}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    });
    setIntakeText("");
    setAttachments([]);
    setAttachmentStatus("");
  }
  function cancelCurrentTask() {
    if (!selectedTask?.id) return;
    void Promise.resolve(props.onCancelTask(selectedTask.id)).finally(() => {
      setPendingDraft(null);
    });
  }
  function editLastUserMessage() {
    const lastUserMessage = [...visibleMessages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage?.text.trim()) return;
    setIntakeText(lastUserMessage.text.trim());
    props.onPromptChange(lastUserMessage.text.trim());
  }
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttachmentStatus("正在解析附件...");
    try {
      const uploaded: AgentAttachment[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await uploadAgentAttachment({
          fileName: file.name,
          sizeBytes: file.size,
          dataBase64: await fileToBase64(file),
          ...(file.type ? { mimeType: file.type } : {}),
        }));
      }
      setAttachments((current) => [...current, ...uploaded]);
      setAttachmentStatus(`${uploaded.length} 个附件已解析`);
    } catch (error) {
      setAttachmentStatus(error instanceof Error ? error.message : "附件解析失败");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  function scrollToTurn(turnId: string) {
    const turnNode = turnRefs.current.get(turnId);
    turnNode?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function openFilePreview(path: string) {
    setFilePreview(null);
    setFilePreviewError("");
    setFilePreviewLoadingPath(path);
    try {
      const preview = await getWorkspaceFilePreview(path);
      setFilePreview(preview);
    } catch (error) {
      setFilePreviewError(error instanceof Error ? error.message : "文件预览失败");
    } finally {
      setFilePreviewLoadingPath("");
    }
  }
  function closeFilePreview() {
    setFilePreview(null);
    setFilePreviewError("");
    setFilePreviewLoadingPath("");
  }
  function startFilePreviewResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const consoleElement = event.currentTarget.closest(".agent-console");
    const consoleRect = consoleElement?.getBoundingClientRect();
    if (!consoleRect) return;

    const minPreviewWidth = 320;
    const maxPreviewWidth = Math.max(minPreviewWidth, Math.min(760, consoleRect.width - 560));
    const clampPreviewWidth = (clientX: number) => {
      const requestedWidth = consoleRect.right - clientX;
      return Math.min(Math.max(requestedWidth, minPreviewWidth), maxPreviewWidth);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setFilePreviewWidth(clampPreviewWidth(event.clientX));
    setFilePreviewResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      setFilePreviewWidth(clampPreviewWidth(moveEvent.clientX));
    }
    function stopResize() {
      setFilePreviewResizing(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }
  async function importMailboxMessages() {
    setAttachmentStatus("正在读取 QQ 邮箱...");
    try {
      const result = await importEmailMessages({
        limit: 20,
        sinceDate: formatDateForMailboxImport(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      });
      const nextPrompt = formatMailboxPrompt(result);
      setIntakeText(nextPrompt);
      props.onPromptChange(nextPrompt);
      setAttachmentStatus(`已读取 ${result.messages.length} 封邮件`);
    } catch (error) {
      setAttachmentStatus(error instanceof Error ? error.message : "邮箱读取失败");
    }
  }
  const hasFilePreview = Boolean(filePreview || filePreviewLoadingPath || filePreviewError);
  const agentConsoleStyle = hasFilePreview
    ? ({ "--agent-preview-width": `${filePreviewWidth}px` } as CSSProperties)
    : undefined;
  return (
    <div
      className={`${hasFilePreview ? "agent-console has-file-preview" : "agent-console"}${filePreviewResizing ? " is-resizing-preview" : ""}`}
      style={agentConsoleStyle}
    >
      <section className="agent-thread-shell" aria-label="Agent 对话">
        <div className={visibleMessages.length ? "agent-thread has-messages" : "agent-thread"}>
          <div className="agent-center-stack">
            <div className="agent-thread-stage" key={conversationKey}>
              {visibleMessages.length ? (
                <div className="agent-dialogue" aria-live="polite" ref={dialogueRef} onScroll={handleDialogueScroll}>
                  {conversationTurns.length > 1 ? (
                    <AgentTurnJumpMarkers turns={conversationTurns} onJump={scrollToTurn} />
                  ) : null}
                  {conversationTurns.map((turn, index) => (
                    <div
                      className="agent-turn-anchor"
                      key={turn.id}
                      ref={(node) => {
                        if (node) turnRefs.current.set(turn.id, node);
                        else turnRefs.current.delete(turn.id);
                      }}
                    >
                      <AgentTurnView
                        turn={turn}
                        runningProcessLabel={index === conversationTurns.length - 1 && showCurrentProcess ? executionStatusLabel : ""}
                        runningProcessMessages={index === conversationTurns.length - 1 && showCurrentProcess ? currentProcessMessages : []}
                        onOpenFilePreview={openFilePreview}
                      />
                    </div>
                  ))}
                  <div className="agent-dialogue-end" ref={dialogueEndRef} aria-hidden="true" />
                </div>
              ) : (
                <div className="agent-empty-prompt">
                  <div className="agent-brand-lockup" aria-label="Ucareer">
                    <img className="agent-brand-wordmark" src="/assets/ucareer-primary-logo.svg" alt="" />
                  </div>
                  <h2>Your Journey. Your Career.</h2>
                  <AgentJourneyLine className="agent-brand-path" />
                </div>
              )}
            </div>
            <div className="agent-entry-stack">
              {visibleApprovals.length ? (
                <div className="agent-approval-bar" aria-label="待审批操作">
                  {visibleApprovals.map((approval) => (
                    <article className={`agent-approval-card risk-${approval.risk}`} key={approval.id}>
                      <div className="agent-approval-copy">
                        <span>{riskLabel(approval.risk)}</span>
                        <strong>{formatApprovalTitle(approval)}</strong>
                        <small>{formatApprovalSubtitle(approval)}</small>
                        <details className="agent-approval-details">
                          <summary>查看细节</summary>
                          <div className="agent-approval-meta">
                            <small>{approval.action}</small>
                            {approval.command ? <code>{approval.command}</code> : null}
                            {approval.cwd ? <small>{approval.cwd}</small> : null}
                            {(approval.affectedPaths || []).length ? (
                              <small>{(approval.affectedPaths || []).slice(0, 3).join(" · ")}</small>
                            ) : null}
                          </div>
                        </details>
                      </div>
                      <div className="agent-approval-actions">
                        <button type="button" onClick={() => props.onDecideApproval(approval.id, "allow_once")}>允许一次</button>
                        <button type="button" className="secondary" onClick={() => props.onDecideApproval(approval.id, "allow_workspace")}>本工作区始终允许</button>
                        <button type="button" className="danger" onClick={() => props.onDecideApproval(approval.id, "deny")}>拒绝</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              <form
                className="agent-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendIntake();
                }}
              >
                {attachments.length || attachmentStatus ? (
                  <div className="agent-attachment-strip" aria-label="已上传附件">
                    {attachments.map((attachment) => (
                      <button
                        type="button"
                        className="agent-attachment-chip"
                        key={attachment.id}
                        title={attachment.parsed.summary}
                        onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                      >
                        <span>{attachment.kind}</span>
                        <strong>{attachment.fileName}</strong>
                      </button>
                    ))}
                    {attachmentStatus ? <small>{attachmentStatus}</small> : null}
                  </div>
                ) : null}
                <textarea
                  aria-label="输入给 Agent 的内容"
                  placeholder={agentBusy ? "可以先输入，当前步骤完成后再发送" : canContinueSelectedTask ? "继续追问当前 Agent 对话" : "随心输入"}
                  value={intakeText}
                  onChange={(event) => setIntakeText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      if (agentBusy) return;
                      event.preventDefault();
                      sendIntake();
                    }
                  }}
                />
                <div className="agent-composer-actions">
                  <div className="agent-composer-left">
                    <input
                      ref={fileInputRef}
                      className="agent-file-input"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md,.csv,.json,image/png,image/jpeg,image/webp"
                      onChange={(event) => void uploadFiles(event.target.files)}
                    />
                    <button type="button" className="agent-icon-button" aria-label="添加上下文" onClick={() => fileInputRef.current?.click()}>+</button>
                    {visibleMessages.some((message) => message.role === "user") ? (
                      <button
                        type="button"
                        className="agent-edit-last-button"
                        onClick={editLastUserMessage}
                        title={agentBusy ? "先停止当前执行，再发送修改后的内容" : "把上一条用户消息填回输入框"}
                      >
                        修改上一句
                      </button>
                    ) : null}
                    <AgentConnectorBar
                      connectionState={selectedProviderStatus}
                      jobSearch={props.jobSearch}
                      onImportMessages={importMailboxMessages}
                      onRunJobSearch={props.onRunJobSearch}
                    />
                    <div className="agent-permission-menu" ref={permissionMenuRef}>
                      <button
                        type="button"
                        className={`agent-permission-trigger is-${permissionMode}`}
                        aria-label="权限模式"
                        aria-haspopup="menu"
                        aria-expanded={permissionMenuOpen}
                        onClick={() => setPermissionMenuOpen((open) => !open)}
                      >
                        <span aria-hidden="true">{permissionModeIcon(permissionMode)}</span>
                        <strong>{permissionModeLabel(permissionMode)}</strong>
                        <b aria-hidden="true">⌄</b>
                      </button>
                      {permissionMenuOpen ? (
                        <div className="agent-permission-options" role="menu" aria-label="选择权限模式">
                          {permissionModes.map((mode) => (
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={permissionMode === mode.id}
                              className={permissionMode === mode.id ? "is-selected" : ""}
                              key={mode.id}
                              onClick={() => {
                                setPermissionMode(mode.id);
                                setPermissionMenuOpen(false);
                              }}
                            >
                              <span aria-hidden="true">{mode.icon}</span>
                              <strong>{mode.label}</strong>
                              {permissionMode === mode.id ? <small aria-hidden="true">✓</small> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="agent-composer-right">
                    {agentBusy ? (
                      <AgentJourneyLine ariaLabel="Agent 正在执行" className="agent-composer-loading-line" loop />
                    ) : (
                      <ContextUsageBadge usage={contextUsage} />
                    )}
                    <div className="agent-provider-menu" ref={providerMenuRef}>
                      <button
                        type="button"
                        className="agent-provider-trigger"
                        aria-expanded={providerMenuOpen}
                        aria-haspopup="listbox"
                        onClick={() => {
                          if (selectedProviderStatus !== "connected") props.onCheckProvider(props.selectedProvider);
                          setProviderMenuOpen((open) => !open);
                        }}
                      >
                        <span className={`agent-provider-status is-${selectedProviderStatus}`} aria-hidden="true" />
                        <span>{selectedProviderLabel}</span>
                        <b aria-hidden="true">⌄</b>
                      </button>
                      {providerMenuOpen ? (
                        <div className="agent-provider-options" role="listbox" aria-label="选择 AI 助手">
                          {providerOptions.map((provider) => {
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
                                  setProviderMenuOpen(false);
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
                      className={`agent-send-button${agentBusy ? " is-stop" : ""}`}
                      type={agentBusy ? "button" : "submit"}
                      aria-label={agentBusy ? "停止当前 Agent 执行" : canContinueSelectedTask ? "追问 Agent" : "发送给 Agent"}
                      disabled={!agentBusy && !intakeText.trim() && attachments.length === 0}
                      onClick={agentBusy ? cancelCurrentTask : undefined}
                    >
                      <span aria-hidden="true">{agentBusy ? "■" : "↑"}</span>
                    </button>
                  </div>
                </div>
              </form>
              {!visibleMessages.length ? (
                <AgentGuidePrompts prompts={guidePrompts} onSelectPrompt={setIntakeText} />
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <AgentFilePreviewDrawer
        preview={filePreview}
        loadingPath={filePreviewLoadingPath}
        error={filePreviewError}
        onClose={closeFilePreview}
        onResizeStart={startFilePreviewResize}
      />
    </div>
  );
}

function AgentTurnJumpMarkers({
  turns,
  onJump,
}: {
  turns: Array<{ id: string; messages: AgentChatMessage[] }>;
  onJump(turnId: string): void;
}) {
  const centerIndex = (turns.length - 1) / 2;
  return (
    <nav className="agent-turn-jumpbar" aria-label="当前对话跳转">
      {turns.map((turn, index) => {
        const firstQuestion = turn.messages.find((message) => message.role === "user")?.text.replace(/\s+/g, " ").trim();
        const label = firstQuestion || `跳到第 ${index + 1} 轮问答`;
        const offset = Math.round((index - centerIndex) * 18);
        return (
          <button
            type="button"
            key={turn.id}
            aria-label={label}
            style={{ "--agent-turn-offset": `${offset}px` } as CSSProperties}
            onClick={() => onJump(turn.id)}
          >
            <span aria-hidden="true" />
            <small>{label}</small>
          </button>
        );
      })}
    </nav>
  );
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
  const answerMessage = turn.answer ? agentEventToChatMessage(turn.answer, `${turn.id}:answer`, formatTurnDuration(turn.question?.createdAt, turn.answer.createdAt)) : null;
  if (answerMessage) messages.push(answerMessage);
  return { id: turn.id, messages };
}

function getCurrentProcessMessages(turns: AgentConversationTurn[]): AgentChatMessage[] {
  const latestTurn = turns.at(-1);
  if (!latestTurn) return [];
  const finalAssistantIndex = findLastMessageIndex(latestTurn.messages, (message) => message.role === "assistant");
  return getVisibleProcessMessages(latestTurn.messages.filter((message, index) => {
    if (message.role === "user" || message.role === "pending") return false;
    return index !== finalAssistantIndex;
  }));
}

function formatDateForMailboxImport(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMailboxPrompt(result: import("@ucareer/shared").ImportEmailMessagesResult): string {
  const messages = result.messages.map((message, index) => [
    `${index + 1}. From: ${message.from || "(unknown)"}`,
    `Subject: ${message.subject || "(no subject)"}`,
    `Date: ${message.date || "(unknown date)"}`,
    `Snippet: ${message.snippet || "(empty)"}`,
  ].join("\n")).join("\n\n");
  return `请分析下面从 QQ 邮箱读取到的最近邮件，判断是否包含面试邀约、拒信、HR 跟进、岗位推荐或无关邮件。请优先提取公司、岗位、事件类型、时间地点、下一步动作，并告诉我是否需要更新投递进度。\n\n邮箱：${result.account}\n文件夹：${result.mailbox}\n读取时间：${result.importedAt}\n\n邮件列表：\n${messages || "(没有读取到邮件)"}`;
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

function ContextUsageBadge({ usage }: { usage: ContextUsage }) {
  const style = {
    "--agent-context-pct": `${usage.percent}%`,
    "--agent-context-color": usage.level === "high" ? "#22c55e" : usage.level === "medium" ? "#4f8cff" : "#94a3b8",
  } as CSSProperties;
  const limitLabel = formatTokenCount(usage.limit);
  const sourceLabel = contextWindowSourceLabel(usage.source);
  return (
    <div
      className={`agent-context-meter is-${usage.level}`}
      style={style}
      tabIndex={0}
      aria-label={`Agent 上下文窗口 ${limitLabel} tokens`}
    >
      <span aria-hidden="true" />
      <div className="agent-context-tooltip" role="tooltip">
        <strong>Agent 上下文窗口</strong>
        <small>{usage.model ? `${usage.model} · ${sourceLabel}` : sourceLabel}</small>
        <em>{limitLabel} tokens</em>
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

function formatApprovalTitle(approval: ApprovalRequest): string {
  if (approval.action === "start_agent") {
    const provider = parseApprovalCommand(approval.command)?.providerLabel || "Agent";
    return `允许 ${provider} 运行？`;
  }
  return approval.summary;
}
function formatApprovalSubtitle(approval: ApprovalRequest): string {
  if (approval.action === "start_agent") {
    return "也可以在输入框左侧权限菜单里切换运行权限";
  }
  return approval.cwd || approval.action;
}
function parseApprovalCommand(command?: string): { providerLabel?: string } | null {
  if (!command) return null;
  try {
    const parsed = JSON.parse(command) as { providerLabel?: unknown };
    return typeof parsed.providerLabel === "string" ? { providerLabel: parsed.providerLabel } : null;
  } catch {
    return null;
  }
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
function providerConnectionState(status?: ProviderInstallStatus): "connected" | "disconnected" | "unknown" {
  if (!status) return "unknown";
  return status.installed ? "connected" : "disconnected";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });
}

const fallbackProviderCapabilities: ProviderSummary["capabilities"] = { approvals: true, mcp: false, ptyRunner: true, resumeSession: false, structuredRunner: true };
const fallbackProviderContextWindows: Record<string, NonNullable<ProviderSummary["contextWindow"]>> = {
  codex: { tokens: 400_000, model: "gpt-5.5", source: "model_default" },
  claude: { tokens: 200_000, source: "provider_default" },
  gemini: { tokens: 1_000_000, model: "auto", source: "provider_default" },
};
const fallbackProviders: ProviderSummary[] = ["codex", "claude", "gemini"].map((id) => ({
  id,
  label: id === "codex" ? "Codex CLI" : id === "claude" ? "Claude Code" : "Gemini CLI",
  ...(fallbackProviderContextWindows[id] ? { contextWindow: fallbackProviderContextWindows[id] } : {}),
  capabilities: fallbackProviderCapabilities,
}));
const workspaceGuidePrompts: AgentGuidePrompt[] = [
  { icon: "⌕", viewId: "market", text: "从岗位列表里筛出今天最值得推进的 3 个岗位" },
  { icon: "▤", viewId: "resumes", text: "检查我的简历，告诉我哪一版最适合当前目标岗位" },
  { icon: "✦", viewId: "experience", text: "帮我整理经历资产里最能证明机器人和 AI 能力的项目" },
  { icon: "↗", viewId: "applications", text: "复盘投递进度，列出需要跟进、准备和关闭的事项" },
  { icon: "◎", viewId: "evidence", text: "查看复盘中心，把证据缺口按优先级排一下" },
];
