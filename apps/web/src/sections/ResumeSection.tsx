import type {
  AgentEvent,
  AgentTask,
  AgentTaskTurn,
  ExportResumeResult,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDiagnosisReport,
  ResumeDocument,
  ResumeExportFormat,
  ResumeExportStyle,
  ResumeSummary,
} from "@ucareer/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { RenderedResumePage, ResumeEmptyState } from "./resume/ResumePreview";
import { ResumeDiagnosis, ResumeFileList, formatJobLabel, formatResumeDisplayTitle } from "./resume/ResumeSidebar";
import { paginateMarkdown } from "./resume/resumeMarkdown";

type ResumeSideView = "list" | "export" | "diagnosis" | "edit" | "customize";
type ResumePageMode = "single" | "spread";

const RESUME_A4_WIDTH = 794;
const RESUME_A4_HEIGHT = 1123;
const RESUME_SPREAD_GAP = 12;
const RESUME_PAGE_PADDING_X = 42;
const RESUME_PAGE_PADDING_Y = 40;
const RESUME_EXPORT_FORMATS = ["pdf", "docx", "md"] as const satisfies readonly ResumeExportFormat[];
const RESUME_EXPORT_FORMAT_LABELS: Record<(typeof RESUME_EXPORT_FORMATS)[number], string> = {
  pdf: "PDF",
  docx: "DOCX",
  md: "Markdown",
};
const RESUME_EXPORT_STYLES: Array<{ value: ResumeExportStyle; label: string; description: string }> = [
  { value: "classic", label: "经典", description: "保留当前预览版式，适合投递和分享。" }, { value: "compact", label: "紧凑", description: "更高信息密度，适合经历较多的版本。" }, { value: "ats", label: "ATS", description: "弱化装饰，优先保证机器解析友好。" }, { value: "bluebar", label: "蓝栏校招", description: "参考大厂实习模板，蓝色栏目条和紧凑项目经历。" },
];

interface ResumeSectionProps {
  resumes: ResumeSummary[];
  diagnostics: ResumeDiagnosisReport[];
  jobs: MarketJob[];
  preview: GenerateResumePreviewResult | null;
  selectedResume: ResumeDocument | null;
  exportResult: ExportResumeResult | null;
  agentTasks: AgentTask[];
  selectedTaskEvents: AgentEvent[];
  selectedTaskId: string;
  selectedTaskTurns: AgentTaskTurn[];
  onSelectResume(file: string): void;
  onGeneratePreview(baseFile: string, targetJobId: string): void;
  onDiagnoseResume(file: string, targetJobId?: string): string | Promise<string>;
  onExportResume(file: string, format: ResumeExportFormat, style?: ResumeExportStyle): Promise<void> | void;
  onSavePreview(): void;
  onSaveResume(file: string, title: string, markdown: string): void | Promise<void>;
}

