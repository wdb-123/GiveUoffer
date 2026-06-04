import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { readJsonFile } from '../data-store.mjs';
import { readJsonBody } from './request-utils.mjs';
import { readRecruitmentMarket, writeRecruitmentMarket } from '../../recruitment-market-store.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const resumesDir = join(root, 'resumes');
const dataDir = join(root, 'data');
const recruitmentMarketPath = join(dataDir, 'recruitment-market.json');
const recruitmentMarketMdPath = join(dataDir, 'recruitment-market.md');
const experienceMetadataPath = join(dataDir, 'experience-metadata.json');
const directionCluesPath = join(resumesDir, 'direction-clues.json');
const codexBin = process.env.CODEX_BIN || '/Users/don/.local/bin/codex';
const codexParseTasks = new Map();
const extensionParseTasks = new Map();
let extensionRegistration = {
  extensionId: '',
  version: '',
  updatedAt: '',
};

const execFileAsync = promisify(execFile);

export function registerRecruitmentRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/direction-clues', listDirectionClues);
  registerJsonRoute('GET', '/api/recruitment-market', listRecruitmentMarket);
  registerJsonRoute('POST', '/api/recruitment-market/search', runRecruitmentSearch);
  registerJsonRoute('POST', '/api/recruitment-market/crawl', runDirectCrawler);
  registerJsonRoute('POST', '/api/recruitment-market/manual-jobs', addManualRecruitmentJob);
  registerJsonRoute('POST', '/api/recruitment-market/delete-job', deleteRecruitmentJob);
  registerJsonRoute('POST', '/api/recruitment-market/update-job', updateRecruitmentJob);
  registerJsonRoute('POST', '/api/recruitment-market/extension-register', registerChromeExtension);
  registerJsonRoute('GET', '/api/recruitment-market/extension-status', getChromeExtensionStatus);
  registerJsonRoute('POST', '/api/recruitment-market/parse-with-extension', parseRecruitmentJobWithExtension);
  registerJsonRoute('POST', '/api/recruitment-market/extension-claim-task', claimExtensionParseTask);
  registerJsonRoute('POST', '/api/recruitment-market/extension-task-complete', completeExtensionParseTask);
  registerJsonRoute('GET', '/api/recruitment-market/extension-task', getExtensionParseTask);
  registerJsonRoute('POST', '/api/recruitment-market/parse-with-codex', parseRecruitmentJobWithCodex);
  registerJsonRoute('GET', '/api/recruitment-market/codex-task', getCodexParseTask);
}

export async function listRecruitmentMarket() {
  return readRecruitmentMarket(recruitmentMarketPath, { mergeLegacyJobs: true });
}

export async function runRecruitmentSearch(req) {
  const options = req ? await readJsonBody(req).catch(() => ({})) : {};
  const market = await listRecruitmentMarket();
  const beforeCount = market.jobs?.length || 0;
  market.jobs = dedupeMarketJobs(market.jobs || []);
  const removedDuplicates = beforeCount - market.jobs.length;
  const existingKeys = new Set(market.jobs.map(jobIdentityKey));
  const queries = await recruitmentQueriesForMode(market, options);
  const discovered = [];
  const stats = {
    queriesChecked: 0,
    pagesChecked: 0,
    resultsSeen: 0,
    duplicatesSkipped: removedDuplicates,
    filteredOut: 0,
    networkEmptyPages: 0,
  };
  const maxAdded = 20;
  const maxPagesPerQuery = 4;

  for (const query of queries.slice(0, 10)) {
    stats.queriesChecked += 1;
    for (let page = 0; page < maxPagesPerQuery; page += 1) {
      const results = await searchBing(query, page);
      stats.pagesChecked += 1;
      if (!results.length) {
        stats.networkEmptyPages += 1;
        continue;
      }
      for (const result of results.slice(0, 10)) {
        stats.resultsSeen += 1;
        const key = jobIdentityKey(result);
        if (!key || existingKeys.has(key)) {
          stats.duplicatesSkipped += 1;
          continue;
        }
        if (!looksLikeJobResult(result)) {
          stats.filteredOut += 1;
          continue;
        }
        existingKeys.add(key);
        discovered.push(buildMarketJob(result, query, market.jobs?.length || 0, discovered.length));
        if (discovered.length >= maxAdded) break;
      }
      if (discovered.length >= maxAdded) break;
    }
    if (discovered.length >= maxAdded) break;
  }

  if (discovered.length || removedDuplicates) {
    market.jobs = [...(market.jobs || []), ...discovered];
    renumberMarketJobs(market.jobs);
    market.updatedAt = todayChina();
    market.lastSearch = {
      runAt: new Date().toISOString(),
      mode: options.mode || 'default',
      queries: queries.slice(0, 10),
      added: discovered.length,
      removedDuplicates,
      stats,
    };
    await writeRecruitmentMarket(recruitmentMarketPath, market);
    await writeFile(recruitmentMarketMdPath, recruitmentMarketMarkdown(market), 'utf8');
  }

  return { added: discovered.length, removedDuplicates, stats, discovered, market };
}

export async function sortMarketJobs(jobs, mode = 'score-desc') {
  if (mode === 'score-desc') {
    return [...jobs].sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0));
  }
  return [...jobs];
}

