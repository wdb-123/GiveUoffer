import type { EvidenceRequestsOverview } from "@ucareer/shared";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";

type ReviewField = {
  id: string;
  label: string;
  placeholder: string;
};

type ReviewTemplate = {
  id: string;
  name: string;
  description: string;
  fields: ReviewField[];
  custom?: boolean;
};

const DEFAULT_REVIEW_TEMPLATES: ReviewTemplate[] = [
  {
    id: "funnel",
    name: "求职漏斗复盘",
    description: "适合分析简历命中、投递反馈、面试推进率。",
    fields: [
      { id: "stuck", label: "卡在哪", placeholder: "例如：投递后无回应 / HR 后无推进 / 技术面后被拒。" },
      { id: "reason", label: "为什么卡", placeholder: "写最可能的 1-2 个原因：方向、证据、关键词、表达、薪资或动机。" },
      { id: "next", label: "下一步做什么", placeholder: "写一个可执行动作：改哪段简历、补哪条证据、复投几个岗位。" },
      { id: "signal", label: "怎么验证", placeholder: "例如：新版简历投 3 个同类岗位，看 7 天内是否有回应。" },
    ],
  },
  {
    id: "star",
    name: "STAR 面试复盘",
    description: "适合复盘面试回答、项目讲述和追问表现。",
    fields: [
      { id: "question", label: "被问到什么", placeholder: "记录原问题或追问。" },
      { id: "answer", label: "当时怎么答", placeholder: "简要还原你的回答，不需要美化。" },
      { id: "gap", label: "缺了什么", placeholder: "缺背景、任务、动作、结果、指标、取舍，还是反思？" },
      { id: "rewrite", label: "下次怎么答", placeholder: "写成一版更清楚的 STAR 回答。" },
    ],
  },
  {
    id: "five-whys",
    name: "5 Whys 根因分析",
    description: "适合连续受挫时挖真实原因，避免只改表面问题。",
    fields: [
      { id: "problem", label: "问题现象", placeholder: "例如：AI/RAG 岗位连续 5 次无面试。" },
      { id: "why1", label: "为什么 1", placeholder: "第一层原因。" },
      { id: "why2", label: "为什么 2", placeholder: "继续追问上一层原因。" },
      { id: "root", label: "根因判断", placeholder: "最终认为最值得处理的根因是什么？" },
      { id: "fix", label: "修复动作", placeholder: "用一个最小动作验证根因是否成立。" },
    ],
  },
  {
    id: "weekly-experiment",
    name: "周复盘实验",
    description: "适合每周固定复盘，把求职当成可验证实验。",
    fields: [
      { id: "hypothesis", label: "本周假设", placeholder: "例如：机器人数据基建方向比通用 Agent 岗更容易命中。" },
      { id: "actions", label: "做了什么", placeholder: "投递数量、简历版本、联系动作、面试准备。" },
      { id: "result", label: "结果信号", placeholder: "回应、拒信、面试反馈、无回应、岗位质量变化。" },
      { id: "decision", label: "下周调整", placeholder: "继续、停止、加码或换方向。" },
    ],
  },
];

interface EvidenceSectionProps {
  evidenceRequests: EvidenceRequestsOverview | null;
  onFulfillEvidence(requestId: string, content: string): void;
}

