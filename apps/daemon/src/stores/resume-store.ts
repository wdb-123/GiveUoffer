import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  GenerateResumePreviewRequest,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDiagnosisReport,
  ResumeDocument,
  ResumeSummary,
  SaveGeneratedResumeRequest,
  SaveGeneratedResumeResult,
} from "@ucareer/shared";
import { isInsideDir } from "../path-guards";
import { workspaceDataPath } from "../workspace-paths";

interface ResumeJobLinkStore {
  updatedAt?: string;
  links?: Array<{
    file?: string;
    title?: string;
    baseFile?: string;
    jobId?: string;
    jobTitle?: string;
    company?: string;
    role?: string;
    generatedAt?: string;
    engine?: string;
  }>;
}

export interface ResumeStore {
  listResumes(): Promise<ResumeSummary[]>;
  getResume(file: string): Promise<ResumeDocument | undefined>;
  listDiagnosisReports(resumeFile?: string): Promise<ResumeDiagnosisReport[]>;
  generatePreview(input: GenerateResumePreviewRequest, jobs: MarketJob[]): Promise<GenerateResumePreviewResult>;
  saveGeneratedResume(input: SaveGeneratedResumeRequest): Promise<SaveGeneratedResumeResult>;
  saveResume(input: { file?: string; title: string; markdown: string; baseFile?: string; targetJobId?: string; targetJobTitle?: string }): Promise<ResumeDocument>;
  saveDiagnosis(input: { file?: string; title: string; markdown: string; resumeFile?: string; targetJobId?: string }): Promise<{ file: string; title: string; path: string; resumeFile: string; targetJobId: string; updatedAt: string }>;
  deleteResume(file: string): Promise<string>;
}

