const SESSION_STORAGE_KEY = "ucareer.session";

const els = {
  connect: document.querySelector("#connect"),
  preview: document.querySelector("#preview"),
  import: document.querySelector("#import"),
  openRead: document.querySelector("#openRead"),
  targetUrl: document.querySelector("#targetUrl"),
  daemonUrl: document.querySelector("#daemonUrl"),
  status: document.querySelector("#status"),
  pageTitle: document.querySelector("#pageTitle"),
  pageText: document.querySelector("#pageText"),
  message: document.querySelector("#message"),
};

let pageSnapshot = null;
let sessionToken = "";

init();

async function init() {
  const saved = await chrome.storage.local.get(["daemonUrl", "sessionToken"]);
  els.daemonUrl.value = saved.daemonUrl || "http://127.0.0.1:54321";
  sessionToken = saved.sessionToken || "";
  renderStatus();
}

els.daemonUrl.addEventListener("change", async () => {
  await chrome.storage.local.set({ daemonUrl: cleanDaemonUrl() });
});

els.connect.addEventListener("click", async () => {
  await runAction(async () => {
    const token = await readUcareerSessionToken();
    if (!token) throw new Error("没有找到 Ucareer 登录会话。请先打开 http://127.0.0.1:12345 并登录。");
    sessionToken = token;
    await chrome.storage.local.set({ sessionToken, daemonUrl: cleanDaemonUrl() });
    await verifySession();
    renderStatus();
    showMessage("已连接本地 Ucareer。", "success");
  });
});

els.preview.addEventListener("click", async () => {
  await runAction(async () => {
    pageSnapshot = await extractCurrentPage();
    els.pageTitle.textContent = pageSnapshot.title || pageSnapshot.url;
    els.pageText.value = pageSnapshot.description || "";
    showMessage("已读取当前网页。", "success");
  });
});

els.openRead.addEventListener("click", async () => {
  await runAction(async () => {
    const url = normalizeHttpUrl(els.targetUrl.value);
    if (!url) throw new Error("请先输入 http/https 网页链接。");
    pageSnapshot = await openUrlAndExtract(url);
    els.pageTitle.textContent = pageSnapshot.title || pageSnapshot.url;
    els.pageText.value = pageSnapshot.description || "";
    showMessage("已打开并读取网页。", "success");
  });
});

els.targetUrl.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await importFromCurrentInput();
});

els.import.addEventListener("click", async () => {
  await importFromCurrentInput();
});

async function importFromCurrentInput() {
  await runAction(async () => {
    if (!sessionToken) throw new Error("请先连接本地 Ucareer。");
    pageSnapshot = await resolveSnapshotForImport();
    const description = els.pageText.value.trim() || pageSnapshot.description;
    if (!description) throw new Error("当前页面没有可导入的正文。");
    if (pageSnapshot.isBoss && pageSnapshot.pageKind !== "detail") {
      throw new Error("当前是 Boss 列表/首页摘要。请先打开具体岗位详情页，再导入岗位。");
    }
    const payload = await postImportJob({
      url: pageSnapshot.url,
      description,
      source: "Chrome 网页插件",
    });
    const job = payload.data?.job;
    showMessage(`已导入：${job?.role || "岗位"} ${payload.data?.imported ? "" : "（已存在，已同步入库时间）"}`, "success");
  });
}

async function resolveSnapshotForImport() {
  const inputUrl = normalizeHttpUrl(els.targetUrl.value);
  if (inputUrl && normalizeHttpUrl(pageSnapshot?.url || "") !== inputUrl) {
    const snapshot = await openUrlAndExtract(inputUrl);
    els.pageTitle.textContent = snapshot.title || snapshot.url;
    els.pageText.value = snapshot.description || "";
    return snapshot;
  }
  if (pageSnapshot) return pageSnapshot;
  const snapshot = await extractCurrentPage();
  els.pageTitle.textContent = snapshot.title || snapshot.url;
  els.pageText.value = snapshot.description || "";
  return snapshot;
}