async function addManualRecruitmentJob(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const hydratedInput = await hydrateManualJobInput(input);
  if (!cleanManualText(hydratedInput.url, 500) && !cleanManualText(hydratedInput.rawText, 1200) && (!cleanManualText(hydratedInput.company, 80) || !cleanManualText(hydratedInput.role, 120))) {
    return {
      added: false,
      duplicate: false,
      error: '请至少粘贴岗位链接、JD 正文，或填写公司和岗位名称。',
      market: await listRecruitmentMarket(),
    };
  }
  const market = await listRecruitmentMarket();
  const jobs = Array.isArray(market.jobs) ? market.jobs : [];
  const job = buildManualMarketJob(hydratedInput, jobs.length);
  const key = jobIdentityKey(job);
  const duplicate = jobs.find((item) => jobIdentityKey(item) === key);
  if (duplicate) {
    return {
      added: false,
      duplicate: true,
      job: duplicate,
      market,
      message: '该岗位链接已记录过，未重复保存。',
    };
  }

  market.jobs = [...jobs, job];
  renumberMarketJobs(market.jobs);
  market.updatedAt = todayChina();
  market.lastManualImport = {
    runAt: new Date().toISOString(),
    company: job.company,
    role: job.role,
    source: job.source,
  };
  await writeRecruitmentMarket(recruitmentMarketPath, market);
  await writeFile(recruitmentMarketMdPath, recruitmentMarketMarkdown(market), 'utf8');
  const hasManualBasics = Boolean(cleanManualText(input.company, 80) && cleanManualText(input.role, 120));
  const parsedFromText = hydratedInput.parseStatus === 'text-parsed';
  return {
    added: true,
    duplicate: false,
    job,
    market,
    message: hydratedInput.parsedFromUrl
      ? '已解析并记录岗位内容，后续会纳入简历匹配。'
      : parsedFromText
        ? '已从 JD 正文解析并记录岗位内容，后续会纳入简历匹配。'
      : hasManualBasics
        ? '已记录岗位内容，后续会纳入简历匹配。'
      : '已记录岗位链接；页面信息未完全解析，建议稍后补公司和岗位名称。',
  };
}

async function deleteRecruitmentJob(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const id = cleanManualText(input.id, 40);
  const url = normalizeUrl(input.url) || cleanManualText(input.url, 500);
  if (!id && !url) {
    return {
      deleted: false,
      error: '缺少要删除的岗位 ID 或链接。',
      market: await listRecruitmentMarket(),
    };
  }

  const market = await listRecruitmentMarket();
  const jobs = Array.isArray(market.jobs) ? market.jobs : [];
  const targetIndex = jobs.findIndex((job) => (id && job.id === id) || (url && normalizeUrl(job.url) === url));
  if (targetIndex < 0) {
    return {
      deleted: false,
      error: '没有找到要删除的岗位。',
      market,
    };
  }

  const [deletedJob] = jobs.splice(targetIndex, 1);
  renumberMarketJobs(jobs);
  market.jobs = jobs;
  market.updatedAt = todayChina();
  market.lastDeletedJob = {
    runAt: new Date().toISOString(),
    id: deletedJob.id,
    company: deletedJob.company,
    role: deletedJob.role,
    url: deletedJob.url,
  };
  await writeRecruitmentMarket(recruitmentMarketPath, market);
  await writeFile(recruitmentMarketMdPath, recruitmentMarketMarkdown(market), 'utf8');

  return {
    deleted: true,
    job: deletedJob,
    market,
    message: `已删除岗位：${deletedJob.company || ''} ${deletedJob.role || ''}`.trim(),
  };
}

async function updateRecruitmentJob(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const id = cleanManualText(input.id, 40);
  const url = normalizeUrl(input.url) || cleanManualText(input.url, 500);
  if (!id && !url) {
    const response = {
      updated: false,
      error: '缺少要更新的岗位 ID 或链接。',
    };
    if (!input.compact) response.market = await listRecruitmentMarket();
    return response;
  }

  const market = await listRecruitmentMarket();
  const jobs = Array.isArray(market.jobs) ? market.jobs : [];
  const job = jobs.find((item) => (id && item.id === id) || (url && normalizeUrl(item.url) === url));
  if (!job) {
    const response = {
      updated: false,
      error: '没有找到要更新的岗位。',
    };
    if (!input.compact) response.market = market;
    return response;
  }

  const parsed = cleanManualText(input.rawText, 6000) ? parseJobText(input.rawText, '', job.url || url, 'text') : {};
  const patch = {
    url: id ? cleanManualText(input.url, 800) : '',
    company: cleanManualText(input.company, 80) || meaningfulParsedText(parsed.company, 80),
    role: cleanManualText(input.role, 120) || meaningfulParsedText(parsed.role, 120) || meaningfulParsedText(parsed.title, 120),
    location: cleanManualText(input.location, 40) || parsed.location,
    salary: cleanManualText(input.salary, 40) || parsed.salary,
    direction: cleanManualText(input.direction, 80),
    keywords: cleanManualText(input.keywords, 240) || parsed.keywords,
    fitReason: cleanManualText(input.reason, 300),
    rawText: cleanManualText(input.rawText, 1200),
  };
  if (patch.url) job.url = patch.url;
  if (patch.company) job.company = patch.company;
  if (patch.role) job.role = patch.role;
  if (patch.location) job.location = patch.location;
  if (patch.salary) job.salary = patch.salary;
  if (patch.direction) job.direction = patch.direction;
  if (patch.keywords) job.keywords = [...new Set(splitManualKeywords(patch.keywords))].slice(0, 10);
  if (patch.fitReason) job.fitReason = patch.fitReason;
  if (patch.rawText) job.rawText = patch.rawText;
  const rawForInference = [job.company, job.role, job.direction, (job.keywords || []).join(' '), job.rawText].filter(Boolean).join(' ');
  job.direction = job.direction || inferDirection(rawForInference, '');
  job.evidenceGap = inferEvidenceGap(job.direction || '', job.keywords || []);
  job.contactHint = '已由后台解析更新，建议打开原链接复核 JD。';
  job.parsedFromUrl = Boolean(patch.rawText || input.company || input.role);
  job.parseStatus = patch.rawText ? 'codex-chrome-parsed' : 'manual-updated';
  job.updatedAt = todayChina();

  market.updatedAt = todayChina();
  market.lastUpdatedJob = {
    runAt: new Date().toISOString(),
    id: job.id,
    company: job.company,
    role: job.role,
    url: job.url,
  };
  await writeRecruitmentMarket(recruitmentMarketPath, market);
  await writeFile(recruitmentMarketMdPath, recruitmentMarketMarkdown(market), 'utf8');

  const response = {
    updated: true,
    job,
    message: `已更新岗位：${job.company || ''} ${job.role || ''}`.trim(),
  };
  if (!input.compact) response.market = market;
  return response;
}

