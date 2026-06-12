import type {
  ExportResumeResult,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
} from "@ucareer/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { RenderedResumePage, ResumeEmptyState } from "./resume/ResumePreview";
import { ResumeDiagnosis, ResumeFileList, formatJobLabel, formatResumeDisplayTitle } from "./resume/ResumeSidebar";
import { paginateMarkdown } from "./resume/resumeMarkdown";

type ResumeSideView = "list" | "diagnosis" | "edit";
type ResumePageMode = "single" | "spread";
type ResumeMarginMode = "compact" | "standard" | "wide";

const RESUME_MARGIN_OPTIONS: Array<{ value: ResumeMarginMode; label: string; single: number; spread: number }> = [
  { value: "compact", label: "窄", single: 38, spread: 30 },
  { value: "standard", label: "标准", single: 46, spread: 34 },
  { value: "wide", label: "宽", single: 56, spread: 42 },
];
const DEFAULT_RESUME_MARGIN_OPTION = RESUME_MARGIN_OPTIONS[1] as (typeof RESUME_MARGIN_OPTIONS)[number];
const RESUME_EXPORT_FORMATS = ["pdf", "docx", "md"] as const satisfies readonly ResumeExportFormat[];
const RESUME_EXPORT_FORMAT_LABELS: Record<(typeof RESUME_EXPORT_FORMATS)[number], string> = {
  pdf: "PDF",
  docx: "DOCX",
  md: "Markdown",
};

interface ResumeSectionProps {
  resumes: ResumeSummary[];
  jobs: MarketJob[];
  preview: GenerateResumePreviewResult | null;
  selectedResume: ResumeDocument | null;
  exportResult: ExportResumeResult | null;
  onSelectResume(file: string): void;
  onGeneratePreview(baseFile: string, targetJobId: string): void;
  onExportResume(file: string, format: ResumeExportFormat): void;
  onSavePreview(): void;
}