export function createResumeStore(workspaceRoot: string): ResumeStore {
  const resumesDir = workspaceDataPath(workspaceRoot, "resumeLibrary");
  const diagnosticsDir = workspaceDataPath(workspaceRoot, "resumeDiagnostics");
  const resumeJobLinksPath = workspaceDataPath(workspaceRoot, "resumeJobLinks");

  return {
    async listResumes() {
      const linkStore = await readResumeJobLinks(resumeJobLinksPath);
      const linksByFile = new Map((linkStore.links || []).map((item) => [item.file, item]));
      const files = (await readDirectorySafe(resumesDir))
        .filter(isResumeMarkdownFile)
        .sort();

      return Promise.all(files.map(async (file) => {
        const markdown = await readFile(join(resumesDir, file), "utf8");
        const title = extractResumeTitle(markdown, file);
        const link = linksByFile.get(file);
        return {
          file,
          title,
          targetJobId: link?.jobId || "",
          targetJobTitle: link?.jobTitle || "",
          generatedAt: link?.generatedAt || "",
        };
      }));
    },

    async getResume(file) {
      if (!isResumeMarkdownFile(file)) return undefined;
      const path = resolve(resumesDir, file);
      if (!isInsideDir(resumesDir, path) || !existsSync(path)) return undefined;
      const markdown = await readFile(path, "utf8");
      return {
        file,
        title: extractResumeTitle(markdown, file),
        markdown,
      };
    },

    async listDiagnosisReports(resumeFile) {
      const files = await readDirectorySafe(diagnosticsDir);
      const reports = await Promise.all(files
        .filter(isDiagnosisMarkdownFile)
        .map(async (file) => readDiagnosisReport(diagnosticsDir, file)));
      const normalizedResumeFile = String(resumeFile || "").trim();
      return reports
        .filter((report) => !normalizedResumeFile || report.resumeFile === normalizedResumeFile || report.file.startsWith(slugifyFileName(normalizedResumeFile.replace(/\.md$/, ""))))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async generatePreview(input, jobs) {
      const baseFile = isResumeMarkdownFile(input.baseFile) ? input.baseFile : (await this.listResumes())[0]?.file || "";
      if (!baseFile) throw new Error("No base resume found");
      const base = await this.getResume(baseFile);
      if (!base) throw new Error(`Base resume not found: ${baseFile}`);
      const targetJob = jobs.find((job) => job.id === input.targetJobId) || jobs[0];
      const title = buildGeneratedTitle(base.title, targetJob);
      return {
        title,
        markdown: buildPreviewMarkdown({ title, baseMarkdown: base.markdown, targetJob }),
        baseFile,
        targetJobId: targetJob?.id || "",
        targetJobTitle: targetJob ? [targetJob.company, targetJob.role].filter(Boolean).join(" · ") : "",
        engine: "local-preview",
      };
    },

    async saveGeneratedResume(input) {
      const title = String(input.title || "").trim() || extractResumeTitle(input.markdown || "", "generated-resume.md");
      const markdown = normalizeGeneratedMarkdown(title, input.markdown);
      await mkdir(resumesDir, { recursive: true });
      const existing = await this.listResumes();
      const targetJobTitle = String(input.targetJobTitle || "").trim();
      const file = nextReadableResumeFile(title, targetJobTitle, existing.map((item) => item.file));
      await writeFile(join(resumesDir, file), markdown, "utf8");
      const generatedAt = new Date().toISOString();
      const { company, role } = splitTargetJobTitle(targetJobTitle);
      await upsertResumeJobLink(resumeJobLinksPath, {
        file,
        title,
        baseFile: input.baseFile || "",
        jobId: input.targetJobId || "",
        jobTitle: targetJobTitle,
        company,
        role,
        generatedAt,
        engine: "local-preview",
      });
      return {
        file,
        title,
        baseFile: input.baseFile || "",
        targetJobId: input.targetJobId || "",
        targetJobTitle,
        generatedAt,
      };
    },

    async saveResume(input) {
      const title = String(input.title || "").trim() || extractResumeTitle(input.markdown || "", "generated-resume.md");
      const markdown = normalizeGeneratedMarkdown(title, input.markdown);
      const existing = await this.listResumes();
      const targetJobTitle = String(input.targetJobTitle || "").trim();
      const file = input.file && isResumeMarkdownFile(input.file)
        ? input.file
        : nextReadableResumeFile(title, targetJobTitle, existing.map((item) => item.file));
      const path = resolve(resumesDir, file);
      if (!isInsideDir(resumesDir, path)) throw new Error("Invalid resume file");
      await mkdir(resumesDir, { recursive: true });
      await writeFile(path, markdown, "utf8");
      if (input.targetJobId || targetJobTitle || input.baseFile) {
        const { company, role } = splitTargetJobTitle(targetJobTitle);
        await upsertResumeJobLink(resumeJobLinksPath, {
          file,
          title,
          baseFile: input.baseFile || "",
          jobId: input.targetJobId || "",
          jobTitle: targetJobTitle,
          company,
          role,
          generatedAt: new Date().toISOString(),
          engine: "agent-tool",
        });
      }
      return { file, title, markdown };
    },

    async saveDiagnosis(input) {
      const title = String(input.title || "").trim() || "简历诊断报告";
      const markdown = normalizeDiagnosisMarkdown(title, input.markdown, {
        resumeFile: input.resumeFile || "",
        targetJobId: input.targetJobId || "",
      });
      const file = input.file && isDiagnosisMarkdownFile(input.file)
        ? input.file
        : buildDiagnosisFileName(title, input.resumeFile);
      const path = resolve(diagnosticsDir, file);
      if (!isInsideDir(diagnosticsDir, path)) throw new Error("Invalid resume diagnosis file");
      await mkdir(diagnosticsDir, { recursive: true });
      await writeFile(path, markdown, "utf8");
      return {
        file,
        title,
        path: `workspace/resumes/diagnostics/${file}`,
        resumeFile: input.resumeFile || "",
        targetJobId: input.targetJobId || "",
        updatedAt: new Date().toISOString(),
      };
    },

    async deleteResume(file) {
      if (!isResumeMarkdownFile(file)) throw new Error("Invalid resume file");
      const path = resolve(resumesDir, file);
      if (!isInsideDir(resumesDir, path) || !existsSync(path)) throw new Error(`Resume not found: ${file}`);
      await rm(path);
      await removeResumeJobLink(resumeJobLinksPath, file);
      return file;
    },
  };
}

function isResumeMarkdownFile(file: string): boolean {
  if (!/^[^/\\]+\.md$/u.test(file)) return false;
  return !["README.md", "ARCHITECTURE.md"].includes(file);
}

function extractResumeTitle(markdown: string, file: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "");
}

