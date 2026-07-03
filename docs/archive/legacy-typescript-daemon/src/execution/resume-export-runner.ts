import { execFile } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import type { ResumeExportFormat, ResumeExportStyle } from "@ucareer/shared";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
type TextResumeBlock = { type: "h1" | "h2" | "h3" | "p" | "contact"; text: string };
type ResumeBlock = TextResumeBlock | { type: "ul"; items: string[] };

export async function renderResumeArtifact(input: {
  markdown: string;
  title: string;
  format: ResumeExportFormat;
  style?: ResumeExportStyle;
  outputPath: string;
}): Promise<void> {
  const style = input.style || "classic";
  if (input.format === "md") {
    await writeFile(input.outputPath, input.markdown, "utf8");
    return;
  }
  if (input.format === "html") {
    await writeFile(input.outputPath, renderResumeHtml(input.markdown, input.title, style), "utf8");
    return;
  }
  if (input.format === "pdf") {
    await renderResumePdf(renderResumeHtml(input.markdown, input.title, style), input.outputPath);
    return;
  }
  if (input.format === "docx") {
    await writeFile(input.outputPath, await renderResumeDocx(input.markdown, input.title, style));
  }
}

async function renderResumePdf(html: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }
}

function renderResumeHtml(markdown: string, title: string, style: ResumeExportStyle): string {
  const pages = paginateMarkdown(markdown);
  const body = pages.map((blocks, index) => renderResumePage(blocks, title, index === 0)).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${resumeExportCss(style)}</style>
</head>
<body class="resume-export-${style}">${body || `<section class="resume-page-v2"><div class="resume-page-content-v2"></div></section>`}</body>
</html>`;
}

function resumeExportCss(style: ResumeExportStyle): string {
  const css = readFileSync(resolve(workspaceRoot, "apps/web/src/sections/resume/resume.css"), "utf8");
  const start = css.indexOf(".resume-page-v2");
  const end = css.indexOf(".resume-deck-controls-v2");
  const resumePageCss = start >= 0 && end > start ? css.slice(start, end) : "";
  return `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body {
  --muted: #64748b;
  background: #ffffff;
  color: #263445;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  margin: 0;
}
${resumePageCss}
.resume-page-v2 {
  border: 0;
  box-shadow: none;
  height: 297mm;
  page-break-after: always;
  width: 210mm;
}
.resume-page-v2:last-child { page-break-after: auto; }
${resumeExportStyleCss(style)}
`;
}

function resumeExportStyleCss(style: ResumeExportStyle): string {
  if (style === "compact") {
    return `.resume-export-compact .resume-page-content-v2{padding:30px 34px}.resume-export-compact .resume-page-content-v2{font-size:10.5px;line-height:1.28}.resume-export-compact .resume-page-content-v2 h2{margin-top:7px;margin-bottom:3px}.resume-export-compact .resume-page-content-v2 ul{margin-top:2px;margin-bottom:4px}.resume-export-compact .resume-header-v2{margin-bottom:8px;padding-bottom:7px}`;
  }
  if (style === "ats") {
    return `.resume-export-ats .resume-page-content-v2{padding:34px 38px;font-family:Arial,"Microsoft YaHei",sans-serif}.resume-export-ats .resume-avatar-v2{display:none}.resume-export-ats .resume-header-v2{display:block;border-bottom:1px solid #cbd5e1;margin-bottom:10px;padding-bottom:8px}.resume-export-ats .resume-page-content-v2 h2{border-left:0;border-bottom:1px solid #cbd5e1;padding-left:0;background:transparent}.resume-export-ats .resume-page-content-v2 p,.resume-export-ats .resume-page-content-v2 li{color:#111827}.resume-export-ats .resume-section-summary{background:transparent;border-left:0;padding:0}`;
  }
  if (style === "bluebar") {
    return `.resume-export-bluebar .resume-page-content-v2{padding:28px 36px;font-size:10.8px;line-height:1.32;color:#151b23}.resume-export-bluebar .resume-header-v2{align-items:center;border-bottom:4px solid #2c638f;gap:14px;grid-template-columns:64px minmax(0,1fr);margin-bottom:7px;padding-bottom:7px}.resume-export-bluebar .resume-identity-v2{align-items:center;column-gap:16px;display:grid;grid-column:2;grid-template-columns:160px minmax(0,1fr)}.resume-export-bluebar .resume-identity-v2 h1{color:#2c638f;font-size:19px;grid-row:span 2}.resume-export-bluebar .resume-contact-line{color:#1f2937;display:grid;font-size:10.5px;gap:2px 12px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;max-width:none}.resume-export-bluebar .resume-contact-line span{display:block;overflow:hidden;text-overflow:ellipsis}.resume-export-bluebar .resume-role-v2::before{content:"岗位："}.resume-export-bluebar .resume-contact-line span:not(:last-child)::after{display:none}.resume-export-bluebar .resume-contact-line span:nth-child(1)::before{content:"地点："}.resume-export-bluebar .resume-contact-line span:nth-child(2)::before{content:"工作时间："}.resume-export-bluebar .resume-contact-line span:nth-child(3)::before{content:"联系方式："}.resume-export-bluebar .resume-contact-line span:nth-child(4)::before{content:"邮箱："}.resume-export-bluebar .resume-contact-line span:nth-child(5){grid-column:1/-1;margin-top:2px}.resume-export-bluebar .resume-contact-line span:nth-child(5)::before{content:"链接："}.resume-export-bluebar .resume-avatar-v2{grid-column:1;grid-row:1;justify-self:start;width:56px}.resume-export-bluebar .resume-avatar-v2 img{border-radius:0;width:56px}.resume-export-bluebar .resume-page-content-v2 h2{background:linear-gradient(to right,#2c638f 0 92px,#eef1f4 92px 100%);border-bottom:0;color:#fff;font-size:11.5px;margin:6px 0 4px;min-height:18px;padding:0;width:100%}.resume-export-bluebar .resume-page-content-v2 h2::before{background:#2c638f;height:18px;margin-right:6px;width:5px}.resume-export-bluebar .resume-section-summary,.resume-export-bluebar .resume-section-skills{background:transparent;border:0;box-shadow:none;padding-left:0;padding-right:0}.resume-export-bluebar .resume-page-content-v2 h3{font-size:11.5px;margin:4px 0 2px}.resume-export-bluebar .resume-page-content-v2 ul{margin:2px 0 4px}.resume-export-bluebar .resume-page-content-v2 li{margin:1px 0}`;
  }
  return "";
}