async function parseRecruitmentJobWithCodex(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const id = cleanManualText(input.id, 40);
  if (!id) {
    return {
      parsed: false,
      error: '缺少要解析的岗位 ID。',
    };
  }

  const market = await listRecruitmentMarket();
  const job = (market.jobs || []).find((item) => item.id === id);
  if (!job) {
    return {
      parsed: false,
      error: '没有找到要解析的岗位。',
    };
  }
  if (!job.url) {
    return {
      parsed: false,
      error: '这个岗位没有链接，无法交给本地 Codex 打开解析。',
    };
  }

  const existingTask = [...codexParseTasks.values()].find((task) => task.jobId === id && task.status === 'running');
  if (existingTask) {
    return {
      started: true,
      task: existingTask,
      message: '本地 Codex 解析任务已在运行。',
    };
  }

  const task = {
    id: `codex-${id}-${Date.now()}`,
    jobId: id,
    status: 'running',
    message: '本地 Codex 解析任务已启动。',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    codexOutput: '',
  };
  codexParseTasks.set(task.id, task);
  runCodexParseTask(task, job).catch((err) => {
    task.status = 'failed';
    task.message = `本地 Codex 任务异常：${String(err?.message || err).slice(0, 240)}`;
    task.finishedAt = new Date().toISOString();
  });

  return {
    started: true,
    task,
    message: '已启动本地 Codex 解析任务，完成后会回写岗位库。',
  };
}

async function parseRecruitmentJobWithExtension(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const id = cleanManualText(input.id, 40);
  if (!id) return { started: false, error: '缺少要解析的岗位 ID。' };
  if (!isChromeExtensionConnected()) {
    return {
      started: false,
      error: '没有检测到已连接的 Chrome 扩展，请打开 Chrome 并刷新 Career-Ops JD Parser。',
    };
  }

  const market = await listRecruitmentMarket();
  const job = (market.jobs || []).find((item) => item.id === id);
  if (!job) return { started: false, error: '没有找到要解析的岗位。' };
  if (!job.url) return { started: false, error: '这个岗位没有链接，无法打开解析。' };

  const existingTask = [...extensionParseTasks.values()].find((task) => task.jobId === id && (task.status === 'running' || task.status === 'queued'));
  if (existingTask) {
    return { started: true, task: existingTask, message: 'Chrome 插件解析任务已在运行。' };
  }

  const task = {
    id: `ext-${id}-${Date.now()}`,
    jobId: id,
    status: 'queued',
    message: '解析任务已入队，等待 Chrome 扩展领取。',
    output: '',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    claimedAt: '',
    claimedBy: '',
  };
  extensionParseTasks.set(task.id, task);

  return {
    started: true,
    task,
    message: task.message,
  };
}

async function registerChromeExtension(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const extensionId = cleanManualText(input.extensionId, 80);
  if (!extensionId) return { ok: false, error: '缺少 extensionId。' };
  extensionRegistration = {
    extensionId,
    version: cleanManualText(input.version, 40),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, extension: extensionRegistration };
}

async function getChromeExtensionStatus() {
  return {
    connected: isChromeExtensionConnected(),
    extension: extensionRegistration,
  };
}

async function claimExtensionParseTask(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const extensionId = cleanManualText(input.extensionId, 80);
  if (!extensionId) return { ok: false, error: '缺少 extensionId。' };
  const task = [...extensionParseTasks.values()].find((item) => item.status === 'queued');
  if (!task) return { ok: true, task: null };
  const market = await listRecruitmentMarket();
  const job = (market.jobs || []).find((item) => item.id === task.jobId);
  if (!job) {
    task.status = 'failed';
    task.message = '解析任务对应的岗位不存在。';
    task.finishedAt = new Date().toISOString();
    return { ok: true, task: null };
  }
  task.status = 'running';
  task.claimedAt = new Date().toISOString();
  task.claimedBy = extensionId;
  task.message = 'Chrome 扩展已领取任务，正在解析岗位。';
  return {
    ok: true,
    task: {
      id: task.id,
      jobId: task.jobId,
      status: task.status,
      message: task.message,
      claimedAt: task.claimedAt,
      claimedBy: task.claimedBy,
    },
    job: {
      id: job.id,
      url: job.url || '',
      company: job.company || '',
      role: job.role || '',
      location: job.location || '',
      salary: job.salary || '',
    },
  };
}

async function completeExtensionParseTask(req) {
  const input = req ? await readJsonBody(req).catch(() => ({})) : {};
  const taskId = cleanManualText(input.taskId, 80);
  const task = extensionParseTasks.get(taskId);
  if (!task) return { ok: false, error: '没有找到扩展解析任务。' };

  task.status = input.status === 'done' ? 'done' : 'failed';
  task.message = cleanManualText(input.message, 240) || (task.status === 'done' ? 'Chrome 插件已解析并回写岗位。' : 'Chrome 插件解析失败。');
  task.output = cleanManualText(input.output, 2000);
  task.finishedAt = new Date().toISOString();
  return {
    ok: true,
    task,
    market: await listRecruitmentMarket(),
  };
}

async function getExtensionParseTask(_req, url) {
  const taskId = cleanManualText(url?.searchParams?.get('taskId'), 80);
  const jobId = cleanManualText(url?.searchParams?.get('jobId'), 40);
  const task = taskId
    ? extensionParseTasks.get(taskId)
    : [...extensionParseTasks.values()].reverse().find((item) => item.jobId === jobId);
  return {
    task: task || null,
    market: task && task.status !== 'running' && task.status !== 'queued' ? await listRecruitmentMarket() : undefined,
  };
}

function isChromeExtensionConnected() {
  if (!extensionRegistration.extensionId || !extensionRegistration.updatedAt) return false;
  const ageMs = Date.now() - new Date(extensionRegistration.updatedAt).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 90000;
}

