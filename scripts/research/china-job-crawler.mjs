#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { chromium } from 'playwright';
import { readRecruitmentMarket, writeRecruitmentMarket } from '../cli/recruitment-market-store.mjs';

const marketPath = 'workspace/ops/data/recruitment-market.json';
const marketMdPath = 'workspace/ops/data/recruitment-market.md';
const args = new Set(process.argv.slice(2));
const maxArg = process.argv.find((arg) => arg.startsWith('--max='));
const platformArg = process.argv.find((arg) => arg.startsWith('--platform='));
const cityArg = process.argv.find((arg) => arg.startsWith('--city='));
const maxAdded = Number(maxArg?.split('=')[1] || 25);
const selectedPlatform = platformArg?.split('=')[1] || '';
const selectedCity = cityArg?.split('=').slice(1).join('=').trim() || '深圳';
const queryArgs = readRepeatedOption('--query');
const dryRun = args.has('--dry-run');
const headful = args.has('--headful');
const enrichExisting = args.has('--enrich-existing');

const targets = [
  {
    id: 'zhaopin',
    platform: '智联招聘',
    source: '智联招聘平台爬虫',
    urls: [
      'https://www.zhaopin.com/sou/jl765/kwCST5CQ2EN9UFMVMVBNINK2QU10/p1',
      'https://www.zhaopin.com/sou/jl765/kwA5ROTAR6FA0FQPBGCDN0/p1',
    ],
    linkPattern: /zhaopin\.com\/jobdetail\//,
  },
  {
    id: 'boss',
    platform: 'Boss直聘',
    source: 'Boss直聘平台爬虫',
    urls: [
      'https://www.zhipin.com/web/geek/jobs?city=101280600&query=%E6%9C%BA%E5%99%A8%E4%BA%BA%E7%B3%BB%E7%BB%9F%E5%B7%A5%E7%A8%8B%E5%B8%88',
      'https://www.zhipin.com/web/geek/jobs?city=101280600&query=ROS2',
      'https://www.zhipin.com/web/geek/jobs?city=101280600&query=AI%E5%B7%A5%E5%85%B7%E9%93%BE',
    ],
    linkPattern: /zhipin\.com\/job_detail\//,
  },
  {
    id: 'liepin',
    platform: '猎聘',
    source: '猎聘平台爬虫',
    urls: [
      'https://www.liepin.com/zhaopin/?key=%E6%9C%BA%E5%99%A8%E4%BA%BA%E7%B3%BB%E7%BB%9F%E5%B7%A5%E7%A8%8B%E5%B8%88&dq=050090',
      'https://www.liepin.com/zhaopin/?key=%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD&dq=050090',
    ],
    linkPattern: /liepin\.com\/job\//,
  },
  {
    id: '51job',
    platform: '前程无忧',
    source: '前程无忧平台爬虫',
    urls: [
      'https://we.51job.com/pc/search?keyword=%E6%9C%BA%E5%99%A8%E4%BA%BA%E7%B3%BB%E7%BB%9F%E5%B7%A5%E7%A8%8B%E5%B8%88&searchType=2&jobArea=040000',
      'https://we.51job.com/pc/search?keyword=ROS2&searchType=2&jobArea=040000',
    ],
    linkPattern: /(51job|jobs\.51job)\.com/,
  },
  {
    id: 'lagou',
    platform: '拉勾招聘',
    source: '拉勾平台爬虫',
    urls: [
      'https://www.lagou.com/wn/zhaopin?city=%E6%B7%B1%E5%9C%B3&kd=AI%20Agent',
      'https://www.lagou.com/wn/zhaopin?city=%E6%B7%B1%E5%9C%B3&kd=RAG',
    ],
    linkPattern: /lagou\.com\/wn\/jobs\//,
  },
  {
    id: 'iguopin',
    platform: '国聘',
    source: '国聘平台爬虫',
    urls: [
      'https://www.iguopin.com/search?keyword=%E6%9C%BA%E5%99%A8%E4%BA%BA',
      'https://www.iguopin.com/search?keyword=%E6%99%BA%E8%83%BD%E5%88%B6%E9%80%A0',
    ],
    linkPattern: /iguopin\.com/,
  },
];

const searchTargets = buildSearchTargets(targets, queryArgs, selectedCity);
const market = await readRecruitmentMarket(marketPath, { mergeLegacyJobs: true });