export function ResumeSection({
  resumes,
  diagnostics,
  jobs,
  preview,
  selectedResume,
  exportResult,
  agentTasks,
  onExportResume,
  onDiagnoseResume,
  onGeneratePreview,
  onSavePreview,
  onSaveResume,
  onSelectResume,
  selectedTaskEvents,
  selectedTaskId,
  selectedTaskTurns,
}: ResumeSectionProps) {
  const [baseFile, setBaseFile] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sideView, setSideView] = useState<ResumeSideView>("list");
  const [resumeSearch, setResumeSearch] = useState("");
  const [resumeTypeFilter, setResumeTypeFilter] = useState("");
  const [exportFormat, setExportFormat] = useState<ResumeExportFormat>("pdf");
  const [exportStyle, setExportStyle] = useState<ResumeExportStyle>("classic");
  const [pageMode, setPageMode] = useState<ResumePageMode>("spread");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorMarkdown, setEditorMarkdown] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorStatus, setEditorStatus] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [diagnosisTaskId, setDiagnosisTaskId] = useState("");
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [paperStageSize, setPaperStageSize] = useState({ width: RESUME_A4_WIDTH, height: RESUME_A4_HEIGHT });
  const paperStageRef = useRef<HTMLElement | null>(null);
  const wheelTurnRef = useRef(0);
  const selectedResumeSummary = resumes.find((resume) => resume.file === selectedResume?.file) || null;
  const diagnosisJob = selectedResumeSummary?.targetJobId
    ? jobs.find((job) => job.id === selectedResumeSummary.targetJobId) || null
    : null;
  const selectedDiagnosisReports = selectedResume
    ? diagnostics.filter((report) => report.resumeFile === selectedResume.file || report.file.startsWith(selectedResume.file.replace(/\.md$/, "")))
    : [];
  const latestDiagnosisReport = selectedDiagnosisReports[0] || null;
  const editingResume = selectedResume && sideView === "edit"
    ? { title: editorTitle || selectedResume.title, markdown: editorMarkdown, file: selectedResume.file }
    : null;
  const activeResume = editingResume || (preview
    ? { title: preview.title, markdown: preview.markdown, file: preview.baseFile, targetJobTitle: preview.targetJobTitle }
    : selectedResume);
  const pages = useMemo(() => paginateMarkdown(activeResume?.markdown || ""), [activeResume?.markdown]);
  const spreadMode = pageMode === "spread" && pages.length > 1;
  const visiblePageIndex = spreadMode ? Math.floor(pageIndex / 2) * 2 : pageIndex;
  const spreadPages = spreadMode ? pages.slice(visiblePageIndex, visiblePageIndex + 2) : [];
  const selectedJob = jobs.find((job) => job.id === targetJobId) || jobs[0] || null;
  const targetJobOptions = jobs.slice(0, 80);
  const deckWidth = spreadMode ? RESUME_A4_WIDTH * 2 + RESUME_SPREAD_GAP : RESUME_A4_WIDTH;
  const deckHeight = RESUME_A4_HEIGHT;
  const previewScale = Math.min(
    1,
    Math.max(0.24, paperStageSize.width / deckWidth),
    Math.max(0.24, paperStageSize.height / deckHeight),
  );
  const paperStageStyle = {
    "--resume-slide-index": visiblePageIndex,
    "--resume-page-padding-x": `${RESUME_PAGE_PADDING_X}px`,
    "--resume-page-padding-y": `${RESUME_PAGE_PADDING_Y}px`,
    "--resume-deck-width": `${deckWidth}px`,
    "--resume-deck-height": `${deckHeight}px`,
    "--resume-preview-scale": previewScale,
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
    setEditorTitle(selectedResume?.title || "");
    setEditorMarkdown(selectedResume?.markdown || "");
    setEditorDirty(false);
    setEditorStatus("");
  }, [selectedResume?.file, selectedResume?.markdown, selectedResume?.title]);

  useEffect(() => {
    const node = paperStageRef.current;
    if (!node) return;
    const updateStageSize = () => {
      const styles = window.getComputedStyle(node);
      const width = node.clientWidth - parseFloat(styles.paddingLeft || "0") - parseFloat(styles.paddingRight || "0");
      const height = node.clientHeight - parseFloat(styles.paddingTop || "0") - parseFloat(styles.paddingBottom || "0");
      setPaperStageSize({ width: Math.max(1, width), height: Math.max(1, height) });
    };
    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(node);
    window.addEventListener("resize", updateStageSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateStageSize);
    };
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

  async function handleSaveEditedResume() {
    if (!selectedResume) return;
    setEditorStatus("保存中...");
    try {
      await onSaveResume(selectedResume.file, editorTitle.trim() || selectedResume.title, editorMarkdown);
      setEditorDirty(false);
      setEditorStatus("已保存");
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function handleExportCurrentResume(format = exportFormat) {
    if (!selectedResume || exportBusy) return;
    setExportBusy(true);
    setExportFormat(format);
    setExportStatus(`正在导出 ${formatExportLabel(format)}...`);
    try {
      await onExportResume(selectedResume.file, format, exportStyle);
      setExportStatus(`已下载 ${formatExportLabel(format)}`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDiagnoseCurrentResume() {
    if (!selectedResume) return;
    setSideView("diagnosis");
    setDiagnosisStatus("正在启动诊断...");
    try {
      const taskId = await onDiagnoseResume(selectedResume.file, selectedResumeSummary?.targetJobId || targetJobId || undefined);
      setDiagnosisTaskId(taskId || "");
      setDiagnosisStatus(taskId ? "Agent 正在诊断当前简历" : "诊断任务未启动");
    } catch (error) {
      setDiagnosisStatus(error instanceof Error ? error.message : "诊断启动失败");
    }
  }

  function handleOpenDiagnosisPanel() {
    if (!selectedResume) return;
    setSideView("diagnosis");
    if (latestDiagnosisReport) {
      setDiagnosisTaskId("");
      setDiagnosisStatus("已读取最近诊断报告");
      return;
    }
    void handleDiagnoseCurrentResume();
  }

  return (
    <div className={`resume-classic-workspace resume-preview-style-${exportStyle}${spreadMode ? " is-spread" : ""}`}>
      <main className="resume-paper-stage" ref={paperStageRef} style={paperStageStyle}>
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
            <button type="button" className="resume-tool-button is-file-tool" aria-label="打开简历列表" data-tooltip="打开简历列表" onClick={() => setSideView("list")}>列表</button>
            <button
              type="button"
              className="resume-tool-button is-file-tool"
              aria-label="打开导出面板"
              data-tooltip="打开导出面板"
              disabled={!selectedResume}
              onClick={() => setSideView("export")}
            >
              {exportBusy ? "导出中" : "导出"}
            </button>
            {exportStatus ? <span className="resume-export-status">{exportStatus}</span> : null}
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
              {spreadMode ? "双页" : "单页"}
            </button>
            <button type="button" className="resume-tool-button is-edit-tool" aria-label="编辑简历" data-tooltip="编辑当前简历" disabled={!selectedResume} onClick={() => setSideView("edit")}>编辑</button>
            <button
              type="button"
              className="resume-tool-button is-diagnosis-tool"
              aria-label="诊断简历"
              data-tooltip={selectedResume ? (latestDiagnosisReport ? "查看已有诊断报告" : "让 Agent 诊断并给出修改建议") : "请先选择简历"}
              disabled={!selectedResume}
              onClick={handleOpenDiagnosisPanel}
            >
              诊断
            </button>
          </div>
        </div>
      </main>

      <aside className="resume-diagnosis-rail">
        <div className={sideView === "edit" ? "resume-side-card is-edit-mode" : "resume-side-card"}>
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
                <ResumeDiagnosis
                  diagnosisStatus={diagnosisStatus}
                  diagnosisTask={agentTasks.find((task) => task.id === diagnosisTaskId) || null}
                  document={selectedResume}
                  events={diagnosisTaskId && selectedTaskId === diagnosisTaskId ? selectedTaskEvents : []}
                  job={diagnosisJob}
                  onRerun={() => void handleDiagnoseCurrentResume()}
                  reports={selectedDiagnosisReports}
                  resume={selectedResumeSummary}
                  turns={diagnosisTaskId && selectedTaskId === diagnosisTaskId ? selectedTaskTurns : []}
                />
                {exportResult ? <p className="status-line">已导出 · {(exportResult.sizeBytes / 1024).toFixed(1)} KB</p> : null}
              </>
            ) : null}
            {sideView === "export" ? (
              <div className="resume-export-panel">
                <div className="resume-context-head">
                  <h2>导出简历</h2>
                  <span>{selectedResume ? formatResumeDisplayTitle(selectedResume.title) : "未选择"}</span>
                </div>
                <div className="resume-export-section">
                  <h3>文件格式</h3>
                  <div className="resume-export-format-grid" role="radiogroup" aria-label="导出文件格式">
                    {RESUME_EXPORT_FORMATS.map((format) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={format === exportFormat}
                        className={format === exportFormat ? "is-selected" : ""}
                        key={format}
                        onClick={() => setExportFormat(format)}
                      >
                        {formatExportLabel(format)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="resume-export-section">
                  <h3>简历风格</h3>
                  <div className="resume-export-style-list" role="radiogroup" aria-label="导出简历风格">
                    {RESUME_EXPORT_STYLES.map((style) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={style.value === exportStyle}
                        className={style.value === exportStyle ? "is-selected" : ""}
                        key={style.value}
                        onClick={() => setExportStyle(style.value)}
                      >
                        <strong>{style.label}</strong>
                        <span>{style.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="resume-export-confirm"
                  disabled={!selectedResume || exportBusy}
                  onClick={() => void handleExportCurrentResume(exportFormat)}
                >
                  {exportBusy ? "正在导出" : `导出 ${formatExportLabel(exportFormat)}`}
                </button>
                {exportStatus ? <p className="resume-export-note">{exportStatus}</p> : null}
                {exportResult ? <p className="resume-export-note">最近导出 · {(exportResult.sizeBytes / 1024).toFixed(1)} KB</p> : null}
              </div>
            ) : null}
            {sideView === "edit" ? (
              <div className="resume-source-editor">
                <label className="resume-edit-field">
                  <span>标题</span>
                  <input
                    value={editorTitle}
                    placeholder="简历标题"
                    onChange={(event) => {
                      setEditorTitle(event.target.value);
                      setEditorDirty(true);
                    }}
                  />
                </label>
                <label className="resume-edit-field resume-markdown-field">
                  <span>Markdown 内容</span>
                  <textarea
                    value={editorMarkdown}
                    spellCheck={false}
                    onChange={(event) => {
                      setEditorMarkdown(event.target.value);
                      setEditorDirty(true);
                    }}
                  />
                </label>
                <div className="resume-editor-actions">
                  <button type="button" disabled={!selectedResume || !editorDirty} onClick={() => void handleSaveEditedResume()}>
                    保存编辑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!selectedResume || !editorDirty}
                    onClick={() => {
                      setEditorTitle(selectedResume?.title || "");
                      setEditorMarkdown(selectedResume?.markdown || "");
                      setEditorDirty(false);
                      setEditorStatus("");
                    }}
                  >
                    撤销
                  </button>
                </div>
                {editorStatus ? <p className="status-line">{editorStatus}</p> : null}
              </div>
            ) : null}
            {sideView === "customize" ? (
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
