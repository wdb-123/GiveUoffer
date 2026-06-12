import { mkdir, stat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ImportJobRequest, ImportJobResult, MarketJob, RecruitmentMarket } from "@ucareer/shared";

const CHUNK_FILE_RE = /^\d{4}\.json$/;
const DEFAULT_CHUNK_SIZE = 25;

export interface MarketStore {
  getRecruitmentMarket(): Promise<RecruitmentMarket>;
  importJob(input: ImportJobRequest): Promise<ImportJobResult>;
  updateJob(id: string, patch: Partial<MarketJob>): Promise<MarketJob>;
  deleteJob(id: string): Promise<string>;
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
    async importJob(input) {
      const url = String(input.url || "").trim();
      let description = String(input.description || "").trim();
      if (!url && !description) throw new Error("请粘贴岗位链接或岗位描述");
      if (isBossListSummary(description, url)) {
        throw new Error("当前内容是 Boss 列表/首页摘要。请打开具体岗位详情页后再导入。");
      }

      if (url && !description) {
        description = await fetchJobDescriptionFromUrl(url).catch(() => "");
      }
      if (isBossListSummary(description, url)) {
        throw new Error("当前内容是 Boss 列表/首页摘要。请打开具体岗位详情页后再导入。");
      }

      const market = await this.getRecruitmentMarket();
      const jobs = Array.isArray(market.jobs) ? [...market.jobs] : [];
      const now = localDate();
      const normalizedUrl = normalizeUrl(url);
      const existingIndex = normalizedUrl
        ? jobs.findIndex((job) => normalizeUrl(job.url) === normalizedUrl)
        : -1;

      if (existingIndex >= 0) {
        const current = jobs[existingIndex];
        if (!current) throw new Error("岗位数据异常，无法更新导入日期");
        const parsed: Partial<ParsedJobText> = description ? parseJobText(description, url) : {};
        const jdPath = description && !current.jdPath ? await writeJobDescriptionFile(workspaceRoot, {
          description,
          id: current.id,
          source: current.source || input.source || "手工导入",
          url: current.url || url,
          ...((current.company || parsed.company) ? { company: current.company || parsed.company } : {}),
          ...((current.role || parsed.role) ? { role: current.role || parsed.role } : {}),
          ...((current.salary || parsed.salary) ? { salary: current.salary || parsed.salary } : {}),
        }) : current.jdPath;
        const updated: MarketJob = {
          ...current,
          source: current.source || input.source || "手工导入",
          ...(jdPath ? { jdPath } : {}),
          importedAt: current.importedAt || now,
          updatedAt: now,
        };
        jobs[existingIndex] = updated;
        const updatedMarket = await writeRecruitmentMarket(marketPath, { ...market, jobs, updatedAt: now });
        return {
          job: updated,
          imported: false,
          marketUpdatedAt: updatedMarket.updatedAt,
        };
      }

      const parsed = parseJobText(description, url);
      const jobId = nextMarketJobId(jobs);
      const jdPath = description ? await writeJobDescriptionFile(workspaceRoot, {
        description,
        id: jobId,
        source: input.source || "手工导入",
        url,
        ...(parsed.company ? { company: parsed.company } : {}),
        ...(parsed.role ? { role: parsed.role } : {}),
        ...(parsed.salary ? { salary: parsed.salary } : {}),
      }) : "";
      const job: MarketJob = {
        id: jobId,
        role: parsed.role || "待解析岗位",
        salary: parsed.salary || "待复核",
        source: input.source || "手工导入",
        ...(url ? { url } : {}),
        ...(jdPath ? { jdPath } : {}),
        direction: parsed.direction || "待复核",
        keywords: parsed.keywords,
        fitReason: parsed.fitReason || (url ? "手工粘贴链接导入，等待解析 JD。" : "手工粘贴岗位描述导入，等待解析 JD。"),
        evidenceGap: parsed.evidenceGap || "需要复核职责、薪资、年限和真实匹配度。",
        importedAt: now,
        updatedAt: now,
      };
      if (parsed.company) job.company = parsed.company;
      if (parsed.location) job.location = parsed.location;
      if (parsed.platform) job.platform = parsed.platform;
      jobs.unshift(job);
      const updatedMarket = await writeRecruitmentMarket(marketPath, { ...market, jobs, updatedAt: now });
      return {
        job,
        imported: true,
        marketUpdatedAt: updatedMarket.updatedAt,
      };
    },

