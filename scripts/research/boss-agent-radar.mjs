#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { readRecruitmentMarket, writeRecruitmentMarket } from '../cli/recruitment-market-store.mjs';

const marketPath = 'workspace/ops/data/recruitment-market.json';
const marketMdPath = 'workspace/ops/data/recruitment-market.md';
const args = process.argv.slice(2);

const dryRun = args.includes('--dry-run');
const withDetails = args.includes('--details');
const skipStatus = args.includes('--skip-status');
const maxAdded = Number(readOption('--max', '25'));
const city = readOption('--city', '深圳');
const platform = readOption('--platform', 'zhipin');
const welfare = readOption('--welfare', '');
const salary = readOption('--salary', '');
const experience = readOption('--experience', '');
const education = readOption('--education', '');
const queryOptions = collectOption('--query');
const queries = queryOptions.length ? queryOptions : [
  '机器人系统工程师',
  'ROS2 机器人',
  '机器人软件 SDK',
  '具身智能 数据',
  'AI工具链 Agent RAG',
];

const stats = {
  queries: queries.length,
  commandsRun: 0,
  candidatesSeen: 0,
  duplicatesSkipped: 0,
  detailCommandsRun: 0,
  added: 0,
  failedQueries: 0,
  statusOk: false,
};

const market = await readRecruitmentMarket(marketPath, { mergeLegacyJobs: true });
const existing = new Set((market.jobs || []).map(jobIdentityKey));
const discovered = [];

if (!skipStatus) {
  const status = await runBoss(['--platform', platform, 'status']);
  stats.statusOk = Boolean(status.envelope?.ok);
  if (!status.ok || !status.envelope?.ok) {
    const message = status.envelope?.error?.message || status.stderr || status.stdout || 'boss status failed';
    console.error(JSON.stringify({
      ok: false,
      reason: 'boss-agent-cli is not ready. Run `boss doctor`, then `boss login` if needed.',
      message: String(message).slice(0, 1000),
    }, null, 2));
    process.exit(1);
  }
}

for (const query of queries) {
  if (discovered.length >= maxAdded) break;
  const commandArgs = buildSearchArgs(query);
  const result = await runBoss(commandArgs);
  if (!result.ok || !result.envelope?.ok) {
    stats.failedQueries += 1;
    continue;
  }

  const items = extractItems(result.envelope);
  for (const item of items) {
    stats.candidatesSeen += 1;
    if (discovered.length >= maxAdded) break;
    const job = normalizeBossJob(item, query);
    if (!job || !looksRelevant(job.rawText || [job.company, job.role, job.direction].join(' '))) continue;

    const key = jobIdentityKey(job);
    if (!key || existing.has(key)) {
      stats.duplicatesSkipped += 1;
      continue;
    }

    if (withDetails && (item.security_id || item.securityId || item.securityIdStr)) {
      const detail = await fetchDetail(item);
      if (detail) mergeDetail(job, detail);
    }

    existing.add(key);
    discovered.push(job);
    stats.added += 1;
  }
}

if (!dryRun && discovered.length) {
  market.jobs = [...(market.jobs || []), ...discovered];
  renumberMarketJobs(market.jobs);
  market.updatedAt = todayChina();
  market.lastBossAgentRadar = {
    runAt: new Date().toISOString(),
    added: discovered.length,
    stats,
    queries,
    city,
    platform,
    welfare,
    note: '通过 boss-agent-cli 只读搜索导入；不打招呼、不投递、不读取聊天、不交换联系方式。',
  };
  await writeRecruitmentMarket(marketPath, market);
  await writeFile(marketMdPath, recruitmentMarketMarkdown(market), 'utf8');
}

console.log(JSON.stringify({
  ok: true,
  dryRun,
  added: discovered.length,
  stats,
  queries,
  discovered,
}, null, 2));

function buildSearchArgs(query) {
  const out = ['--platform', platform, 'search', query, '--city', city];
  if (welfare) out.push('--welfare', welfare);
  if (salary) out.push('--salary', salary);
  if (experience) out.push('--experience', experience);
  if (education) out.push('--education', education);
  return out;
}

async function fetchDetail(item) {
  const sid = item.security_id || item.securityId || item.securityIdStr;
  if (!sid) return null;
  const args = ['--platform', platform, 'detail', String(sid)];
  const jobId = item.job_id || item.jobId || item.encryptJobId || item.encrypt_job_id;
  if (jobId) args.push('--job-id', String(jobId));
  stats.detailCommandsRun += 1;
  const result = await runBoss(args);
  return result.ok && result.envelope?.ok ? result.envelope.data : null;
}

