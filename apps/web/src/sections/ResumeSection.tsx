import type {
  ExportResumeResult,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDocument,
  ResumeSummary,
} from "@ucareer/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { RenderedResumePage, ResumeEmptyState } from "./resume/ResumePreview";
import { ResumeDiagnosis, ResumeEditPanel, ResumeFileList, formatJobLabel } from "./resume/ResumeSidebar";
import { paginateMarkdown } from "./resume/resumeMarkdown";

type ResumeSideView = "list" | "diagnosis" | "edit";

interface ResumeSectionProps {
  resumes: ResumeSummary[];
  jobs: MarketJob[];
  preview: GenerateResumePreviewResult | null;
  selectedResume: ResumeDocument | null;
  exportResult: ExportResumeResult | null;
  onSelectResume(file: string): void;
  onGeneratePreview(baseFile: string, targetJobId: string): void;
  onSavePreview(): void;
}

export function ResumeSection({
  resumes,
  jobs,
  preview,
  selectedResume,
  exportResult,
  onSelectResume,
  onGeneratePreview,
  onSavePreview,
}: ResumeSectionProps) {
  const [baseFile, setBaseFile] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sideView, setSideView] = useState<ResumeSideView>("diagnosis");
  const [resumeSearch, setResumeSearch] = useState("");
  const [resumeTypeFilter, setResumeTypeFilter] = useState("");
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const targetPickerRef = useRef<HTMLDivElement | null>(null);
  const wheelTurnRef = useRef(0);
  const selectedJob = jobs.find((job) => job.id === targetJobId) || jobs[0];
  const targetJobOptions = jobs.slice(0, 80);
  const selectedJobLabel = selectedJob ? formatJobLabel(selectedJob) : "选择目标岗位";
  const activeResume = preview
    ? { title: preview.title, markdown: preview.markdown, file: preview.baseFile, targetJobTitle: preview.targetJobTitle }
    : selectedResume;
  const pages = useMemo(() => paginateMarkdown(activeResume?.markdown || ""), [activeResume?.markdown]);
  const paperStageStyle = {
    "--resume-slide-index": pageIndex,
  } as CSSProperties;

  useEffect(() => {
    if (!baseFile && resumes[0]) setBaseFile(resumes[0].file);
    if (!selectedResume && resumes[0]) onSelectResume(resumes[0].file);
  }, [baseFile, onSelectResume, resumes, selectedResume]);

  useEffect(() => {
    if (!targetJobId && jobs[0]) setTargetJobId(jobs[0].id);
  }, [jobs, targetJobId]);

  useEffect(() => {
    function closeTargetPicker(event: globalThis.MouseEvent) {
      if (!targetPickerRef.current?.contains(event.target as Node)) setTargetPickerOpen(false);
    }
    document.addEventListener("mousedown", closeTargetPicker);
    return () => document.removeEventListener("mousedown", closeTargetPicker);
  }, []);

  useEffect(() => {
    setPageIndex(0);
  }, [activeResume?.markdown]);

  function turnPage(delta: number) {
    if (pages.length <= 1) return;
    const pageCount = pages.length;
    setPageIndex((current) => (current + delta + pageCount) % pageCount);
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
    <div className="resume-classic-workspace">
      <main className="resume-paper-stage" style={paperStageStyle}>
        <article className="resume-paper-deck" aria-label="简历预览" onWheel={handlePaperWheel}>
          {activeResume && pages.length ? (
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
        <div className="resume-deck-controls-v2" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label="上一页" disabled={pages.length <= 1} onClick={() => turnPage(-1)}>‹</button>
          <span>{pages.length ? pageIndex + 1 : 0} / {Math.max(pages.length, 1)}</span>
          <button type="button" aria-label="下一页" disabled={pages.length <= 1} onClick={() => turnPage(1)}>›</button>
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
            <button
              type="button"
              role="tab"
              aria-selected={sideView === "edit"}
              className={sideView === "edit" ? "is-active" : ""}
              onClick={() => setSideView("edit")}
            >
              简历修改
            </button>
          </div>

          {sideView !== "list" ? (
            <div className="resume-top-toolbar">
              <div className="resume-target-picker" ref={targetPickerRef}>
                <button
                  type="button"
                  className="resume-target-trigger"
                  aria-expanded={targetPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setTargetPickerOpen((open) => !open)}
                >
                  <span>{selectedJobLabel}</span>
                  <b aria-hidden="true">⌄</b>
                </button>
                {targetPickerOpen ? (
                  <div className="resume-target-popover" role="listbox" aria-label="目标岗位">
                    {targetJobOptions.map((job) => {
                      const selected = job.id === targetJobId;
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={selected ? "is-selected" : ""}
                          key={job.id}
                          onClick={() => {
                            setTargetJobId(job.id);
                            setTargetPickerOpen(false);
                          }}
                        >
                          {formatJobLabel(job)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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
                <ResumeDiagnosis job={selectedJob || null} />
                {exportResult ? <p className="status-line">已导出 {exportResult.file} · {(exportResult.sizeBytes / 1024).toFixed(1)} KB</p> : null}
              </>
            ) : null}
            {sideView === "edit" ? (
              <ResumeEditPanel
                baseFile={baseFile}
                previewReady={Boolean(preview)}
                resumes={resumes}
                onBaseFileChange={setBaseFile}
                onGeneratePreview={() => onGeneratePreview(baseFile, targetJobId)}
                onSavePreview={onSavePreview}
              />
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