const existing = new Set((market.jobs || []).map(jobIdentityKey));
const discovered = [];
const stats = {
  targets: 0,
  pagesVisited: 0,
  candidatesSeen: 0,
  duplicatesSkipped: 0,
  added: 0,
  failedPages: 0,
  detailPagesVisited: 0,
  detailPagesFailed: 0,
  emailsFound: 0,
  existingEnriched: 0,
};

const browser = await chromium.launch({ headless: !headful });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  userAgent: 'Mozilla/5.0 Ucareer China job crawler',
});
const detailPage = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 Ucareer China job crawler',
});
page.setDefaultTimeout(15_000);
detailPage.setDefaultTimeout(12_000);

if (enrichExisting) {
  await enrichExistingJobs(detailPage);
  await browser.close();
  if (!dryRun && stats.existingEnriched) {
    market.updatedAt = todayChina();
    market.lastContactEnrichment = {
      runAt: new Date().toISOString(),
      enriched: stats.existingEnriched,
      stats,
      note: '打开已有 JD 详情页提取公开投递邮箱；不绕过登录、验证码或平台权限。',
    };
    await writeRecruitmentMarket(marketPath, market);
    await writeFile(marketMdPath, recruitmentMarketMarkdown(market), 'utf8');
  }
  console.log(JSON.stringify({ added: 0, dryRun, enrichExisting, stats, discovered: [] }, null, 2));
  process.exit(0);
}

for (const target of searchTargets) {
  if (selectedPlatform && target.id !== selectedPlatform) continue;
  stats.targets += 1;
  for (const url of target.urls) {
    if (discovered.length >= maxAdded) break;
    const jobs = await crawlTargetPage(page, target, url);
    for (const job of jobs) {
      stats.candidatesSeen += 1;
      const key = jobIdentityKey(job);
      if (!key || existing.has(key)) {
        stats.duplicatesSkipped += 1;
        continue;
      }
      await enrichContactInfo(detailPage, job);
      await wait(300);
      existing.add(key);
      discovered.push(job);
      stats.added += 1;
      if (discovered.length >= maxAdded) break;
    }
    await wait(900);
  }
}

await browser.close();

if (!dryRun && discovered.length) {
  market.jobs = [...(market.jobs || []), ...discovered];
  renumberMarketJobs(market.jobs);
  await attachJobDescriptionFiles(discovered);
  market.updatedAt = todayChina();
  market.lastDirectCrawler = {
    runAt: new Date().toISOString(),
    added: discovered.length,
    stats,
    note: '直接访问中国招聘平台搜索页采集岗位卡片；不绕过登录、验证码或投递动作。',
  };
  await writeRecruitmentMarket(marketPath, market);
  await writeFile(marketMdPath, recruitmentMarketMarkdown(market), 'utf8');
}

console.log(JSON.stringify({ added: discovered.length, dryRun, stats, discovered }, null, 2));

async function crawlTargetPage(page, target, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2500);
    stats.pagesVisited += 1;
    const raw = await page.evaluate((patternText) => {
      const pattern = new RegExp(patternText);
      const anchors = [...document.querySelectorAll('a[href]')];
      return anchors.map((a) => {
        const href = new URL(a.getAttribute('href'), location.href).href;
        if (!pattern.test(href)) return null;
        let node = a;
        let bestText = '';
        for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
          const nodeText = (node.innerText || '').replace(/\s+/g, ' ').trim();
          if (nodeText.length > bestText.length && nodeText.length < 2200) bestText = nodeText;
        }
        return {
          title: (a.innerText || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim(),
          url: href,
          text: bestText || (a.innerText || '').replace(/\s+/g, ' ').trim(),
        };
      }).filter(Boolean);
    }, target.linkPattern.source);

    return dedupeRaw(raw).map((item) => buildCrawlerJob(item, target)).filter(Boolean);
  } catch {
    stats.failedPages += 1;
    return [];
  }
}

async function enrichExistingJobs(page) {
  const jobs = (market.jobs || [])
    .filter((job) => !selectedPlatform || platformMatches(job, selectedPlatform))
    .filter((job) => job.url && !job.applicationEmail && !job.contactEmails?.length)
    .slice(0, maxAdded);

  for (const job of jobs) {
    await enrichContactInfo(page, job);
    if (job.contactCheckedAt) stats.existingEnriched += 1;
    await wait(300);
  }
}

