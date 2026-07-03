import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { dirname, join } from "node:path";
import type { JobSearchRequest, JobSearchResult, JobSearchSource, JobSearchSourceId, MarketJob } from "@ucareer/shared";
import type { ChromeBridgeService } from "./chrome-bridge-service";

export const DEFAULT_JOB_SEARCH_QUERIES = ["机器人系统工程师", "ROS2 机器人", "机器人软件 SDK", "具身智能 数据", "AI工具链 Agent RAG"];
export const DEFAULT_JOB_SEARCH_CITY = "深圳";
const DEFAULT_MAX = 12;
const COMMAND_TIMEOUT_MS = 60_000;
const CODEX_CHROME_COMMAND_TIMEOUT_MS = 360_000;

type ConcreteJobSearchSourceId = Exclude<JobSearchSourceId, "all">;

export interface NormalizedJobSearchRequest {
  source: JobSearchSourceId;
  city: string;
  queries: string[];
  max: number;
  minMatchScore: number;
  withDetails: boolean;
  dryRun: boolean;
}

export interface JobSearchRunContext {
  runId: string;
  startedAt: string;
  workspaceRoot: string;
  request: NormalizedJobSearchRequest;
  chromeBridgeService?: ChromeBridgeService;
}

export interface JobSearchProvider {
  id: ConcreteJobSearchSourceId;
  label: string;
  description: string;
  requiresAuth: boolean;
  defaultCity?: string;
  isAvailable(context: Pick<JobSearchRunContext, "workspaceRoot" | "chromeBridgeService">): Promise<boolean>;
  search(context: JobSearchRunContext): Promise<JobSearchResult>;
}

export function createJobSearchProviders(): JobSearchProvider[] {
  return [
    createCodexChromeBossProvider(),
    createBossAgentProvider(),
    createChinaCrawlerProvider(),
    createPortalsProvider(),
  ];
}

export function normalizeJobSearchRequest(input: JobSearchRequest): NormalizedJobSearchRequest {
  const max = Number(input.max || DEFAULT_MAX);
  return {
    source: input.source || "all",
    city: String(input.city || DEFAULT_JOB_SEARCH_CITY).trim() || DEFAULT_JOB_SEARCH_CITY,
    queries: Array.isArray(input.queries) && input.queries.length
      ? input.queries.map((query) => String(query).trim()).filter(Boolean)
      : DEFAULT_JOB_SEARCH_QUERIES,
    max: Number.isFinite(max) ? Math.max(1, Math.min(50, Math.floor(max))) : DEFAULT_MAX,
    minMatchScore: Number(input.minMatchScore || 0),
    withDetails: input.withDetails !== false,
    dryRun: Boolean(input.dryRun),
  };
}

export async function providerToSource(
  provider: JobSearchProvider,
  context: Pick<JobSearchRunContext, "workspaceRoot" | "chromeBridgeService">,
): Promise<JobSearchSource> {
  return {
    id: provider.id,
    label: provider.label,
    description: provider.description,
    available: await provider.isAvailable(context),
    requiresAuth: provider.requiresAuth,
    ...(provider.defaultCity ? { defaultCity: provider.defaultCity } : {}),
  };
}

export function createAllSourcesEntry(providers: JobSearchProvider[]): JobSearchSource {
  const labels = providers.filter((provider) => provider.id !== "portals").map((provider) => provider.label).join("、");
  return {
    id: "all",
    label: "全部可用来源",
    description: `依次运行所有当前可用的岗位搜索来源：${labels}。`,
    available: true,
    requiresAuth: providers.some((provider) => provider.id !== "portals" && provider.requiresAuth),
    defaultCity: DEFAULT_JOB_SEARCH_CITY,
  };
}

