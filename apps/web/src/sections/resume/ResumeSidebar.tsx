import type { AgentEvent, AgentTask, AgentTaskTurn, MarketJob, ResumeDiagnosisReport, ResumeDocument, ResumeSummary } from "@ucareer/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function formatJobLabel(job: MarketJob) {
  const company = job.company || "待确认公司";
  const role = job.role || "待确认岗位";
  const score = typeof job.matchScore === "number" ? ` · ${job.matchScore.toFixed(1)}` : "";
  return `${company} - ${role}${score}`;
}

export function formatResumeDisplayTitle(title: string) {
  const cleaned = String(title || "")
    .replace(/^[\u4e00-\u9fa5]{2,4}\s*[-—–]\s*/, "")
    .trim();
  if (!cleaned) return "简历-未命名-通用";
  if (cleaned.startsWith("简历-")) return cleaned;
  return `简历-${cleaned}-通用`;
}

function formatResumeListTitle(resume: ResumeSummary) {
  const base = String(resume.title || "")
    .replace(/^[\u4e00-\u9fa5]{2,4}\s*[-—–]\s*/, "")
    .trim() || "未命名";
  if (base.startsWith("简历-")) return base;
  if (resume.targetJobTitle) {
    const [company = "", ...roleParts] = resume.targetJobTitle.split(" · ");
    const role = roleParts.join(" · ") || base;
    return `简历-${compactResumeNamePart(role)}-${compactResumeNamePart(company || "岗位定制")}`;
  }
  return `简历-${compactResumeNamePart(base)}-通用`;
}

export function ResumeFileList({
  onSearchChange,
  onSelectResume,
  onTypeFilterChange,
  resumes,
  search,
  selectedFile,
  typeFilter,
}: {
  onSearchChange(value: string): void;
  onSelectResume(file: string): void;
  onTypeFilterChange(value: string): void;
  resumes: ResumeSummary[];
  search: string;
  selectedFile: string;
  typeFilter: string;
}) {
  const normalizedSearch = normalizeFilterText(search);
  const typeOptions = [
    { value: "", label: "全部简历" },
    { value: "base", label: "基础简历" },
    { value: "generated", label: "自动生成" },
    { value: "targeted", label: "岗位定制" },
  ];
  const filteredResumes = resumes.filter((resume) => {
    if (typeFilter && resumeType(resume) !== typeFilter) return false;
    if (!normalizedSearch) return true;
    return normalizeFilterText([resume.title, resume.file, resume.targetJobTitle].join(" ")).includes(normalizedSearch);
  });

  useEffect(() => {
    if (!filteredResumes.length) return;
    if (filteredResumes.some((resume) => resume.file === selectedFile)) return;
    onSelectResume(filteredResumes[0]?.file || "");
  }, [filteredResumes, onSelectResume, selectedFile]);

  if (!resumes.length) return <p className="resume-side-empty">暂无简历文件。</p>;

  return (
    <>
      <div className="resume-list-filters">
        <input
          aria-label="搜索简历"
          className="resume-list-search"
          value={search}
          type="search"
          placeholder="搜索简历"
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <ResumeInlineSelect
          ariaLabel="按简历类型筛选"
          value={typeFilter}
          options={typeOptions}
          onChange={onTypeFilterChange}
        />
      </div>
      <div className="resume-side-list">
        {filteredResumes.slice(0, 12).map((resume) => (
          <button
            type="button"
            className={resume.file === selectedFile ? "is-active" : ""}
            key={resume.file}
            onClick={() => onSelectResume(resume.file)}
          >
            <strong>{formatResumeListTitle(resume)}</strong>
            <span>{resumeDisplayMeta(resume)}</span>
          </button>
        ))}
        {!filteredResumes.length ? <p className="resume-side-empty">没有符合筛选的简历。</p> : null}
      </div>
    </>
  );
}

