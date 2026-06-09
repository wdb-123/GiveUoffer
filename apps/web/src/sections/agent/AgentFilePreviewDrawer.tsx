import type { WorkspaceFilePreview } from "@ucareer/shared";
import type { PointerEvent } from "react";
import { AgentMarkdown } from "./AgentMarkdown";

export function AgentFilePreviewDrawer({
  preview,
  loadingPath,
  error,
  onClose,
  onResizeStart,
}: {
  preview: WorkspaceFilePreview | null;
  loadingPath: string;
  error: string;
  onClose(): void;
  onResizeStart(event: PointerEvent<HTMLButtonElement>): void;
}) {
  if (!preview && !error && !loadingPath) return null;
  return (
    <aside className="agent-file-preview-drawer" aria-label="文件预览">
      <button
        type="button"
        className="agent-file-preview-resizer"
        aria-label="调整文件预览宽度"
        onPointerDown={onResizeStart}
      />
      <div className="agent-file-preview-head">
        <div>
          <span>{preview?.fileName || "文件预览"}</span>
        </div>
        <button type="button" className="agent-file-preview-close" aria-label="关闭文件预览" onClick={onClose}>×</button>
      </div>
      <div className="agent-file-preview-panel">
        {loadingPath ? <p className="agent-file-preview-state">正在读取文件内容...</p> : null}
        {!loadingPath && error ? <p className="agent-file-preview-state">{error}</p> : null}
        {preview ? (
          <>
            {preview.previewType === "pdf" ? (
              <PdfPreview preview={preview} />
            ) : preview.previewType === "docx" ? (
              <DocxPreview preview={preview} />
            ) : preview.previewType === "text" ? (
              <FilePreviewBody preview={preview} />
            ) : (
              <p className="agent-file-preview-state">{preview.content}</p>
            )}
            {preview.truncated ? <p className="agent-file-preview-state">预览已截断，仅显示前 128 KB。</p> : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function PdfPreview({ preview }: { preview: WorkspaceFilePreview }) {
  if (!preview.dataUrl) {
    return <p className="agent-file-preview-state">PDF 预览数据不可用。</p>;
  }
  return (
    <section className="agent-file-preview-pdf" aria-label={`${preview.fileName} PDF 预览`}>
      <iframe src={preview.dataUrl} title={preview.fileName} />
    </section>
  );
}

function DocxPreview({ preview }: { preview: WorkspaceFilePreview }) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      color: #111827;
      font: 13px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      padding: 0;
    }
    h1 { font-size: 22px; margin: 0 0 14px; }
    h2 { font-size: 18px; margin: 20px 0 10px; }
    h3 { font-size: 15px; margin: 16px 0 8px; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px 20px; padding: 0; }
    table { border-collapse: collapse; margin: 10px 0 14px; width: 100%; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  </style>
</head>
<body>${preview.content}</body>
</html>`;
  return (
    <section className="agent-file-preview-docx" aria-label={`${preview.fileName} DOCX 预览`}>
      <iframe sandbox="" srcDoc={html} title={preview.fileName} />
    </section>
  );
}

function FilePreviewBody({ preview }: { preview: WorkspaceFilePreview }) {
  const mode = getPreviewMode(preview);
  if (mode === "markdown") {
    return (
      <section className="agent-file-preview-markdown">
        <AgentMarkdown text={preview.content} />
      </section>
    );
  }
  if (mode === "structured") {
    return <LineCodePreview preview={preview} className="is-structured" />;
  }
  if (mode === "code") {
    return <LineCodePreview preview={preview} className="is-code" />;
  }
  return (
    <section className="agent-file-preview-text">
      {preview.content.split(/\r?\n/u).map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`}>{line || "\u00A0"}</p>
      ))}
    </section>
  );
}

function LineCodePreview({
  preview,
  className,
}: {
  preview: WorkspaceFilePreview;
  className: string;
}) {
  const lines = preview.content.split(/\r?\n/u);
  return (
    <div className={`agent-file-preview-code ${className}`}>
      {lines.map((line, index) => (
        <div className="agent-file-preview-code-line" key={`${index}-${line.slice(0, 24)}`}>
          <span className="agent-file-preview-line-number">{index + 1}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  );
}

function getPreviewMode(filePreview: WorkspaceFilePreview): "markdown" | "structured" | "code" | "text" {
  const hint = filePreview.languageHint.toLowerCase();
  if (hint === "md") return "markdown";
  if (["json", "jsonl", "yaml", "yml", "tsv", "csv"].includes(hint)) return "structured";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "html", "xml", "sh", "zsh", "py", "rb", "java", "go", "rs", "sql"].includes(hint)) {
    return "code";
  }
  return "text";
}