export function combineJobSearchResults(
  runId: string,
  startedAt: string,
  source: JobSearchSourceId,
  results: JobSearchResult[],
): JobSearchResult {
  if (!results.length) {
    return {
      runId,
      source,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      added: 0,
      candidatesSeen: 0,
      duplicatesSkipped: 0,
      failedQueries: 0,
      jobs: [],
      message: "没有可用的岗位搜索来源。",
    };
  }
  const jobs = results.flatMap((result) => result.jobs);
  const failed = results.filter((result) => result.status === "failed");
  return {
    runId,
    source,
    status: failed.length === results.length ? "failed" : "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    added: sum(results, "added"),
    candidatesSeen: sum(results, "candidatesSeen"),
    duplicatesSkipped: sum(results, "duplicatesSkipped"),
    failedQueries: sum(results, "failedQueries"),
    jobs,
    ...(failed.length ? { message: failed.map((result) => result.message).filter(Boolean).join("；") } : {}),
  };
}

function createCodexChromeBossProvider(): JobSearchProvider {
  return {
    id: "codex-chrome",
    label: "Codex Chrome",
    description: "通过 Ucareer Chrome 扩展 bridge 或本地 Codex Chrome radar 读取已登录招聘网站页面。",
    requiresAuth: true,
    defaultCity: DEFAULT_JOB_SEARCH_CITY,
    async isAvailable() {
      return true;
    },
    async search(context) {
      if (context.chromeBridgeService) {
        const result = await context.chromeBridgeService.runBossSearch({
          city: context.request.city,
          queries: context.request.queries,
          max: context.request.max,
          withDetails: context.request.withDetails,
          dryRun: context.request.dryRun,
        }, CODEX_CHROME_COMMAND_TIMEOUT_MS);
        return {
          runId: context.runId,
          source: this.id,
          status: result.ok ? "completed" : "failed",
          startedAt: context.startedAt,
          completedAt: new Date().toISOString(),
          added: numberFrom(result.added, result.discovered?.length || 0),
          candidatesSeen: numberFrom(result.stats?.candidatesSeen, result.discovered?.length || 0),
          duplicatesSkipped: numberFrom(result.stats?.duplicatesSkipped, 0),
          failedQueries: numberFrom(result.stats?.failedQueries, result.ok ? 0 : context.request.queries.length),
          jobs: normalizeJobs(result.discovered),
          ...(result.message ? { message: trimMessage(result.message) } : {}),
        };
      }

      const args = [resolveProjectScript(context.workspaceRoot, "scripts/research/codex-chrome-boss-radar.mjs"), "--max", String(context.request.max), "--city", context.request.city];
      if (context.request.dryRun) args.push("--dry-run");
      context.request.queries.forEach((query) => args.push("--query", query));
      return runNodeRadarCommand(context, this.id, this.label, args, CODEX_CHROME_COMMAND_TIMEOUT_MS);
    },
  };
}

function createBossAgentProvider(): JobSearchProvider {
  return {
    id: "boss-agent",
    label: "Boss Agent",
    description: "通过本地 boss-agent-cli 只读搜索 Boss / 智联岗位。",
    requiresAuth: true,
    defaultCity: DEFAULT_JOB_SEARCH_CITY,
    async isAvailable() {
      return commandExists("boss");
    },
    async search(context) {
      const args = [resolveProjectScript(context.workspaceRoot, "scripts/research/boss-agent-radar.mjs"), "--max", String(context.request.max), "--city", context.request.city];
      if (context.request.withDetails) args.push("--details");
      if (context.request.dryRun) args.push("--dry-run");
      context.request.queries.forEach((query) => args.push("--query", query));
      return runNodeRadarCommand(context, this.id, this.label, args);
    },
  };
}

function createChinaCrawlerProvider(): JobSearchProvider {
  return {
    id: "china-crawler",
    label: "中国平台爬虫",
    description: "用 Playwright 只读访问 Boss、智联、猎聘、51Job 等搜索页。",
    requiresAuth: false,
    defaultCity: DEFAULT_JOB_SEARCH_CITY,
    async isAvailable() {
      return true;
    },
    async search(context) {
      const args = [
        resolveProjectScript(context.workspaceRoot, "scripts/research/china-job-crawler.mjs"),
        `--max=${context.request.max}`,
        `--city=${context.request.city}`,
      ];
      if (context.request.withDetails) args.push("--details");
      if (context.request.dryRun) args.push("--dry-run");
      context.request.queries.forEach((query) => args.push(`--query=${query}`));
      return runNodeRadarCommand(context, this.id, this.label, args);
    },
  };
}

