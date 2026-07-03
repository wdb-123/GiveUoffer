import type { AgentEvent, AgentTask, ApplicationsOverview, EmailMessageSummary } from "@ucareer/shared";
import type { CSSProperties } from "react";
import { useState } from "react";
import { importEmailMessages } from "../api";
import { Panel } from "../ui/Panel";

type ApplicationSummary = ApplicationsOverview["applications"][number];
type ApplicationProgressEvent = NonNullable<ApplicationSummary["events"]>[number];
type SelectedPipelineEvent = {
  application: ApplicationSummary;
  event: ApplicationProgressEvent;
  label: string;
} | null;

export interface ApplicationEventFormInput {
  application_id: string;
  company: string;
  role: string;
  event: string;
  date?: string;
  due?: string;
  next_action: string;
  note: string;
}

interface ApplicationsSectionProps {
  applications: ApplicationsOverview | null;
  agentTasks?: AgentTask[];
  selectedTaskEvents?: AgentEvent[];
  selectedTaskId?: string;
  onCreateEvent(input: ApplicationEventFormInput): void;
  onFindInterviewEmails?(): string | Promise<string>;
}

export function ApplicationsSection({
  applications,
  agentTasks = [],
  selectedTaskEvents = [],
  selectedTaskId = "",
  onCreateEvent,
  onFindInterviewEmails,
}: ApplicationsSectionProps) {
  const [emailText, setEmailText] = useState("");
  const [draft, setDraft] = useState<ApplicationEventFormInput | null>(null);
  const [mailboxStatus, setMailboxStatus] = useState("");
  const [isReadingMailbox, setIsReadingMailbox] = useState(false);
  const [mailboxTaskId, setMailboxTaskId] = useState("");
  const [selectedPipelineEvent, setSelectedPipelineEvent] = useState<SelectedPipelineEvent>(null);
  const emptyDraft = {
    application_id: "",
    company: "",
    role: "",
    event: "applied",
    next_action: "",
    note: "",
  };

  function parseProgressEmail(textOverride?: string) {
    const text = (textOverride ?? emailText).trim();
    if (!text) {
      setDraft(null);
      setMailboxStatus("");
      return;
    }
    const subject = text.match(/Subject:\s*(.+)/i)?.[1]?.trim() || text.match(/主题[：:]\s*(.+)/i)?.[1]?.trim() || "";
    const from = text.match(/(?:From|发件人):\s*([^<\n]+)/i)?.[1]?.trim() || "";
    const company = extractCompanyFromEmail(text, from);
    const isInterview = /interview|面试|邀约|预约/i.test(text);
    const isRejected = /reject|unfortunately|拒绝|不合适/i.test(text);
    const isOffer = /\boffer\b|录用|发放意向|offer/i.test(text);
    const isAssessment = /assessment|test|测评|笔试|在线测试/i.test(text);
    const isApplied = /received|已收到|投递成功|申请已提交|简历已投递/i.test(text);
    const isResponded = /reply|回复|通知|invitation|邀约/i.test(text);
    const date = normalizeEmailDate(text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/)?.[1] || text.match(/Date:\s*(.+)/i)?.[1] || "");
    setDraft({
      application_id: applications?.applications[0]?.id || "001",
      company: company || "待确认公司",
      role: extractRoleFromEmail(text, subject) || subject || "待确认岗位",
      event: isOffer ? "offer" : isInterview ? "interview" : isAssessment ? "assessment" : isRejected ? "rejected" : isApplied ? "applied" : isResponded ? "responded" : "note",
      ...(date ? { date, due: date } : {}),
      next_action: isOffer
        ? "核对 Offer 细节并准备谈判要点"
        : isInterview
          ? "确认面试时间并准备面试材料"
          : isAssessment
            ? "完成测评/笔试并记录截止时间"
            : isRejected
              ? "记录拒信并复盘原因"
              : "复核邮件内容并确认下一步",
      note: text.slice(0, 180),
    });
  }

  async function readMailboxAndParse() {
    if (isReadingMailbox) return;
    setIsReadingMailbox(true);
    setMailboxStatus(onFindInterviewEmails ? "正在启动 Agent 检索邮箱..." : "正在读取已连接邮箱...");
    try {
      if (onFindInterviewEmails) {
        const taskId = await onFindInterviewEmails();
        if (taskId) setMailboxTaskId(taskId);
        setDraft(null);
        setMailboxStatus("Agent 已开始查找面试/HR/投递相关邮件，命中后会写入投递进度。");
        return;
      }
      const result = await importEmailMessages({
        limit: 12,
        snippetBytes: 6000,
        content: "面试 interview offer 拒绝 不合适 测评 笔试 投递 简历 预约 invitation assessment rejected",
      });
      const message = pickProgressMessage(result.messages);
      if (!message) {
        setDraft(null);
        setMailboxStatus(`已读取 ${result.messages.length} 封邮件，但没有命中投递/面试/测评/拒信关键词。`);
        return;
      }
      const text = emailMessageToText(message);
      setEmailText(text);
      parseProgressEmail(text);
      setMailboxStatus(`已从 ${result.account} 读取并解析：${message.subject || "无主题邮件"}`);
    } catch (error) {
      setDraft(null);
      setMailboxStatus(error instanceof Error ? error.message : "邮箱读取失败");
    } finally {
      setIsReadingMailbox(false);
    }
  }

  function confirmDraft() {
    if (!draft) return;
    onCreateEvent(draft);
  }

  const pipelineApplications = (applications?.applications || []).filter((application) => Boolean(application.latestEvent) || Number(application.eventCount || 0) > 0);
  const mailboxTask = mailboxTaskId ? agentTasks.find((task) => task.id === mailboxTaskId) || null : null;
  const mailboxEvents = mailboxTaskId && selectedTaskId === mailboxTaskId ? selectedTaskEvents : [];
  const showMailboxAgentProgress = Boolean(mailboxTaskId || mailboxStatus.includes("Agent 已开始") || mailboxStatus.includes("正在启动 Agent"));

  return (
    <div className="applications-workspace applications-import-workspace">
      <div className="applications-import-grid">
        <Panel className="applications-mail-panel">
          <div className="applications-panel-title">
            <h2>邮箱进度解析</h2>
          </div>
          <textarea
            value={emailText}
            onChange={(event) => setEmailText(event.target.value)}
            placeholder={"支持投递回执、面试邀请、测评通知和拒信。优先点击“读邮箱并解析”；也可以手动粘贴邮件作为备用。\n\n示例：Subject: Interview invitation\nFrom: recruiting@example.com\n请在 2026-06-10 前预约面试..."}
          />
          <div className="applications-import-actions">
            <div className="applications-parse-actions">
              <button type="button" className="mailbox-read-button" disabled={isReadingMailbox} onClick={readMailboxAndParse}>
                {isReadingMailbox ? "启动中..." : "Agent 找邮件"}
              </button>
              <button type="button" onClick={() => parseProgressEmail()}>解析进度</button>
              <button type="button" className="secondary" onClick={() => { setEmailText(""); setDraft(null); setMailboxStatus(""); }}>清空</button>
            </div>
          </div>
          {mailboxStatus ? <p className="applications-mailbox-status">{mailboxStatus}</p> : null}
          {showMailboxAgentProgress || draft ? (
            <div className={draft ? "applications-result-box has-result" : "applications-result-box"}>
              <div className="applications-inline-result-head">
                <strong>{showMailboxAgentProgress ? "执行过程" : "解析结果"}</strong>
                <button type="button" className="text-button" disabled={!draft} onClick={confirmDraft}>确认后入库</button>
              </div>
              {showMailboxAgentProgress ? (
                <MailboxAgentProgress events={mailboxEvents} task={mailboxTask} />
              ) : draft ? (
                <dl>
                  <div><dt>公司</dt><dd>{draft.company}</dd></div>
                  <div><dt>岗位</dt><dd>{draft.role}</dd></div>
                  <div><dt>事件</dt><dd>{eventLabel(draft.event)}</dd></div>
                  <div><dt>下一步</dt><dd>{draft.next_action}</dd></div>
                </dl>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel className="applications-pipeline-panel">
        <div className="applications-panel-title">
          <h2>我的投递管线</h2>
          <span>最新进度</span>
        </div>
        <div className="applications-pipeline-list">
          {pipelineApplications.length ? pipelineApplications.slice(0, 12).map((application) => (
            <article className="application-row" key={application.id}>
              <div className="application-row-main">
                <div className="application-row-head">
                  <span className={`application-status-pill is-${normalizeStatusClass(application.statusKey)}`}>{eventLabel(application.latestEvent?.event || application.statusKey)}</span>
                  <strong>{application.company || "待确认公司"}</strong>
                  <em>{application.role || "待确认岗位"}</em>
                </div>
                <p className="application-row-event">
                  <strong>{eventLabel(application.latestEvent?.event || application.statusKey)}</strong>
                  <span>{application.latestEvent?.due || application.latestEvent?.date || application.date || "时间待确认"}</span>
                  {application.eventCount && application.eventCount > 1 ? <span>已记录 {application.eventCount} 个事件</span> : null}
                </p>
                <ApplicationStageTrack
                  events={application.events || (application.latestEvent ? [application.latestEvent] : [])}
                  onSelectEvent={(event, label) => setSelectedPipelineEvent({ application, event, label })}
                />
              </div>
            </article>
          )) : (
            <div className="applications-empty-pipeline">
              还没有导入的投递进度。先解析一封真实邮件，确认入库后，这里才会形成你的投递时间线。
            </div>
          )}
        </div>
        {selectedPipelineEvent ? (
          <PipelineEventDetail
            selected={selectedPipelineEvent}
            onClose={() => setSelectedPipelineEvent(null)}
          />
        ) : null}
      </Panel>
    </div>
  );
}

function MailboxAgentProgress({ task, events }: { task: AgentTask | null; events: AgentEvent[] }) {
  const latestEvents = events.slice(-5).reverse();
  const taskStatus = task?.status || "running";
  const active = taskStatus === "queued" || taskStatus === "running" || taskStatus === "waiting_approval";
  const activeStepIndex = stepsFirstPendingIndex([
    events.some((event) => event.type === "command" || event.type === "message") || taskStatus !== "queued",
    events.some((event) => event.type === "message" && /mailbox|邮箱|搜索|面试|投递|HR/i.test(event.text)),
    events.some((event) => event.type === "message" && /过滤|排除|无关|newsletter|pricing|SLA/i.test(event.text)),
    events.some(isApplicationWriteEvent),
  ]);
  const steps = [
    { label: "连接邮箱", done: events.some((event) => event.type === "command" || event.type === "message") || taskStatus !== "queued" },
    { label: "搜索面试/HR/投递关键词", done: events.some((event) => event.type === "message" && /mailbox|邮箱|搜索|面试|投递|HR/i.test(event.text)) },
    { label: "过滤广告和无关通知", done: events.some((event) => event.type === "message" && /过滤|排除|无关|newsletter|pricing|SLA/i.test(event.text)) },
    { label: "写入投递进度", done: events.some(isApplicationWriteEvent) },
  ];
  return (
    <div className={`mailbox-agent-progress is-${taskStatus}`}>
      <div className="mailbox-agent-head">
        <span className={active ? "mailbox-agent-spinner" : "mailbox-agent-dot"} aria-hidden="true" />
        <div>
          <strong>{mailboxTaskStatusLabel(taskStatus)}</strong>
          <p>{active ? "正在检索已连接邮箱，命中后会自动更新这里。" : "邮箱检索任务已结束。"}</p>
        </div>
      </div>
      <ol className="mailbox-agent-steps" aria-label="邮箱搜索执行过程">
        {steps.map((step, index) => (
          <li className={step.done ? "is-done" : active && index === activeStepIndex ? "is-active" : ""} key={step.label}>
            <span>{index + 1}</span>
            <p>{step.label}</p>
          </li>
        ))}
      </ol>
      <div className="mailbox-agent-log">
        <strong>执行日志</strong>
        {!active && !events.some(isApplicationWriteEvent) ? (
          <p className="mailbox-agent-warning">已识别邮件，但还没有检测到真实写入记录。请重新执行写入。</p>
        ) : null}
        {latestEvents.length ? (
          latestEvents.map((event, index) => (
            <p key={`${event.createdAt}-${index}`}>{agentEventSummary(event)}</p>
          ))
        ) : (
          <p>任务已创建，等待 Agent 返回第一条执行日志...</p>
        )}
      </div>
    </div>
  );
}

function isApplicationWriteEvent(event: AgentEvent): boolean {
  if (event.type === "file_change") return /application-events\.jsonl|applications\.md|投递/.test(`${event.path} ${event.summary || ""}`);
  if (event.type !== "message") return false;
  return /UC_TOOL_RESULT[\s\S]{0,120}applications\.create_event|applications\.create_event[\s\S]{0,120}event_id/i.test(event.text);
}

function stepsFirstPendingIndex(doneFlags: boolean[]): number {
  const index = doneFlags.findIndex((done) => !done);
  return index >= 0 ? index : doneFlags.length - 1;
}

function mailboxTaskStatusLabel(status: AgentTask["status"]): string {
  return ({
    queued: "等待 Agent 开始检索",
    running: "Agent 正在找邮件",
    waiting_approval: "等待确认权限",
    completed: "邮箱检索完成",
    failed: "邮箱检索失败",
    cancelled: "邮箱检索已取消",
  } as Record<AgentTask["status"], string>)[status] || "邮箱检索中";
}

function agentEventSummary(event: AgentEvent): string {
  if (event.type === "message") return trimEventText(event.text);
  if (event.type === "command") return `执行命令：${event.status}`;
  if (event.type === "file_change") return event.summary || "已更新本地投递记录";
  if (event.type === "approval_request") return `等待审批：${event.approval.summary}`;
  if (event.type === "task_status") return `任务状态：${mailboxTaskStatusLabel(event.status)}`;
  if (event.type === "error") return `错误：${event.message}`;
  return "任务正在执行";
}

function trimEventText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function pickProgressMessage(messages: EmailMessageSummary[]): EmailMessageSummary | null {
  const ranked = messages
    .map((message) => ({ message, score: scoreProgressMessage(message) }))
    .filter((item) => item.score >= 3)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.message || null;
}

function scoreProgressMessage(message: EmailMessageSummary): number {
  const text = `${message.from} ${message.subject} ${message.snippet}`;
  const hasRecruitmentContext = /招聘|HR|人事|recruit(?:er|ing|ment)?|talent|hiring?|猎聘|BOSS|直聘|智联|飞书招聘|mail\.hire|career(?:s)?\b|职位|岗位|应聘/i.test(text);
  const hasOfferSignal = /录用|发放意向|offer\s+(?:letter|received|from)|job offer/i.test(text) || (hasRecruitmentContext && /\boffer\b/i.test(text));
  const hasStrongEventSignal = hasOfferSignal || /面试|邀约|预约|interview|invitation|测评|笔试|assessment|拒绝|不合适|unfortunately|rejected|投递|申请|简历|已收到|applied|application\s+(?:received|submitted|status)/i.test(text);
  const isNoise = /newsletter|pricing|SLA|startup|webinar|news for startups|events for startups|object storage|GPU pricing|discount|savings|free calls|limited time|anniversary|sampling|featured products|github|run failed|notifications@github|community|marketing|活动通知|新闻订阅|订阅|账单|发票|验证码/i.test(text);
  if (!hasStrongEventSignal) return 0;
  if (!hasRecruitmentContext && isNoise) return 0;
  if (!hasRecruitmentContext && !/面试|邀约|interview|invitation|录用|拒绝|不合适/i.test(text)) return 0;
  let score = 0;
  if (/面试|邀约|预约|interview|invitation/i.test(text)) score += 4;
  if (hasOfferSignal) score += 4;
  if (/测评|笔试|assessment/i.test(text)) score += 3;
  if (/拒绝|不合适|unfortunately|rejected/i.test(text)) score += 3;
  if (/投递|申请|简历|已收到|applied|application\s+(?:received|submitted|status)/i.test(text)) score += 2;
  if (hasRecruitmentContext) score += 2;
  if (isNoise) score -= 4;
  return score;
}

function emailMessageToText(message: EmailMessageSummary): string {
  return [
    `Subject: ${message.subject || ""}`,
    `From: ${message.from || ""}`,
    `Date: ${message.date || ""}`,
    "",
    message.snippet || "",
  ].join("\n");
}

function extractCompanyFromEmail(text: string, from: string): string {
  const explicit = text.match(/(?:公司|Company)[：:]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return explicit;
  const companyBeforeInvite = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,32})(?:邀请|邀您|通知您|感谢您|已收到)/)?.[1]?.trim();
  if (companyBeforeInvite) return companyBeforeInvite;
  const displayName = from.replace(/<[^>]+>/g, "").replace(/recruiting|talent|hr|招聘|人事/gi, "").trim();
  return displayName;
}

function extractRoleFromEmail(text: string, subject: string): string {
  const explicit = text.match(/(?:岗位|职位|Role|Position)[：:]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return explicit;
  const subjectRole = subject.match(/(?:关于|应聘|申请|面试|邀约|Interview invitation for)\s*[-：:]?\s*([^\n|，,]+)/i)?.[1]?.trim();
  return subjectRole || "";
}

function normalizeEmailDate(value: string): string {
  if (!value) return "";
  const direct = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, "0")}-${String(direct[3]).padStart(2, "0")}`;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventLabel(event: string) {
  return ({
    applied: "已投递",
    application_received: "已投递",
    responded: "已回复",
    assessment: "测评",
    interview: "面试中",
    offer: "Offer",
    rejected: "已拒绝",
    discarded: "已放弃",
    skip: "不投",
    note: "备注",
    evaluated: "已评估",
  } as Record<string, string>)[event] || event || "备注";
}

function PipelineEventDetail({ selected, onClose }: { selected: NonNullable<SelectedPipelineEvent>; onClose(): void }) {
  const { event } = selected;
  if (event.email_snapshot) {
    return (
      <aside className="application-event-detail application-email-detail" aria-label="原邮件信息">
        <div className="application-event-detail-head">
          <h3>原邮件信息</h3>
          <button type="button" className="secondary compact-button" onClick={onClose}>关闭</button>
        </div>
        <div className="application-email-full">
          <div className="application-email-meta">
            <p className="is-subject"><strong>主题</strong><span>{event.email_snapshot.subject || "未记录"}</span></p>
            <p><strong>发件人</strong><span>{event.email_snapshot.from || "未记录"}</span></p>
            <p><strong>时间</strong><span>{event.email_snapshot.date || event.date || "未记录"}</span></p>
            <p><strong>邮箱</strong><span>{[event.email_snapshot.account, event.email_snapshot.mailbox].filter(Boolean).join(" / ") || "未记录"}</span></p>
          </div>
          {event.email_snapshot.attachments?.length ? (
            <div className="application-email-attachments">
              <strong>附件</strong>
              {event.email_snapshot.attachments.map((attachment) => (
                <span key={`${attachment.filename}-${attachment.path || attachment.size}`}>
                  {attachment.filename}
                  {attachment.path ? <small>{attachment.path}</small> : null}
                </span>
              ))}
            </div>
          ) : null}
          <pre>{event.email_snapshot.rawText || event.email_snapshot.snippet || event.note || "未记录邮件正文"}</pre>
        </div>
      </aside>
    );
  }

  return (
    <aside className="application-event-detail" aria-label="投递节点详情">
      <div className="application-event-detail-head">
        <div>
          <span>{eventLabel(event.event)}</span>
          <h3>{event.next_action || "事件记录"}</h3>
          <p>{event.due || event.date || "时间待确认"}</p>
        </div>
        <button type="button" className="secondary compact-button" onClick={onClose}>关闭</button>
      </div>
      <dl>
        <div><dt>来源</dt><dd>{sourceLabel(event.source)}</dd></div>
        <div><dt>详情</dt><dd>{event.note || event.evidence || "暂无详情"}</dd></div>
      </dl>
    </aside>
  );
}

function ApplicationStageTrack({
  events,
  onSelectEvent,
}: {
  events: NonNullable<ApplicationsOverview["applications"][number]["events"]>;
  onSelectEvent(event: ApplicationProgressEvent, label: string): void;
}) {
  const stages = buildApplicationStages(events);
  return (
    <ol
      className="application-stage-track"
      aria-label="投递阶段"
      style={{ "--application-stage-count": stages.length } as CSSProperties}
    >
      {stages.map((stage) => (
        <li className={stage.active ? "is-active" : ""} data-state={stage.state} key={stage.key}>
          {stage.event ? (
            <button type="button" onClick={() => {
              if (stage.event) onSelectEvent(stage.event, stage.label);
            }}>
              <span>{stage.label}</span>
              {stage.date ? <small>{stage.date}</small> : null}
            </button>
          ) : (
            <span>{stage.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function buildApplicationStages(events: NonNullable<ApplicationsOverview["applications"][number]["events"]>) {
  const sorted = [...events].sort((a, b) => String(a.date || a.created_at).localeCompare(String(b.date || b.created_at)));
  const interviewEvents = sorted.filter((event) => event.event === "interview");
  const offer = sorted.find((event) => event.event === "offer");
  const failed = [...sorted].reverse().find((event) => ["rejected", "discarded", "skip"].includes(event.event));
  const applied = sorted.find((event) => ["applied", "application_received"].includes(event.event));
  const base = [
    { key: "applied", label: "投递", state: "applied", active: true, date: eventDate(applied), event: applied },
    ...buildInterviewStages(interviewEvents),
  ];
  if (failed) return [...base, { key: "failed", label: "不通过", state: "failed", active: true, date: eventDate(failed), event: failed }];
  return [...base, { key: "offer", label: "Offer", state: "offer", active: Boolean(offer), date: eventDate(offer), event: offer }];
}

function buildInterviewStages(events: NonNullable<ApplicationsOverview["applications"][number]["events"]>) {
  const labels = ["一轮", "二轮", "三轮", "四轮", "五轮", "六轮"];
  return events.map((event, index) => ({
    key: `interview-${index + 1}`,
    label: labels[index] || `${index + 1}轮`,
    state: "interview",
    active: true,
    date: eventDate(event),
    event,
  }));
}

function eventDate(event?: NonNullable<ApplicationsOverview["applications"][number]["events"]>[number]) {
  return event?.due || event?.date || "";
}

function normalizeStatusClass(statusKey: string) {
  return String(statusKey || "note").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "note";
}

function sourceLabel(source: string) {
  return ({
    qq_email_agent: "QQ 邮箱 / Agent",
    agent_tool: "Agent",
    manual_import: "手动导入",
  } as Record<string, string>)[source] || source || "未知来源";
}
