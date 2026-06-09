import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import type { ResumeExportFormat } from "@ucareer/shared";

const execFileAsync = promisify(execFile);

export async function renderResumeArtifact(input: {
  markdown: string;
  title: string;
  format: ResumeExportFormat;
  outputPath: string;
}): Promise<void> {
  if (input.format === "md") {
    await writeFile(input.outputPath, input.markdown, "utf8");
    return;
  }
  if (input.format === "html") {
    await writeFile(input.outputPath, renderResumeHtml(input.markdown, input.title), "utf8");
    return;
  }
  if (input.format === "pdf") {
    await renderResumePdf(renderResumeHtml(input.markdown, input.title), input.outputPath);
    return;
  }
  if (input.format === "docx") {
    await writeFile(input.outputPath, await renderResumeDocx(input.markdown, input.title));
  }
}

async function renderResumePdf(html: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0.5in", right: "0.55in", bottom: "0.5in", left: "0.55in" },
    });
  } finally {
    await browser.close();
  }
}

function renderResumeHtml(markdown: string, title: string): string {
  const body = markdown
    .split(/\r?\n/)
    .map((line) => renderMarkdownLine(line))
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { color: #1f2522; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; margin: 0; }
main { margin: 0 auto; max-width: 840px; padding: 28px; }
h1 { font-size: 30px; margin: 0 0 14px; }
h2 { border-bottom: 1px solid #d7ddd5; font-size: 18px; margin: 22px 0 10px; padding-bottom: 5px; }
h3 { font-size: 15px; margin: 16px 0 8px; }
p, li { font-size: 12px; }
ul { margin: 6px 0 10px; padding-left: 20px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function renderMarkdownLine(line: string): string {
  const text = line.trim();
  if (!text) return "";
  const heading = text.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = (heading[1] || "#").length;
    const headingText = heading[2] || "";
    return `<h${level}>${escapeHtml(stripInlineMarkdown(headingText))}</h${level}>`;
  }
  const bullet = text.match(/^[-*]\s+(.+)$/);
  if (bullet) return `<ul><li>${escapeHtml(stripInlineMarkdown(bullet[1] || ""))}</li></ul>`;
  return `<p>${escapeHtml(stripInlineMarkdown(text))}</p>`;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderResumeDocx(markdown: string, title: string): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "Ucareer-docx-"));
  try {
    await mkdir(join(tempDir, "_rels"), { recursive: true });
    await mkdir(join(tempDir, "docProps"), { recursive: true });
    await mkdir(join(tempDir, "word", "_rels"), { recursive: true });

    await writeFile(join(tempDir, "[Content_Types].xml"), docxContentTypesXml(), "utf8");
    await writeFile(join(tempDir, "_rels", ".rels"), docxRootRelsXml(), "utf8");
    await writeFile(join(tempDir, "docProps", "core.xml"), docxCoreXml(title), "utf8");
    await writeFile(join(tempDir, "docProps", "app.xml"), docxAppXml(), "utf8");
    await writeFile(join(tempDir, "word", "_rels", "document.xml.rels"), docxDocumentRelsXml(), "utf8");
    await writeFile(join(tempDir, "word", "styles.xml"), docxStylesXml(), "utf8");
    await writeFile(join(tempDir, "word", "document.xml"), markdownToDocxDocumentXml(markdown), "utf8");

    const outputPath = join(tempDir, "resume.docx");
    await execFileAsync("zip", ["-qr", outputPath, "[Content_Types].xml", "_rels", "docProps", "word"], { cwd: tempDir });
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function markdownToDocxDocumentXml(markdown: string): string {
  const paragraphs = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(markdownLineToDocxParagraph)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function markdownLineToDocxParagraph(rawLine: string): string {
  const heading = rawLine.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const headingMarker = heading[1] || "#";
    const style = headingMarker.length === 1 ? "Title" : `Heading${Math.min(headingMarker.length, 3)}`;
    return docxParagraph(stripInlineMarkdown(heading[2] || ""), style);
  }
  const bullet = rawLine.match(/^[-*]\s+(.+)$/);
  if (bullet) return docxParagraph(`- ${stripInlineMarkdown(bullet[1] || "")}`, "ListParagraph");
  if (/^---+$/.test(rawLine)) return docxParagraph("", "Separator");
  return docxParagraph(stripInlineMarkdown(rawLine), "BodyText");
}

function docxParagraph(text: string, style: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-package.extended-properties+xml"/>
</Types>`;
}

function docxRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function docxDocumentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function docxCoreXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title || "Resume")}</dc:title>
  <dc:creator>Ucareer</dc:creator>
  <cp:lastModifiedBy>Ucareer</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function docxAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/wordprocessingml/2006/docPropsVTypes">
  <Application>Ucareer</Application>
</Properties>`;
}

function docxStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="34"/></w:rPr><w:pPr><w:spacing w:after="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="24"/></w:rPr><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="334155"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="70" w:line="260" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="BodyText"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Separator"><w:name w:val="Separator"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D6DDE5"/></w:pBdr></w:pPr></w:style>
</w:styles>`;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