async function enrichContactInfo(page, job) {
  const baseText = job.rawText || '';
  const baseContact = extractContactInfo(baseText, job.url);
  Object.assign(job, baseContact);

  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
    await page.waitForTimeout(1800);
    stats.detailPagesVisited += 1;
    const detailText = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').trim() || '');
    if (detailText) job.rawText = `${baseText}\n${detailText}`.trim().slice(0, 8000);
    const detailContact = extractContactInfo(`${baseText} ${detailText}`, job.url);
    Object.assign(job, detailContact);
  } catch {
    stats.detailPagesFailed += 1;
  }

  job.contactCheckedAt = todayChina();
  if (job.contactEmails?.length) stats.emailsFound += job.contactEmails.length;
}

function buildCrawlerJob(item, target) {
  const cardText = item.text || '';
  const text = `${item.title} ${cardText}`;
  const role = cleanRole(isCrawlerRoleTitle(item.title) ? item.title : inferRole(cardText || text));
  if (!role || !looksRelevant(text)) return null;
  const company = inferCompany(cardText || text, role);
  const keywords = inferKeywords(text);
  const direction = inferDirection(text);
  return {
    id: '',
    company,
    role,
    location: inferLocation(cardText || text),
    salary: inferSalary(cardText || text),
    source: target.source,
    url: normalizeUrl(item.url),
    direction,
    keywords,
    matchScore: inferMatchScore(keywords, direction, text),
    fitReason: '平台爬虫直接采集候选，需要打开 JD 复核职责、薪资、年限和真实匹配度。',
    evidenceGap: inferEvidenceGap(direction, keywords),
    platform: target.platform,
    discoveredBy: 'china-direct-crawler',
    discoveredAt: todayChina(),
    contactMethod: '平台沟通或原链接投递',
    contactEmails: [],
    applicationEmail: '',
    contactHint: '未在列表页发现公开邮箱；可打开 JD 详情页复核。',
    rawText: item.text.slice(0, 600),
  };
}

async function attachJobDescriptionFiles(jobs) {
  for (const job of jobs) {
    const description = String(job.rawText || '').trim();
    if (!description || job.jdPath || !job.id) continue;
    job.jdPath = await writeJobDescriptionFile(job, description);
  }
}

async function writeJobDescriptionFile(job, description) {
  const jdsDir = 'workspace/jobs/jds';
  await mkdir(jdsDir, { recursive: true });
  const fileName = `${job.id}-${slugifyFileName([job.company, job.role].filter(Boolean).join('-') || 'job-description')}.md`;
  const relativePath = `${jdsDir}/${fileName}`;
  const markdown = [
    `# ${job.role || '待解析岗位'}`,
    '',
    `- ID: ${job.id}`,
    job.company ? `- 公司: ${job.company}` : '',
    job.salary ? `- 薪资: ${job.salary}` : '',
    job.location ? `- 地点: ${job.location}` : '',
    job.url ? `- URL: ${job.url}` : '',
    `- 来源: ${job.source || '平台爬虫'}`,
    `- 入库时间: ${new Date().toISOString()}`,
    '',
    '## JD 原文',
    '',
    description,
    '',
  ].filter((line) => line !== '').join('\n');
  await writeFile(join(process.cwd(), relativePath), markdown, 'utf8');
  return relativePath;
}

function slugifyFileName(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.slice(0, 80) || 'job-description';
}

function extractContactInfo(text, url) {
  const contactEmails = extractEmails(text);
  const applicationEmail = contactEmails[0] || '';
  let contactMethod = '平台沟通或原链接投递';
  let contactHint = '未发现公开邮箱；建议通过平台沟通或原链接投递。';

  if (applicationEmail) {
    contactMethod = '邮箱投递';
    contactHint = `公开邮箱：${applicationEmail}`;
  } else if (/官网|career|jobs|join|招聘官网/i.test(url)) {
    contactMethod = '官网投递';
    contactHint = '未发现公开邮箱；优先走公司官网投递入口。';
  }

  return { contactMethod, contactEmails, applicationEmail, contactHint };
}