export function EvidenceSection({ evidenceRequests, onFulfillEvidence }: EvidenceSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const defaultReviewTemplate = DEFAULT_REVIEW_TEMPLATES[0] as ReviewTemplate;
  const [activeTemplateId, setActiveTemplateId] = useState(defaultReviewTemplate.id);
  const [customTemplates, setCustomTemplates] = useState<ReviewTemplate[]>(() => loadCustomTemplates());
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [isIssueMenuOpen, setIsIssueMenuOpen] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplateFields, setCustomTemplateFields] = useState("卡在哪\n为什么卡\n下一步做什么");
  const requests = evidenceRequests?.requests || [];
  const highPriority = requests.filter((request) => request.priority === "high");
  const openRequests = requests.filter((request) => request.status === "open");
  const prioritizedRequests = [...requests].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const issueOptions = prioritizedRequests.slice(0, 12);
  const selectedRequest = issueOptions.find((request) => request.id === selectedId) || issueOptions[0];
  const reviewTemplates = useMemo(() => [...DEFAULT_REVIEW_TEMPLATES, ...customTemplates], [customTemplates]);
  const activeTemplate = reviewTemplates.find((template) => template.id === activeTemplateId) || defaultReviewTemplate;
  const directionCount = new Set(requests.map((request) => request.direction)).size;
  const completionRate = Math.round(((requests.length - openRequests.length) / Math.max(requests.length, 1)) * 100);

  useEffect(() => {
    window.localStorage.setItem("ucareer.reviewTemplates", JSON.stringify(customTemplates));
  }, [customTemplates]);

  function answerKey(fieldId: string): string {
    return `${activeTemplate.id}:${selectedRequest?.id || "general"}:${fieldId}`;
  }

  function createCustomTemplate() {
    const name = customTemplateName.trim();
    const fields = customTemplateFields
      .split(/\r?\n/)
      .map((field) => field.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!name || fields.length === 0) return;
    const template: ReviewTemplate = {
      id: `custom-${Date.now()}`,
      name,
      description: "自建复盘模板",
      custom: true,
      fields: fields.map((field, index) => ({
        id: `field-${index + 1}`,
        label: field,
        placeholder: `填写${field}`,
      })),
    };
    setCustomTemplates((current) => [...current, template]);
    setActiveTemplateId(template.id);
    setCustomTemplateName("");
    setShowTemplateBuilder(false);
  }

  function saveReview() {
    if (!selectedRequest) return;
    const content = [
      `# ${activeTemplate.name}`,
      "",
      `关联卡点：${selectedRequest.direction} (${selectedRequest.id})`,
      `缺口：${selectedRequest.gap}`,
      "",
      ...activeTemplate.fields.flatMap((field) => [`## ${field.label}`, drafts[answerKey(field.id)] || ""]),
    ].join("\n");
    onFulfillEvidence(selectedRequest.id, content);
    setDrafts((current) => {
      const next = { ...current };
      activeTemplate.fields.forEach((field) => delete next[answerKey(field.id)]);
      return next;
    });
  }

  return (
    <div className="evidence-workspace">
      <Panel className="evidence-overview-panel evidence-brief-panel" variant="workbench">
        <div className="evidence-slim-title">
          <h2>复盘中心</h2>
        </div>
        {evidenceRequests ? (
          <div className="evidence-summary-strip">
            <div>
              <strong>{openRequests.length}</strong>
              <span>待处理</span>
            </div>
            <div>
              <strong>{highPriority.length}</strong>
              <span>影响邀约</span>
            </div>
            <div>
              <strong>{directionCount}</strong>
              <span>方向</span>
            </div>
            <div>
              <strong>{completionRate}%</strong>
              <span>修复率</span>
            </div>
          </div>
        ) : <p>证据请求未加载。</p>}
      </Panel>

      <Panel className="evidence-board-panel evidence-review-panel evidence-command-panel">
        <div className="evidence-command-grid">
          <section className="evidence-template-panel" aria-label="复盘模板">
            <SectionHeading title="复盘模板" meta={`${reviewTemplates.length} 套`} />
            <div className="evidence-template-dropdown">
              <button
                className="evidence-template-trigger"
                type="button"
                aria-expanded={isTemplateMenuOpen}
                onClick={() => setIsTemplateMenuOpen((current) => !current)}
              >
                <strong>{activeTemplate.name}</strong>
              </button>
              {isTemplateMenuOpen ? (
                <div className="evidence-template-menu" role="listbox">
                  {reviewTemplates.map((template) => (
                    <button
                      className={activeTemplate.id === template.id ? "evidence-template-option is-active" : "evidence-template-option"}
                      key={template.id}
                      type="button"
                      role="option"
                      aria-selected={activeTemplate.id === template.id}
                      onClick={() => {
                        setActiveTemplateId(template.id);
                        setIsTemplateMenuOpen(false);
                      }}
                    >
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="evidence-template-hint">
              <span>{activeTemplate.description}</span>
            </div>
            <button className="evidence-template-create" type="button" onClick={() => setShowTemplateBuilder((current) => !current)}>
              新建模板
            </button>
            {showTemplateBuilder ? (
              <div className="evidence-template-builder">
                <label>
                  模板名
                  <input value={customTemplateName} onChange={(event) => setCustomTemplateName(event.target.value)} placeholder="例如：终面复盘" />
                </label>
                <label>
                  字段列表
                  <textarea value={customTemplateFields} onChange={(event) => setCustomTemplateFields(event.target.value)} />
                </label>
                <button type="button" onClick={createCustomTemplate}>创建模板</button>
              </div>
            ) : null}
          </section>

          <section className="evidence-review-form-panel" aria-label="填写复盘">
            <div className="evidence-linked-picker">
              <div className="evidence-linked-picker-head">
                <strong>关联卡点</strong>
              </div>
              <div className="evidence-linked-dropdown">
                <button
                  className="evidence-linked-trigger"
                  type="button"
                  aria-expanded={isIssueMenuOpen}
                  onClick={() => setIsIssueMenuOpen((current) => !current)}
                >
                  <span>{selectedRequest ? priorityLabel(selectedRequest.priority) : "未选择"}</span>
                  <strong>{selectedRequest?.direction || "暂无可关联卡点"}</strong>
                  <small>{selectedRequest?.gap || "切换筛选条件后再选择。"}</small>
                </button>
                {isIssueMenuOpen ? (
                  <div className="evidence-linked-menu" role="listbox">
                    {issueOptions.map((request) => (
                      <button
                        className={selectedRequest?.id === request.id ? "evidence-linked-option is-active" : "evidence-linked-option"}
                        key={request.id}
                        type="button"
                        role="option"
                        aria-selected={selectedRequest?.id === request.id}
                        onClick={() => {
                          setSelectedId(request.id);
                          setIsIssueMenuOpen(false);
                        }}
                      >
                        <span>{priorityLabel(request.priority)}</span>
                        <strong>{request.direction}</strong>
                        <small>{request.gap}</small>
                      </button>
                    ))}
                    {!issueOptions.length ? <div className="evidence-linked-empty">暂无可关联卡点</div> : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="evidence-template-form">
              {activeTemplate.fields.map((field) => (
                <label key={field.id}>
                  {field.label}
                  <textarea
                    placeholder={field.placeholder}
                    value={drafts[answerKey(field.id)] || ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [answerKey(field.id)]: event.target.value }))}
                  />
                </label>
              ))}
            </div>

            <div className="evidence-form-actions">
              <button type="button" disabled={!selectedRequest} onClick={saveReview}>保存复盘</button>
              <span>{selectedRequest ? `保存到 ${selectedRequest.targetFile}` : "没有可保存的卡点"}</span>
            </div>
          </section>
        </div>
      </Panel>
    </div>
  );
}

function priorityLabel(priority: string): string {
  if (priority === "high") return "优先补";
  if (priority === "medium") return "建议补";
  if (priority === "low") return "可稍后";
  return "待复盘";
}

function priorityRank(priority: string): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  if (priority === "low") return 2;
  return 3;
}

function loadCustomTemplates(): ReviewTemplate[] {
  try {
    const value = window.localStorage.getItem("ucareer.reviewTemplates");
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