async function runCodexParseTask(task, job) {
  const prompt = localCodexParsePrompt(job);
  if (!existsSync(codexBin)) {
    task.status = 'failed';
    task.message = `没有找到本地 Codex 命令：${codexBin}`;
    task.finishedAt = new Date().toISOString();
    return;
  }

  try {
    const { stdout, stderr } = await runCodexExec(prompt, { timeoutMs: 300_000 });
    const codexOutput = cleanManualText([stdout, stderr].filter(Boolean).join('\n'), 2000);
    const updatedMarket = await listRecruitmentMarket();
    const updatedJob = (updatedMarket.jobs || []).find((item) => item.id === task.jobId);
    const stillPending = updatedJob ? isPendingMarketJob(updatedJob) : true;
    const codexReportedFailure = /未回写|失败原因|无法读取|Chrome 扩展通道不可用|blocked|CAPTCHA|验证码/i.test(codexOutput);
    task.status = updatedJob && !stillPending && !codexReportedFailure ? 'done' : 'failed';
    task.message = task.status === 'done'
      ? `本地 Codex 已解析并回写：${updatedJob.company || ''} ${updatedJob.role || ''}`.trim()
      : '本地 Codex 已执行，但没有完成有效回写。可能是登录态、Chrome 插件能力或页面读取失败。';
    task.codexOutput = codexOutput;
    task.finishedAt = new Date().toISOString();
  } catch (err) {
    task.status = 'failed';
    task.message = `本地 Codex 执行失败：${String(err?.message || err).slice(0, 240)}`;
    task.codexOutput = cleanManualText([err?.stdout, err?.stderr].filter(Boolean).join('\n'), 2000);
    task.finishedAt = new Date().toISOString();
  }
}

async function getCodexParseTask(_req, url) {
  const taskId = cleanManualText(url?.searchParams?.get('taskId'), 80);
  const jobId = cleanManualText(url?.searchParams?.get('jobId'), 40);
  const task = taskId
    ? codexParseTasks.get(taskId)
    : [...codexParseTasks.values()].reverse().find((item) => item.jobId === jobId);
  return {
    task: task || null,
    market: task && task.status !== 'running' ? await listRecruitmentMarket() : undefined,
  };
}

function runCodexExec(prompt, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, ['exec', '--ephemeral', '--dangerously-bypass-approvals-and-sandbox', prompt], {
      cwd: root,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const err = new Error(`codex exec exited with ${signal || code}`);
      err.stdout = stdout;
      err.stderr = stderr;
      rejectPromise(err);
    });
  });
}

async function openChromeUrl(url) {
  const args = ['-a', 'Google Chrome', url];
  try {
    await execFileAsync('open', args, { cwd: root });
  } catch (primaryErr) {
    await execFileAsync('open', ['-a', 'Chrome', url], { cwd: root }).catch(() => {
      throw primaryErr;
    });
  }
}

function localCodexParsePrompt(job) {
  return [
    '@Chrome',
    '',
    '# Career-Ops Local Codex Workflow: Parse Manual JD',
    '',
    '## Objective',
    'Parse one manually imported job URL and write structured JD data back into the local Career-Ops recruitment market.',
    '',
    '## Input',
    `- job_id: ${job.id}`,
    `- job_url: ${job.url}`,
    `- current_company: ${job.company || '待解析公司'}`,
    `- current_role: ${job.role || '待解析岗位'}`,
    `- local_update_api: http://localhost:4173/api/recruitment-market/update-job`,
    `- local_read_api: http://localhost:4173/api/recruitment-market`,
    '',
    '## Tool Strategy',
    '- This task requires the Chrome plugin because Boss/Zhipin often needs the user\'s logged-in Chrome session.',
    '- First load/use the chrome:control-chrome skill. If node_repl js is not visible, use tool discovery for "node_repl js".',
    '- Use the Node REPL js tool. Do not use shell, curl, WebFetch, Playwright CLI, or Computer Use for Chrome access.',
    '- Bootstrap Chrome with exactly this JavaScript pattern in node_repl before any page work:',
    '```js',
    'if (!globalThis.agent) {',
    '  const { setupBrowserRuntime } = await import("/Users/don/.codex/plugins/cache/openai-bundled/chrome/26.527.60818/scripts/browser-client.mjs");',
    '  await setupBrowserRuntime({ globals: globalThis });',
    '}',
    'if (!globalThis.browser) {',
    '  globalThis.browser = await agent.browsers.get("extension");',
    '}',
    'await browser.nameSession("🔎 Career-Ops JD parse");',
    'if (typeof tab === "undefined") {',
    '  globalThis.tab = await browser.tabs.new();',
    '}',
    'console.log("chrome-ready");',
    '```',
    '- Before parsing, prove Chrome access by running the bootstrap above and receiving chrome-ready. Retry once after 2 seconds if needed.',
    '- If Chrome access is not proven, stop and return: 未回写。原因：Chrome 扩展通道不可用。',
    '- After Chrome access is proven, open job_url in Chrome and only read visible page text. Do not click communication or application actions.',
    '- Do not use direct HTTP/curl/WebFetch for Boss/Zhipin as the main path; it commonly returns a security loading page.',
    '- Only use HTTP as a diagnostic after Chrome fails, and never treat a security/loading page as valid JD text.',
    '- Never invent company, role, salary, or location if the page is blocked.',
    '',
    '## Safety Boundaries',
    '- Read-only on third-party job sites.',
    '- Do NOT click apply, submit, communicate, send, favorite, login, solve CAPTCHA, or change any third-party state.',
    '- It is allowed to call localhost:4173 APIs to update this local app.',
    '',
    '## Steps',
    '1. Run the Chrome extension probe described above. Continue only if Chrome access is proven.',
    '2. Open job_url in Chrome with node_repl, for example:',
    '```js',
    `await tab.goto(${JSON.stringify(job.url)});`,
    'await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 20000 }).catch(() => {});',
    'await tab.playwright.waitForTimeout(3000);',
    'const jdText = await tab.playwright.locator("body").innerText({ timeoutMs: 10000 });',
    'console.log(jdText.slice(0, 6000));',
    '```',
    '3. Read the visible job detail text from the node_repl output.',
    '4. Extract visible JD facts:',
    '   - company',
    '   - role',
    '   - location',
    '   - salary',
    '   - keywords: comma-separated, max 10',
    '   - reason: one short sentence explaining fit/relevance',
    '   - rawText: concise visible JD excerpt/summary, max 1200 chars',
    '5. Validate that company and role are not placeholders such as 待解析公司 / 待解析岗位.',
    '6. POST JSON to local_update_api with exactly these fields:',
    `   {"id":"${job.id}","compact":true,"company":"...","role":"...","location":"...","salary":"...","keywords":"...","reason":"...","rawText":"..."}`,
    '7. Confirm the compact update response has updated=true and job.company/job.role are no longer placeholders.',
    '8. Do not print the full market JSON. Keep the final response short.',
    '',
    '## Success Response',
    'Return a short Chinese summary: 已回写 + company + role + salary/location if available.',
    '',
    '## Failure Response',
    'If blocked by login/CAPTCHA/no tool access, do not update placeholders. Return a short Chinese failure reason and mention what manual input is needed.',
  ].join('\n');
}

