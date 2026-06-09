import { blockKey, slugResumeSection, type ResumeBlock, type TextResumeBlock } from "./resumeMarkdown";

export function RenderedResumePage({ blocks, fallbackTitle, showHeader }: { blocks: ResumeBlock[]; fallbackTitle: string; showHeader: boolean }) {
  const titleBlock = blocks.find((block): block is TextResumeBlock => block.type === "h1");
  const title = titleBlock?.text || fallbackTitle;
  const contactBlock = blocks.find((block): block is TextResumeBlock => block.type === "contact");
  const body = blocks.filter((block) => block.type !== "h1" && block.type !== "contact");
  let activeSection = "";

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
      {body.map((block, index) => {
        if (block.type === "h2") activeSection = block.text;
        return (
          <ResumeBlockView
            block={block}
            section={activeSection}
            key={`${block.type}-${index}-${blockKey(block)}`}
          />
        );
      })}
    </>
  );
}

export function ResumeEmptyState() {
  return <div className="resume-empty-paper">正在读取简历。</div>;
}

function ResumeBlockView({ block, section }: { block: ResumeBlock; section: string }) {
  const sectionClass = `resume-section-${slugResumeSection(section)}`;
  if (block.type === "h2") return <h2 className={sectionClass}>{block.text}</h2>;
  if (block.type === "h3") return <h3 className={sectionClass}>{block.text}</h3>;
  if (block.type === "ul") return <ul className={sectionClass}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  return <p className={sectionClass}>{block.text}</p>;
}
