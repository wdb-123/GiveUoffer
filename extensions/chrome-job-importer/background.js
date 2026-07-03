const DEFAULT_DAEMON_URL = "http://127.0.0.1:54321";
const POLL_ALARM = "ucareer-chrome-bridge-poll";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ daemonUrl: DEFAULT_DAEMON_URL });
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  void pollBridge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  void pollBridge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void pollBridge();
});

let polling = false;

async function pollBridge() {
  if (polling) return;
  polling = true;
  try {
    const { daemonUrl } = await chrome.storage.local.get(["daemonUrl"]);
    const sessionToken = await resolveSessionToken();
    if (!sessionToken) return;
    const baseUrl = cleanDaemonUrl(daemonUrl);
    const response = await fetch(`${baseUrl}/api/chrome-bridge/tasks/next`, {
      headers: { "x-ucareer-session": sessionToken },
    });
    if (!response.ok) return;
    const payload = await response.json();
    const task = payload?.data;
    if (!payload?.ok || !task?.id) return;
    const result = await runBridgeTask(task, { baseUrl, sessionToken });
    await fetch(`${baseUrl}/api/chrome-bridge/tasks/${encodeURIComponent(task.id)}/result`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ucareer-session": sessionToken,
      },
      body: JSON.stringify(result),
    });
  } catch {
    // Bridge polling must stay quiet; the daemon-side waiter reports timeout.
  } finally {
    polling = false;
  }
}

async function resolveSessionToken() {
  const saved = await chrome.storage.local.get(["sessionToken"]);
  if (saved.sessionToken) return saved.sessionToken;
  const token = await readUcareerSessionToken();
  if (token) await chrome.storage.local.set({ sessionToken: token });
  return token;
}

async function readUcareerSessionToken() {
  const tabs = await chrome.tabs.query({
    url: [
      "http://127.0.0.1:12345/*",
      "http://localhost:12345/*",
    ],
  });
  for (const tab of tabs) {
    if (!tab.id) continue;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const raw = window.localStorage.getItem("ucareer.session") || window.sessionStorage.getItem("ucareer.session") || "";
        if (!raw) return "";
        try {
          return JSON.parse(raw).token || "";
        } catch {
          return "";
        }
      },
    });
    if (result?.result) return result.result;
  }
  return "";
}

async function runBridgeTask(task, context) {
  if (task.type === "boss_search") {
    return runBossSearchTask(task.payload || {}, context);
  }
  if (task.type === "boss_current_detail") {
    return runBossCurrentDetailTask(task.payload || {}, context);
  }
  return { ok: false, message: `Unsupported Chrome bridge task: ${task.type}` };
}

async function runBossSearchTask(payload, context) {
  const city = String(payload.city || "深圳");
  const cityCode = bossCityCode(city);
  const queries = Array.isArray(payload.queries) && payload.queries.length
    ? payload.queries.map((item) => String(item).trim()).filter(Boolean)
    : ["机器人系统工程师"];
  const max = Math.max(1, Math.min(20, Number(payload.max || 8)));
  const dryRun = Boolean(payload.dryRun);
  const discovered = [];
  const stats = {
    queries: queries.length,
    candidatesSeen: 0,
    duplicatesSkipped: 0,
    failedQueries: 0,
  };
  const seen = new Set();

  for (const query of queries) {
    if (discovered.length >= max) break;
    const url = `https://www.zhipin.com/web/geek/jobs?city=${encodeURIComponent(cityCode)}&query=${encodeURIComponent(query)}&industry=&position=`;
    const tab = await chrome.tabs.create({ url, active: true });
    try {
      await waitForTabLoaded(tab.id);
      await delay(1800);
      const snapshots = await collectBossDetails(tab.id, max - discovered.length);
      if (!snapshots.length) stats.failedQueries += 1;
      for (const snapshot of snapshots) {
        stats.candidatesSeen += 1;
        const key = normalizeUrl(snapshot.url) || `${snapshot.title}\n${snapshot.description.slice(0, 200)}`;
        if (seen.has(key)) {
          stats.duplicatesSkipped += 1;
          continue;
        }
        seen.add(key);
        if (dryRun) {
          discovered.push(snapshotToMarketJob(snapshot));
        } else {
          const imported = await importSnapshot(snapshot, context);
          if (imported) discovered.push(imported);
        }
        if (discovered.length >= max) break;
      }
    } catch {
      stats.failedQueries += 1;
    }
  }

  return {
    ok: true,
    added: discovered.length,
    stats,
    queries,
    discovered,
    message: discovered.length
      ? `Ucareer Chrome 扩展已读取 Boss 并${dryRun ? "预览" : "导入"} ${discovered.length} 个岗位。`
      : "Ucareer Chrome 扩展没有读取到可导入的 Boss 岗位详情。",
  };
}

