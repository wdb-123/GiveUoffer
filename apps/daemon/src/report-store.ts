import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ReportDocument, ReportsOverview, ReportSummary } from "@offeru/shared";
import { isInsideDir } from "./path-guards";

export interface ReportStore {
  listReports(): Promise<ReportsOverview>;
  getReport(file: string): Promise<ReportDocument | undefined>;
}

export function createReportStore(workspaceRoot: string): ReportStore {
  const reportsDir = join(workspaceRoot, "reports");

  return {
    async listReports() {
      const files = (await readdir(reportsDir)).filter(isReportMarkdownFile).sort();
      const reports = await Promise.all(files.map(async (file) => {
        const markdown = await readFile(join(reportsDir, file), "utf8");
        return parseReportSummary(file, markdown);
      }));
      return {
        reports,
        metrics: {
          total: reports.length,
          withScore: reports.filter((report) => report.score).length,
          highLegitimacy: reports.filter((report) => /^high\b/i.test(report.legitimacy)).length,
        },
      };
    },

    async getReport(file) {
      if (!isReportMarkdownFile(file)) return undefined;
      const path = resolve(reportsDir, file);
      if (!isInsideDir(reportsDir, path) || !existsSync(path)) return undefined;
      const markdown = await readFile(path, "utf8");
      return {
        ...parseReportSummary(file, markdown),
        markdown,
      };
    },
  };
}

function isReportMarkdownFile(file: string): boolean {
  return /^[\w.-]+\.md$/.test(file);
}

function parseReportSummary(file: string, markdown: string): ReportSummary {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "");
  return {
    file,
    title,
    date: readHeader(markdown, "Date"),
    url: readHeader(markdown, "URL"),
    score: readHeader(markdown, "Score") || readHeader(markdown, "评分"),
    recommendation: readHeader(markdown, "Recommendation") || readHeader(markdown, "建议"),
    legitimacy: readHeader(markdown, "Legitimacy"),
    excerpt: buildExcerpt(markdown),
  };
}

function readHeader(markdown: string, label: string): string {
  const pattern = new RegExp(`^\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.+?)\\s*$`, "im");
  return markdown.match(pattern)?.[1]?.trim() || "";
}

function buildExcerpt(markdown: string): string {
  return markdown
    .replace(/^#.+$/m, "")
    .replace(/^\*\*.+?\*\*.*$/gm, "")
    .replace(/^#+\s+/gm, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 260);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
