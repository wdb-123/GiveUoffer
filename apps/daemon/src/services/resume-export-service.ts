import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ExportResumeRequest, ExportResumeResult, ResumeExportFormat } from "@ucareer/shared";
import { renderResumeArtifact } from "../execution/resume-export-runner";
import { isInsideDir } from "../path-guards";

export interface ResumeExportService {
  exportResume(input: ExportResumeRequest): Promise<ExportResumeResult>;
}

export function createResumeExportService(workspaceRoot: string): ResumeExportService {
  const resumesDir = join(workspaceRoot, "workspace/resumes/library");
  const outputDir = join(workspaceRoot, "workspace/ops/exports/resumes");

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

      await renderResumeArtifact({ markdown, title, format, outputPath });

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