export function ResumeDiagnosis({
  diagnosisStatus,
  diagnosisTask,
  document,
  events,
  job,
  onRerun,
  reports = [],
  resume,
  turns,
}: {
  diagnosisStatus?: string;
  diagnosisTask?: AgentTask | null;
  document: ResumeDocument | null;
  events?: AgentEvent[];
  job: MarketJob | null;
  onRerun?: () => void;
  reports?: ResumeDiagnosisReport[];
  resume: ResumeSummary | null;
  turns?: AgentTaskTurn[];
}) {
  const title = formatResumeDisplayTitle(document?.title || resume?.title || "未选择简历");
  const target = resume?.targetJobTitle || (job ? [job.company, job.role].filter(Boolean).join(" · ") : "");
  const latestTurn = turns?.at(-1) || null;
  const answer = latestTurn?.answer?.text || "";
  const processEvents = (latestTurn?.processEvents?.length ? latestTurn.processEvents : (events || []))
    .filter(isProcessEvent);
  const activeStatus = diagnosisTask?.status || "";
  const running = activeStatus === "queued" || activeStatus === "running" || activeStatus === "waiting_approval";
  return (
    <div className="resume-direction-clues">
      <section className="resume-diagnosis-focus">
        <strong>{title}</strong>
      </section>
      <section className="resume-diagnosis-focus">
        <strong>{target || "未绑定岗位"}</strong>
        {job?.direction ? <p>{job.direction}</p> : <p>基础简历会按简历内容诊断；岗位定制简历会读取绑定岗位信号。</p>}
      </section>
      <section className="resume-diagnosis-actions">
        {diagnosisTask ? (
          <>
            <div className={running ? "resume-agent-diagnosis-status is-running" : "resume-agent-diagnosis-status"}>
              <span>{running ? "诊断中" : taskStatusLabel(activeStatus)}</span>
              <b>{diagnosisStatus || taskStatusDescription(activeStatus)}</b>
            </div>
            <div className="resume-agent-result">
              <div className="resume-agent-result-actions">
                {onRerun ? (
                  <button type="button" disabled={running} onClick={onRerun}>
                    重新诊断
                  </button>
                ) : null}
              </div>
              {answer ? <p>{compactAnswer(answer)}</p> : <p>正在生成诊断结果，完成后会显示在这里。</p>}
            </div>
            {processEvents.length ? (
              <div className="resume-agent-process">
                <h3>执行过程</h3>
                <ul>
                  {processEvents.slice(-5).map((event, index) => (
                    <li key={`${event.createdAt}-${index}`}>{formatAgentEvent(event)}</li>
                  ))}
                </ul>
              </div>
            ) : running ? <p className="resume-agent-process-empty">正在等待执行事件...</p> : null}
          </>
        ) : (
          <>
            {reports.length ? (
              <div className="resume-agent-result">
                <div className="resume-agent-result-actions">
                  {onRerun ? (
                    <button type="button" onClick={onRerun}>
                      重新诊断
                    </button>
                  ) : null}
                </div>
                <ResumeDiagnosisReportCard report={reports[0]} />
              </div>
            ) : (
              <>
                <h3>优先强化</h3>
                <ul>
                  {diagnosisActions(job, document).map((item) => <li key={item}>{item}</li>)}
                </ul>
                {onRerun ? (
                  <button type="button" className="resume-diagnosis-primary-action" onClick={onRerun}>
                    开始诊断
                  </button>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ResumeDiagnosisReportCard({ report }: { report: ResumeDiagnosisReport | undefined }) {
  if (!report) return <p>暂无诊断报告。</p>;
  const markdown = stripDiagnosisTechnicalDetails(report.markdown || report.excerpt || "");
  const summary = summarizeDiagnosisMarkdown(markdown);
  return (
    <div className="resume-diagnosis-report-card">
      <time className="resume-diagnosis-card-time">更新 {formatReportTime(report.updatedAt)}</time>
      {summary.conclusion ? <p className="resume-diagnosis-summary">{summary.conclusion}</p> : null}
      {summary.metrics.length ? (
        <dl className="resume-diagnosis-metrics">
          {summary.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{renderInlineMarkdown(metric.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {summary.sections.length ? (
        <div className="resume-diagnosis-insights">
          {summary.sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {markdown ? (
        <details className="resume-diagnosis-details">
          <summary>查看完整报告</summary>
          <div className="resume-diagnosis-report-full" aria-label="完整诊断报告">
            {renderDiagnosisMarkdown(markdown)}
          </div>
        </details>
      ) : <p>已生成诊断报告。</p>}
    </div>
  );
}

type DiagnosisSummarySection = { title: string; items: string[] };

function summarizeDiagnosisMarkdown(markdown: string): {
  conclusion: string;
  metrics: Array<{ label: string; value: string }>;
  sections: DiagnosisSummarySection[];
  title: string;
} {
  const lines = String(markdown || "").split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() || "";
  const sections = splitDiagnosisSections(lines);
  const conclusionLines = sections.get("一、结论") || sections.get("结论") || [];
  const metrics = conclusionLines
    .map((line) => line.match(/^[-*]\s+\*\*(.+?)：\*\*\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .slice(0, 3)
    .map((match) => ({ label: match[1] || "", value: match[2] || "" }));
  const conclusion = conclusionLines
    .filter((line) => line.trim() && !/^[-*]\s+\*\*/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .join("")
    .slice(0, 148);
  const selectedSections: DiagnosisSummarySection[] = [
    buildDiagnosisSection("主要问题", sections.get("二、主要问题") || sections.get("主要问题") || [], 3),
    buildDiagnosisSection("修改优先级", sections.get("三、修改优先级（建议）") || sections.get("修改优先级（建议）") || [], 4),
    buildDiagnosisSection("证据缺口", sections.get("四、证据缺口（硬约束）") || sections.get("证据缺口（硬约束）") || [], 4),
    buildDiagnosisSection("下一步", sections.get("七、建议下一步") || sections.get("建议下一步") || [], 3),
  ].filter((section) => section.items.length);
  return { conclusion, metrics, sections: selectedSections.slice(0, 3), title };
}

function splitDiagnosisSections(lines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1]?.trim() || "";
      sections.set(current, []);
      continue;
    }
    if (!current || /^#\s+/.test(line)) continue;
    sections.get(current)?.push(line);
  }
  return sections;
}

function buildDiagnosisSection(title: string, lines: string[], limit: number): DiagnosisSummarySection {
  const items = lines
    .map(normalizeDiagnosisListLine)
    .filter(Boolean)
    .filter((line) => !/^原句：|^建议：|^改写原因：/.test(line))
    .slice(0, limit);
  return { title, items };
}

function normalizeDiagnosisListLine(line: string): string {
  return line
    .replace(/^\d+\.\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\*\*(.+?)\*\*$/, "$1")
    .trim();
}

function stripDiagnosisTechnicalDetails(markdown: string): string {
  return String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*[-*]?\s*\*\*(诊断文件|报告文件|简历文件|目标岗位|目标薪资\/地址|诊断时间|Resume|Target Job|Generated At):\*\*/i.test(line))
    .filter((line) => !/workspace\/resumes\/(diagnostics|library)\//i.test(line))
    .join("\n")
    .trim();
}

function renderDiagnosisMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushList = () => {
    if (!listItems.length) return;
    const items = listItems;
    listItems = [];
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {items.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>,
    );
  };
  const flushCode = () => {
    if (!codeLines.length) return;
    const content = codeLines.join("\n");
    codeLines = [];
    nodes.push(<pre key={`code-${nodes.length}`}>{content}</pre>);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1]?.length || 2, 4);
      const content = renderInlineMarkdown(heading[2] || "");
      if (level === 1) nodes.push(<h1 key={`heading-${nodes.length}`}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={`heading-${nodes.length}`}>{content}</h2>);
      else if (level === 3) nodes.push(<h3 key={`heading-${nodes.length}`}>{content}</h3>);
      else nodes.push(<h4 key={`heading-${nodes.length}`}>{content}</h4>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1] || "");
      continue;
    }
    flushList();
    nodes.push(<p key={`paragraph-${nodes.length}`}>{renderInlineMarkdown(line)}</p>);
  }
  flushList();
  flushCode();
  return nodes;
}

function renderInlineMarkdown(value: string) {
  const parts = String(value || "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={`${part}-${index}`}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function taskStatusLabel(status: string): string {
  return ({
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    waiting_approval: "待审批",
    running: "诊断中",
    queued: "排队中",
  } as Record<string, string>)[status] || "待诊断";
}

function taskStatusDescription(status: string): string {
  if (status === "completed") return "诊断已完成";
  if (status === "failed") return "诊断失败，请查看执行过程";
  if (status === "waiting_approval") return "等待审批后继续执行";
  if (status === "cancelled") return "诊断已取消";
  return "Agent 正在诊断当前简历";
}

function isProcessEvent(event: AgentEvent): boolean {
  return event.type === "command"
    || event.type === "file_change"
    || event.type === "approval_request"
    || event.type === "task_status"
    || event.type === "error";
}

function formatAgentEvent(event: AgentEvent): string {
  if (event.type === "command") return `${event.status === "done" ? "完成" : event.status === "failed" ? "失败" : "执行"}：${event.command}`;
  if (event.type === "file_change") return `文件变更：${event.path}`;
  if (event.type === "approval_request") return "等待执行审批";
  if (event.type === "task_status") return taskStatusLabel(event.status);
  if (event.type === "error") return event.message;
  return "正在处理";
}

function compactAnswer(value: string, limit = 220): string {
  const compact = String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\-[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function formatReportTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diagnosisActions(job: MarketJob | null, document: ResumeDocument | null): string[] {
  const actions = [job?.evidenceGap, job?.fitReason].filter(Boolean).map(String);
  if (actions.length) return actions;
  if (!document) return ["先在“简历列表”选择一份简历，再查看诊断。"];
  return [
    "基础简历未绑定具体岗位，建议先选择岗位生成定制版，再看 JD 对齐诊断。",
    "当前诊断按简历文本信号识别，重点检查项目顺序、关键词密度和可验证证据。",
  ];
}

function ResumeInlineSelect({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className={open ? "resume-inline-select is-open" : "resume-inline-select"}>
      <button
        type="button"
        className="resume-inline-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || "请选择"}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      {open ? (
        <div className="resume-inline-select-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value || "all"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function resumeType(resume: ResumeSummary): string {
  if (/auto-generated|generated/i.test(resume.file)) return "generated";
  if (resume.targetJobId || resume.targetJobTitle) return "targeted";
  return "base";
}

function resumeDisplayMeta(resume: ResumeSummary): string {
  const type = resumeType(resume);
  if (resume.targetJobTitle) return "岗位定制";
  if (type === "generated") return "自动生成 · 待绑定岗位";
  if (type === "targeted") return "岗位定制";
  return "基础简历";
}

function compactResumeNamePart(value: string): string {
  return String(value || "")
    .replace(/[【】[\]（）()]/gu, " ")
    .replace(/\s+/gu, "")
    .replace(/[\\/|:*?"<>]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32) || "通用";
}

function normalizeFilterText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[（）()【】[\]_\s-]+/g, "");
}