async function runBossCurrentDetailTask(payload, context) {
  const dryRun = Boolean(payload.dryRun);
  const tab = await findBossCurrentTab(payload.url);
  if (!tab?.id) {
    return {
      ok: false,
      added: 0,
      stats: { queries: 0, candidatesSeen: 0, duplicatesSkipped: 0, failedQueries: 1 },
      discovered: [],
      message: "没有找到已打开的 Boss/Zhipin 标签页。请在 Chrome 打开并选中目标岗位后重试。",
    };
  }

  try {
    await waitForTabLoaded(tab.id);
    await delay(700);
    const snapshot = await extractBossCurrentDetail(tab.id);
    if (!snapshot) {
      return {
        ok: false,
        added: 0,
        stats: { queries: 0, candidatesSeen: 0, duplicatesSkipped: 0, failedQueries: 1 },
        discovered: [],
        message: "当前 Boss 页面没有读取到可导入的选中岗位详情。请先在列表中点开一个岗位，让右侧/详情区域出现 JD 后重试。",
      };
    }

    const discovered = [];
    if (dryRun) {
      discovered.push(snapshotToMarketJob(snapshot));
    } else {
      const imported = await importSnapshot({ ...snapshot, source: "ucareer-chrome-bridge-boss-current" }, context);
      if (imported) discovered.push(imported);
    }
    return {
      ok: true,
      added: discovered.length,
      stats: { queries: 0, candidatesSeen: 1, duplicatesSkipped: discovered.length ? 0 : 1, failedQueries: 0 },
      discovered,
      message: discovered.length
        ? `Ucareer Chrome 扩展已读取当前 Boss 选中岗位并${dryRun ? "预览" : "导入"}。`
        : "当前 Boss 选中岗位已存在或导入结果为空。",
    };
  } catch (error) {
    return {
      ok: false,
      added: 0,
      stats: { queries: 0, candidatesSeen: 0, duplicatesSkipped: 0, failedQueries: 1 },
      discovered: [],
      message: error instanceof Error ? error.message : "读取当前 Boss 选中岗位失败。",
    };
  }
}

async function collectBossDetails(tabId, max) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedCollectBossDetails,
    args: [max],
  });
  return Array.isArray(injected?.result) ? injected.result : [];
}

async function extractBossCurrentDetail(tabId) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedExtractBossCurrentDetail,
  });
  return injected?.result || null;
}

