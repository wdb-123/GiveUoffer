function ucareerExtractPage() {
  const title = document.title || "";
  const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
  const metaDescription = document.querySelector('meta[name="description"]')?.content || "";
  const headings = Array.from(document.querySelectorAll("h1,h2"))
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .slice(0, 8);
  const boss = extractBossPage();
  const mainText = boss.text || extractMainText();
  return {
    url: canonical || location.href,
    title: title.trim(),
    description: [
      title.trim(),
      metaDescription.trim(),
      headings.join("\n"),
      mainText,
    ].filter(Boolean).join("\n\n").slice(0, 24000),
    source: "chrome_extension",
    pageKind: boss.kind || "generic",
    isBoss: boss.isBoss,
  };
}

function extractBossPage() {
  const isBoss = /(^|\.)zhipin\.com$/i.test(location.hostname);
  if (!isBoss) return { isBoss: false, kind: "", text: "" };
  const detail = extractBossDetail();
  if (detail) return { isBoss: true, kind: "detail", text: detail };
  const list = extractBossList();
  if (list) return { isBoss: true, kind: "list", text: list };
  return { isBoss: true, kind: "generic", text: "" };
}

function extractBossDetail() {
  const detailSelectors = [
    ".job-detail",
    ".job-detail-box",
    ".job-sec",
    ".detail-content",
    ".job-detail-container",
    ".job-primary.detail-box",
  ];
  const detail = detailSelectors
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
  const location = firstText([".location-address", ".job-address", ".address"]);
  const text = detailText || bodyText;
  return [
    title ? `职位：${title}` : "",
    company ? `公司：${company}` : "",
    salary ? `薪资：${salary}` : "",
    location ? `地点：${location}` : "",
    text,
  ].filter(Boolean).join("\n");
}

function extractBossList() {
  const cards = Array.from(document.querySelectorAll(".job-card-wrapper, .job-list-box li, .job-card-body, li[class*='job-card'], .rec-job-list li, .job-list li"));
  const bodyText = normalizeText(document.body?.innerText || "");
  if (!cards.length && !/精选职位|最新职位|热招职位|根据求职期望匹配/.test(bodyText)) return "";
  if (!cards.length) {
    return [
      "BOSS直聘岗位列表（仅列表摘要，打开单个岗位详情后再导入）",
      extractBossListSummaryFromText(bodyText),
    ].filter(Boolean).join("\n\n");
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
    return [
      `${index + 1}. ${title || raw.slice(0, 40)}`,
      salary ? `薪资：${salary}` : "",
      company ? `公司：${company}` : "",
      tags ? `标签：${tags}` : "",
      raw,
    ].filter(Boolean).join("\n");
  });
  const selectedDetail = normalizeText(document.querySelector(".job-detail, .job-detail-box, .detail-content")?.textContent || "");
  return [
    "BOSS直聘岗位列表（仅列表摘要，打开单个岗位详情后再导入）",
    items.join("\n\n---\n\n"),
    selectedDetail ? `\n\n当前选中岗位详情\n${selectedDetail}` : "",
  ].filter(Boolean).join("\n\n");
}

function extractBossListSummaryFromText(text) {
  const normalized = normalizeText(text);
  const startMarkers = ["根据求职期望匹配：", "精选职位", "最新职位", "热招职位"];
  const starts = startMarkers
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index >= 0);
  const start = starts.length ? Math.min(...starts) : 0;
  const endCandidates = ["热门企业", "查看更多职位", "职位类型"]
    .map((marker) => normalized.indexOf(marker, start + 20))
    .filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : start + 5000;
  return normalized.slice(start, end).trim();
}

function firstText(selectors) {
  return selectors.map((selector) => normalizeText(document.querySelector(selector)?.textContent || "")).find(Boolean) || "";
}

function firstTextIn(root, selectors) {
  return selectors.map((selector) => normalizeText(root.querySelector(selector)?.textContent || "")).find(Boolean) || "";
}

function extractMainText() {
  const selectors = [
    "[class*='job']",
    "[class*='detail']",
    "[class*='description']",
    "[class*='content']",
    "main",
    "article",
    "body",
  ];
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((node) => normalizeText(node.textContent || ""))
    .filter((text) => text.length > 80)
    .sort((a, b) => b.length - a.length);
  return (candidates[0] || normalizeText(document.body?.innerText || "")).slice(0, 22000);
}

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "UCAREER_EXTRACT_PAGE") return false;
  try {
    sendResponse({ ok: true, data: ucareerExtractPage() });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  return true;
});
