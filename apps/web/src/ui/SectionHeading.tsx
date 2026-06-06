import type { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  summary?: ReactNode;
}

export function SectionHeading({ eyebrow, title, meta, summary }: SectionHeadingProps) {
  return (
    <div className="panel-heading section-heading">
      <div>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {summary ? <p className="section-summary">{summary}</p> : null}
      </div>
      {meta ? <span className="section-heading-meta">{meta}</span> : null}
    </div>
  );
}