function isPendingMarketJob(job) {
  return /待解析/.test(`${job.company || ''} ${job.role || ''}`) || /blocked|failed|fallback/.test(String(job.parseStatus || ''));
}

async function listDirectionClues() {
  return readJsonFile(directionCluesPath, {});
}

async function recruitmentQueriesForMode(market, options = {}) {
  if (options.mode === 'experience') {
    const queries = await experienceRecruitmentQueries();
    if (queries.length) return queries;
  }
  if (options.mode === 'resume-intent') {
    const queries = await resumeIntentRecruitmentQueries(options.resumeFile, market);
    if (queries.length) return queries;
  }
  return market.queryScope?.length ? market.queryScope : defaultRecruitmentQueries();
}

async function experienceRecruitmentQueries() {
  const data = await readJsonFile(experienceMetadataPath, { experiences: [] });
  return (data.experiences || []).slice(0, 8).map((item) => {
    const terms = uniqueTerms([
      item.category,
      item.role,
      ...(item.tags || []),
      ...(item.evidence || []),
      item.summary,
    ]).slice(0, 6).join(' ');
    return terms ? `深圳 ${terms} 招聘 职位 -酒店 -天气` : '';
  }).filter(Boolean);
}

async function resumeIntentRecruitmentQueries(resumeFile, market) {
  let content = '';
  try {
    const file = validateResumeFile(resumeFile || '');
    content = await readFile(resolve(resumesDir, file), 'utf8');
  } catch {
    content = '';
  }
  const title = content.match(/^#\s+(.+)$/m)?.[1] || '';
  const clues = await listDirectionClues().catch(() => ({}));
  const clueText = Object.values(clues).map((item) => [
    item?.direction,
    item?.strategy,
    ...(item?.jdSignals || []),
    ...(item?.keywords || []),
  ].flat().join(' ')).join(' ');
  const terms = uniqueTerms([title, clueText]).slice(0, 8).join(' ');
  const base = terms ? [`深圳 ${terms} 招聘 职位 -酒店 -天气`] : [];
  return [...base, ...(market.queryScope || defaultRecruitmentQueries()).slice(0, 8)];
}

function uniqueTerms(values) {
  const seen = new Set();
  return values.flatMap((value) => String(value || '').split(/[\s,，、/|]+/))
    .map((item) => item.trim())
    .filter((item) => item && item.length >= 2 && !/^(韦东波|招聘|职位|深圳)$/.test(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

async function runDirectCrawler() {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['scripts/china-job-crawler.mjs', '--max=12'],
    {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 5_000_000,
    },
  );
  const jsonStart = stdout.lastIndexOf('\n{');
  const payload = jsonStart >= 0 ? stdout.slice(jsonStart + 1) : stdout;
  const result = JSON.parse(payload);
  return {
    ...result,
    market: await listRecruitmentMarket(),
  };
}

function defaultRecruitmentQueries() {
  return [
    '深圳 机器人系统工程师 EtherCAT ROS2 招聘',
    '深圳 具身智能 数据基建 机器人数据 Pipeline 招聘',
    '深圳 RAG Agent 企业知识库 招聘',
    '深圳 机器人软件 SDK ROS2 CANopen EtherCAT 招聘',
  ];
}

async function searchBing(query, page = 0) {
  try {
    const first = page * 10 + 1;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN&first=${first}`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 career-ops local scanner',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const blocks = html.match(/<li class=\"b_algo\"[\s\S]*?<\/li>/g) || [];
    return blocks.map((block) => {
      const link = block.match(/<h2[^>]*>\s*<a[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) return null;
      const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || '';
      return {
        title: cleanHtml(link[2]),
        url: unwrapBingUrl(decodeHtml(link[1])),
        snippet: cleanHtml(snippet),
        query,
        page,
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function looksLikeJobResult(result) {
  const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const jobWords = ['招聘', '职位', '岗位', '工程师', 'job', 'jobs', 'career', 'zhaopin', 'boss', 'liepin', '猎聘', '拉勾', 'hire'];
  const targetWords = ['机器人', '具身', 'rag', 'agent', 'ros', 'ethercat', 'canopen', 'sdk', '大模型', '知识库'];
  return jobWords.some((word) => text.includes(word.toLowerCase()))
    && targetWords.some((word) => text.includes(word.toLowerCase()));
}

function buildMarketJob(result, query, existingCount, offset) {
  const text = `${result.title} ${result.snippet}`;
  const keywords = inferKeywords(text);
  const direction = inferDirection(text, query);
  const { company, role } = inferCompanyRole(result.title);
  const score = inferMatchScore(keywords, direction, text);
  return {
    id: `MJ-${String(existingCount + offset + 1).padStart(3, '0')}`,
    company,
    role,
    location: inferLocation(text),
    salary: inferSalary(text),
    source: inferSource(result.url),
    url: result.url,
    direction,
    keywords,
    matchScore: score,
    fitReason: '自动检索候选，需要打开 JD 后复核职责、薪资、年限和真实匹配度。',
    evidenceGap: inferEvidenceGap(direction, keywords),
    discoveredBy: 'auto-search',
    searchQuery: query,
    searchPage: result.page || 0,
    snippet: result.snippet,
  };
}

function buildManualMarketJob(input, existingCount) {
  const company = cleanManualText(input.company, 80) || '待解析公司';
  const role = cleanManualText(input.role, 120) || cleanManualText(input.title, 120) || '待解析岗位';
  const url = normalizeUrl(input.url) || cleanManualText(input.url, 500);
  const reason = cleanManualText(input.reason, 300);
  const location = cleanManualText(input.location, 40);
  const salary = cleanManualText(input.salary, 40);
  const rawText = [company, role, reason, input.direction, input.keywords, input.notes, input.rawText].filter(Boolean).join(' ');
  const keywords = splitManualKeywords(input.keywords);
  const inferredKeywords = inferKeywords(rawText);
  const direction = cleanManualText(input.direction, 80) || inferDirection(rawText, '');

  return {
    id: `MJ-${String(existingCount + 1).padStart(3, '0')}`,
    company,
    role,
    location: location || inferLocation(rawText),
    salary: salary || inferSalary(rawText),
    source: '手工导入',
    url,
    direction,
    keywords: [...new Set([...keywords, ...inferredKeywords])].slice(0, 10),
    matchScore: 4.2,
    fitReason: reason || '用户手工标记为感兴趣岗位，优先纳入简历匹配和后续跟进。',
    evidenceGap: inferEvidenceGap(direction, [...keywords, ...inferredKeywords]),
    contactMethod: url ? '原链接投递' : '待补充投递入口',
    contactHint: input.parsedFromUrl ? '已从岗位链接解析基础信息，仍建议打开原链接复核 JD。' : '已记录岗位链接；平台可能拦截自动解析，请打开原链接复核并补齐字段。',
    discoveredBy: 'manual-import',
    manualInterest: true,
    importedAt: todayChina(),
    parsedFromUrl: Boolean(input.parsedFromUrl),
    parseStatus: input.parseStatus || (input.parsedFromUrl ? 'parsed' : 'manual'),
  };
}

async function hydrateManualJobInput(input) {
  const url = normalizeUrl(input.url) || cleanManualText(input.url, 500);
  const rawInputText = cleanManualText(input.rawText || input.notes, 6000);
  const hasCompanyAndRole = cleanManualText(input.company, 80) && cleanManualText(input.role, 120);
  if (rawInputText && !hasCompanyAndRole) {
    const parsedText = parseJobText(rawInputText, '', url, 'text');
    return {
      ...parsedText,
      ...input,
      url,
      company: cleanManualText(input.company, 80) || meaningfulParsedText(parsedText.company, 80) || '',
      role: cleanManualText(input.role, 120) || meaningfulParsedText(parsedText.role, 120) || meaningfulParsedText(parsedText.title, 120) || '',
      location: cleanManualText(input.location, 40) || parsedText.location || '',
      salary: cleanManualText(input.salary, 40) || parsedText.salary || '',
      keywords: cleanManualText(input.keywords, 200) || parsedText.keywords || '',
      rawText: rawInputText,
      parsedFromUrl: false,
      parseStatus: parsedText.parseStatus,
    };
  }
  if (!url || hasCompanyAndRole) return { ...input, url, rawText: rawInputText };

  const parsed = await parseJobUrl(url).catch((err) => ({
    parseStatus: 'failed',
    parseError: String(err?.message || err).slice(0, 160),
  }));
  return {
    ...parsed,
    ...input,
    url,
    company: cleanManualText(input.company, 80) || meaningfulParsedText(parsed.company, 80) || '',
    role: cleanManualText(input.role, 120) || meaningfulParsedText(parsed.role, 120) || meaningfulParsedText(parsed.title, 120) || '',
    location: cleanManualText(input.location, 40) || parsed.location || '',
    salary: cleanManualText(input.salary, 40) || parsed.salary || '',
    keywords: cleanManualText(input.keywords, 200) || parsed.keywords || '',
    rawText: [parsed.rawText, input.notes].filter(Boolean).join(' '),
    parsedFromUrl: Boolean(meaningfulParsedText(parsed.company, 80) || meaningfulParsedText(parsed.role, 120) || meaningfulParsedText(parsed.title, 120)),
    parseStatus: parsed.parseStatus || (meaningfulParsedText(parsed.company, 80) || meaningfulParsedText(parsed.role, 120) || meaningfulParsedText(parsed.title, 120) ? 'parsed' : 'fallback'),
  };
}

async function parseJobUrl(url) {
  const fetched = await parseJobUrlByFetch(url);
  if (fetched.company || fetched.role || fetched.title) return fetched;
  const browsed = await parseJobUrlByBrowser(url).catch(() => ({}));
  return {
    ...fetched,
    ...browsed,
    rawText: [fetched.rawText, browsed.rawText].filter(Boolean).join(' '),
    parseStatus: browsed.parseStatus || fetched.parseStatus || 'fallback',
  };
}

async function parseJobUrlByFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 career-ops manual job importer',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { parseStatus: `fetch-${res.status}` };
    const html = await res.text();
    return parseJobText(cleanHtml(html), html, url, 'fetch');
  } catch (err) {
    return { parseStatus: 'fetch-failed', parseError: String(err?.message || err).slice(0, 160) };
  }
}

async function parseJobUrlByBrowser(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 career-ops manual job importer',
    });
    page.setDefaultTimeout(10_000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => ({
      title: document.title || '',
      text: document.body?.innerText?.replace(/\s+/g, ' ').trim() || '',
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      company: document.querySelector('[class*="company"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      salary: document.querySelector('[class*="salary"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }));
    return parseJobText(`${data.h1} ${data.company} ${data.salary} ${data.text}`, '', url, 'browser', data.title);
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseJobText(text, html, url, source) {
  if (isBlockedJobPage(text, html, url)) {
    return {
      title: '',
      role: '',
      company: '',
      salary: '',
      location: '',
      keywords: '',
      rawText: cleanManualText(text, 1200),
      parseStatus: `${source}-blocked`,
    };
  }
  const bossVisible = parseBossVisibleText(text);
  const title = cleanManualText(
    bossVisible.title || extractMeta(html, 'og:title') || extractTitleFromHtml(html) || inferTitleFromText(text),
    120,
  );
  const role = meaningfulParsedText(bossVisible.role || inferRoleFromText(text, title), 120);
  const company = meaningfulParsedText(bossVisible.company || inferCompanyFromText(text, title), 80);
  const salary = cleanManualText(bossVisible.salary || inferSalary(text), 40);
  const location = cleanManualText(bossVisible.location || inferLocation(text), 40);
  const keywords = inferKeywords(text).join(', ');
  const validTitle = meaningfulParsedText(title, 120);
  const parseStatus = validTitle || role || company ? `${source}-parsed` : `${source}-blocked`;
  return {
    title: validTitle,
    role,
    company,
    salary,
    location,
    keywords,
    rawText: cleanManualText(text, 1200),
    parseStatus,
  };
}

function parseBossVisibleText(text) {
  const value = cleanManualText(text, 6000);
  if (!value) return {};
  const content = value.replace(/^.*?最新\s+/, '');
  const salaryPattern = '(\\d{1,3}\\s*[-~－]\\s*\\d{1,3}\\s*[kK](?:\\s*[·xX*]\\s*\\d{1,2}\\s*薪?)?|\\d{1,3}\\s*[kK]\\s*[-~－]\\s*\\d{1,3}\\s*[kK](?:\\s*[·xX*]\\s*\\d{1,2}\\s*薪?)?)';
  const head = content.match(new RegExp(`([\\\\u4e00-\\\\u9fa5A-Za-z0-9 /+（）()·-]{2,80}?)\\s+${salaryPattern}\\s+([\\\\u4e00-\\\\u9fa5]{2,8})\\s+`));
  const company = value.match(/公司基本信息\s+(.+?)\s+(?:[ABCDEF轮天使种子未已不需要融资]|上市|1000-|[1-9]\d{0,4}-\d{1,5}人|查看全部职位)/)?.[1]
    || value.match(/([^\s]{2,40})\s+·\s*(?:hr|HR|招聘|人事)/i)?.[1]
    || '';
  return {
    title: head?.[1] || '',
    role: head?.[1] || '',
    salary: head?.[2] || '',
    location: head?.[3] || '',
    company,
  };
}

function extractMeta(html, property) {
  if (!html) return '';
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  return decodeHtml(html.match(re)?.[1] || '');
}

function extractTitleFromHtml(html) {
  return decodeHtml(html?.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
}

function inferTitleFromText(text) {
  return String(text || '').split(/[。|\n]/).map((line) => line.trim()).find((line) => /工程师|开发|岗位|招聘|产品经理|架构师/i.test(line)) || '';
}

function inferRoleFromText(text, title) {
  const value = `${title} ${text}`;
  const bossTitle = value.match(/([\u4e00-\u9fa5A-Za-z0-9 /+（）()-]{2,80}(工程师|开发|架构师|产品经理|算法|负责人|专家))/);
  return bossTitle?.[1] || title.replace(/招聘.*$/i, '').replace(/[-_].*$/g, '').trim();
}

function inferCompanyFromText(text, title) {
  const value = `${title} ${text}`;
  const company = value.match(/[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,50}(有限公司|集团|科技|机器人|智能|研究院|腾讯|字节|华为|美团|京东|比亚迪|智元|优必选|宇树|股份)/)?.[0];
  return company || '';
}

function inferredCompanyFromUrl(url) {
  const source = inferSource(url);
  if (source && source !== '自动检索') return source;
  return '';
}

function inferCompanyRole(title) {
  const clean = title.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/[-_|｜—–]/).map((part) => part.trim()).filter(Boolean);
  const rolePart = parts.find((part) => /工程师|开发|架构|算法|RAG|Agent|机器人|具身|SDK/i.test(part)) || parts[0] || clean;
  const companyPart = parts.find((part) => part !== rolePart && !/招聘|职位|岗位|猎聘|智联|Boss|BOSS/i.test(part)) || '待复核';
  return { company: companyPart.slice(0, 40), role: rolePart.slice(0, 80) };
}

function inferKeywords(text) {
  const candidates = [
    'EtherCAT', 'CANopen', 'CAN', 'CiA402', 'ROS2', 'ROS', 'MoveIt', 'URDF', 'SDK',
    'RAG', 'Agent', '知识库', '检索', '重排', 'Evidence', 'Badcase', 'FastAPI',
    '具身智能', '机器人数据', '多模态数据', '数据清洗', '数据标注', '数据质检',
    'Isaac Sim', 'IsaacSim', 'MuJoCo', '强化学习', '模仿学习', 'VLA', 'Kubernetes',
    'Docker', 'C++', 'Python', '实时系统', '运动控制',
  ];
  const lower = text.toLowerCase();
  return candidates.filter((kw) => lower.includes(kw.toLowerCase())).slice(0, 10);
}

function inferDirection(text, query) {
  const s = `${text} ${query}`.toLowerCase();
  if (s.includes('rag') || s.includes('agent') || s.includes('知识库')) return '企业级 AI / RAG / Agent';
  if (s.includes('数据') && (s.includes('具身') || s.includes('机器人'))) return '具身智能数据基建';
  if (s.includes('isaac') || s.includes('mujoco') || s.includes('仿真')) return '机器人仿真 / 具身应用';
  if (s.includes('sdk') || s.includes('ros')) return '机器人软件 / ROS2 / SDK';
  if (s.includes('ethercat') || s.includes('canopen') || s.includes('运动控制')) return '机器人系统 / 工业通信';
  return '待复核';
}

function inferMatchScore(keywords, direction, text) {
  let score = 2.6;
  score += Math.min(keywords.length, 8) * 0.12;
  if (/深圳/.test(text)) score += 0.2;
  if (/RAG|Agent|EtherCAT|CANopen|ROS2|SDK|具身智能|机器人数据/i.test(text)) score += 0.4;
  if (/负责人|架构|专家|5年|五年|8年|八年|博士/.test(text)) score -= 0.5;
  if (/实习|校招/.test(text)) score -= 0.3;
  if (direction === '企业级 AI / RAG / Agent' || direction === '机器人软件 / ROS2 / SDK') score += 0.2;
  return Math.max(1, Math.min(5, Number(score.toFixed(1))));
}

function inferEvidenceGap(direction, keywords) {
  if (direction.includes('数据')) return '需要补机器人数据 Pipeline、数据清洗、质检、版本管理或标注流转证据。';
  if (direction.includes('RAG')) return '需要补 RAG 架构、评测、Badcase、Evidence API 和部署细节。';
  if (direction.includes('SDK')) return '需要补 SDK 模块、API、Demo、文档、客户接入和测试证据。';
  if (direction.includes('仿真')) return '需要补 Isaac/ROS2/MoveIt/URDF Demo、截图、视频或调试记录。';
  if (direction.includes('系统')) return '需要补 EtherCAT/CANopen、实时系统、多关节稳定性和现场问题闭环证据。';
  return keywords.length ? `围绕 ${keywords.slice(0, 3).join('、')} 补充项目证据。` : '需要打开 JD 后复核证据缺口。';
}

function inferLocation(text) {
  const match = text.match(/深圳|广州|上海|北京|杭州|苏州|东莞|珠海|成都|武汉|南京/);
  return match?.[0] || '待复核';
}

function inferSalary(text) {
  const match = text.match(/(\d{1,3}\s*[kK]\s*[-~－]\s*\d{1,3}\s*[kK](?:\s*[·*xX]\s*\d{1,2}\s*薪?)?|\d{1,3}\s*[-~－]\s*\d{1,3}K(?:\s*[·*xX]\s*\d{1,2}\s*薪?)?)/);
  return match?.[0] || '待复核';
}

function isBlockedJobPage(text, html, url) {
  const value = `${extractTitleFromHtml(html)} ${url || ''} ${text || ''}`;
  return /passport\/zp\/security|\/web\/user\/|请稍候|正在加载中|安全验证|验证码登录|APP扫码登录|BOSS直聘注册登录|客户服务热线|找工作 BOSS直聘直接谈|首次验证通过即注册BOSS直聘账号/.test(value);
}

function inferSource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known = [
      ['zhaopin.com', '智联招聘'],
      ['liepin.com', '猎聘'],
      ['zhipin.com', 'Boss直聘'],
      ['jobs.tencent.com', '腾讯招聘'],
      ['michaelpage.com.cn', 'Michael Page'],
      ['bebee.com', 'BeBee'],
      ['haitou.cc', '海投'],
      ['simplyhired.cn', 'SimplyHired'],
    ];
    return known.find(([key]) => host.includes(key))?.[1] || host;
  } catch {
    return '自动检索';
  }
}

function recruitmentMarketMarkdown(market) {
  const rows = (market.jobs || []).map((job) => {
    return `| ${job.id} | ${pipe(job.company)} | ${pipe(job.role)} | ${pipe(job.location)} | ${pipe(job.salary)} | ${pipe(job.direction)} | ${Number(job.matchScore || 0).toFixed(1)} | ${pipe((job.keywords || []).join('、'))} | ${pipe(job.evidenceGap || '')} | [链接](${job.url}) |`;
  }).join('\n');
  return `# 招聘信息检索表

更新时间：${market.updatedAt || ''}

检索范围：

${(market.queryScope || []).map((item) => `- ${item}`).join('\n')}

| ID | 公司 | 岗位 | 地点 | 薪资 | 方向 | 匹配分 | 关键词 | 证据缺口 | 来源 |
|---|---|---|---|---|---|---:|---|---|---|
${rows}
`;
}

function dedupeMarketJobs(jobs) {
  const seen = new Set();
  const deduped = [];
  for (const job of jobs) {
    const key = jobIdentityKey(job);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  renumberMarketJobs(deduped);
  return deduped;
}

function renumberMarketJobs(jobs) {
  jobs.forEach((job, index) => {
    job.id = `MJ-${String(index + 1).padStart(3, '0')}`;
  });
}

function jobIdentityKey(item) {
  const urlKey = normalizeUrl(item.url);
  if (urlKey) return `url:${urlKey}`;
  const title = normalizeIdentityText(item.title || item.role || '');
  const company = normalizeIdentityText(item.company || '');
  if (!title) return '';
  return `title:${company}:${title}`;
}

function normalizeIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[|｜_\-—–·,，。:：()（）【】\[\]]/g, '');
}

function cleanManualText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function meaningfulParsedText(value, limit) {
  const text = cleanManualText(value, limit)
    .replace(/^(首页\s+)?(职位\s+)?最新\s+/, '')
    .replace(/^(首页\s+)?职位\s+/, '');
  if (!text) return '';
  if (/^(请稍候|请稍等|加载中|安全验证|登录|注册|验证码|BOSS直聘|Boss直聘|BOSS 直聘|自动检索)$/i.test(text)) return '';
  if (/请稍候|安全验证|验证码|登录后|页面不存在|访问受限|风险|风控|滑块|人机验证|客户服务热线|APP扫码登录|BOSS直聘注册登录|找工作 BOSS直聘直接谈/.test(text)) return '';
  return text;
}

function splitManualKeywords(value) {
  return String(value || '')
    .split(/[\s,，、/|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function pipe(value) {
  return String(value ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    if (/zhaopin\.com\/jobdetail|zhipin\.com\/job_detail|liepin\.com\/job\/|lagou\.com\/wn\/jobs/.test(u.href)) {
      u.search = '';
      return u.toString();
    }
    ['utm_source', 'utm_medium', 'utm_campaign', 'spm', 'refcode', 'srccode', 'preactionid', '__zp_stoken__'].forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return '';
  }
}

function cleanHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function unwrapBingUrl(value) {
  try {
    const url = new URL(value);
    const encoded = url.searchParams.get('u');
    if (encoded?.startsWith('a1')) {
      return Buffer.from(encoded.slice(2), 'base64url').toString('utf8');
    }
    return value;
  } catch {
    return value;
  }
}

function todayChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function validateResumeFile(value) {
  const file = String(value || '');
  if (!/^\d{2}-.+\.md$/.test(file)) throw new Error('Invalid resume file');
  const path = resolve(resumesDir, file);
  if (!path.startsWith(resumesDir) || !existsSync(path)) throw new Error('Resume not found');
  return file;
}