function renderResumePage(blocks: ResumeBlock[], fallbackTitle: string, showHeader: boolean): string {
  const titleBlock = blocks.find((block): block is TextResumeBlock => block.type === "h1");
  const contactBlock = blocks.find((block): block is TextResumeBlock => block.type === "contact");
  const titleParts = splitResumeTitle(titleBlock?.text || fallbackTitle);
  const body = blocks.filter((block) => block.type !== "h1" && block.type !== "contact");
  let activeSection = "";
  const header = showHeader
    ? `<header class="resume-header-v2"><div class="resume-identity-v2"><h1><span class="resume-name-v2">${escapeHtml(titleParts.name)}</span><span class="resume-role-v2">${escapeHtml(titleParts.role)}</span></h1>${renderContactLine(contactBlock?.text || "")}</div><figure class="resume-avatar-v2"><img src="${headshotUrl()}" alt="职业照"></figure></header>`
    : "";
  const content = body.map((block) => {
    if (block.type === "h2") activeSection = block.text;
    return renderResumeBlock(block, activeSection);
  }).join("\n");
  return `<section class="resume-page-v2"><div class="resume-page-content-v2">${header}${content}</div></section>`;
}

function splitResumeTitle(title: string): { name: string; role: string } {
  const [name = title, ...roleParts] = title.split(/\s*[-—–]\s*/u);
  const role = roleParts.join(" - ").trim().replace(/^AI\s*[+＋]\s*/iu, "");
  return { name: name.trim() || title, role };
}

