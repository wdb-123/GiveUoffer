chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SCRAPE_JOB_PAGE') return false;
  scrapeJobPage()
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

async function scrapeJobPage() {
  await waitForReadableBody();
  const bodyText = normalizeText(document.body?.innerText || '');
  if (!bodyText || bodyText.length < 80) {
    throw new Error('页面正文为空，可能仍在加载或被安全页拦截。');
  }
  if (/请稍候|安全验证|验证码|登录后继续|访问异常|人机验证/.test(bodyText) && !/职位描述|岗位职责|任职要求|职位详情/.test(bodyText)) {
    throw new Error('Boss 页面被登录/安全验证拦截，没有可读 JD。');
  }

  const title = textFromSelectors([
    '.job-title',
    '.name h1',
    '.job-banner .name',
    '.job-primary .name',
    'h1',
  ]);
  const salary = textFromSelectors([
    '.salary',
    '.job-salary',
    '.name .salary',
    '.job-banner .salary',
  ]) || inferSalary(bodyText);
  const company = cleanCompanyCandidate(textFromSelectors([
    '.company-info .name',
    '.company-name',
    '.sider-company .company-name',
    '.job-company-info .company-name',
  ]), bodyText) || inferCompany(bodyText);
  const location = inferLocation(bodyText);
  const role = cleanRole(title || inferRole(bodyText));
  const rawText = bodyText.slice(0, 1200);
  const keywords = inferKeywords(bodyText);

  if (!role || /BOSS直聘|请稍候|安全验证/.test(role)) {
    throw new Error('没有识别到岗位名称。');
  }

  return {
    company: company || '',
    role,
    location,
    salary,
    keywords: keywords.join(','),
    reason: buildReason(bodyText, keywords),
    rawText,
    pageTitle: document.title || '',
    url: locationHrefWithoutHash(),
  };
}

function waitForReadableBody() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const text = normalizeText(document.body?.innerText || '');
      if (text.length > 120 || Date.now() - startedAt > 15000) {
        clearInterval(timer);
        if (text.length > 40) resolve();
        else reject(new Error('页面加载超时，没有读取到正文。'));
      }
    }, 500);
  });
}

function textFromSelectors(selectors) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const value = normalizeText(node?.innerText || node?.textContent || '');
    if (value) return value;
  }
  return '';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanRole(value) {
  return normalizeText(value)
    .replace(/[丨|].*$/, '')
    .replace(/招聘.*$/, '')
    .replace(/^\u300c|\u300d$/g, '')
    .trim();
}

function inferRole(text) {
  const title = normalizeText(document.title || '');
  const titleMatch = title.match(/[「"]?([^「」"]{2,80}(?:工程师|产品经理|算法|开发|架构|负责人|Leader|总监)[^「」"]*)[」"]?/i);
  if (titleMatch?.[1]) return titleMatch[1];
  const lineMatch = text.match(/([^。；\n]{2,80}(?:工程师|产品经理|算法|开发|架构|负责人|Leader|总监)[^。；\n]*)/i);
  return lineMatch?.[1] || '';
}

function inferCompany(text) {
  const title = normalizeText(document.title || '');
  const titleMatch = title.match(/_([^_]{2,40})招聘[-_]/);
  if (titleMatch?.[1]) {
    const cleaned = cleanCompanyCandidate(titleMatch[1], text);
    if (cleaned) return cleaned;
  }
  const delegatedMatch = text.match(/代招公司[:：]\s*([^\s，。；]+?)(?=(深圳|北京|上海|广州|杭州|南京|苏州|成都|武汉|西安|东莞|佛山|\d{1,3}\s*-\s*\d{1,3}\s*K|感兴趣|立即沟通))/);
  if (delegatedMatch?.[1]) {
    const cleaned = cleanCompanyCandidate(delegatedMatch[1], text);
    if (cleaned) return cleaned;
  }
  const companyMatch = text.match(/公司[:：]\s*([^\s，。；]{2,40})/);
  if (companyMatch?.[1]) {
    const cleaned = cleanCompanyCandidate(companyMatch[1], text);
    if (cleaned) return cleaned;
  }
  return '';
}

function inferLocation(text) {
  const cities = ['深圳', '北京', '上海', '广州', '杭州', '南京', '苏州', '成都', '武汉', '西安', '东莞', '佛山'];
  return cities.find((city) => text.includes(city)) || '';
}

function inferSalary(text) {
  const match = text.match(/\d{1,3}\s*[-~]\s*\d{1,3}\s*K(?:[·*xX]\s*\d{1,2}\s*薪?)?|(?:\d{1,3}\.\d|\d{1,3})\s*-\s*(?:\d{1,3}\.\d|\d{1,3})万(?:·\d{1,2}薪)?/i);
  return normalizeText(match?.[0] || '');
}

function inferKeywords(text) {
  const candidates = [
    'RAG', 'Agent', 'Prompt', 'Python', 'Linux', 'OpenAI', 'API', 'ROS2', 'ROS',
    'EtherCAT', 'CANopen', 'SDK', '具身智能', '机器人', 'VLA', 'VLM', 'LLM',
    '强化学习', '模仿学习', '运动控制', 'Isaac', 'MuJoCo', 'PyTorch', 'Docker',
    'Kubernetes', '数据合成', '仿真', '遥操作'
  ];
  return candidates.filter((item) => new RegExp(escapeRegExp(item), 'i').test(text)).slice(0, 10);
}

function buildReason(text, keywords) {
  const focus = keywords.slice(0, 4).join('、') || '岗位职责';
  if (/具身智能|机器人|运动控制|VLA|强化学习/.test(text)) {
    return `岗位聚焦 ${focus}，和当前机器人/AI 工程化方向相关，建议继续复核 JD 细节。`;
  }
  if (/RAG|Agent|Prompt|OpenAI/.test(text)) {
    return `岗位聚焦 ${focus}，和当前 AI 应用工程化方向相关，建议继续复核 JD 细节。`;
  }
  return `已从已登录页面读取 JD；岗位包含 ${focus} 等关键词，建议继续复核匹配度。`;
}

function cleanCompanyCandidate(value, text) {
  const candidate = normalizeText(value)
    .replace(/^代招公司[:：]\s*/, '')
    .replace(/招聘$/, '')
    .trim();
  if (!candidate) return '';
  if (candidate.length > 40) return '';
  if (/\d{1,3}\s*-\s*\d{1,3}\s*K/i.test(candidate)) return '';
  if (/工程师|产品经理|算法|开发|架构|负责人|Leader|总监/.test(candidate)) return '';
  if (/职位描述|岗位职责|任职要求|感兴趣|立即沟通|完善在线简历/.test(candidate)) return '';
  if (candidate === inferLocation(text)) return '';
  return candidate;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locationHrefWithoutHash() {
  const url = new URL(window.location.href);
  url.hash = '';
  return url.toString();
}