function extractEmails(text) {
  const normalized = String(text || '')
    .replace(/\s*\[?\s*(?:at|AT|＠|艾特)\s*\]?\s*/g, '@')
    .replace(/\s*\[?\s*(?:dot|DOT|点)\s*\]?\s*/g, '.');
  const matches = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map((email) => email.replace(/[.,;，。；]+$/, '').toLowerCase()))].slice(0, 5);
}

function platformMatches(job, platformId) {
  const text = `${job.platform || ''} ${job.source || ''} ${job.url || ''}`.toLowerCase();
  const aliases = {
    zhaopin: ['zhaopin', '智联'],
    boss: ['zhipin', 'boss'],
    liepin: ['liepin', '猎聘'],
    '51job': ['51job', '前程'],
    lagou: ['lagou', '拉勾'],
    iguopin: ['iguopin', '国聘'],
  };
  return (aliases[platformId] || [platformId]).some((alias) => text.includes(alias.toLowerCase()));
}

function looksRelevant(text) {
  return /机器人|具身|ROS|ROS2|EtherCAT|CANopen|RAG|Agent|AI|人工智能|系统工程|SDK|运动控制|自动化/i.test(text);
}

function cleanRole(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/立即沟通|立即投递|收藏|高回复率/g, '')
    .replace(/\s*【[^】]+】.*$/g, '')
    .replace(/\s+\d+(?:\.\d+)?\s*[-~－]\s*\d+(?:\.\d+)?\s*[kK万].*$/g, '')
    .replace(/\s+薪资面议.*$/g, '')
    .trim()
    .slice(0, 80);
}

function isCrawlerRoleTitle(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 90) return false;
  if (/有限公司|集团|科技|半导体|电子|新能源|民营|合资|\d+人/.test(text)) return false;
  return /工程师|开发|算法|机器人|架构师|专家|产品经理|负责人/i.test(text);
}

function inferRole(text) {
  return text.match(/[\u4e00-\u9fa5A-Za-z0-9 /+（）()-]{2,60}(工程师|产品经理|架构师|负责人|专家|算法|开发)/)?.[0] || '';
}

function inferCompany(text, role) {
  const withoutRole = text.replace(role, ' ');
  const tokens = withoutRole.split(/\s+/).filter(Boolean);
  const educationIndex = tokens.findIndex((token) => /博士|硕士|本科|大专|学历不限/.test(token));
  const afterEducation = educationIndex >= 0 ? tokens[educationIndex + 1] : '';
  if (afterEducation && /有限公司|集团|科技|机器人|智能|研究院|半导体|电子|腾讯|字节|华为|美团|京东|比亚迪|智元|优必选|宇树|道通|速腾聚创|股份/.test(afterEducation)) {
    return afterEducation.slice(0, 40);
  }
  const company = withoutRole.match(/[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}(有限公司|集团|科技|机器人|智能|研究院|半导体|电子|腾讯|字节|华为|美团|京东|比亚迪|智元|优必选|宇树|道通|速腾聚创)/)?.[0];
  return company || '待复核';
}

function inferKeywords(text) {
  const candidates = [
    'EtherCAT', 'CANopen', 'CAN', 'CiA402', 'ROS2', 'ROS', 'MoveIt', 'URDF', 'SDK',
    'RAG', 'Agent', 'MCP', 'AI工具链', '知识库', '检索', '重排', 'Badcase',
    '具身智能', '机器人平台', '机器人系统', '机器人数据', '多模态数据', '多传感器融合',
    'Isaac Sim', 'MuJoCo', '强化学习', '模仿学习', 'VLA', 'Docker', 'Kubernetes',
    'C++', 'Python', '实时系统', '运动控制', '感知算法', '自动化',
  ];
  const lower = text.toLowerCase();
  return candidates.filter((kw) => lower.includes(kw.toLowerCase())).slice(0, 10);
}