function buildGeneratedTitle(baseTitle: string, targetJob?: MarketJob): string {
  const role = targetJob?.role || baseTitle.split("-").pop()?.trim() || "目标岗位";
  return `韦东波 - ${role}`;
}

function buildPreviewMarkdown(input: { title: string; baseMarkdown: string; targetJob: MarketJob | undefined }): string {
  const contact = input.baseMarkdown.match(/^#.+\n([\s\S]*?)(?=\n##\s+)/)?.[1]?.trim() || "";
  const keywords = [
    ...(input.targetJob?.keywords || []),
    input.targetJob?.direction || "",
  ].filter(Boolean).slice(0, 18);
  const baseSections = input.baseMarkdown
    .replace(/^#.+$/m, "")
    .trim()
    .slice(0, 9000);
  return `# ${input.title}
${contact ? `${contact}\n` : ""}
## 个人摘要

面向${input.targetJob ? `${input.targetJob.company || "目标公司"} / ${input.targetJob.role || "目标岗位"}` : "目标岗位"}生成的本地规则预览版简历。重点对齐岗位信号：${keywords.slice(0, 10).join("、") || "待补充"}。

## 岗位匹配重点

${input.targetJob ? `- 公司：${input.targetJob.company || "待确认"}
- 岗位：${input.targetJob.role || "待确认"}
- 地点：${input.targetJob.location || "待确认"}
- 匹配分：${typeof input.targetJob.matchScore === "number" ? input.targetJob.matchScore.toFixed(1) : "待评估"}
- 证据缺口：${input.targetJob.evidenceGap || "待补充"}` : "- 暂无目标岗位，使用基础简历生成预览。"}

## 原始简历内容

${baseSections}

## 待人工确认

- 核对所有量化指标，避免写入未确认事实。
- 根据目标 JD 调整项目排序和关键词密度。
- 保存前建议补充证据请求中的缺口材料。
`;
}

function normalizeGeneratedMarkdown(title: string, markdown: string): string {
  const text = String(markdown || "").trim();
  if (!text) throw new Error("Generated resume markdown is required");
  const normalized = text.startsWith("# ") ? text : `# ${title}\n\n${text}`;
  return `${normalized.trim()}\n`;
}

function normalizeDiagnosisMarkdown(title: string, markdown: string, meta: { resumeFile: string; targetJobId: string }): string {
  const text = String(markdown || "").trim();
  if (!text) throw new Error("Resume diagnosis markdown is required");
  const hasTitle = text.startsWith("# ");
  const body = hasTitle ? text : `# ${title}\n\n${text}`;
  const metadata = [
    `**Resume:** ${meta.resumeFile || "待补充"}`,
    `**Target Job:** ${meta.targetJobId || "未绑定"}`,
    `**Generated At:** ${new Date().toISOString()}`,
  ].join("\n");
  return `${body.trim()}\n\n---\n\n${metadata}\n`;
}

function isDiagnosisMarkdownFile(file: string): boolean {
  return /^[^/\\]+\.md$/u.test(file) && !["README.md", "ARCHITECTURE.md"].includes(file);
}

function buildDiagnosisFileName(title: string, resumeFile?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = resumeFile?.replace(/\.md$/, "") || title;
  return `${slugifyFileName(base)}-diagnosis-${date}.md`;
}

function slugifyFileName(value: string): string {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 90) || "resume";
}

function nextReadableResumeFile(title: string, targetJobTitle: string, existingFiles: string[]): string {
  const base = buildReadableResumeName(title, targetJobTitle);
  const used = new Set(existingFiles);
  let candidate = `${base}.md`;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}.md`;
    index += 1;
  }
  return candidate;
}

function buildReadableResumeName(title: string, targetJobTitle: string): string {
  const cleanedTitle = stripPersonName(title);
  const { company, role } = splitTargetJobTitle(targetJobTitle);
  const targetRole = normalizeResumeNamePart(role || cleanedTitle || "机器人系统工程师");
  const suffix = company ? normalizeResumeNamePart(company) : inferResumePurpose(cleanedTitle);
  return slugifyFileName(`简历-${targetRole}-${suffix}`);
}

function stripPersonName(title: string): string {
  return String(title || "")
    .replace(/^[\u4e00-\u9fa5]{2,4}\s*[-—–]\s*/u, "")
    .trim();
}

function normalizeResumeNamePart(value: string): string {
  return String(value || "")
    .replace(/[【】[\]（）()]/gu, " ")
    .replace(/\s+/gu, "")
    .replace(/[\\/|:*?"<>]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32) || "通用";
}

function inferResumePurpose(title: string): string {
  if (/通用|基础|系统工程师|软件|SDK|具身|RAG|Agent/i.test(title)) return "通用";
  return "通用";
}

async function readResumeJobLinks(path: string): Promise<ResumeJobLinkStore> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as ResumeJobLinkStore;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { links: [] };
    throw error;
  }
}

async function readDirectorySafe(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function readDiagnosisReport(dir: string, file: string): Promise<ResumeDiagnosisReport> {
  const path = resolve(dir, file);
  if (!isInsideDir(dir, path)) throw new Error("Invalid resume diagnosis file");
  const markdown = await readFile(path, "utf8");
  const title = extractResumeTitle(markdown, file);
  const resumeFile = extractMetadataValue(markdown, "Resume");
  const targetJobId = extractMetadataValue(markdown, "Target Job");
  const updatedAt = extractMetadataValue(markdown, "Generated At") || "";
  return {
    file,
    title,
    path: `workspace/resumes/diagnostics/${file}`,
    resumeFile: resumeFile === "待补充" ? "" : resumeFile,
    targetJobId: targetJobId === "未绑定" ? "" : targetJobId,
    updatedAt,
    excerpt: compactMarkdown(markdown, 180),
    markdown,
  };
}

function extractMetadataValue(markdown: string, key: string): string {
  return markdown.match(new RegExp(`^\\*\\*${escapeRegExp(key)}:\\*\\*\\s*(.+?)\\s*$`, "m"))?.[1]?.trim() || "";
}

function compactMarkdown(markdown: string, limit: number): string {
  const compact = markdown
    .replace(/^---[\s\S]*$/m, "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>\-[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function upsertResumeJobLink(path: string, link: NonNullable<ResumeJobLinkStore["links"]>[number]): Promise<void> {
  const current = await readResumeJobLinks(path);
  const links = (current.links || []).filter((item) => item.file !== link.file);
  const next: ResumeJobLinkStore = {
    links: [...links, link],
  };
  if (link.generatedAt) next.updatedAt = link.generatedAt;
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function removeResumeJobLink(path: string, file: string): Promise<void> {
  const current = await readResumeJobLinks(path);
  const nextLinks = (current.links || []).filter((item) => item.file !== file);
  const next: ResumeJobLinkStore = {
    links: nextLinks,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function splitTargetJobTitle(targetJobTitle: string): { company: string; role: string } {
  const [company = "", ...rest] = targetJobTitle.split(" · ");
  return {
    company: company.trim(),
    role: rest.join(" · ").trim(),
  };
}