    async updateJob(id, patch) {
      const jobId = String(id || "").trim();
      if (!jobId) throw new Error("Missing job id");
      const market = await this.getRecruitmentMarket();
      const jobs = Array.isArray(market.jobs) ? [...market.jobs] : [];
      const index = jobs.findIndex((job) => job.id === jobId);
      if (index < 0) throw new Error(`Job not found: ${jobId}`);
      const current = jobs[index];
      if (!current) throw new Error(`Job not found: ${jobId}`);
      const now = localDate();
      const updated = normalizeMarketJobPatch(current, patch, now);
      jobs[index] = updated;
      await writeRecruitmentMarket(marketPath, { ...market, jobs, updatedAt: now });
      return updated;
    },

    async deleteJob(id) {
      const jobId = String(id || "").trim();
      if (!jobId) throw new Error("Missing job id");
      const market = await this.getRecruitmentMarket();
      const jobs = Array.isArray(market.jobs) ? [...market.jobs] : [];
      const nextJobs = jobs.filter((job) => job.id !== jobId);
      if (nextJobs.length === jobs.length) throw new Error(`Job not found: ${jobId}`);
      await writeRecruitmentMarket(marketPath, { ...market, jobs: nextJobs, updatedAt: localDate() });
      return jobId;
    },
  };
}

function normalizeMarketJobPatch(current: MarketJob, patch: Partial<MarketJob>, updatedAt: string): MarketJob {
  const next: MarketJob = { ...current, updatedAt };
  for (const key of ["company", "role", "location", "salary", "source", "url", "direction", "fitReason", "evidenceGap", "platform"] as const) {
    if (patch[key] !== undefined) next[key] = String(patch[key] || "").trim();
  }
  if (patch.matchScore !== undefined) {
    const score = Number(patch.matchScore);
    if (Number.isFinite(score)) next.matchScore = Math.max(0, Math.min(5, score));
  }
  if (patch.keywords !== undefined) {
    next.keywords = Array.isArray(patch.keywords)
      ? patch.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
      : [];
  }
  if (patch.importedAt !== undefined) next.importedAt = String(patch.importedAt || "").trim();
  if (patch.discoveredAt !== undefined) next.discoveredAt = String(patch.discoveredAt || "").trim();
  if (patch.createdAt !== undefined) next.createdAt = String(patch.createdAt || "").trim();
  return next;
}