function renderContactLine(value: string): string {
  const items = value.split("|").map((item) => item.trim()).filter(Boolean);
  return `<div class="resume-contact-line" aria-label="联系方式">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderResumeBlock(block: ResumeBlock, section: string): string {
  const sectionClass = `resume-section-${slugResumeSection(section)}`;
  if (block.type === "h2") return `<h2 class="${sectionClass}">${escapeHtml(block.text)}</h2>`;
  if (block.type === "h3") return `<h3 class="${sectionClass}">${escapeHtml(block.text)}</h3>`;
  if (block.type === "ul") return `<ul class="${sectionClass}">${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  return `<p class="${sectionClass}">${escapeHtml(block.text)}</p>`;
}

function headshotUrl(): string {
  const headshot = readFileSync(resolve(workspaceRoot, "apps/web/public/assets/headshot.png")).toString("base64");
  return `data:image/png;base64,${headshot}`;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

function paginateMarkdown(markdown: string): ResumeBlock[][] {
  const blocks = parseResumeMarkdown(markdown);
  if (!blocks.length) return [];
  const pages: ResumeBlock[][] = [];
  let current: ResumeBlock[] = [];
  let weight = 0;
  const pageWeightLimit = 82;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const nextWeight = blockWeight(block);
    const followingBlock = blocks[index + 1];
    const previousBlock = current[current.length - 1];
    const keepsHeadingWithBody = previousBlock?.type === "h2" && block.type === "ul";
    const wouldLeaveHeadingAtPageEnd =
      current.length > 0 &&
      (block.type === "h2" || block.type === "h3") &&
      followingBlock &&
      weight + nextWeight <= pageWeightLimit &&
      weight + nextWeight + blockWeight(followingBlock) > pageWeightLimit;
    if (wouldLeaveHeadingAtPageEnd) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    if (previousBlock?.type === "h3" && block.type === "ul" && weight + nextWeight > pageWeightLimit && current.length > 1) {
      current.pop();
      pages.push(current);
      current = [previousBlock];
      weight = blockWeight(previousBlock);
    }
    if (current.length && weight + nextWeight > pageWeightLimit && !keepsHeadingWithBody) {
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
  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (skipStrategy && line.startsWith("## ")) skipStrategy = false;
    if (skipStrategy) continue;
    if (!line) {
      flushList();
      continue;
    }
    if (headerSeen && !contactCaptured && !line.startsWith("#") && !line.startsWith("- ")) {
      flushList();
      blocks.push({ type: "contact", text: stripInlineMarkdown(line) });
      contactCaptured = true;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1];
    if (bullet) {
      list.push(stripInlineMarkdown(bullet));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: stripInlineMarkdown(line.slice(4)) });
    else if (line.startsWith("## ")) {
      const sectionTitle = stripInlineMarkdown(line.slice(3));
      if (sectionTitle === "投递定位") {
        skipStrategy = true;
        continue;
      }
      blocks.push({ type: "h2", text: sectionTitle });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: stripInlineMarkdown(line.slice(2)) });
      headerSeen = true;
    } else {
      blocks.push({ type: "p", text: stripInlineMarkdown(line) });
    }
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

function slugResumeSection(section: string): string {
  if (section.includes("个人摘要")) return "summary";
  if (section.includes("核心技能")) return "skills";
  if (section.includes("项目")) return "projects";
  if (section.includes("工作")) return "work";
  if (section.includes("教育")) return "education";
  if (section.includes("荣誉")) return "honors";
  return "default";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderResumeDocx(markdown: string, title: string, style: ResumeExportStyle): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "Ucareer-docx-"));
  try {
    await mkdir(join(tempDir, "_rels"), { recursive: true });
    await mkdir(join(tempDir, "docProps"), { recursive: true });
    await mkdir(join(tempDir, "word", "media"), { recursive: true });
    await mkdir(join(tempDir, "word", "_rels"), { recursive: true });

    await writeFile(join(tempDir, "[Content_Types].xml"), docxContentTypesXml(), "utf8");
    await writeFile(join(tempDir, "_rels", ".rels"), docxRootRelsXml(), "utf8");
    await writeFile(join(tempDir, "docProps", "core.xml"), docxCoreXml(title), "utf8");
    await writeFile(join(tempDir, "docProps", "app.xml"), docxAppXml(), "utf8");
    await writeFile(join(tempDir, "word", "_rels", "document.xml.rels"), docxDocumentRelsXml(), "utf8");
    await writeFile(join(tempDir, "word", "styles.xml"), docxStylesXml(style), "utf8");
    copyFileSync(resolve(workspaceRoot, "apps/web/public/assets/headshot.png"), join(tempDir, "word", "media", "headshot.png"));
    await writeFile(join(tempDir, "word", "document.xml"), markdownToDocxDocumentXml(markdown, title, style), "utf8");

    const outputPath = join(tempDir, "resume.docx");
    await execFileAsync("zip", ["-qr", outputPath, "[Content_Types].xml", "_rels", "docProps", "word"], { cwd: tempDir });
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function markdownToDocxDocumentXml(markdown: string, fallbackTitle: string, style: ResumeExportStyle): string {
  const pages = paginateMarkdown(markdown);
  const content = (pages.length ? pages : [[]])
    .map((blocks, index) => renderDocxPage(blocks, fallbackTitle, index === 0, index < pages.length - 1, style))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${content}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="600" w:right="630" w:bottom="600" w:left="630" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function renderDocxPage(blocks: ResumeBlock[], fallbackTitle: string, showHeader: boolean, pageBreakAfter: boolean, style: ResumeExportStyle): string {
  const titleBlock = blocks.find((block): block is TextResumeBlock => block.type === "h1");
  const contactBlock = blocks.find((block): block is TextResumeBlock => block.type === "contact");
  const body = blocks.filter((block) => block.type !== "h1" && block.type !== "contact");
  let activeSection = "";
  const content = body.flatMap((block) => {
    if (block.type === "h2") activeSection = block.text;
    return resumeBlockToDocxParagraphs(block, activeSection);
  }).join("");

  return `${showHeader ? docxHeader(titleBlock?.text || fallbackTitle, contactBlock?.text || "", style) : ""}${content}${pageBreakAfter ? docxPageBreak() : ""}`;
}

function resumeBlockToDocxParagraphs(block: ResumeBlock, section: string): string[] {
  const sectionSlug = slugResumeSection(section);
  if (block.type === "h1" || block.type === "contact") return [];
  if (block.type === "h2") return [docxParagraph(block.text, "Heading2")];
  if (block.type === "h3") {
    const style = sectionSlug === "projects" || sectionSlug === "work" ? "Heading3Accent" : "Heading3";
    return [docxParagraph(block.text, style)];
  }
  if (block.type === "ul") {
    const style = sectionSlug === "skills" ? "SkillsListParagraph" : "ListParagraph";
    const list = block.items.map((item) => docxParagraph(`• ${item}`, style));
    return sectionSlug === "skills" ? [docxParagraph("", "SkillsBoxTop"), ...list, docxParagraph("", "SkillsBoxBottom")] : list;
  }
  if (sectionSlug === "summary") return [docxParagraph(block.text, "SummaryText")];
  return [docxParagraph(block.text, "BodyText")];
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

function docxHeader(title: string, contact: string, style: ResumeExportStyle): string {
  const contactText = contact.split("|").map((item) => item.trim()).filter(Boolean).join(" • ");
  if (style === "ats") return `${docxParagraph(title, "Title")}${docxParagraph(contactText, "Contact")}${docxParagraph("", "HeaderSpacer")}`;
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:bottom w:val="single" w:sz="18" w:space="8" w:color="111827"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>
    <w:tblGrid><w:gridCol w:w="9680"/><w:gridCol w:w="980"/></w:tblGrid>
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="9680" w:type="dxa"/><w:vAlign w:val="top"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr>${docxParagraph(title, "Title")}${docxParagraph(contactText, "Contact")}</w:tc>
      <w:tc><w:tcPr><w:tcW w:w="980" w:type="dxa"/><w:vAlign w:val="top"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r>${docxImage()}</w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>${docxParagraph("", "HeaderSpacer")}`;
}

function docxImage(): string {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="704850" cy="881063"/>
    <wp:docPr id="1" name="headshot"/>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="headshot.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="704850" cy="881063"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
    </a:graphicData></a:graphic>
  </wp:inline></w:drawing>`;
}

function docxPageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function docxContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/headshot.png"/>
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

function docxStylesXml(style: ResumeExportStyle): string {
  const compact = style === "compact";
  const ats = style === "ats";
  const bluebar = style === "bluebar";
  const normalSize = compact ? "16" : "17";
  const titleSize = bluebar ? "26" : compact ? "19" : "20";
  const headingSize = compact ? "17" : "18";
  const headingBorder = ats ? "" : bluebar ? '<w:shd w:val="clear" w:fill="2C638F"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="3" w:color="2C638F"/></w:pBdr>' : '<w:pBdr><w:left w:val="single" w:sz="18" w:space="5" w:color="111827"/><w:bottom w:val="single" w:sz="4" w:space="2" w:color="D8DEE7"/></w:pBdr>';
  const summaryDecor = ats ? "" : '<w:shd w:val="clear" w:fill="F1F4F8"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="111827"/></w:pBdr><w:ind w:left="120" w:right="120"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:color w:val="263445"/><w:sz w:val="${normalSize}"/></w:rPr><w:pPr><w:spacing w:after="0" w:line="${compact ? "225" : "241"}" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="${bluebar ? "2C638F" : "111827"}"/><w:sz w:val="${titleSize}"/></w:rPr><w:pPr><w:spacing w:after="${compact ? "45" : "70"}" w:line="230" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Contact"><w:name w:val="Contact"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="64748B"/><w:sz w:val="${normalSize}"/></w:rPr><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="HeaderSpacer"><w:name w:val="Header Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="30" w:line="20" w:lineRule="exact"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="${bluebar ? "FFFFFF" : "111827"}"/><w:sz w:val="${headingSize}"/></w:rPr><w:pPr><w:spacing w:before="${compact ? "55" : "90"}" w:after="${compact ? "25" : "45"}"/>${headingBorder}</w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="111827"/><w:sz w:val="${headingSize}"/></w:rPr><w:pPr><w:spacing w:before="${compact ? "40" : "65"}" w:after="25"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3Accent"><w:name w:val="heading 3 accent"/><w:basedOn w:val="Heading3"/><w:pPr><w:spacing w:before="${compact ? "40" : "65"}" w:after="25"/>${ats ? "" : '<w:pBdr><w:left w:val="single" w:sz="18" w:space="5" w:color="111827"/></w:pBdr>'}</w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="${compact ? "18" : "35"}" w:line="${compact ? "225" : "241"}" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="SummaryText"><w:name w:val="Summary Text"/><w:basedOn w:val="BodyText"/><w:pPr><w:spacing w:before="40" w:after="${compact ? "35" : "55"}" w:line="245" w:lineRule="auto"/>${summaryDecor}</w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="BodyText"/><w:pPr><w:ind w:left="220" w:hanging="120"/><w:spacing w:after="${compact ? "12" : "20"}" w:line="${compact ? "225" : "236"}" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="SkillsListParagraph"><w:name w:val="Skills List Paragraph"/><w:basedOn w:val="ListParagraph"/><w:pPr><w:ind w:left="300" w:hanging="120"/><w:spacing w:after="20" w:line="236" w:lineRule="auto"/><w:shd w:val="clear" w:fill="FBFCFE"/><w:pBdr><w:left w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/><w:right w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/></w:pBdr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="SkillsBoxTop"><w:name w:val="Skills Box Top"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="25" w:after="0" w:line="25" w:lineRule="exact"/><w:shd w:val="clear" w:fill="FBFCFE"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="DBE3EC"/><w:left w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/><w:right w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/></w:pBdr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="SkillsBoxBottom"><w:name w:val="Skills Box Bottom"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="45" w:line="25" w:lineRule="exact"/><w:shd w:val="clear" w:fill="FBFCFE"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="DBE3EC"/><w:left w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/><w:right w:val="single" w:sz="4" w:space="8" w:color="DBE3EC"/></w:pBdr></w:pPr></w:style>
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
