import type { MarketJob, ResumeDocument, ResumeSummary } from "@ucareer/shared";
import { useEffect, useState } from "react";

export function formatJobLabel(job: MarketJob) {
  const company = job.company || "待确认公司";
  const role = job.role || "待确认岗位";
  const score = typeof job.matchScore === "number" ? ` · ${job.matchScore.toFixed(1)}` : "";
  return `${company} - ${role}${score}`;
}

export function formatResumeDisplayTitle(title: string) {
  return String(title || "")
    .replace(/^[\u4e00-\u9fa5]{2,4}\s*[-—–]\s*/, "")
    .trim() || title;
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
            <strong>{formatResumeDisplayTitle(resume.title)}</strong>
            <span>{resumeDisplayMeta(resume)}</span>
          </button>
        ))}
        {!filteredResumes.length ? <p className="resume-side-empty">没有符合筛选的简历。</p> : null}
      </div>
    </>
  );
}

export function ResumeDiagnosis({ resume, document, job }: { resume: ResumeSummary | null; document: ResumeDocument | null; job: MarketJob | null }) {
  const tags = (job?.keywords || []).slice(0, 6);
  const title = formatResumeDisplayTitle(document?.title || resume?.title || "未选择简历");
  const target = resume?.targetJobTitle || (job ? [job.company, job.role].filter(Boolean).join(" · ") : "");
  const resumeSignals = inferResumeSignals(document?.markdown || "");
  return (
    <div className="resume-direction-clues">
      <section className="resume-diagnosis-focus">
        <strong>{title}</strong>
      </section>
      <section className="resume-diagnosis-focus">
        <strong>{target || "未绑定岗位"}</strong>
        {job?.direction ? <p>{job.direction}</p> : <p>基础简历会按简历内容诊断；岗位定制简历会读取绑定岗位信号。</p>}
      </section>
      <section className="resume-diagnosis-signals">
        <h3>{job ? "JD 信号" : "简历信号"}</h3>
        <div className="resume-clue-tags">
          {tags.length
            ? tags.map((tag) => <span key={tag}>{tag}</span>)
            : resumeSignals.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </section>
      <section className="resume-diagnosis-actions">
        <h3>优先强化</h3>
        <ul>
          {diagnosisActions(job, document).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </div>
  );
}

function inferResumeSignals(markdown: string): string[] {
  const text = normalizeFilterText(markdown);
  const signals = [
    ["机器人", /机器人|ros|moveit|urdf|ethercat|canopen|sdk/.test(text)],
    ["AI / Agent", /agent|rag|openai|gpt|模型|多模态/.test(text)],
    ["数据工程", /pipeline|数据|标注|清洗|质检|仿真/.test(text)],
    ["工程交付", /demo|文档|faq|客户|交付|部署/.test(text)],
    ["系统调试", /调试|故障|定位|linux|csp|ethercat/.test(text)],
  ];
  return signals.filter(([, matched]) => matched).map(([label]) => String(label)).slice(0, 6);
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
          {options.filter((option) => option.value !== "").map((option) => (
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
  if (resume.targetJobTitle) return `岗位定制 · ${resume.targetJobTitle}`;
  if (type === "generated") return "自动生成 · 待绑定岗位";
  if (type === "targeted") return "岗位定制";
  return "基础简历";
}

function normalizeFilterText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[（）()【】[\]_\s-]+/g, "");
}