async function importSnapshot(snapshot, context) {
  const response = await fetch(`${context.baseUrl}/api/recruitment-market/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ucareer-session": context.sessionToken,
    },
    body: JSON.stringify({
      url: snapshot.url,
      description: snapshot.description,
      source: snapshot.source || "ucareer-chrome-bridge-boss-detail",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) return null;
  return payload.data?.job || null;
}

async function findBossCurrentTab(url) {
  const normalizedUrl = normalizeUrl(url);
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeBoss = activeTabs.find((tab) => isBossTab(tab) && (!normalizedUrl || sameOriginPath(tab.url, normalizedUrl) || /\/web\/geek\/jobs/.test(String(tab.url || ""))));
  if (activeBoss) return activeBoss;

  const bossTabs = await chrome.tabs.query({
    url: [
      "https://www.zhipin.com/*",
      "https://*.zhipin.com/*",
    ],
  });
  if (normalizedUrl) {
    const exact = bossTabs.find((tab) => normalizeUrl(tab.url) === normalizedUrl);
    if (exact) return exact;
  }
  return bossTabs[0] || null;
}

function isBossTab(tab) {
  try {
    const url = new URL(String(tab?.url || ""));
    return /(^|\.)zhipin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function sameOriginPath(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function snapshotToMarketJob(snapshot) {
  return {
    id: "",
    company: snapshot.company || "",
    role: snapshot.role || snapshot.title || "",
    location: snapshot.location || "",
    salary: snapshot.salary || "",
    url: snapshot.url,
    source: "ucareer-chrome-bridge-boss-detail",
    platform: "Boss直聘",
    fitReason: "Chrome 扩展只读预览，等待正式导入和评估。",
  };
}

async function waitForTabLoaded(tabId) {
  if (!tabId) throw new Error("Missing tab id");
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("网页加载超时"));
    }, 25000);
    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function cleanDaemonUrl(value) {
  return String(value || DEFAULT_DAEMON_URL).trim().replace(/\/+$/, "") || DEFAULT_DAEMON_URL;
}

function normalizeUrl(value) {
  try {
    return new URL(String(value || "")).toString();
  } catch {
    return "";
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bossCityCode(value) {
  const normalized = String(value || "").trim();
  const map = {
    "深圳": "101280600",
    "上海": "101020100",
    "北京": "101010100",
    "广州": "101280100",
    "杭州": "101210100",
    "苏州": "101190400",
    "成都": "101270100",
    "南京": "101190100",
    "武汉": "101200100",
    "西安": "101110100",
  };
  return map[normalized] || normalized || "101280600";
}

async function injectedCollectBossDetails(max) {
  const normalizeBossPrivateUseDigits = (text) => {
    const digitMap = {
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
    return String(text || "").replace(/[\ue031-\ue03a]/g, (char) => digitMap[char] || char);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeText = (text) => normalizeBossPrivateUseDigits(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const firstText = (selectors) => selectors
    .map((selector) => normalizeText(document.querySelector(selector)?.textContent || ""))
    .find(Boolean) || "";
  const firstTextIn = (root, selectors) => selectors
    .map((selector) => normalizeText(root.querySelector(selector)?.textContent || ""))
    .find(Boolean) || "";
  const absoluteUrl = (href) => {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return "";
    }
  };
  const cards = Array.from(document.querySelectorAll(".job-card-wrapper, .job-list-box li, .job-card-body, li[class*='job-card'], .rec-job-list li, .job-list li"))
    .filter((card) => normalizeText(card.textContent || "").length > 20);
  const out = [];
  for (const card of cards.slice(0, Math.max(1, Number(max || 1)) * 3)) {
    if (out.length >= max) break;
    const anchor = card.querySelector('a[href*="/job_detail/"], a[href*="job_detail"]');
    const href = absoluteUrl(anchor?.getAttribute("href") || "");
    try {
      card.scrollIntoView({ block: "center" });
      (anchor || card).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await delay(1300);
    } catch {
      continue;
    }
    const detail = Array.from(document.querySelectorAll(".job-detail, .job-detail-box, .job-sec, .detail-content, .job-detail-container, .job-primary.detail-box"))
      .map((node) => normalizeText(node.textContent || ""))
      .filter((text) => /职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(text))
      .sort((a, b) => b.length - a.length)[0] || "";
    const bodyText = normalizeText(document.body?.innerText || "");
    const descriptionText = detail || (/职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(bodyText) ? bodyText : "");
    if (!descriptionText) continue;
    const role = firstText([".job-name", ".name", "h1"]) || firstTextIn(card, [".job-name", ".job-title", ".name", "a"]);
    const salary = firstText([".salary", ".job-salary", ".red"]) || firstTextIn(card, [".salary", ".job-salary", ".red"]);
    const company = firstText([".company-info .name", ".company-name", ".job-company"]) || firstTextIn(card, [".company-name", ".boss-name", ".job-card-right .name"]);
    const locationText = firstText([".location-address", ".job-address", ".address"]);
    const jobUrl = href || absoluteUrl(document.querySelector('a[href*="/job_detail/"]')?.getAttribute("href") || "") || location.href;
    if (!/zhipin\.com\/job_detail\//.test(jobUrl)) continue;
    out.push({
      url: jobUrl,
      title: document.title || role,
      role,
      company,
      salary,
      location: locationText,
      description: [
        role ? `职位：${role}` : "",
        company ? `公司：${company}` : "",
        salary ? `薪资：${salary}` : "",
        locationText ? `地点：${locationText}` : "",
        descriptionText,
      ].filter(Boolean).join("\n").slice(0, 24000),
    });
  }
  return out;
}

function injectedExtractBossCurrentDetail() {
  const normalizeBossPrivateUseDigits = (text) => {
    const digitMap = {
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
    return String(text || "").replace(/[\ue031-\ue03a]/g, (char) => digitMap[char] || char);
  };
  const normalizeText = (text) => normalizeBossPrivateUseDigits(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const firstText = (selectors) => selectors
    .map((selector) => normalizeText(document.querySelector(selector)?.textContent || ""))
    .find(Boolean) || "";
  const firstTextIn = (root, selectors) => selectors
    .map((selector) => normalizeText(root.querySelector(selector)?.textContent || ""))
    .find(Boolean) || "";
  const absoluteUrl = (href) => {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return "";
    }
  };
  const isBoss = /(^|\.)zhipin\.com$/i.test(location.hostname);
  if (!isBoss) return null;

  const detailNodes = [
    ".job-detail",
    ".job-detail-box",
    ".job-sec",
    ".detail-content",
    ".job-detail-container",
    ".job-primary.detail-box",
    ".job-detail-section",
  ].map((selector) => document.querySelector(selector)).filter(Boolean);
  const detailText = detailNodes
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text.length > 80)
    .sort((a, b) => b.length - a.length)[0] || "";
  const bodyText = normalizeText(document.body?.innerText || "");
  const descriptionText = detailText || (/职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(bodyText) ? bodyText : "");
  if (!/职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(descriptionText)) return null;

  const role = firstText([".job-name", ".name", "h1", ".job-title"]);
  const salary = firstText([".salary", ".job-salary", ".red"]);
  const company = firstText([".company-info .name", ".company-name", ".job-company", ".company-title"]);
  const locationText = firstText([".location-address", ".job-address", ".address", ".job-location"]);
  const selectedCard = findSelectedBossCard(role, salary);
  const cardRole = selectedCard ? firstTextIn(selectedCard, [".job-name", ".job-title", ".name", "a"]) : "";
  const cardSalary = selectedCard ? firstTextIn(selectedCard, [".salary", ".job-salary", ".red"]) : "";
  const cardCompany = selectedCard ? firstTextIn(selectedCard, [".company-name", ".boss-name", ".job-card-right .name"]) : "";
  const cardAnchor = selectedCard?.querySelector('a[href*="/job_detail/"], a[href*="job_detail"]');
  const firstDetailAnchor = document.querySelector('a[href*="/job_detail/"], a[href*="job_detail"]');
  const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
  const jobUrl = absoluteUrl(cardAnchor?.getAttribute("href") || "")
    || absoluteUrl(firstDetailAnchor?.getAttribute("href") || "")
    || (/\/job_detail\//.test(location.href) ? location.href : "")
    || canonical
    || location.href;

  const finalRole = role || cardRole;
  const finalSalary = salary || cardSalary;
  const finalCompany = company || cardCompany;
  return {
    url: jobUrl,
    title: document.title || finalRole,
    role: finalRole,
    company: finalCompany,
    salary: finalSalary,
    location: locationText,
    description: [
      finalRole ? `职位：${finalRole}` : "",
      finalCompany ? `公司：${finalCompany}` : "",
      finalSalary ? `薪资：${finalSalary}` : "",
      locationText ? `地点：${locationText}` : "",
      descriptionText,
    ].filter(Boolean).join("\n").slice(0, 24000),
  };

  function findSelectedBossCard(title, pay) {
    const cards = Array.from(document.querySelectorAll(".job-card-wrapper, .job-list-box li, .job-card-body, li[class*='job-card'], .rec-job-list li, .job-list li"))
      .filter((card) => normalizeText(card.textContent || "").length > 20);
    const active = cards.find((card) => /\b(active|selected|cur|current|focus)\b/i.test(String(card.className || "")));
    if (active) return active;
    const titleText = normalizeText(title);
    const payText = normalizeText(pay);
    if (titleText) {
      const matched = cards.find((card) => {
        const text = normalizeText(card.textContent || "");
        return text.includes(titleText) && (!payText || text.includes(payText));
      });
      if (matched) return matched;
    }
    return cards[0] || null;
  }
}