function createPortalsProvider(): JobSearchProvider {
  return {
    id: "portals",
    label: "官网门户扫描",
    description: "读取 workspace/profile/portals.yml 并扫描公司官网/ATS。",
    requiresAuth: false,
    async isAvailable() {
      return false;
    },
    async search(context) {
      return {
        runId: context.runId,
        source: this.id,
        status: "failed",
        startedAt: context.startedAt,
        completedAt: new Date().toISOString(),
        added: 0,
        candidatesSeen: 0,
        duplicatesSkipped: 0,
        failedQueries: 1,
        jobs: [],
        message: "官网门户扫描还没有接入 jobsearch provider，请先使用其他可用来源。",
      };
    },
  };
}

async function runNodeRadarCommand(
  context: JobSearchRunContext,
  source: ConcreteJobSearchSourceId,
  label: string,
  args: string[],
  timeoutMs?: number,
): Promise<JobSearchResult> {
  const output = await spawnNode(args, context.workspaceRoot, timeoutMs);
  if (!output.ok) {
    return {
      runId: context.runId,
      source,
      status: "failed",
      startedAt: context.startedAt,
      completedAt: new Date().toISOString(),
      added: 0,
      candidatesSeen: 0,
      duplicatesSkipped: 0,
      failedQueries: 1,
      jobs: [],
      message: `${label} 运行失败：${trimMessage(output.stderr || output.stdout)}`,
    };
  }

  const envelope = parseJsonEnvelope(output.stdout);
  if (!envelope) {
    return {
      runId: context.runId,
      source,
      status: "failed",
      startedAt: context.startedAt,
      completedAt: new Date().toISOString(),
      added: 0,
      candidatesSeen: 0,
      duplicatesSkipped: 0,
      failedQueries: 1,
      jobs: [],
      message: `${label} 没有返回可解析 JSON。`,
    };
  }

  const stats = typeof envelope.stats === "object" && envelope.stats ? envelope.stats as Record<string, unknown> : {};
  const jobs = normalizeJobs(envelope.discovered);
  return {
    runId: context.runId,
    source,
    status: envelope.ok === false ? "failed" : "completed",
    startedAt: context.startedAt,
    completedAt: new Date().toISOString(),
    added: numberFrom(envelope.added, jobs.length),
    candidatesSeen: numberFrom(stats.candidatesSeen, jobs.length),
    duplicatesSkipped: numberFrom(stats.duplicatesSkipped, 0),
    failedQueries: numberFrom(stats.failedQueries, envelope.ok === false ? 1 : 0),
    jobs,
    ...(envelope.reason || envelope.message ? { message: trimMessage(envelope.reason || envelope.message) } : {}),
  };
}

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(true));
  });
}

function spawnNode(args: string[], cwd: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      stderr = `${stderr}\njobsearch command timed out`.trim();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

function resolveProjectScript(workspaceRoot: string, relativePath: string): string {
  let current = workspaceRoot;
  for (;;) {
    const candidate = join(current, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return join(workspaceRoot, relativePath);
    current = parent;
  }
}

function parseJsonEnvelope(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeJobs(value: unknown): MarketJob[] {
  return Array.isArray(value) ? value.filter((job): job is MarketJob => Boolean(job && typeof job === "object")) : [];
}

function sum(results: JobSearchResult[], key: "added" | "candidatesSeen" | "duplicatesSkipped" | "failedQueries"): number {
  return results.reduce((total, result) => total + result[key], 0);
}

function numberFrom(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function trimMessage(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}
