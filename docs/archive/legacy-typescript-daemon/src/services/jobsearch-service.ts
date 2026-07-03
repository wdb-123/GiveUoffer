import type { JobSearchRequest, JobSearchResult, JobSearchSource, JobSearchSourceId } from "@ucareer/shared";
import type { ChromeBridgeService } from "./chrome-bridge-service";
import {
  combineJobSearchResults,
  createAllSourcesEntry,
  createJobSearchProviders,
  normalizeJobSearchRequest,
  providerToSource,
  type JobSearchProvider,
} from "./jobsearch-providers";

const ALL_SOURCE_ORDER: JobSearchSourceId[] = ["codex-chrome", "boss-agent", "china-crawler"];

export interface JobSearchService {
  listSources(): Promise<JobSearchSource[]>;
  search(input: JobSearchRequest): Promise<JobSearchResult>;
  importCurrentJob(input?: { url?: string; dryRun?: boolean }): Promise<JobSearchResult>;
}

export function createJobSearchService(workspaceRoot: string, chromeBridgeService?: ChromeBridgeService): JobSearchService {
  const providers = createJobSearchProviders();
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

  return {
    async listSources() {
      const context = createProviderContext(workspaceRoot, chromeBridgeService);
      const concreteSources = await Promise.all(providers.map((provider) => providerToSource(provider, context)));
      return [...concreteSources, createAllSourcesEntry(providers)];
    },

    async search(input) {
      const request = normalizeJobSearchRequest(input);
      const runId = `jobsearch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date().toISOString();
      const context = { runId, startedAt, request, ...createProviderContext(workspaceRoot, chromeBridgeService) };
      const selectedProviders = await resolveProviders(request.source, providerMap, context);

      if (request.source !== "all") {
        const provider = selectedProviders[0];
        if (!provider) throw new Error(`未知岗位搜索来源：${request.source}`);
        const result = await provider.search(context);
        if (request.source !== "codex-chrome" || !shouldFallbackFromCodexChrome(result)) return result;

        const fallbackProviders = await resolveFallbackProviders(providerMap, context);
        if (!fallbackProviders.length) return result;

        const results = [result];
        for (const fallbackProvider of fallbackProviders) {
          const fallbackResult = await fallbackProvider.search(context);
          results.push(fallbackResult);
          if (!shouldFallbackFromCodexChrome(fallbackResult)) break;
        }
        const combined = combineJobSearchResults(runId, startedAt, "all", results);
        return {
          ...combined,
          message: [
            "Codex Chrome 没有读到当前招聘页面里的可导入岗位，已自动切换到备用搜索来源。",
            combined.message,
          ].filter(Boolean).join(" "),
        };
      }

      const results = [];
      for (const provider of selectedProviders) {
        results.push(await provider.search(context));
      }
      return combineJobSearchResults(runId, startedAt, request.source, results);
    },

    async importCurrentJob(input = {}) {
      const runId = `jobimport_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date().toISOString();
      if (!chromeBridgeService) {
        return {
          runId,
          source: "codex-chrome",
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          added: 0,
          candidatesSeen: 0,
          duplicatesSkipped: 0,
          failedQueries: 1,
          jobs: [],
          message: "当前后端没有启用 Ucareer Chrome bridge，无法读取当前浏览器选中岗位。",
        };
      }

      const result = await chromeBridgeService.runBossCurrentDetail({
        ...(input.url ? { url: input.url } : {}),
        dryRun: Boolean(input.dryRun),
      }, 45_000);
      if ((!result.ok || !result.discovered?.length) && input.url) {
        const fallbackRequest = parseBossSearchUrl(input.url);
        if (fallbackRequest) {
          const fallback = await chromeBridgeService.runBossSearch({
            ...fallbackRequest,
            max: 1,
            dryRun: Boolean(input.dryRun),
          }, 180_000);
          return {
            runId,
            source: "codex-chrome",
            status: fallback.ok ? "completed" : "failed",
            startedAt,
            completedAt: new Date().toISOString(),
            added: Number(fallback.added || fallback.discovered?.length || 0),
            candidatesSeen: Number(fallback.stats?.candidatesSeen || fallback.discovered?.length || 0),
            duplicatesSkipped: Number(fallback.stats?.duplicatesSkipped || 0),
            failedQueries: Number(fallback.stats?.failedQueries || (fallback.ok ? 0 : 1)),
            jobs: Array.isArray(fallback.discovered) ? fallback.discovered : [],
            message: [
              "当前 Boss 选中岗位读取不可用，已按粘贴 URL 的 query/city 只导入搜索结果中的 1 条岗位。",
              fallback.message ? normalizeCurrentJobImportMessage(fallback.message) : "",
            ].filter(Boolean).join(" "),
          };
        }
      }
      return {
        runId,
        source: "codex-chrome",
        status: result.ok ? "completed" : "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        added: Number(result.added || result.discovered?.length || 0),
        candidatesSeen: Number(result.stats?.candidatesSeen || result.discovered?.length || 0),
        duplicatesSkipped: Number(result.stats?.duplicatesSkipped || 0),
        failedQueries: Number(result.stats?.failedQueries || (result.ok ? 0 : 1)),
        jobs: Array.isArray(result.discovered) ? result.discovered : [],
        ...(result.message ? { message: normalizeCurrentJobImportMessage(result.message) } : {}),
      };
    },
  };
}

