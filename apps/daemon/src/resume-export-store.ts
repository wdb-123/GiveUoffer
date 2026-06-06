import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { chromium } from "playwright";
import type { ExportResumeRequest, ExportResumeResult, ResumeExportFormat } from "@offeru/shared";
import { isInsideDir } from "./path-guards";

export interface ResumeExportStore {
  exportResume(input: ExportResumeRequest): Promise<ExportResumeResult>;
}

export function createResumeExportStore(workspaceRoot: string): ResumeExportStore {
  const resumesDir = join(workspaceRoot, "resumes");
  const outputDir = join(workspaceRoot, "output/exports");

  return {
    async exportResume(input) {
      const format = input.format;
      if (!isExportFormat(format)) throw new Error(`Unsupported export format: ${String(format)}`);
      const file = validateResumeFile(input.file);
      const sourcePath = resolve(resumesDir, file);
      if (!isInsideDir(resumesDir, sourcePath)) throw new Error("Invalid resume file");
      const markdown = await readFile(sourcePath, "utf8");
      const title = markdown.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "");
      const exportedAt = new Date().toISOString();
      await mkdir(outputDir, { recursive: true });
      const outputBase = `${file.replace(/\.md$/, "")}-${format}`;
      const outputPath = join(outputDir, `${outputBase}.${format}`);

      if (format === "md") {
        await writeFile(outputPath, markdown, "utf8");
      } else if (format === "html") {
        await writeFile(outputPath, renderResumeHtml(markdown, title), "utf8");
      } else if (format === "pdf") {
        await renderResumePdf(renderResumeHtml(markdown, title), outputPath);
      } else if (format === "docx") {
        const renderer = await import("../../../visualizer/services/render-service.mjs") as unknown as {
          renderResumeDocx(markdown: string, title: string): Promise<Buffer>;
        };
        await writeFile(outputPath, await renderer.renderResumeDocx(markdown, title));
      }

      const info = await stat(outputPath);
      return {
        file: basename(outputPath),
        sourceFile: file,
        format,
        outputPath,
        sizeBytes: info.size,
        exportedAt,
      };
    },
  };
}

function validateResumeFile(file: string): string {
  if (!/^\d{2}-.+\.md$/.test(file)) throw new Error("Invalid resume file");
  return file;
}

function isExportFormat(format: unknown): format is ResumeExportFormat {
  return format === "md" || format === "html" || format === "pdf" || format === "docx";
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