function runBoss(commandArgs) {
  stats.commandsRun += 1;
  return new Promise((resolve) => {
    const child = spawn('boss', commandArgs, { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: `${stderr}\n${error.message}`.trim(), envelope: null });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, envelope: parseJsonEnvelope(stdout) });
    });
  });
}

function parseJsonEnvelope(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractItems(envelope) {
  const data = envelope?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.jobs)) return data.jobs;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeBossJob(item, query) {
  const role = cleanText(firstOf(item, ['jobName', 'job_name', 'title', 'positionName', 'name']));
  const company = cleanText(firstOf(item, ['brandName', 'brand_name', 'companyName', 'company_name', 'company']));
  const location = cleanText(firstOf(item, ['cityName', 'city_name', 'city', 'location', 'areaDistrict']));
  const salaryText = cleanText(firstOf(item, ['salaryDesc', 'salary_desc', 'salary', 'salaryText']));
  const url = normalizeBossUrl(item);
  const rawText = stringifyCompact(item);
  const keywords = inferKeywords(rawText);
  const direction = inferDirection(rawText || `${query} ${role}`);
  if (!role && !company) return null;
  return {
    id: '',
    company: company || '待复核公司',
    role: role || query,
    location: location || city,
    salary: salaryText || '待复核',
    source: 'Boss直聘 / boss-agent-cli',
    url,
    direction,
    keywords,
    matchScore: inferMatchScore(keywords, direction, rawText),
    fitReason: 'boss-agent-cli 只读搜索导入，已通过结构化输出进入岗位雷达；需要打开 JD 复核职责、薪资、年限和团队边界。',
    evidenceGap: inferEvidenceGap(direction, keywords),
    platform: platform === 'zhilian' ? '智联招聘' : 'Boss直聘',
    discoveredBy: 'boss-agent-cli',
    discoveredAt: todayChina(),
    securityId: firstOf(item, ['security_id', 'securityId', 'securityIdStr']) || '',
    bossJobId: firstOf(item, ['job_id', 'jobId', 'encryptJobId', 'encrypt_job_id']) || '',
    contactMethod: '平台沟通或原链接投递',
    contactHint: 'boss-agent-cli 仅做本地只读辅助；沟通、投递和联系方式交换必须回到平台官网手动完成。',
    rawText: rawText.slice(0, 1600),
  };
}

function mergeDetail(job, detail) {
  const rawText = `${job.rawText || ''}\n${stringifyCompact(detail)}`;
  const keywords = inferKeywords(rawText);
  job.rawText = rawText.slice(0, 2600);
  job.keywords = Array.from(new Set([...(job.keywords || []), ...keywords])).slice(0, 12);
  job.direction = inferDirection(rawText);
  job.matchScore = inferMatchScore(job.keywords, job.direction, rawText);
  job.evidenceGap = inferEvidenceGap(job.direction, job.keywords);
}

function normalizeBossUrl(item) {
  const direct = firstOf(item, ['url', 'jobUrl', 'job_url', 'detailUrl', 'detail_url']);
  if (direct) return normalizeUrl(String(direct));
  const sid = firstOf(item, ['security_id', 'securityId', 'securityIdStr']);
  if (!sid) return '';
  const jid = firstOf(item, ['job_id', 'jobId', 'encryptJobId', 'encrypt_job_id']);
  const url = new URL('https://www.zhipin.com/job_detail/');
  url.searchParams.set('securityId', String(sid));
  if (jid) url.searchParams.set('jobId', String(jid));
  return url.toString();
}

function firstOf(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return '';
}

