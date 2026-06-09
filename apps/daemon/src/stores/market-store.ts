import { stat, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { MarketJob, RecruitmentMarket } from "@ucareer/shared";

const CHUNK_FILE_RE = /^\d{4}\.json$/;

export interface MarketStore {
  getRecruitmentMarket(): Promise<RecruitmentMarket>;
}

export function createMarketStore(workspaceRoot: string): MarketStore {
  const marketPath = join(workspaceRoot, "workspace/ops/data/recruitment-market.json");

  return {
    async getRecruitmentMarket() {
      const base = await readJsonFile<RecruitmentMarket & { jobs_file?: string }>(marketPath, {
        updatedAt: "",
        jobs: [],
      });
      const jobsDir = await resolveJobsDir(marketPath, base.jobs_file);
      const chunkJobs = await readChunkJobs(jobsDir);
      const legacyJobs = Array.isArray(base.jobs) ? base.jobs : [];
      const jobs = legacyJobs.length > 0 ? legacyJobs : chunkJobs;
      return {
        ...base,
        jobs,
        jobsCount: jobs.length,
      };
    },
  };
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const text = (await readFile(path, "utf8")).trim();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function resolveJobsDir(marketPath: string, jobsFilePath?: string): Promise<string> {
  const candidate = jobsFilePath
    ? isAbsolute(jobsFilePath)
      ? jobsFilePath
      : resolve(dirname(marketPath), jobsFilePath)
    : `${marketPath}.jobs.d`;
  return (await pathExists(candidate)) ? candidate : `${marketPath}.jobs.d`;
}

async function readChunkJobs(jobsDir: string): Promise<MarketJob[]> {
  if (!(await pathExists(jobsDir))) return [];
  const names = (await readdir(jobsDir))
    .filter((name) => CHUNK_FILE_RE.test(name))
    .sort();
  const jobs: MarketJob[] = [];
  for (const name of names) {
    const chunk = await readJsonFile<MarketJob[]>(join(jobsDir, name), []);
    if (Array.isArray(chunk)) jobs.push(...chunk);
  }
  return jobs;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
