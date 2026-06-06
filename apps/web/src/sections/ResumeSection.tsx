import type {
  ExportResumeResult,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
} from "@offeru/shared";
import HTMLFlipBook from "react-pageflip";
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface ResumeSectionProps {
  resumes: ResumeSummary[];
  jobs: MarketJob[];
  preview: GenerateResumePreviewResult | null;
  selectedResume: ResumeDocument | null;
  exportResult: ExportResumeResult | null;
  onSelectResume(file: string): void;
  onGeneratePreview(baseFile: string, targetJobId: string): void;
  onSavePreview(): void;
  onExportResume(file: string, format: ResumeExportFormat): void;
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
  onExportResume,
}: ResumeSectionProps) {
  const [baseFile, setBaseFile] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const [exportFormat, setExportFormat] = useState<ResumeExportFormat>("pdf");
  const [pageIndex, setPageIndex] = useState(0);
  const [controlsTopVh, setControlsTopVh] = useState(68);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const flipBookRef = useRef<FlipBookHandle | null>(null);
  const loopCorrectionTimer = useRef<number | null>(null);
  const targetPickerRef = useRef<HTMLDivElement | null>(null);
  const selectedJob = jobs.find((job) => job.id === targetJobId) || jobs[0];
  const targetJobOptions = jobs.slice(0, 80);
  const selectedJobLabel = selectedJob ? formatJobLabel(selectedJob) : "选择目标岗位";
  const activeResume = preview
    ? { title: preview.title, markdown: preview.markdown, file: preview.baseFile, targetJobTitle: preview.targetJobTitle }
    : selectedResume;
  const pages = useMemo(() => paginateMarkdown(activeResume?.markdown || ""), [activeResume?.markdown]);
  const loopPages = useMemo(() => buildLoopPages(pages), [pages]);
  const paperStageStyle = {
    "--resume-page-controls-top": `clamp(360px, ${controlsTopVh}vh, 720px)`,
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

  useEffect(() => () => {
    if (loopCorrectionTimer.current) window.clearTimeout(loopCorrectionTimer.current);
  }, []);

  useEffect(() => {
    setPageIndex(0);
    if (loopCorrectionTimer.current) window.clearTimeout(loopCorrectionTimer.current);
    flipBookRef.current?.pageFlip()?.turnToPage(pages.length > 1 ? 1 : 0);
  }, [activeResume?.markdown]);

  function turnPage(delta: number) {
    if (pages.length <= 1) return;
    if (delta > 0) flipBookRef.current?.pageFlip()?.flipNext("top");
    else flipBookRef.current?.pageFlip()?.flipPrev("top");
  }

  function handleBookFlip(event: FlipBookEvent) {
    const rawPage = Number(event.data) || 0;
    const pageCount = pages.length;
    if (pageCount <= 1) {
      setPageIndex(0);
      return;
    }
    if (loopCorrectionTimer.current) window.clearTimeout(loopCorrectionTimer.current);
    if (rawPage === 0) {
      setPageIndex(pageCount - 1);
      loopCorrectionTimer.current = window.setTimeout(() => flipBookRef.current?.pageFlip()?.turnToPage(pageCount), 80);
      return;
    }
    if (rawPage === pageCount + 1) {
      setPageIndex(0);
      loopCorrectionTimer.current = window.setTimeout(() => flipBookRef.current?.pageFlip()?.turnToPage(1), 80);
      return;
    }
    setPageIndex(rawPage - 1);
  }

  return (
    <div className="resume-classic-workspace">
      <div className="resume-top-toolbar">
        <div className="resume-target-picker" ref={targetPickerRef}>
          <span>目标岗位</span>
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
        <details className="resume-action-menu">
          <summary>操作</summary>
          <div>
            <label>
              基础简历
              <select value={baseFile} onChange={(event) => setBaseFile(event.target.value)}>
                {resumes.map((resume) => (
                  <option key={resume.file} value={resume.file}>{resume.title}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => onGeneratePreview(baseFile, targetJobId)}>生成岗位简历</button>
            <button type="button" className="secondary" disabled={!preview} onClick={onSavePreview}>保存预览</button>
            <label className="resume-control-tuner">
              翻页按钮高度
              <span>{controlsTopVh}vh</span>
              <input
                max="78"
                min="42"
                step="1"
                type="range"
                value={controlsTopVh}
                onChange={(event) => setControlsTopVh(Number(event.target.value))}
              />
            </label>
            <label>
              导出格式
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ResumeExportFormat)}>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="html">HTML</option>
                <option value="md">Markdown</option>
              </select>
            </label>
            <button type="button" className="secondary" disabled={!activeResume} onClick={() => activeResume && onExportResume(activeResume.file, exportFormat)}>导出当前简历</button>
          </div>
        </details>
      </div>

      <main className="resume-paper-stage" style={paperStageStyle}>
        <article className="resume-paper-deck" aria-label="简历预览">
          {activeResume && pages.length ? (
            <HTMLFlipBook
              autoSize={false}
              className="resume-flip-book"
              clickEventForward={false}
              disableFlipByClick={false}
              drawShadow
              flippingTime={920}
              height={756}
              maxHeight={756}
              maxShadowOpacity={0.18}
              maxWidth={535}
              minHeight={424}
              minWidth={300}
              mobileScrollSupport
              onFlip={handleBookFlip}
              showCover={false}
              showPageCorners={false}
              size="fixed"
              startPage={pages.length > 1 ? 1 : 0}
              startZIndex={6}
              style={{}}
              swipeDistance={18}
              useMouseEvents
              usePortrait
              width={535}
              ref={flipBookRef}
              key={activeResume.markdown}
            >
              {loopPages.map((page) => (
                <ResumeFlipPage key={`${activeResume.file}-${page.key}`} number={page.realIndex + 1}>
                  <RenderedResumePage blocks={page.blocks} fallbackTitle={activeResume.title} showHeader={page.realIndex === 0} />
                </ResumeFlipPage>
              ))}
            </HTMLFlipBook>
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
        <div className="resume-context-card">
          <div className="resume-context-head">
            <h2>简历诊断</h2>
            <span>简历匹配线索</span>
          </div>
          <div className="resume-context-tabs">
            <button type="button" className="secondary">简历编辑</button>
            <button type="button">简历诊断</button>
          </div>
          <ResumeDiagnosis job={selectedJob || null} />
          {exportResult ? <p className="status-line">已导出 {exportResult.file} · {(exportResult.sizeBytes / 1024).toFixed(1)} KB</p> : null}
        </div>
      </aside>
    </div>
  );
}

function RenderedResumePage({ blocks, fallbackTitle, showHeader }: { blocks: ResumeBlock[]; fallbackTitle: string; showHeader: boolean }) {
  const titleBlock = blocks.find((block): block is TextResumeBlock => block.type === "h1");
  const title = titleBlock?.text || fallbackTitle;
  const contactBlock = blocks.find((block): block is TextResumeBlock => block.type === "contact");
  const body = blocks.filter((block) => block.type !== "h1" && block.type !== "contact");

  return (
    <>
      {showHeader ? (
        <header className="resume-header-v2">
          <div className="resume-identity-v2">
            <h1>{title}</h1>
            <p>{contactBlock?.text || "深圳 | 2 年工作经验 | 181 7224 4940 | 12132301@mail.sustech.edu.cn | github.com/ZeroErrControl"}</p>
          </div>
          <figure className="resume-avatar-v2"><img src="/assets/headshot.png" alt="韦东波职业照" /></figure>
        </header>
      ) : null}
      {body.map((block, index) => <ResumeBlockView block={block} key={`${block.type}-${index}-${blockKey(block)}`} />)}
    </>
  );
}

function ResumeBlockView({ block }: { block: ResumeBlock }) {
  if (block.type === "h2") return <h2>{block.text}</h2>;
  if (block.type === "h3") return <h3>{block.text}</h3>;
  if (block.type === "ul") return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  return <p>{block.text}</p>;
}

function formatJobLabel(job: MarketJob) {
  const company = job.company || "待确认公司";
  const role = job.role || "待确认岗位";
  const score = typeof job.matchScore === "number" ? ` · ${job.matchScore.toFixed(1)}` : "";
  return `${company} - ${role}${score}`;
}

function ResumeDiagnosis({ job }: { job: MarketJob | null }) {
  const tags = (job?.keywords || []).slice(0, 8);
  return (
    <div className="resume-direction-clues">
      <section>
        <h3>投递策略</h3>
        <p>围绕 {job?.company || "目标公司"}「{job?.role || "目标岗位"}」做定制表达。优先补强岗位直接要求的模块、API、Demo、文档、客户接入和测试证据。</p>
      </section>
      <section>
        <h3>方向线索</h3>
        <strong>{job?.direction || job?.role || "目标岗位"}</strong>
      </section>
      <section>
        <h3>JD 信号</h3>
        <ul>{tags.length ? tags.map((tag) => <li key={tag}>{tag}</li>) : <li>选择目标岗位后显示。</li>}</ul>
      </section>
      <section>
        <h3>优先强化</h3>
        <ul>
          {[job?.fitReason, job?.evidenceGap, job?.salary ? `薪资/职级信号：${job.salary}` : ""].filter(Boolean).map((item) => <li key={String(item)}>{item}</li>)}
        </ul>
      </section>
      <div className="resume-clue-tags">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </div>
  );
}

function ResumeEmptyState() {
  return <div className="resume-empty-paper">正在读取简历。</div>;
}

type TextResumeBlock = { type: "h1" | "h2" | "h3" | "p" | "contact"; text: string };
type ResumeBlock = TextResumeBlock | { type: "ul"; items: string[] };
type LoopResumePage = { blocks: ResumeBlock[]; key: string; realIndex: number };
type FlipBookEvent = { data: number };
type FlipBookHandle = {
  pageFlip(): {
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    turnToPage(page: number): void;
  };
};

const ResumeFlipPage = forwardRef<HTMLElement, { children: ReactNode; number: number }>(function ResumeFlipPage({ children, number }, ref) {
  return (
    <section className="resume-page-v2" data-density="soft" data-page-number={number} ref={ref}>
      <div className="resume-page-content-v2">{children}</div>
    </section>
  );
});

function buildLoopPages(pages: ResumeBlock[][]): LoopResumePage[] {
  if (pages.length <= 1) {
    return pages.map((blocks, index) => ({ blocks, key: `page-${index}`, realIndex: index }));
  }
  const lastIndex = pages.length - 1;
  const firstPage = pages[0];
  const lastPage = pages[lastIndex];
  if (!firstPage || !lastPage) return [];
  return [
    { blocks: lastPage, key: "sentinel-last", realIndex: lastIndex },
    ...pages.map((blocks, index) => ({ blocks, key: `page-${index}`, realIndex: index })),
    { blocks: firstPage, key: "sentinel-first", realIndex: 0 },
  ];
}

function blockKey(block: ResumeBlock): string {
  return block.type === "ul" ? block.items.join("|") : block.text;
}

function paginateMarkdown(markdown: string): ResumeBlock[][] {
  const blocks = parseResumeMarkdown(markdown);
  if (!blocks.length) return [];
  const pages: ResumeBlock[][] = [];
  let current: ResumeBlock[] = [];
  let weight = 0;
  for (const block of blocks) {
    const nextWeight = blockWeight(block);
    if (current.length && weight + nextWeight > 30) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(block);
    weight += nextWeight;
  }
  if (current.length) pages.push(current);
  return pages;
}

function parseResumeMarkdown(markdown: string): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  let list: string[] = [];
  let headerSeen = false;
  let contactCaptured = false;
  let skipStrategy = false;
  const flushList = () => {
    if (list.length) blocks.push({ type: "ul", items: list });
    list = [];
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (skipStrategy && line.startsWith("## ")) skipStrategy = false;
    if (skipStrategy) continue;
    if (!line) {
      flushList();
      continue;
    }
    if (headerSeen && !contactCaptured && !line.startsWith("#") && !line.startsWith("- ")) {
      flushList();
      blocks.push({ type: "contact", text: cleanInlineMarkdown(line) });
      contactCaptured = true;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1];
    if (bullet) {
      list.push(cleanInlineMarkdown(bullet));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: cleanInlineMarkdown(line.slice(4)) });
    else if (line.startsWith("## ")) {
      const title = cleanInlineMarkdown(line.slice(3));
      if (title === "投递定位") {
        skipStrategy = true;
        continue;
      }
      blocks.push({ type: "h2", text: title });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: cleanInlineMarkdown(line.slice(2)) });
      headerSeen = true;
    }
    else blocks.push({ type: "p", text: cleanInlineMarkdown(line) });
  }
  flushList();
  return blocks;
}

function blockWeight(block: ResumeBlock): number {
  if (block.type === "h1") return 5;
  if (block.type === "h2") return 3;
  if (block.type === "h3") return 2;
  if (block.type === "ul") return Math.max(2, block.items.length * 1.8);
  return Math.max(1, Math.ceil(block.text.length / 70));
}

function cleanInlineMarkdown(value: string): string {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}