function stringifyCompact(value) {
  try {
    return JSON.stringify(value, null, 0).replace(/\s+/g, ' ').trim();
  } catch {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
}

function looksRelevant(text) {
  return /机器人|具身|ROS|ROS2|EtherCAT|CANopen|RAG|Agent|AI|人工智能|系统工程|SDK|运动控制|自动化|大模型|数据平台|MCP/i.test(text);
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function inferKeywords(text) {
  const candidates = [
    'EtherCAT', 'CANopen', 'CAN', 'CiA402', 'ROS2', 'ROS', 'MoveIt', 'URDF', 'SDK',
    'RAG', 'Agent', 'MCP', 'AI工具链', '知识库', '检索', '重排', 'Badcase',
    '具身智能', '机器人平台', '机器人系统', '机器人数据', '多模态数据', '多传感器融合',
    'Isaac Sim', 'MuJoCo', '强化学习', '模仿学习', 'VLA', 'Docker', 'Kubernetes',
    'C++', 'Python', '实时系统', '运动控制', '感知算法', '自动化',
  ];
  const lower = String(text || '').toLowerCase();
  return candidates.filter((kw) => lower.includes(kw.toLowerCase())).slice(0, 12);
}

function inferDirection(text) {
  const s = String(text || '').toLowerCase();
  if (/ai工具链|agent|rag|知识库|mcp|大模型/i.test(s)) return 'AI工具链 / RAG / Agent';
  if (/感知|多传感器|视觉/.test(text)) return '机器人感知 / 多传感器融合';
  if (/数据|标注|采集|清洗/.test(text) && /机器人|具身/.test(text)) return '具身智能数据基建';
  if (/ros|sdk|平台/.test(s) && /机器人/.test(text)) return '机器人软件 / 平台 / SDK';
  if (/ethercat|canopen|运动控制|实时/.test(s)) return '机器人系统 / 工业通信';
  if (/仿真|isaac|mujoco/i.test(text)) return '机器人仿真 / 具身应用';
  return /机器人|具身/.test(text) ? '机器人相关 / 待复核' : 'AI/技术岗位 / 待复核';
}

function inferMatchScore(keywords, direction, text) {
  let score = 2.7;
  score += Math.min(keywords.length, 8) * 0.12;
  if (/深圳/.test(text)) score += 0.2;
  if (/RAG|Agent|EtherCAT|CANopen|ROS2|SDK|具身智能|机器人平台|机器人数据|MCP/i.test(text)) score += 0.45;
  if (/负责人|架构|专家|8年|10年|博士/.test(text)) score -= 0.45;
  if (/实习|校招|应届/.test(text)) score -= 0.35;
  return Math.max(1, Math.min(5, Number(score.toFixed(1))));
}

function inferEvidenceGap(direction, keywords) {
  if (direction.includes('数据')) return '需要补机器人数据 Pipeline、数据清洗、质检、版本管理或标注流转证据。';
  if (direction.includes('Agent') || direction.includes('RAG')) return '需要补 RAG/Agent 架构、评测、工具调用、Badcase 和部署细节。';
  if (direction.includes('SDK') || direction.includes('平台')) return '需要补 SDK/API、开发者工具、客户接入、版本规划和平台化证据。';
  if (direction.includes('感知')) return '需要确认是否算法岗；补多传感器、机器人数据、调试协作和系统集成证据。';
  if (direction.includes('系统')) return '需要补 EtherCAT/CANopen、实时系统、多关节稳定性和现场问题闭环证据。';
  return keywords.length ? `围绕 ${keywords.slice(0, 3).join('、')} 补充项目证据。` : '需要打开 JD 后复核证据缺口。';
}

function jobIdentityKey(item) {
  const urlKey = normalizeUrl(item.url);
  if (urlKey) return `url:${urlKey}`;
  const sid = item.securityId || item.security_id;
  if (sid) return `boss:${sid}`;
  const role = normalizeIdentityText(item.role || item.title || '');
  const company = normalizeIdentityText(item.company || '');
  return role ? `title:${company}:${role}` : '';
}

function normalizeIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[|｜_\-—–·,，。:：()（）【】\[\]]/g, '');
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'spm', 'refcode', 'srccode', 'preactionid', '__zp_stoken__'].forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return '';
  }
}

function renumberMarketJobs(jobs) {
  jobs.forEach((job, index) => {
    job.id = `MJ-${String(index + 1).padStart(3, '0')}`;
  });
}

function recruitmentMarketMarkdown(market) {
  const rows = (market.jobs || []).map((job) => {
    return `| ${job.id} | ${pipe(job.platform || job.source || '')} | ${pipe(job.company)} | ${pipe(job.role)} | ${pipe(job.location)} | ${pipe(job.salary)} | ${pipe(job.contactMethod || '')} | ${pipe(job.direction)} | ${Number(job.matchScore || 0).toFixed(1)} | ${pipe(job.fitReason || '')} |`;
  }).join('\n');
  return `# 招聘信息检索表

更新时间：${market.updatedAt || ''}

| ID | 渠道 | 公司 | 岗位 | 地点 | 薪资 | 联系方式 | 方向 | 匹配分 | 备注 |
|---|---|---|---|---|---|---|---|---:|---|
${rows}
`;
}

function pipe(value) {
  return String(value ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim();
}

function todayChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function readOption(name, fallback = '') {
  const equals = args.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
}

function collectOption(name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
    if (arg === name && args[i + 1] && !args[i + 1].startsWith('--')) values.push(args[i + 1]);
  }
  return values.map((value) => value.trim()).filter(Boolean);
}
