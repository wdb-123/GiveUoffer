import { useEffect, useState } from "react";
import type { JobSearchRequest, JobSearchResult, JobSearchSource } from "@ucareer/shared";
import { getJobSearchSources, runJobSearch } from "../api";

export type JobSearchStatus = "idle" | "running" | "failed";

export function useJobSearch(enabled: boolean, onMarketChanged: () => void | Promise<void>) {
  const [sources, setSources] = useState<JobSearchSource[]>([]);
  const [status, setStatus] = useState<JobSearchStatus>("idle");
  const [lastResult, setLastResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    void getJobSearchSources().then(setSources).catch(() => undefined);
  }, [enabled]);

  async function search(input: Partial<JobSearchRequest> = {}) {
    setStatus("running");
    setError("");
    try {
      const request: JobSearchRequest = {
        source: input.source || "codex-chrome",
        city: input.city || "深圳",
        max: input.max ?? 25,
      };
      if (input.queries) request.queries = input.queries;
      if (input.minMatchScore !== undefined) request.minMatchScore = input.minMatchScore;
      if (input.withDetails !== undefined) request.withDetails = input.withDetails;
      if (input.dryRun !== undefined) request.dryRun = input.dryRun;
      const result = await runJobSearch(request);
      setLastResult(result);
      if (result.status === "failed") {
        setStatus("failed");
        setError(result.message || "jobsearch 运行失败");
      } else {
        setStatus("idle");
        await onMarketChanged();
      }
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "jobsearch 运行失败";
      setStatus("failed");
      setError(message);
      throw cause;
    }
  }

  return {
    sources,
    status,
    lastResult,
    error,
    search,
  };
}