async function writeRecruitmentMarket(filePath: string, market: RecruitmentMarket): Promise<RecruitmentMarket> {
  const jobs = Array.isArray(market.jobs) ? market.jobs : [];
  const jobsDir = `${filePath}.jobs.d`;
  const payload = {
    ...market,
    jobs: [],
    jobs_file: jobsDir,
    jobsCount: jobs.length,
    lastUpdatedFromShardsAt: new Date().toISOString(),
  };

  await mkdir(dirname(filePath), { recursive: true });
  await mkdir(jobsDir, { recursive: true });

  const existing = await readdir(jobsDir).catch(() => []);
  for (const name of existing) {
    if (CHUNK_FILE_RE.test(name)) await rm(join(jobsDir, name)).catch(() => undefined);
  }

  for (let index = 0; index < jobs.length; index += DEFAULT_CHUNK_SIZE) {
    const chunk = jobs.slice(index, index + DEFAULT_CHUNK_SIZE);
    const chunkPath = join(jobsDir, `${String(Math.floor(index / DEFAULT_CHUNK_SIZE)).padStart(4, "0")}.json`);
    const tmpChunkPath = `${chunkPath}.tmp.${Date.now().toString(36)}`;
    await writeFile(tmpChunkPath, `${JSON.stringify(chunk, null, 2)}\n`, "utf8");
    await rename(tmpChunkPath, chunkPath);
  }

  const tmpPath = `${filePath}.tmp.${Date.now().toString(36)}`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
  return payload;
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

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeUrl(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return text.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function nextMarketJobId(jobs: MarketJob[]) {
  const max = jobs.reduce((value, job) => {
    const match = String(job.id || "").match(/^MJ-(\d+)$/);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `MJ-${String(max + 1).padStart(3, "0")}`;
}

async function writeJobDescriptionFile(workspaceRoot: string, input: {
  company?: string;
  description: string;
  id: string;
  role?: string;
  salary?: string;
  source: string;
  url: string;
}): Promise<string> {
  const jdsDir = join(workspaceRoot, "workspace/jobs/jds");
  await mkdir(jdsDir, { recursive: true });
  const title = [input.company, input.role].filter(Boolean).join("-");
  const fileName = `${input.id}-${slugifyFileName(title || input.role || "job-description")}.md`;
  const relativePath = `workspace/jobs/jds/${fileName}`;
  const markdown = [
    `# ${input.role || "待解析岗位"}`,
    "",
    `- ID: ${input.id}`,
    input.company ? `- 公司: ${input.company}` : "",
    input.salary ? `- 薪资: ${input.salary}` : "",
    input.url ? `- URL: ${input.url}` : "",
    `- 来源: ${input.source}`,
    `- 入库时间: ${new Date().toISOString()}`,
    "",
    "## JD 原文",
    "",
    input.description.trim(),
    "",
  ].filter((line) => line !== "").join("\n");
  await writeFile(join(workspaceRoot, relativePath), markdown, "utf8");
  return relativePath;
}

function slugifyFileName(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug.slice(0, 80) || "job-description";
}

interface ParsedJobText {
  company?: string;
  role?: string;
  location?: string;
  salary?: string;
  direction?: string;
  keywords: string[];
  platform?: string;
  fitReason?: string;
  evidenceGap?: string;
}

function parseJobText(description: string, url: string): ParsedJobText {
  const lines = normalizeTextLines(description);
  const lower = `${url}\n${description}`.toLowerCase();
  const platform = /zhipin\.com|boss直聘|boss/.test(lower) ? "Boss直聘" : undefined;
  const role = firstExplicitValue(lines, "职位") || inferRoleFromBossHeader(lines) || inferRoleFromVisibleLines(lines);
  const company = firstExplicitValue(lines, "公司") || inferBossCompany(lines);
  const salary = firstExplicitValue(lines, "薪资") || inferSalaryFromVisibleLines(lines);
  const location = firstExplicitValue(lines, "地点") || inferLocationFromBossHeader(lines) || inferLocation(lines);
  const keywords = inferKeywords(lines);
  return {
    ...(company ? { company } : {}),
    ...(role ? { role } : {}),
    ...(location ? { location } : {}),
    ...(salary ? { salary } : {}),
    ...(platform ? { platform } : {}),
    direction: inferDirection([...keywords, role || "", description].join(" ")),
    keywords,
    fitReason: description ? "已读取网页可见 JD 文本，等待生成评估报告。" : "",
    evidenceGap: "需要复核岗位真实性、薪资口径、年限要求和项目证据匹配。",
  };
}

function isBossListSummary(description: string, url: string): boolean {
  const text = `${url}\n${description}`;
  if (!/zhipin\.com|boss直聘/i.test(text)) return false;
  if (/BOSS直聘岗位列表（仅列表摘要/.test(description)) return true;
  const head = normalizeTextLines(description).slice(0, 80).join(" ");
  return /职位类型.*地图.*搜索/.test(head)
    && /精选职位|最新职位|热招职位|根据求职期望匹配/.test(head)
    && !/职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(description);
}

function normalizeTextLines(text: string): string[] {
  return normalizeBossPrivateUseDigits(String(text || ""))
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .slice(0, 500);
}

function normalizeBossPrivateUseDigits(text: string): string {
  const digitMap: Record<string, string> = {
    "\ue031": "0",
    "\ue032": "1",
    "\ue033": "2",
    "\ue034": "3",
    "\ue035": "4",
    "\ue036": "5",
    "\ue037": "6",
    "\ue038": "7",
    "\ue039": "8",
    "\ue03a": "9",
  };
  return text.replace(/[\ue031-\ue03a]/g, (char) => digitMap[char] || char);
}

function firstExplicitValue(lines: string[], label: string): string {
  const re = new RegExp(`^${label}[：:]\\s*(.+)$`);
  return lines.map((line) => line.match(re)?.[1]?.trim() || "").find(Boolean) || "";
}

function inferRoleFromVisibleLines(lines: string[]): string {
  const detailIndex = lines.findIndex((line) => /职位描述|岗位职责|岗位要求/.test(line));
  if (detailIndex > 0) {
    const candidate = lines.slice(Math.max(0, detailIndex - 24), detailIndex).reverse().find(isRoleLikeLine);
    if (candidate) return candidate;
  }
  return lines.find(isRoleLikeLine) || "";
}

function inferRoleFromBossHeader(lines: string[]): string {
  const header = lines.find((line) => /[Kk]|薪|万|千|面议/.test(line) && /职位描述|岗位职责|工作职责|任职要求|岗位要求/.test(line))
    || lines.find((line) => /[Kk]|薪|万|千|面议/.test(line) && /深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程/.test(line));
  if (!header) return "";
  const salary = extractSalaryText(header);
  if (!salary) return "";
  const beforeSalary = header.slice(0, header.indexOf(salary)).trim();
  if (!beforeSalary || beforeSalary.length > 80) return "";
  return isRoleLikeLine(beforeSalary) ? beforeSalary : "";
}

function isRoleLikeLine(line: string): boolean {
  if (line.length < 3 || line.length > 60) return false;
  if (/^(Python|Java|C|C\+\+|C#|Go|Golang|Rust|Linux|ROS|ROS2|MySQL|Redis|PyTorch|TensorFlow|Django|Flask|CMake|Docker|K8s)$/i.test(line)) return false;
  if (/首页|职位|公司|校园|海归|APP|消息|简历|推荐|搜索|地图|求职|薪资|经验|学历|清空|收藏|沟通|举报|微信|扫码|工作地址|查看更多|热门/.test(line)) return false;
  if (isSalaryLine(line) || /深圳[·\s]|北京[·\s]|上海[·\s]|本科|经验|今日活跃|hrbp|HR|招聘信息/.test(line)) return false;
  return /工程师|开发|算法|机器人|软件|硬件|后端|后台|前端|架构|测试|产品|经理|运维|数据|AI|C\+\+|Python|Java|Linux|ROS/i.test(line);
}

function isSalaryLine(line: string): boolean {
  return /[Kk]|薪|万|千|面议/.test(line) && /[-~—–]|薪|以上|以下|面议/.test(line) && line.length <= 40;
}

function inferSalaryFromVisibleLines(lines: string[]): string {
  return lines.find(isSalaryLine) || lines.map(extractSalaryText).find(Boolean) || "";
}

function extractSalaryText(line: string): string {
  const match = line.match(/(?:\d+(?:\.\d+)?\s*)[-~—–]\s*(?:\d+(?:\.\d+)?)\s*(?:[Kk]|千|万)(?:[·･]\s*\d+\s*薪)?|(?:\d+(?:\.\d+)?\s*)(?:[Kk]|千|万)(?:以上|以下)?(?:[·･]\s*\d+\s*薪)?|面议/);
  return match?.[0]?.replace(/\s+/g, "") || "";
}

function inferBossCompany(lines: string[]): string {
  const hrLine = lines.find((line) => /·\s*(hrbp|hr|招聘者|招聘专员|招聘顾问|人事|经理|主管|boss)/i.test(line));
  if (hrLine) {
    const before = hrLine.split("·")[0]?.trim() || "";
    const compact = before
      .replace(/^.*?(?:任职要求|岗位要求|职位描述|工作职责).*?(?:\d+[、.，]|加分项：|必备项：)?/u, "")
      .replace(/^(?:[^\s]+女士|[^\s]+先生|[^\s]+老师|[^\s]+经理)\s*(?:在线|今日活跃|刚刚活跃)?\s*/u, "")
      .trim();
    const tokens = compact.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] || compact;
  }
  const companyIndex = lines.findIndex((line) => line === "公司" || /公司介绍|工商信息/.test(line));
  if (companyIndex > 0) return lines[companyIndex - 1] || "";
  return "";
}

function inferLocationFromBossHeader(lines: string[]): string {
  const header = lines.find((line) => /[Kk]|薪|万|千|面议/.test(line) && /深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程/.test(line));
  if (!header) return "";
  const salary = extractSalaryText(header);
  const afterSalary = salary ? header.slice(header.indexOf(salary) + salary.length).trim() : header;
  const match = afterSalary.match(/深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程/u);
  return match?.[0]?.trim() || "";
}

function inferLocation(lines: string[]): string {
  const workAddressIndex = lines.findIndex((line) => /工作地址|工作地点/.test(line));
  if (workAddressIndex >= 0) {
    const next = lines.slice(workAddressIndex + 1, workAddressIndex + 4).find((line) => /深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程/.test(line));
    if (next) return next;
  }
  return lines.find((line) => /深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程/.test(line) && line.length <= 80) || "";
}

function inferKeywords(lines: string[]): string[] {
  const known = [
    "Python", "Java", "C++", "C", "Linux", "ROS", "ROS2", "MoveIt", "URDF", "EtherCAT", "CANopen",
    "PyTorch", "TensorFlow", "Django", "Flask", "MySQL", "Redis", "CMake", "Docker", "K8s", "RAG", "Agent",
    "机器人", "自动化", "嵌入式", "控制", "算法", "分布式", "编译器", "驱动开发", "音视频",
  ];
  const text = lines.join("\n").toLowerCase();
  return known.filter((keyword) => text.includes(keyword.toLowerCase())).slice(0, 16);
}

function inferDirection(text: string): string {
  const lower = text.toLowerCase();
  if (/机器人|ros|moveit|urdf|ethercat|canopen/.test(lower)) return "机器人/智能硬件生态业务";
  if (/rag|agent|llm|openai|gpt|ai/.test(lower)) return "企业级 AI / RAG / Agent";
  if (/数据|pipeline|标注|清洗|质检/.test(lower)) return "具身智能数据基建";
  if (/自动化|plc|控制|嵌入式/.test(lower)) return "机器人产品 / 解决方案";
  return "待复核";
}

async function fetchJobDescriptionFromUrl(url: string): Promise<string> {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(normalizedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 UcareerJobImporter/1.0",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/text|html|xml|json/i.test(contentType)) return "";
    const raw = (await response.text()).slice(0, 600_000);
    return extractJobDescriptionFromHtml(raw, response.url || normalizedUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeHttpUrl(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractJobDescriptionFromHtml(raw: string, url: string): string {
  const title = htmlDecode(firstMatch(raw, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const metaDescription = htmlDecode(firstMatch(raw, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || firstMatch(raw, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)
    || firstMatch(raw, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i));
  const jsonLd = extractJsonLdJobPosting(raw);
  const visibleText = htmlToVisibleText(raw);
  const description = [
    title ? `标题：${title}` : "",
    metaDescription ? `摘要：${metaDescription}` : "",
    jsonLd,
    visibleText,
    url ? `来源链接：${url}` : "",
  ].filter(Boolean).join("\n\n");
  return description.slice(0, 24000);
}

function extractJsonLdJobPosting(raw: string): string {
  const blocks = Array.from(raw.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const block of blocks) {
    const text = htmlDecode(block[1] || "").trim();
    if (!text) continue;
    const parsed = parseJsonLoose(text);
    const job = findJobPosting(parsed);
    if (!job) continue;
    const record = job as Record<string, unknown>;
    return [
      stringField(record.title, "职位"),
      stringField(nestedName(record.hiringOrganization), "公司"),
      stringField(nestedName(record.jobLocation), "地点"),
      stringField(record.description, "职位描述"),
    ].filter(Boolean).join("\n");
  }
  return "";
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findJobPosting(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = Array.isArray(record["@type"]) ? record["@type"].join(" ") : String(record["@type"] || "");
  if (/JobPosting/i.test(type)) return record;
  return findJobPosting(record["@graph"]);
}

function nestedName(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(nestedName).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.name || record.address || "").trim();
  }
  return "";
}

function stringField(value: unknown, label: string): string {
  const text = htmlToVisibleText(String(value || ""));
  return text ? `${label}：${text}` : "";
}

function htmlToVisibleText(raw: string): string {
  return htmlDecode(String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<(br|p|div|section|article|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n"))
    .trim()
    .slice(0, 22000);
}

function htmlDecode(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function firstMatch(value: string, re: RegExp): string {
  return value.match(re)?.[1]?.trim() || "";
}