export function ResumeSection({
  resumes,
  jobs,
  preview,
  selectedResume,
  exportResult,
  onExportResume,
  onGeneratePreview,
  onSavePreview,
  onSelectResume,
}: ResumeSectionProps) {
  const [baseFile, setBaseFile] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sideView, setSideView] = useState<ResumeSideView>("diagnosis");
  const [resumeSearch, setResumeSearch] = useState("");
  const [resumeTypeFilter, setResumeTypeFilter] = useState("");
  const [exportFormat, setExportFormat] = useState<ResumeExportFormat>("pdf");
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [pageMode, setPageMode] = useState<ResumePageMode>("spread");
  const [marginMode, setMarginMode] = useState<ResumeMarginMode>("standard");
  const [marginMenuOpen, setMarginMenuOpen] = useState(false);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);
  const marginMenuRef = useRef<HTMLDivElement | null>(null);
  const wheelTurnRef = useRef(0);
  const selectedResumeSummary = resumes.find((resume) => resume.file === selectedResume?.file) || null;
  const diagnosisJob = selectedResumeSummary?.targetJobId
    ? jobs.find((job) => job.id === selectedResumeSummary.targetJobId) || null
    : null;
  const activeResume = preview
    ? { title: preview.title, markdown: preview.markdown, file: preview.baseFile, targetJobTitle: preview.targetJobTitle }
    : selectedResume;
  const pages = useMemo(() => paginateMarkdown(activeResume?.markdown || ""), [activeResume?.markdown]);
  const spreadMode = pageMode === "spread" && pages.length > 1;
  const marginOption = RESUME_MARGIN_OPTIONS.find((option) => option.value === marginMode) || DEFAULT_RESUME_MARGIN_OPTION;
  const visiblePageIndex = spreadMode ? Math.floor(pageIndex / 2) * 2 : pageIndex;
  const spreadPages = spreadMode ? pages.slice(visiblePageIndex, visiblePageIndex + 2) : [];
  const selectedJob = jobs.find((job) => job.id === targetJobId) || jobs[0] || null;
  const targetJobOptions = jobs.slice(0, 80);
  const paperStageStyle = {
    "--resume-slide-index": visiblePageIndex,
    "--resume-page-padding-x": `${marginOption.single}px`,
    "--resume-page-padding-y": `${Math.max(30, marginOption.single - 2)}px`,
    "--resume-spread-page-padding-x": `${marginOption.spread}px`,
    "--resume-spread-page-padding-y": `${Math.max(28, marginOption.spread)}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!baseFile && resumes[0]) setBaseFile(resumes[0].file);
    if (!selectedResume && resumes[0]) onSelectResume(resumes[0].file);
  }, [baseFile, onSelectResume, resumes, selectedResume]);

  useEffect(() => {
    if (!targetJobId && jobs[0]) setTargetJobId(jobs[0].id);
  }, [jobs, targetJobId]);

  useEffect(() => {
    setPageIndex(0);
  }, [activeResume?.markdown]);

  useEffect(() => {
    function closeToolbarMenus(event: globalThis.MouseEvent) {
      if (!formatMenuRef.current?.contains(event.target as Node)) setFormatMenuOpen(false);
      if (!marginMenuRef.current?.contains(event.target as Node)) setMarginMenuOpen(false);
    }
    document.addEventListener("mousedown", closeToolbarMenus);
    return () => document.removeEventListener("mousedown", closeToolbarMenus);
  }, []);

  function turnPage(delta: number) {
    if (pages.length <= 1) return;
    const pageCount = pages.length;
    const step = spreadMode ? delta * 2 : delta;
    setPageIndex((current) => (current + step + pageCount) % pageCount);
  }

  function handlePaperWheel(event: WheelEvent<HTMLElement>) {
    if (pages.length <= 1) return;
    if (Math.abs(event.deltaY) < 24 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    const now = Date.now();
    if (now - wheelTurnRef.current < 420) return;
    wheelTurnRef.current = now;
    turnPage(event.deltaY > 0 ? 1 : -1);
  }

  return (
    <div className={spreadMode ? "resume-classic-workspace is-spread" : "resume-classic-workspace"}>
      <main className="resume-paper-stage" style={paperStageStyle}>
        <article className={spreadMode ? "resume-paper-deck is-spread" : "resume-paper-deck"} aria-label="简历预览" onWheel={handlePaperWheel}>
          {activeResume && spreadMode ? (
            <div className="resume-spread-window">
              {spreadPages.map((page, index) => (
                <section className="resume-page-v2" data-density="soft" data-page-number={visiblePageIndex + index + 1} key={`${activeResume.file}-spread-${visiblePageIndex + index}`}>
                  <div className="resume-page-content-v2">
                    <RenderedResumePage blocks={page} fallbackTitle={activeResume.title} showHeader={visiblePageIndex + index === 0} />
                  </div>
                </section>
              ))}
            </div>
          ) : activeResume && pages.length ? (
            <div className="resume-slide-window">
              <div className="resume-slide-track">
              {pages.map((page, index) => (
                <section className="resume-page-v2" data-density="soft" data-page-number={index + 1} key={`${activeResume.file}-${index}`}>
                  <div className="resume-page-content-v2">
                    <RenderedResumePage blocks={page} fallbackTitle={activeResume.title} showHeader={index === 0} />
                  </div>
                </section>
              ))}
              </div>
            </div>
          ) : (
            <section className="resume-page-v2">
              <div className="resume-page-content-v2"><ResumeEmptyState /></div>
            </section>
          )}
        </article>
        <div className="resume-deck-controls-v2" role="toolbar" aria-label="简历工具栏" onClick={(event) => event.stopPropagation()}>
          <div className="resume-toolbar-group" aria-label="导入导出">
            <button type="button" className="resume-tool-button is-file-tool" aria-label="导入简历" data-tooltip="打开简历列表" onClick={() => setSideView("list")}>⇩</button>
            <button
              type="button"
              className="resume-tool-button is-file-tool"
              aria-label="导出简历"
              data-tooltip={`导出 ${formatExportLabel(exportFormat)}`}
              disabled={!selectedResume}
              onClick={() => selectedResume && onExportResume(selectedResume.file, exportFormat)}
            >
              ⇧
            </button>
            <div className="resume-format-menu" ref={formatMenuRef}>
              <button
                type="button"
                aria-label="导出格式"
                aria-expanded={formatMenuOpen}
                aria-haspopup="listbox"
                className="resume-format-trigger"
                data-tooltip="选择导出格式"
                onClick={() => setFormatMenuOpen((open) => !open)}
              >
                {formatExportLabel(exportFormat)}
              </button>
              {formatMenuOpen ? (
                <div className="resume-format-options" role="listbox" aria-label="导出格式">
                  {RESUME_EXPORT_FORMATS.map((format) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={format === exportFormat}
                      className={format === exportFormat ? "is-selected" : ""}
                      key={format}
                      onClick={() => {
                        setExportFormat(format);
                        setFormatMenuOpen(false);
                      }}
                    >
                      {formatExportLabel(format)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="resume-page-controls" aria-label="页面切换">
            <button type="button" aria-label="上一页" data-tooltip={spreadMode ? "上一组双页" : "上一页"} disabled={pages.length <= 1} onClick={() => turnPage(-1)}>‹</button>
            <span>
              {spreadMode
                ? `${visiblePageIndex + 1}-${Math.min(visiblePageIndex + 2, pages.length)} / ${pages.length}`
                : `${pages.length ? pageIndex + 1 : 0} / ${Math.max(pages.length, 1)}`}
            </span>
            <button type="button" aria-label="下一页" data-tooltip={spreadMode ? "下一组双页" : "下一页"} disabled={pages.length <= 1} onClick={() => turnPage(1)}>›</button>
          </div>

          <div className="resume-toolbar-group resume-toolbar-group-right" aria-label="修改操作">
            <button
              type="button"
              className={spreadMode ? "resume-tool-button is-view-tool is-active" : "resume-tool-button is-view-tool"}
              aria-label={spreadMode ? "切换单页模式" : "切换双页模式"}
              data-tooltip={spreadMode ? "切换单页模式" : "切换双页模式"}
              aria-pressed={spreadMode}
              disabled={pages.length <= 1}
              onClick={() => setPageMode((mode) => (mode === "spread" ? "single" : "spread"))}
            >
              ▥
            </button>
            <div className={marginMenuOpen ? "resume-margin-menu is-open" : "resume-margin-menu"} ref={marginMenuRef}>
              <button
                type="button"
                className="resume-tool-button is-margin-tool"
                aria-label="设置页边距"
                aria-expanded={marginMenuOpen}
                aria-haspopup="true"
                data-tooltip={`页边距：${marginOption.label}`}
                onClick={() => setMarginMenuOpen((open) => !open)}
              >
                ◫
              </button>
              <div className="resume-margin-options" role="group" aria-label="页边距">
                {RESUME_MARGIN_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={option.value === marginMode ? "is-selected" : ""}
                    key={option.value}
                    onClick={() => {
                      setMarginMode(option.value);
                      setMarginMenuOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="resume-tool-button is-edit-tool" aria-label="编辑简历" data-tooltip="生成定制简历" disabled={!selectedResume} onClick={() => setSideView("edit")}>✎</button>
            <button type="button" className="resume-tool-button is-primary" aria-label="保存简历" data-tooltip={preview ? "保存当前预览" : "先生成预览"} disabled={!preview} onClick={onSavePreview}>✓</button>
            <button type="button" className="resume-tool-button is-diagnosis-tool" aria-label="诊断简历" data-tooltip="查看简历诊断" onClick={() => setSideView("diagnosis")}>◎</button>
          </div>
        </div>
      </main>

      <aside className="resume-diagnosis-rail">
        <div className="resume-side-card">
          <div className="resume-side-tabs" role="tablist" aria-label="简历侧栏">
            <button
              type="button"
              role="tab"
              aria-selected={sideView === "list"}
              className={sideView === "list" ? "is-active" : ""}
              onClick={() => setSideView("list")}
            >
              简历列表
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideView === "diagnosis"}
              className={sideView === "diagnosis" ? "is-active" : ""}
              onClick={() => setSideView("diagnosis")}
            >
              简历诊断
            </button>
          </div>

          <div className="resume-context-card">
            {sideView === "list" ? (
              <ResumeFileList
                onSearchChange={setResumeSearch}
                onSelectResume={onSelectResume}
                onTypeFilterChange={setResumeTypeFilter}
                resumes={resumes}
                search={resumeSearch}
                selectedFile={selectedResume?.file || ""}
                typeFilter={resumeTypeFilter}
              />
            ) : null}
            {sideView === "diagnosis" ? (
              <>
                <ResumeDiagnosis resume={selectedResumeSummary} document={selectedResume} job={diagnosisJob} />
                {exportResult ? <p className="status-line">已导出 {exportResult.file} · {(exportResult.sizeBytes / 1024).toFixed(1)} KB</p> : null}
              </>
            ) : null}
            {sideView === "edit" ? (
              <div className="resume-edit-panel">
                <div className="resume-edit-field">
                  <span>基础简历</span>
                  <ResumeBoundedSelect
                    ariaLabel="选择基础简历"
                    options={resumes.map((resume) => ({ value: resume.file, label: formatResumeDisplayTitle(resume.title) }))}
                    value={baseFile}
                    onChange={setBaseFile}
                  />
                </div>
                <div className="resume-edit-field">
                  <span>目标岗位</span>
                  <ResumeBoundedSelect
                    ariaLabel="选择目标岗位"
                    options={targetJobOptions.map((job) => ({ value: job.id, label: formatJobLabel(job) }))}
                    value={targetJobId}
                    onChange={setTargetJobId}
                  />
                </div>
                <button type="button" disabled={!baseFile || !selectedJob} onClick={() => selectedJob && onGeneratePreview(baseFile, selectedJob.id)}>
                  生成预览
                </button>
                <button type="button" className="secondary" disabled={!preview} onClick={onSavePreview}>
                  保存当前预览
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ResumeBoundedSelect({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    function closeSelect(event: globalThis.MouseEvent) {
      if (!selectRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeSelect);
    return () => document.removeEventListener("mousedown", closeSelect);
  }, []);

  return (
    <div className={open ? "resume-bounded-select is-open" : "resume-bounded-select"} ref={selectRef}>
      <button
        type="button"
        className="resume-bounded-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={!options.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || "暂无可选项"}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      {open ? (
        <div className="resume-bounded-select-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value}
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

function formatExportLabel(format: ResumeExportFormat): string {
  return format in RESUME_EXPORT_FORMAT_LABELS
    ? RESUME_EXPORT_FORMAT_LABELS[format as keyof typeof RESUME_EXPORT_FORMAT_LABELS]
    : format.toUpperCase();
}
