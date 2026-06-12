import { spawn } from "node:child_process";
import process from "node:process";
import { join } from "node:path";
import type { MarketJob, JobSearchRequest, JobSearchResult, JobSearchSource, JobSearchSourceId } from "@ucareer/shared";
import type { ChromeBridgeService } from "./chrome-bridge-service";

const DEFAULT_QUERIES = ["机器人系统工程师", "ROS2 机器人", "机器人软件 SDK", "具身智能 数据", "AI工具链 Agent RAG"];
const DEFAULT_CITY = "深圳";
const DEFAULT_MAX = 12;
const COMMAND_TIMEOUT_MS = 60_000;
const CODEX_CHROME_COMMAND_TIMEOUT_MS = 360_000;

type RadarCommand = { label: string; args: string[]; timeoutMs?: number };

export interface JobSearchService {
  listSources(): Promise<JobSearchSource[]>;
  search(input: JobSearchRequest): Promise<JobSearchResult>;
}

export function createJobSearchService(workspaceRoot: string, chromeBridgeService?: ChromeBridgeService): JobSearchService {
  return {
    async listSources() {
      return [
        {
          id: "codex-chrome",
          label: "Codex Chrome",
          description: "通过 Ucareer Chrome 扩展 bridge 读取已登录 Boss 页面，把具体岗位详情写入岗位市场。",
          available: true,
          requiresAuth: true,
          defaultCity: DEFAULT_CITY,
        },
        {
          id: "boss-agent",
          label: "Boss Agent",
          description: "通过本地 boss-agent-cli 只读搜索 Boss / 智联岗位。",
          available: true,
          requiresAuth: true,
          defaultCity: DEFAULT_CITY,
        },
        {
          id: "china-crawler",
          label: "中国平台爬虫",
          description: "用 Playwright 只读访问 Boss、智联、猎聘、51Job 等搜索页。",
          available: true,
          requiresAuth: false,
          defaultCity: DEFAULT_CITY,
        },
        {
          id: "portals",
          label: "官网门户扫描",
          description: "读取 workspace/profile/portals.yml 并扫描公司官网/ATS。",
          available: false,
          requiresAuth: false,
        },
        {
          id: "all",
          label: "全部可用来源",
          description: "依次运行 Boss Agent 和中国平台爬虫。",
          available: true,
          requiresAuth: true,
          defaultCity: DEFAULT_CITY,
        },
      ];
    },

    async search(input) {
      const request = normalizeSearchRequest(input);
      const runId = `jobsearch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date().toISOString();
      const commands = buildCommands(workspaceRoot, request);
      const results: JobSearchResult[] = [];

      if (request.source === "codex-chrome" && chromeBridgeService) {
        const result = await chromeBridgeService.runBossSearch({
          city: request.city,
          queries: request.queries,
          max: request.max,
          dryRun: request.dryRun,
        }, CODEX_CHROME_COMMAND_TIMEOUT_MS);
        return {
          runId,
          source: request.source,
          status: result.ok ? "completed" : "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          added: numberFrom(result.added, result.discovered?.length || 0),
          candidatesSeen: numberFrom(result.stats?.candidatesSeen, result.discovered?.length || 0),
          duplicatesSkipped: numberFrom(result.stats?.duplicatesSkipped, 0),
          failedQueries: numberFrom(result.stats?.failedQueries, result.ok ? 0 : request.queries.length),
          jobs: normalizeJobs(result.discovered),
          ...(result.message ? { message: trimMessage(result.message) } : {}),
        };
      }

      for (const command of commands) {
        results.push(await runRadarCommand(runId, startedAt, request.source, command));
      }

      return combineResults(runId, startedAt, request.source, results);
    },
  };
}

function normalizeSearchRequest(input: JobSearchRequest): Required<Pick<JobSearchRequest, "source" | "city" | "queries" | "max" | "minMatchScore" | "withDetails" | "dryRun">> {
  const max = Number(input.max || DEFAULT_MAX);
  return {
    source: input.source || "boss-agent",
    city: String(input.city || DEFAULT_CITY).trim() || DEFAULT_CITY,
    queries: Array.isArray(input.queries) && input.queries.length
      ? input.queries.map((query) => String(query).trim()).filter(Boolean)
      : DEFAULT_QUERIES,
    max: Number.isFinite(max) ? Math.max(1, Math.min(50, Math.floor(max))) : DEFAULT_MAX,
    minMatchScore: Number(input.minMatchScore || 0),
    withDetails: Boolean(input.withDetails),
    dryRun: Boolean(input.dryRun),
  };
}

function buildCommands(workspaceRoot: string, request: ReturnType<typeof normalizeSearchRequest>): RadarCommand[] {
  if (request.source === "portals") {
    throw new Error("官网门户扫描还没有接入 jobsearch，请先使用 Boss Agent 或中国平台爬虫。");
  }
  if (request.source === "codex-chrome") {
    const args = [join(workspaceRoot, "scripts/research/codex-chrome-boss-radar.mjs"), "--max", String(request.max), "--city", request.city];
    if (request.dryRun) args.push("--dry-run");
    request.queries.forEach((query) => args.push("--query", query));
    return [{ label: "Codex Chrome Boss", args, timeoutMs: CODEX_CHROME_COMMAND_TIMEOUT_MS }];
  }

  const sources: Exclude<JobSearchSourceId, "codex-chrome" | "all" | "portals">[] = request.source === "all"
    ? ["boss-agent", "china-crawler"]
    : [request.source];

  return sources.map((source) => {
    if (source === "boss-agent") {
      const args = [join(workspaceRoot, "scripts/research/boss-agent-radar.mjs"), "--max", String(request.max), "--city", request.city];
      if (request.withDetails) args.push("--details");
      if (request.dryRun) args.push("--dry-run");
      request.queries.forEach((query) => args.push("--query", query));
      return { label: "Boss Agent", args };
    }
    const args = [join(workspaceRoot, "scripts/research/china-job-crawler.mjs"), `--max=${request.max}`];
    if (request.dryRun) args.push("--dry-run");
    return { label: "中国平台爬虫", args };
  });
}

async function runRadarCommand(
  runId: string,
  startedAt: string,
  source: JobSearchSourceId,
  command: RadarCommand,
): Promise<JobSearchResult> {
  const output = await spawnNode(command.args, command.timeoutMs);
  if (!output.ok) {
    return {
      runId,
      source,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      added: 0,
      candidatesSeen: 0,
      duplicatesSkipped: 0,
      failedQueries: 1,
      jobs: [],
      message: `${command.label} 运行失败：${trimMessage(output.stderr || output.stdout)}`,
    };
  }

  const envelope = parseJsonEnvelope(output.stdout);
  if (!envelope) {
    return {
      runId,
      source,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      added: 0,
      candidatesSeen: 0,
      duplicatesSkipped: 0,
      failedQueries: 1,
      jobs: [],
      message: `${command.label} 没有返回可解析 JSON。`,
    };
  }

  const stats = typeof envelope.stats === "object" && envelope.stats ? envelope.stats as Record<string, unknown> : {};
  const jobs = normalizeJobs(envelope.discovered);
  return {
    runId,
    source,
    status: envelope.ok === false ? "failed" : "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    added: numberFrom(envelope.added, jobs.length),
    candidatesSeen: numberFrom(stats.candidatesSeen, jobs.length),
    duplicatesSkipped: numberFrom(stats.duplicatesSkipped, 0),
    failedQueries: numberFrom(stats.failedQueries, envelope.ok === false ? 1 : 0),
    jobs,
    ...(envelope.reason || envelope.message ? { message: trimMessage(envelope.reason || envelope.message) } : {}),
  };
}

function spawnNode(args: string[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
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

function combineResults(runId: string, startedAt: string, source: JobSearchSourceId, results: JobSearchResult[]): JobSearchResult {
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