function shouldFallbackFromCodexChrome(result: JobSearchResult): boolean {
  return result.status === "failed" || (
    result.added === 0
    && result.candidatesSeen === 0
    && result.jobs.length === 0
  );
}

function normalizeCurrentJobImportMessage(message: string): string {
  if (/Unsupported Chrome bridge task:\s*boss_current_detail/i.test(message)) {
    return "Ucareer Chrome 扩展后台仍是旧版本，尚不支持读取当前 Boss 选中岗位。请到 chrome://extensions 找到 Ucareer Job Importer，点击刷新/重新加载扩展后再试。";
  }
  return message;
}

function parseBossSearchUrl(value: string): { city: string; queries: string[] } | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)zhipin\.com$/i.test(url.hostname) || url.pathname !== "/web/geek/jobs") return null;
    const query = (url.searchParams.get("query") || "").trim();
    const city = (url.searchParams.get("city") || "").trim() || "深圳";
    if (!query) return null;
    return { city, queries: [query] };
  } catch {
    return null;
  }
}

function createProviderContext(workspaceRoot: string, chromeBridgeService?: ChromeBridgeService) {
  return {
    workspaceRoot,
    ...(chromeBridgeService ? { chromeBridgeService } : {}),
  };
}

async function resolveProviders(
  source: JobSearchSourceId,
  providerMap: Map<JobSearchProvider["id"], JobSearchProvider>,
  context: Parameters<JobSearchProvider["isAvailable"]>[0],
): Promise<JobSearchProvider[]> {
  if (source !== "all") {
    const provider = providerMap.get(source);
    if (!provider) return [];
    return [provider];
  }

  const resolved: JobSearchProvider[] = [];
  for (const sourceId of ALL_SOURCE_ORDER) {
    const provider = providerMap.get(sourceId as JobSearchProvider["id"]);
    if (!provider) continue;
    if (await provider.isAvailable(context)) resolved.push(provider);
  }
  return resolved;
}

async function resolveFallbackProviders(
  providerMap: Map<JobSearchProvider["id"], JobSearchProvider>,
  context: Parameters<JobSearchProvider["isAvailable"]>[0],
): Promise<JobSearchProvider[]> {
  const resolved: JobSearchProvider[] = [];
  for (const sourceId of ALL_SOURCE_ORDER) {
    if (sourceId === "codex-chrome") continue;
    const provider = providerMap.get(sourceId as JobSearchProvider["id"]);
    if (!provider) continue;
    if (await provider.isAvailable(context)) resolved.push(provider);
  }
  return resolved;
}
