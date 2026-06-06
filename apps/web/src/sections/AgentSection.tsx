import type {
  AgentEvent,
  AgentTask,
  ApprovalDecisionRequest,
  ApprovalRequest,
  ProviderInstallStatus,
  ProviderSummary,
} from "@offeru/shared";
import { useEffect, useRef, useState } from "react";
import type { AppView, ViewId } from "../views";

interface AgentSectionProps {
  providers: ProviderSummary[];
  installStatus: Record<string, ProviderInstallStatus>;
  selectedProvider: string;
  prompt: string;
  approvals: ApprovalRequest[];
  tasks: AgentTask[];
  selectedTaskId: string;
  selectedTaskEvents: AgentEvent[];
  workspaceViews: AppView[];
  onProviderChange(value: string): void;
  onPromptChange(value: string): void;
  onCheckProvider(providerId: string): void;
  onCreateTask(promptOverride?: string): void;
  onCreateLocalCommand(command: string, args: string): void;
  onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]): void;
  onSelectTask(taskId: string): void;
  onRefreshTaskEvents(): void;
  onPushSync(): void;
  onOpenView(viewId: ViewId): void;
}

export function AgentSection(props: AgentSectionProps) {
  const [localCommand, setLocalCommand] = useState("node");
  const [localArgs, setLocalArgs] = useState("-e \"console.log('offeru local command ok')\"");
  const [intakeText, setIntakeText] = useState("");
  const [localMessages, setLocalMessages] = useState<AgentChatMessage[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedProviderLabel = providerLabel(props.providers, props.selectedProvider);
  const intakeIntent = classifyIntake(intakeText);
  const intakePrompt = buildIntakePrompt(intakeText, intakeIntent);
  const recentTasks = props.tasks.slice(0, 4);
  const eventMessages = props.selectedTaskEvents.map(agentEventToMessage).filter((message): message is AgentChatMessage => Boolean(message));
  const visibleMessages = [...localMessages, ...eventMessages];

  useEffect(() => {
    function closeProviderMenu(event: MouseEvent) {
      if (!providerMenuRef.current?.contains(event.target as Node)) setProviderMenuOpen(false);
    }
    document.addEventListener("mousedown", closeProviderMenu);
    return () => document.removeEventListener("mousedown", closeProviderMenu);
  }, []);

  function sendIntake() {
    const text = intakeText.trim();
    if (!text) return;
    const sentAt = Date.now();
    setLocalMessages((current) => [
      ...current,
      { id: `local-user-${sentAt}`, role: "user", text },
      { id: `local-system-${sentAt}`, role: "system", text: `已交给 ${selectedProviderLabel}。如果需要审批或后台未连接，状态会显示在右上角或状态栏里。` },
    ]);
    props.onPromptChange(intakePrompt);
    props.onCreateTask(intakePrompt);
    setIntakeText("");
  }

  return (
    <div className={`agent-console ${inspectorOpen ? "has-inspector" : ""}`}>
      <section className="agent-thread-shell" aria-label="Agent 对话">
        <div className="agent-thread-header">
          <div className="agent-thread-tools">
            <span className="agent-provider-pill">{selectedProviderLabel}</span>
            <button type="button" className="secondary compact-button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>
              状态
            </button>
          </div>
        </div>

        <div className="agent-thread">
          <div className="agent-center-stack">
            {visibleMessages.length ? (
              <div className="agent-dialogue" aria-live="polite">
                {visibleMessages.map((message) => (
                  <article className={`agent-chat-bubble is-${message.role}`} key={message.id}>
                    <span>{messageRoleLabel(message.role)}</span>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="agent-empty-prompt">
                <h2>今天要推进哪个求职任务？</h2>
              </div>
            )}

            <div className="agent-composer">
              <textarea
                aria-label="输入给 Agent 的内容"
                placeholder="随心输入"
                value={intakeText}
                onChange={(event) => setIntakeText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendIntake();
                }}
              />
              <div className="agent-composer-actions">
                <div className="agent-composer-left">
                  <button type="button" className="agent-icon-button" aria-label="添加上下文">+</button>
                  <span className={`agent-intake-badge intent-${intakeIntent.kind}`}>{intakeIntent.label}</span>
                </div>
                <div className="agent-composer-right">
                  <div className="agent-provider-menu" ref={providerMenuRef}>
                    <button
                      type="button"
                      className="agent-provider-trigger"
                      aria-expanded={providerMenuOpen}
                      aria-haspopup="listbox"
                      onClick={() => setProviderMenuOpen((open) => !open)}
                    >
                      <span>{selectedProviderLabel}</span>
                      <b aria-hidden="true">⌄</b>
                    </button>
                    {providerMenuOpen ? (
                      <div className="agent-provider-options" role="listbox" aria-label="选择 AI 助手">
                        {props.providers.map((provider) => {
                          const selected = provider.id === props.selectedProvider;
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={selected ? "is-selected" : ""}
                              key={provider.id}
                              onClick={() => {
                                props.onProviderChange(provider.id);
                                setProviderMenuOpen(false);
                              }}
                            >
                              {provider.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!intakeText.trim()}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      sendIntake();
                    }}
                  >
                    发送给 Agent
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {inspectorOpen ? <aside className="agent-inspector" aria-label="Agent 状态栏">
        <section className="agent-inspector-block">
          <div className="agent-inspector-head">
            <strong>判断</strong>
            <span>{intakeIntent.confidence}</span>
          </div>
          <p>{intakeIntent.description}</p>
          <ul>
            {intakeIntent.nextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </section>

        <section className="agent-inspector-block">
          <div className="agent-inspector-head">
            <strong>审批</strong>
            <span>{props.approvals.length} 项</span>
          </div>
          {props.approvals.length === 0 ? <p>没有待确认动作。</p> : null}
          {props.approvals.map((approval) => (
            <article className="agent-rail-item" key={approval.id}>
              <strong>{approval.action}</strong>
              <p>{approval.summary}</p>
              <div className="agent-rail-actions">
                <button type="button" onClick={() => props.onDecideApproval(approval.id, "allow_once")}>允许</button>
                <button type="button" className="secondary" onClick={() => props.onDecideApproval(approval.id, "deny")}>拒绝</button>
              </div>
            </article>
          ))}
        </section>

        <section className="agent-inspector-block">
          <div className="agent-inspector-head">
            <strong>页面</strong>
            <span>{props.workspaceViews.length}</span>
          </div>
          <div className="agent-page-links">
            {props.workspaceViews.map((view) => (
              <button type="button" key={view.id} onClick={() => props.onOpenView(view.id)}>
                <span>{view.label}</span>
                <small>{workspaceViewCatalog[view.id].kind}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="agent-inspector-block">
          <div className="agent-inspector-head">
            <strong>任务</strong>
            <button type="button" className="secondary compact-button" onClick={props.onRefreshTaskEvents}>刷新</button>
          </div>
          {recentTasks.length === 0 ? <p>暂无任务记录。</p> : null}
          {recentTasks.map((task) => (
            <button
              type="button"
              className={`agent-task-link ${props.selectedTaskId === task.id ? "is-selected" : ""}`}
              key={task.id}
              onClick={() => props.onSelectTask(task.id)}
            >
              <span>{taskStatusLabel(task.status)}</span>
              <p>{task.prompt}</p>
            </button>
          ))}
        </section>

        <section className="agent-inspector-block">
          <div className="agent-inspector-head">
            <strong>助手</strong>
            <span>{props.providers.length} 个</span>
          </div>
          {props.providers.map((provider) => {
            const providerStatus = props.installStatus[provider.id];
            return (
              <article className="agent-provider-row" key={provider.id}>
                <div>
                  <strong>{provider.label}</strong>
                  <p>{providerStatus ? installLabel(providerStatus) : "尚未检测"}</p>
                </div>
                <button type="button" className="secondary compact-button" onClick={() => props.onCheckProvider(provider.id)}>
                  检测
                </button>
              </article>
            );
          })}
        </section>

        <details className="agent-rail-advanced">
          <summary>高级</summary>
          <label>
            命令
            <input value={localCommand} onChange={(event) => setLocalCommand(event.target.value)} />
          </label>
          <label>
            参数
            <input value={localArgs} onChange={(event) => setLocalArgs(event.target.value)} />
          </label>
          <button type="button" onClick={() => props.onCreateLocalCommand(localCommand, localArgs)}>创建审批</button>
          <button type="button" className="secondary" onClick={props.onPushSync}>同步记录</button>
        </details>
      </aside> : null}
    </div>
  );
}

interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}

function agentEventToMessage(event: AgentEvent): AgentChatMessage | null {
  if (event.type === "message") {
    return { id: `${event.createdAt}-${event.role}-${event.text}`, role: event.role, text: event.text };
  }
  if (event.type === "error") {
    return { id: `${event.createdAt}-error`, role: "system", text: event.message };
  }
  if (event.type === "task_status") {
    return { id: `${event.createdAt}-status`, role: "system", text: `任务状态：${taskStatusLabel(event.status)}` };
  }
  if (event.type === "command") {
    return { id: `${event.createdAt}-command`, role: "system", text: `命令 ${event.status}：${event.command}` };
  }
  if (event.type === "approval_request") {
    return { id: `${event.createdAt}-approval`, role: "system", text: `等待审批：${event.approval.summary}` };
  }
  if (event.type === "file_change") {
    return { id: `${event.createdAt}-file`, role: "system", text: event.summary || `文件变更：${event.path}` };
  }
  return null;
}

function messageRoleLabel(role: AgentChatMessage["role"]) {
  if (role === "user") return "你";
  if (role === "assistant") return "Agent";
  return "系统";
}

const workspaceViewCatalog: Record<ViewId, { kind: string; description: string; task: string }> = {
  agent: {
    kind: "中心",
    description: "统一入口、任务调度、审批和执行记录。",
    task: "回到中心控制台，帮我梳理当前最应该处理的求职任务。",
  },
  resumes: {
    kind: "文件显示器",
    description: "查看简历文件、预览生成结果和导出版本。",
    task: "检查我的简历库，告诉我哪些简历版本需要更新，以及下一步应该生成哪一版。",
  },
  experience: {
    kind: "资产编辑器",
    description: "查看和人工校对经历资产、项目文件与职业偏好。",
    task: "检查我的经历资产，找出可以补强简历和岗位匹配的项目证据缺口。",
  },
  market: {
    kind: "岗位显示器",
    description: "展示已收集岗位，供人工筛选和对照。",
    task: "根据当前岗位列表，筛出最值得优先投递的岗位，并说明匹配理由和风险。",
  },
  applications: {
    kind: "进度编辑器",
    description: "查看投递状态、面试事件和跟进记录。",
    task: "检查我的投递进度，整理需要跟进、需要准备和可以关闭的事项。",
  },
  evidence: {
    kind: "复盘编辑器",
    description: "整理证据缺口、复盘材料和后续补充动作。",
    task: "查看复盘中心，帮我把缺失证据按重要性排序，并给出补充计划。",
  },
};

function buildWorkspacePrompt(viewId: ViewId): string {
  const viewMeta = workspaceViewCatalog[viewId];
  return `你是 OfferU 中心控制台 Agent。${viewMeta.task}

要求：
1. 先读取相关页面背后的本地文件或当前数据。
2. 给出明确结论、优先级和下一步动作。
3. 需要写入文件、执行命令或同步时，先请求确认。
4. 不要直接提交任何外部申请。`;
}

type IntakeKind = "job" | "progress" | "project" | "general";

interface IntakeIntent {
  kind: IntakeKind;
  label: string;
  title: string;
  description: string;
  confidence: string;
  nextSteps: string[];
}

function classifyIntake(value: string): IntakeIntent {
  const text = value.trim().toLowerCase();
  if (!text) return intentCatalog.general;

  const jobScore = score(text, [
    "greenhouse.io", "ashbyhq.com", "lever.co", "workable.com", "smartrecruiters.com", "jobs.", "/jobs/",
    "careers", "职位", "岗位", "招聘", "jd", "responsibilities", "requirements", "qualifications", "薪资", "remote",
    "zhipin.com", "liepin.com", "lagou.com", "job", "career",
  ]);
  const progressScore = score(text, [
    "面试", "邀约", "邀请", "拒信", "不合适", "测评", "笔试", "offer", "录用", "投递", "已读", "回复",
    "interview", "application", "applied", "assessment", "rejected", "unfortunately", "next step", "recruiter", "hr",
  ]);
  const projectScore = score(text, [
    "github.com", "gitlab.com", "notion.so", "项目", "经历", "复盘", "证明", "证据", "demo", "repository", "readme",
    "portfolio", "case study", "architecture", "milestone", "prd", "roadmap", "项目经理", "项目管理",
  ]);

  if (jobScore >= progressScore && jobScore >= projectScore && jobScore > 0) return withConfidence(intentCatalog.job, jobScore);
  if (progressScore >= jobScore && progressScore >= projectScore && progressScore > 0) return withConfidence(intentCatalog.progress, progressScore);
  if (projectScore > 0) return withConfidence(intentCatalog.project, projectScore);
  return intentCatalog.general;
}

const intentCatalog: Record<IntakeKind, IntakeIntent> = {
  job: {
    kind: "job",
    label: "岗位信息",
    title: "进入岗位评估 / 岗位库流程",
    description: "适合处理 JD 链接、招聘平台链接、公司 careers 页面或岗位文本。",
    confidence: "待输入",
    nextSteps: ["抓取或读取岗位内容", "判断岗位匹配度和合法性", "生成评估任务，并在确认后写入岗位/报告流程"],
  },
  progress: {
    kind: "progress",
    label: "招聘进度",
    title: "进入投递进度解析流程",
    description: "适合处理投递回执、面试邀请、测评通知、HR 聊天记录或拒信。",
    confidence: "待输入",
    nextSteps: ["提取公司、岗位、事件类型和日期", "判断下一步动作和截止时间", "确认后写入投递事件"],
  },
  project: {
    kind: "project",
    label: "项目经历",
    title: "进入经历资产 / 证据补全流程",
    description: "适合处理项目链接、作品集、GitHub、项目笔记、复盘材料或项目管理经历。",
    confidence: "待输入",
    nextSteps: ["提取项目背景、角色、技术栈和成果", "整理可写入简历的证明点", "发现证据缺口并更新经历资产"],
  },
  general: {
    kind: "general",
    label: "待判断",
    title: "需要 Agent 先理解内容",
    description: "可以粘贴任意求职相关内容，Agent 会先分类再建议处理流程。",
    confidence: "等待输入",
    nextSteps: ["识别内容类型", "选择最合适的求职流程", "需要写入或执行时先请求确认"],
  },
};

function withConfidence(intent: IntakeIntent, scoreValue: number): IntakeIntent {
  const confidence = scoreValue >= 4 ? "高置信" : scoreValue >= 2 ? "中置信" : "低置信";
  return { ...intent, confidence };
}

function score(text: string, keywords: string[]): number {
  return keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function buildIntakePrompt(value: string, intent: IntakeIntent): string {
  const content = value.trim();
  return `你是 OfferU 求职工作台的统一入口 Agent。请按下面判断处理输入。

自动分类结果：${intent.label}
处理目标：${intent.title}

要求：
1. 先验证分类是否正确；如果不正确，说明你改判成什么类型。
2. 如果是岗位信息：读取链接或岗位文本，抽取公司、岗位、地点、薪资、JD 信号、匹配点、风险点，并准备进入岗位评估/岗位库流程。
3. 如果是招聘进度：抽取公司、岗位、事件类型、日期、下一步动作、截止时间和证据原文，并准备更新投递事件。
4. 如果是项目经历：抽取项目背景、我的角色、技术栈、可量化成果、可写入简历的证明点、证据缺口，并准备更新经历资产或复盘中心。
5. 不要直接提交任何外部申请；任何本地写入、命令执行或同步都必须先请求确认。

输入内容：
${content}`;
}

function providerLabel(providers: ProviderSummary[], providerId: string): string {
  return providers.find((provider) => provider.id === providerId)?.label || providerId;
}

function installLabel(status: ProviderInstallStatus): string {
  if (!status.installed) return "未检测到";
  return status.version ? `已连接 · ${status.version}` : "已连接";
}

function riskLabel(risk: string): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "需确认";
  if (risk === "low") return "低风险";
  return "需确认";
}

function taskStatusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "running") return "处理中";
  if (status === "blocked") return "等待确认";
  if (status === "failed") return "失败";
  if (status === "queued") return "排队中";
  return status;
}

function eventTypeLabel(type: string): string {
  if (type === "created") return "创建";
  if (type === "started") return "开始";
  if (type === "completed") return "完成";
  if (type === "approval_requested") return "请求确认";
  if (type === "approval_decided") return "确认结果";
  if (type === "output") return "输出";
  if (type === "error") return "错误";
  return type;
}
