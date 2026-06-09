import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  GenerateResumePreviewRequest,
  GenerateResumePreviewResult,
  MarketJob,
  ResumeDocument,
  ResumeSummary,
  SaveGeneratedResumeRequest,
  SaveGeneratedResumeResult,
} from "@ucareer/shared";
import { isInsideDir } from "../path-guards";

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
  generatePreview(input: GenerateResumePreviewRequest, jobs: MarketJob[]): Promise<GenerateResumePreviewResult>;
  saveGeneratedResume(input: SaveGeneratedResumeRequest): Promise<SaveGeneratedResumeResult>;
}

export function createResumeStore(workspaceRoot: string): ResumeStore {
  const resumesDir = join(workspaceRoot, "workspace/resumes/library");
  const resumeJobLinksPath = join(workspaceRoot, "workspace/ops/data/resume-job-links.json");

  return {
    async listResumes() {
      const linkStore = await readResumeJobLinks(resumeJobLinksPath);
      const linksByFile = new Map((linkStore.links || []).map((item) => [item.file, item]));
      const files = (await readdir(resumesDir))
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
      const existing = await this.listResumes();
      const used = new Set(existing.map((item) => Number(item.file.match(/^(\d{2})-/)?.[1] || 0)));
      const nextIndex = Array.from({ length: 90 }, (_, index) => index + 10).find((index) => !used.has(index)) || 99;
      const file = `${String(nextIndex).padStart(2, "0")}-generated-resume.md`;
      await writeFile(join(resumesDir, file), markdown, "utf8");
      const generatedAt = new Date().toISOString();
      const targetJobTitle = String(input.targetJobTitle || "").trim();
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
  };
}

function isResumeMarkdownFile(file: string): boolean {
  return /^\d{2}-.+\.md$/.test(file);
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

async function readResumeJobLinks(path: string): Promise<ResumeJobLinkStore> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as ResumeJobLinkStore;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { links: [] };
    throw error;
  }
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

function splitTargetJobTitle(targetJobTitle: string): { company: string; role: string } {
  const [company = "", ...rest] = targetJobTitle.split(" · ");
  return {
    company: company.trim(),
    role: rest.join(" · ").trim(),
  };
}
