import type { MarketJob, ResumeSummary } from "@ucareer/shared";
import { useEffect, useState } from "react";

export function formatJobLabel(job: MarketJob) {
  const company = job.company || "待确认公司";
  const role = job.role || "待确认岗位";
  const score = typeof job.matchScore === "number" ? ` · ${job.matchScore.toFixed(1)}` : "";
  return `${company} - ${role}${score}`;
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
            <strong>{resume.title}</strong>
            <span>{resume.file}</span>
          </button>
        ))}
        {!filteredResumes.length ? <p className="resume-side-empty">没有符合筛选的简历。</p> : null}
      </div>
    </>
  );
}

export function ResumeEditPanel({
  baseFile,
  previewReady,
  resumes,
  onBaseFileChange,
  onGeneratePreview,
  onSavePreview,
}: {
  baseFile: string;
  previewReady: boolean;
  resumes: ResumeSummary[];
  onBaseFileChange(file: string): void;
  onGeneratePreview(): void;
  onSavePreview(): void;
}) {
  return (
    <div className="resume-edit-panel">
      <label>
        基础简历
        <select value={baseFile} onChange={(event) => onBaseFileChange(event.target.value)}>
          {resumes.map((resume) => (
            <option key={resume.file} value={resume.file}>{resume.title}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onGeneratePreview}>生成岗位简历</button>
      <button type="button" className="secondary" disabled={!previewReady} onClick={onSavePreview}>保存预览</button>
    </div>
  );
}

export function ResumeDiagnosis({ job }: { job: MarketJob | null }) {
  const tags = (job?.keywords || []).slice(0, 6);
  return (
    <div className="resume-direction-clues">
      <section className="resume-diagnosis-focus">
        <h3>方向</h3>
        <strong>{job?.direction || job?.role || "目标岗位"}</strong>
      </section>
      <section className="resume-diagnosis-signals">
        <h3>JD 信号</h3>
        <div className="resume-clue-tags">
          {tags.length ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span>选择目标岗位后显示</span>}
        </div>
      </section>
      <section className="resume-diagnosis-actions">
        <h3>优先强化</h3>
        <ul>
          {[job?.evidenceGap, job?.fitReason].filter(Boolean).map((item) => <li key={String(item)}>{item}</li>)}
        </ul>
      </section>
    </div>
  );
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

function normalizeFilterText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[（）()【】[\]_\s-]+/g, "");
}