function inferDirection(text) {
  const s = text.toLowerCase();
  if (/ai工具链|agent|rag|知识库|mcp/i.test(s)) return 'AI工具链 / RAG / Agent';
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
  if (/RAG|Agent|EtherCAT|CANopen|ROS2|SDK|具身智能|机器人平台|机器人数据/i.test(text)) score += 0.45;
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

function inferLocation(text) {
  const match = text.match(/深圳|广州|上海|北京|杭州|苏州|东莞|珠海|成都|武汉|南京|佛山/);
  return match?.[0] || '待复核';
}

function inferSalary(text) {
  const match = text.match(/(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*万(?:[·*xX]\s*\d{1,2}薪?)?|\d{1,3}\s*[kK]\s*[-~－]\s*\d{1,3}\s*[kK]?(?:\s*[·*xX]\s*\d{1,2}薪?)?|\d{4,5}\s*-\s*\d{4,5}元(?:[·*xX]\s*\d{1,2}薪?)?|面议)/);
  return match?.[0]?.replace(/\s+/g, '') || '待复核';
}

function dedupeRaw(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function jobIdentityKey(item) {
  const urlKey = normalizeUrl(item.url);
  if (urlKey) return `url:${urlKey}`;
  const title = normalizeIdentityText(item.title || item.role || '');
  const company = normalizeIdentityText(item.company || '');
  return title ? `title:${company}:${title}` : '';
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

function renumberMarketJobs(jobs) {
  jobs.forEach((job, index) => {
    job.id = `MJ-${String(index + 1).padStart(3, '0')}`;
  });
}

function recruitmentMarketMarkdown(market) {
  const rows = (market.jobs || []).map((job) => {
    return `| ${job.id} | ${pipe(job.platform || job.source || '')} | ${pipe(job.company)} | ${pipe(job.role)} | ${pipe(job.location)} | ${pipe(job.salary)} | ${pipe(job.applicationEmail || job.contactMethod || '')} | ${pipe(job.direction)} | ${Number(job.matchScore || 0).toFixed(1)} | ${pipe(job.fitReason || '')} |`;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRepeatedOption(name) {
  const values = [];
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 12);
}

function buildSearchTargets(baseTargets, queries, city) {
  if (!queries.length) return baseTargets;
  const cityConfig = resolveCityConfig(city);
  const byId = new Map(baseTargets.map((target) => [target.id, target]));
  return [
    dynamicTarget(byId.get('boss'), queries.map((query) => bossUrl(cityConfig.boss, query))),
    dynamicTarget(byId.get('liepin'), queries.map((query) => liepinUrl(cityConfig.liepin, query))),
    dynamicTarget(byId.get('51job'), queries.map((query) => job51Url(cityConfig.job51, query))),
    dynamicTarget(byId.get('lagou'), queries.map((query) => lagouUrl(cityConfig.lagou, query))),
    dynamicTarget(byId.get('iguopin'), queries.map((query) => iguopinUrl(query))),
  ].filter(Boolean);
}

function dynamicTarget(target, urls) {
  if (!target) return null;
  return { ...target, urls };
}

function resolveCityConfig(city) {
  const configs = {
    深圳: { boss: '101280600', liepin: '050090', job51: '040000', lagou: '深圳' },
    上海: { boss: '101020100', liepin: '020', job51: '020000', lagou: '上海' },
    北京: { boss: '101010100', liepin: '010', job51: '010000', lagou: '北京' },
    广州: { boss: '101280100', liepin: '050020', job51: '030200', lagou: '广州' },
    杭州: { boss: '101210100', liepin: '070020', job51: '080200', lagou: '杭州' },
    成都: { boss: '101270100', liepin: '280020', job51: '090200', lagou: '成都' },
    大湾区: { boss: '101280600', liepin: '050090', job51: '040000', lagou: '深圳' },
    远程: { boss: '101280600', liepin: '050090', job51: '040000', lagou: '深圳' },
  };
  return configs[String(city || '').trim()] || configs.深圳;
}

function bossUrl(cityCode, query) {
  return `https://www.zhipin.com/web/geek/jobs?city=${cityCode}&query=${encodeURIComponent(query)}`;
}

function liepinUrl(cityCode, query) {
  return `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(query)}&dq=${cityCode}`;
}

function job51Url(cityCode, query) {
  return `https://we.51job.com/pc/search?keyword=${encodeURIComponent(query)}&searchType=2&jobArea=${cityCode}`;
}

function lagouUrl(city, query) {
  return `https://www.lagou.com/wn/zhaopin?city=${encodeURIComponent(city)}&kd=${encodeURIComponent(query)}`;
}

function iguopinUrl(query) {
  return `https://www.iguopin.com/search?keyword=${encodeURIComponent(query)}`;
}
