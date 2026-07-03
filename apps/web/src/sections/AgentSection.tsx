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
import { useEffect, useRef, useState } from "react";
import type { AppView } from "../views";
import { importEmailMessages, uploadAgentAttachment } from "../api";
import { AgentApprovalBar } from "./agent/AgentApprovalBar";
import { AgentFilePreviewDrawer } from "./agent/AgentFilePreviewDrawer";
import { AgentComposer } from "./agent/AgentComposer";
import { AgentGuidePrompts, type AgentGuidePrompt } from "./agent/AgentGuidePrompts";
import { AgentThreadStage } from "./agent/AgentThreadStage";
import { type AgentPendingDraft, useAgentConversationState } from "./agent/useAgentConversationState";
import { useAgentFilePreview } from "./agent/useAgentFilePreview";
import {
  resolveContextUsage,
} from "./agent/agentConversation";
import type { AgentChatMessage } from "./agent/agentConversation";
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
  onCreateTask(promptOverride?: string, permissionMode?: CreateAgentTaskRequest["permissionMode"], attachments?: AgentAttachment[], pageContext?: AgentPageContext): string | Promise<string>;
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
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const [localMessages, setLocalMessages] = useState<AgentChatMessage[]>([]);
  const [pendingDraft, setPendingDraft] = useState<AgentPendingDraft | null>(null);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<CreateAgentTaskRequest["permissionMode"]>("auto_review");
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const filePreview = useAgentFilePreview();
  const permissionMenuRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentPreviewUrlsRef = useRef(new Map<string, string>());
  const submitLockRef = useRef(false);
  const checkedProviderIds = useRef(new Set<string>());
  const providerOptions = props.providers.length ? props.providers : fallbackProviders;
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
  const conversationState = useAgentConversationState({
    localMessages,
    pendingDraft,
    selectedTask,
    selectedTaskEvents: props.selectedTaskEvents,
    selectedTaskTurns: props.selectedTaskTurns,
    onClearPendingDraft: () => setPendingDraft(null),
  });
  const visibleApprovals = selectedTask
    ? props.approvals.filter((approval) => approval.taskId === selectedTask.id)
    : props.approvals.slice(0, 3);
  const contextUsage = resolveContextUsage({
    providerId: props.selectedProvider,
    providers: providerOptions,
    events: props.selectedTaskEvents,
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
    providerOptions.forEach((provider) => {
      if (props.installStatus[provider.id] || checkedProviderIds.current.has(provider.id)) return;
      checkedProviderIds.current.add(provider.id);
      props.onCheckProvider(provider.id);
    });
  }, [providerOptions, props.installStatus, props.onCheckProvider]);
  useEffect(() => {
    return () => {
      attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentPreviewUrlsRef.current.clear();
    };
  }, []);
  function sendIntake() {
    if (submitLockRef.current) return;
    const text = intakeText.trim();
    if ((!text && attachments.length === 0) || conversationState.agentBusy) return;
    submitLockRef.current = true;
    const currentAttachments = attachments;
    const sentAt = Date.now();
    const userMessage: AgentChatMessage = {
      id: `local-user-${sentAt}`,
      role: "user",
      text,
      createdAt: new Date(sentAt).toISOString(),
      ...(currentAttachments.length ? { attachments: currentAttachments } : {}),
    };
    const pendingMessage: AgentChatMessage = { id: `local-pending-${sentAt}`, role: "pending", text: "", createdAt: new Date(sentAt).toISOString() };
    setLocalMessages((current) => [
      ...current,
      userMessage,
    ]);
    setPendingDraft({ user: userMessage, pending: pendingMessage, sentAt });
    props.onPromptChange(text);
    Promise.resolve(props.onCreateTask(text, permissionMode, currentAttachments, props.pageContext)).then((taskId) => {
      if (!taskId) return;
      setPendingDraft((current) => current?.sentAt === sentAt ? { ...current, taskId } : current);
    }).catch((error: unknown) => {
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
    }).finally(() => {
      submitLockRef.current = false;
    });
    setIntakeText("");
    setAttachments([]);
    clearAttachmentPreviewUrls();
    setAttachmentStatus("");
  }
  function cancelCurrentTask() {
    if (!selectedTask?.id) return;
    void Promise.resolve(props.onCancelTask(selectedTask.id)).finally(() => {
      setPendingDraft(null);
    });
  }
  function editLastUserMessage() {
    const lastUserMessage = [...conversationState.visibleMessages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage?.text.trim()) return;
    setIntakeText(lastUserMessage.text.trim());
    props.onPromptChange(lastUserMessage.text.trim());
  }
  async function uploadFiles(files: FileList | File[] | null, source: "picker" | "paste" = "picker") {
    if (!files?.length) return;
    setAttachmentStatus(source === "paste" ? "正在上传粘贴的截图..." : "正在解析附件...");
    const nextPreviewUrls = new Map<string, string>();
    try {
      const uploaded: AgentAttachment[] = [];
      for (const file of Array.from(files)) {
        const uploadedAttachment = await uploadAgentAttachment({
          fileName: file.name,
          sizeBytes: file.size,
          dataBase64: await fileToBase64(file),
          ...(file.type ? { mimeType: file.type } : {}),
        });
        uploaded.push(uploadedAttachment);
        if (uploadedAttachment.kind === "image" && file.type.startsWith("image/")) {
          nextPreviewUrls.set(uploadedAttachment.id, URL.createObjectURL(file));
        }
      }
      setAttachments((current) => [...current, ...uploaded]);
      registerAttachmentPreviewUrls(nextPreviewUrls);
      setAttachmentStatus(source === "paste" ? `${uploaded.length} 张截图已添加` : `${uploaded.length} 个附件已解析`);
    } catch (error) {
      nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      setAttachmentStatus(error instanceof Error ? error.message : source === "paste" ? "截图上传失败" : "附件解析失败");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  function registerAttachmentPreviewUrls(urls: Map<string, string>) {
    if (!urls.size) return;
    urls.forEach((url, id) => {
      const previousUrl = attachmentPreviewUrlsRef.current.get(id);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      attachmentPreviewUrlsRef.current.set(id, url);
    });
    setAttachmentPreviewUrls(Object.fromEntries(attachmentPreviewUrlsRef.current.entries()));
  }
  function removeAttachment(attachmentId: string) {
    const previewUrl = attachmentPreviewUrlsRef.current.get(attachmentId);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    attachmentPreviewUrlsRef.current.delete(attachmentId);
    setAttachmentPreviewUrls(Object.fromEntries(attachmentPreviewUrlsRef.current.entries()));
    setAttachments((current) => current.filter((item) => item.id !== attachmentId));
  }
  function clearAttachmentPreviewUrls() {
    attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentPreviewUrlsRef.current.clear();
    setAttachmentPreviewUrls({});
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
  return (
    <div
      className={`${filePreview.hasPreview ? "agent-console has-file-preview" : "agent-console"}${filePreview.resizing ? " is-resizing-preview" : ""}`}
      style={filePreview.consoleStyle}
    >
      <section className="agent-thread-shell" aria-label="Agent 对话">
        <div className={conversationState.visibleMessages.length ? "agent-thread has-messages" : "agent-thread"}>
          <div className="agent-center-stack">
            <AgentThreadStage
              agentBusy={conversationState.agentBusy}
              conversationKey={conversationKey}
              conversationTurns={conversationState.conversationTurns}
              currentProcessMessages={conversationState.currentProcessMessages}
              executionStatusLabel={conversationState.executionStatusLabel}
              selectedTaskEventsCount={props.selectedTaskEvents.length}
              selectedTaskStatus={selectedTask?.status}
              selectedTaskTurnsCount={props.selectedTaskTurns.length}
              showCurrentProcess={conversationState.showCurrentProcess}
              visibleMessages={conversationState.visibleMessages}
              onOpenFilePreview={filePreview.open}
            />
            <div className="agent-entry-stack">
              <AgentApprovalBar approvals={visibleApprovals} onDecideApproval={props.onDecideApproval} />
              <AgentComposer
                agentBusy={conversationState.agentBusy}
                attachmentPreviewUrls={attachmentPreviewUrls}
                attachments={attachments}
                attachmentStatus={attachmentStatus}
                canContinueSelectedTask={canContinueSelectedTask}
                contextUsage={contextUsage}
                fileInputRef={fileInputRef}
                installStatus={props.installStatus}
                intakeText={intakeText}
                jobSearch={props.jobSearch}
                permissionMenuOpen={permissionMenuOpen}
                permissionMenuRef={permissionMenuRef}
                permissionMode={permissionMode}
                providerMenuOpen={providerMenuOpen}
                providerMenuRef={providerMenuRef}
                providerOptions={providerOptions}
                selectedProvider={props.selectedProvider}
                visibleMessagesHaveUser={conversationState.visibleMessages.some((message) => message.role === "user")}
                onCancelCurrentTask={cancelCurrentTask}
                onCheckProvider={props.onCheckProvider}
                onEditLastUserMessage={editLastUserMessage}
                onImportMailboxMessages={importMailboxMessages}
                onIntakeTextChange={setIntakeText}
                onOpenFilePreview={filePreview.open}
                onProviderChange={props.onProviderChange}
                onRemoveAttachment={removeAttachment}
                onRunJobSearch={props.onRunJobSearch}
                onSetPermissionMenuOpen={setPermissionMenuOpen}
                onSetPermissionMode={setPermissionMode}
                onSetProviderMenuOpen={setProviderMenuOpen}
                onSubmit={sendIntake}
                onUploadFiles={uploadFiles}
              />
              {!conversationState.visibleMessages.length ? (
                <AgentGuidePrompts prompts={guidePrompts} onSelectPrompt={setIntakeText} />
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <AgentFilePreviewDrawer
        preview={filePreview.preview}
        loadingPath={filePreview.loadingPath}
        error={filePreview.error}
        onClose={filePreview.close}
        onResizeStart={filePreview.startResize}
      />
    </div>
  );
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