async function postImportJob(body) {
  const response = await fetch(`${cleanDaemonUrl()}/api/recruitment-market/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ucareer-session": sessionToken,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error?.message || "导入失败");
  return payload;
}

async function extractCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error("请先打开一个招聘网站页面。");
  }
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: injectedExtractPage,
  });
  const response = { ok: true, data: injected.result };
  if (!response?.ok) throw new Error(response?.error || "读取页面失败");
  return response.data;
}

async function openUrlAndExtract(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabLoaded(tab.id);
  await delay(1400);
  return extractTabPage(tab.id);
}

async function extractTabPage(tabId) {
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedExtractPage,
  });
  if (!injected?.result) throw new Error("读取页面失败");
  return injected.result;
}

async function waitForTabLoaded(tabId) {
  if (!tabId) throw new Error("无法打开网页标签页。");
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("网页加载超时"));
    }, 20000);
    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
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
      func: (key) => {
        const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
        if (!raw) return "";
        try {
          return JSON.parse(raw).token || "";
        } catch {
          return "";
        }
      },
      args: [SESSION_STORAGE_KEY],
    });
    if (result?.result) return result.result;
  }
  return "";
}

async function verifySession() {
  const response = await fetch(`${cleanDaemonUrl()}/api/auth/session`, {
    headers: { "x-ucareer-session": sessionToken },
  });
  const payload = await response.json();
  if (!payload.ok || !payload.data) throw new Error("Ucareer 会话已失效，请重新登录。");
}

function renderStatus() {
  els.status.textContent = sessionToken ? "已连接" : "未连接";
}

function cleanDaemonUrl() {
  return els.daemonUrl.value.trim().replace(/\/+$/, "") || "http://127.0.0.1:54321";
}

function normalizeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAction(action) {
  try {
    els.message.className = "";
    showMessage("处理中...");
    await action();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), "error");
  }
}

function showMessage(text, kind = "") {
  els.message.textContent = text;
  els.message.className = kind;
}

function injectedExtractPage() {
  const normalizeText = (text) => String(text || "")
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
  const isBoss = /(^|\.)zhipin\.com$/i.test(location.hostname);
  const bossDetail = (() => {
    if (!isBoss) return "";
    const detail = [".job-detail", ".job-detail-box", ".job-sec", ".detail-content", ".job-detail-container", ".job-primary.detail-box"]
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const detailText = normalizeText(detail?.textContent || "");
    const bodyText = normalizeText(document.body?.innerText || "");
    const looksLikeDetail = /职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责/.test(detailText || bodyText)
      && !/职位类型\s+地图\s+搜索/.test(bodyText.slice(0, 1200));
    if (!detail && !looksLikeDetail) return "";
    const title = firstText([".job-name", ".name", "h1"]);
    const salary = firstText([".salary", ".job-salary", ".red"]);
    const company = firstText([".company-info .name", ".company-name", ".job-company"]);
    const locationText = firstText([".location-address", ".job-address", ".address"]);
    const text = detailText || bodyText;
    return [
      title ? `职位：${title}` : "",
      company ? `公司：${company}` : "",
      salary ? `薪资：${salary}` : "",
      locationText ? `地点：${locationText}` : "",
      text,
    ].filter(Boolean).join("\n");
  })();
  const bossList = (() => {
    if (!isBoss) return "";
    const cards = Array.from(document.querySelectorAll(".job-card-wrapper, .job-list-box li, .job-card-body, li[class*='job-card'], .rec-job-list li, .job-list li"));
    const bodyText = normalizeText(document.body?.innerText || "");
    if (!cards.length && !/精选职位|最新职位|热招职位|根据求职期望匹配/.test(bodyText)) return "";
    if (!cards.length) {
      const startMarkers = ["根据求职期望匹配：", "精选职位", "最新职位", "热招职位"];
      const starts = startMarkers.map((marker) => bodyText.indexOf(marker)).filter((index) => index >= 0);
      const start = starts.length ? Math.min(...starts) : 0;
      const endCandidates = ["热门企业", "查看更多职位", "职位类型"]
        .map((marker) => bodyText.indexOf(marker, start + 20))
        .filter((index) => index > start);
      const end = endCandidates.length ? Math.min(...endCandidates) : start + 5000;
      const summary = bodyText.slice(start, end).trim();
      return ["BOSS直聘岗位列表（仅列表摘要，打开单个岗位详情后再导入）", summary].filter(Boolean).join("\n\n");
    }
    const items = cards.slice(0, 30).map((card, index) => {
      const title = firstTextIn(card, [".job-name", ".job-title", ".name", "a"]);
      const salary = firstTextIn(card, [".salary", ".job-salary", ".red"]);
      const company = firstTextIn(card, [".company-name", ".boss-name", ".job-card-right .name"]);
      const tags = Array.from(card.querySelectorAll(".tag-list li, .job-card-footer li, .job-tags span, .info-desc"))
        .map((node) => normalizeText(node.textContent || ""))
        .filter(Boolean)
        .slice(0, 8)
        .join(" / ");
      const raw = normalizeText(card.textContent || "");
      return [`${index + 1}. ${title || raw.slice(0, 40)}`, salary ? `薪资：${salary}` : "", company ? `公司：${company}` : "", tags ? `标签：${tags}` : "", raw]
        .filter(Boolean)
        .join("\n");
    });
    const selectedDetail = normalizeText(document.querySelector(".job-detail, .job-detail-box, .detail-content")?.textContent || "");
    return ["BOSS直聘岗位列表（仅列表摘要，打开单个岗位详情后再导入）", items.join("\n\n---\n\n"), selectedDetail ? `当前选中岗位详情\n${selectedDetail}` : ""].filter(Boolean).join("\n\n");
  })();
  const genericSelectors = ["[class*='job']", "[class*='detail']", "[class*='description']", "[class*='content']", "main", "article", "body"];
  const genericText = genericSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text.length > 80)
    .sort((a, b) => b.length - a.length)[0] || normalizeText(document.body?.innerText || "");
  const text = bossDetail || bossList || genericText;
  const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
  const metaDescription = document.querySelector('meta[name="description"]')?.content || "";
  const headings = Array.from(document.querySelectorAll("h1,h2"))
    .map((node) => normalizeText(node.textContent || ""))
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
  return {
    url: canonical || location.href,
    title: document.title || "",
    description: [document.title || "", metaDescription, headings, text].filter(Boolean).join("\n\n").slice(0, 24000),
    source: "chrome_extension",
    pageKind: bossDetail ? "detail" : bossList ? "list" : "generic",
    isBoss,
  };
}
