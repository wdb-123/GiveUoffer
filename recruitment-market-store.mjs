import { stat } from 'fs/promises';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join, resolve } from 'path';

const DEFAULT_CHUNK_SIZE = 25;
const CHUNK_FILE_RE = /^\d{4}\.json$/;

function metaJobsDir(filePath) {
  return `${filePath}.jobs.d`;
}

function toFallback() {
  return {
    updatedAt: '',
    queryScope: [],
    jobs: [],
    platforms: [],
    lastBossCapture: {},
    lastMaimaiCapture: {},
    lastMaimaiChatCapture: {},
    chinaLocalization: {},
    lastSearch: null,
    lastDirectCrawler: null,
    lastContactEnrichment: null,
  };
}

function jobChunkPath(basePath, index) {
  return join(metaJobsDir(basePath), `${String(index).padStart(4, '0')}.json`);
}

function normalizeJobsPayload(filePath, value) {
  if (!Array.isArray(value)) {
    throw new Error(`Recruitment job chunk is not an array: ${filePath}`);
  }
  return value;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return false;
    throw err;
  }
}

function extractLegacyJobs(base) {
  return Array.isArray(base.jobs) ? base.jobs : [];
}

function resolveJobsDir(filePath, jobsFilePath) {
  if (typeof jobsFilePath !== 'string' || !jobsFilePath) return metaJobsDir(filePath);
  const candidate = isAbsolute(jobsFilePath)
    ? jobsFilePath
    : resolve(dirname(filePath), jobsFilePath);
  return candidate;
}

async function readChunkJobs(jobsDir) {
  if (!(await pathExists(jobsDir))) return [];
  const names = (await readdir(jobsDir))
    .filter((name) => CHUNK_FILE_RE.test(name))
    .sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)));

  const all = [];
  for (const name of names) {
    const fullPath = join(jobsDir, name);
    const list = normalizeJobsPayload(fullPath, JSON.parse(await readFile(fullPath, 'utf8')));
    all.push(...list);
  }
  return all;
}

export async function readRecruitmentMarket(filePath, { mergeLegacyJobs = true } = {}) {
  let base = toFallback();
  let sourcePath = null;

  if (await pathExists(filePath)) {
    const text = (await readFile(filePath, 'utf8')).trim();
    if (text) {
      base = JSON.parse(text);
      sourcePath = text.includes('jobs_file') ? base.jobs_file : null;
    }
  }

  const resolvedJobsDir = await (async () => {
    const candidate = resolveJobsDir(filePath, sourcePath);
    return (await pathExists(candidate)) ? candidate : metaJobsDir(filePath);
  })();

  const chunkJobs = await readChunkJobs(resolvedJobsDir);
  const legacyJobs = extractLegacyJobs(base);
  const jobs = mergeLegacyJobs && legacyJobs.length > 0 ? legacyJobs : chunkJobs;

  return { ...base, jobs: jobs || [] };
}

export async function writeRecruitmentMarket(filePath, market, { chunkSize = DEFAULT_CHUNK_SIZE } = {}) {
  const jobs = Array.isArray(market.jobs) ? market.jobs : [];
  const metaPath = filePath;
  const jobsDir = metaJobsDir(filePath);
  const normalized = {
    ...market,
    jobs: [],
    jobs_file: jobsDir,
  };

  const tmpMeta = `${metaPath}.tmp.${Date.now().toString(36)}`;
  const parent = dirname(metaPath);
  if (parent) {
    await mkdir(parent, { recursive: true });
  }

  await mkdir(jobsDir, { recursive: true });

  const existing = await (async () => (await pathExists(jobsDir) ? readdir(jobsDir).catch(() => []) : []))();
  for (const name of existing) {
    if (CHUNK_FILE_RE.test(name)) {
      await rm(join(jobsDir, name)).catch(() => {});
    }
  }

  for (let i = 0; i < jobs.length; i += chunkSize) {
    const chunk = jobs.slice(i, i + chunkSize);
    const target = jobChunkPath(filePath, Math.floor(i / chunkSize));
    const tmp = `${target}.tmp.${Date.now().toString(36)}`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(tmp, JSON.stringify(chunk, null, 2) + '\n', 'utf8');
    await rename(tmp, target);
  }

  const payload = {
    ...normalized,
    jobsCount: jobs.length,
    lastUpdatedFromShardsAt: new Date().toISOString(),
  };
  const data = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(tmpMeta, data, 'utf8');
  await rename(tmpMeta, metaPath);
  return payload;
}
