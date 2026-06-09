import { chromium } from "playwright";

const url = process.env.UCAREER_AUDIT_URL || "http://127.0.0.1:12345/";
const sessionJson = process.env.UCAREER_SESSION_JSON || "";
const viewports = [
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
if (sessionJson) {
  await context.addInitScript((value) => {
    window.localStorage.setItem("ucareer.session", value);
  }, sessionJson);
}

const page = await context.newPage();
const failures = [];
const results = [];

for (const viewport of viewports) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const overlaps = (a, b) => Boolean(
      a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top),
    );
    const nav = rect(".app-nav");
    const center = rect(".agent-center-stack");
    const composer = rect(".agent-composer");
    const hero = rect(".agent-empty-prompt");
    const brand = rect(".brand-main");
    const bodyText = document.body.innerText;
    const workspaceLoaded = Boolean(document.querySelector(".app-layout") && document.querySelector(".agent-composer"));
    return {
      brand,
      center,
      composer,
      hero,
      nav,
      bodyOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      composerInsideCenter: Boolean(center && composer && composer.left >= center.left - 2 && composer.right <= center.right + 2),
      heroInsideCenter: Boolean(center && hero && hero.left >= center.left - 2 && hero.right <= center.right + 2),
      loginGate: !workspaceLoaded,
      navComposerOverlap: overlaps(nav, composer),
      oldProgressLabelGone: !bodyText.includes("投递进度导入"),
      progressLabelOk: bodyText.includes("投递进度"),
      workspaceLoaded,
      wordmarkOk: Boolean(document.querySelector(".brand-wordmark")),
    };
  });

  const viewportFailures = [];
  if (result.loginGate) {
    viewportFailures.push("workspace not loaded; pass UCAREER_SESSION_JSON for authenticated layout audit");
  } else {
    if (result.bodyOverflowX) viewportFailures.push("document has horizontal overflow");
    if (result.navComposerOverlap) viewportFailures.push("sidebar overlaps composer");
    if (!result.composerInsideCenter) viewportFailures.push("composer is outside center stack");
    if (!result.heroInsideCenter) viewportFailures.push("hero is outside center stack");
    if (!result.progressLabelOk || !result.oldProgressLabelGone) viewportFailures.push("sidebar progress label mismatch");
    if (!result.wordmarkOk) viewportFailures.push("brand wordmark missing");
  }

  results.push({ viewport, checks: result, failures: viewportFailures });
  failures.push(...viewportFailures.map((failure) => `${viewport.width}x${viewport.height}: ${failure}`));
}

await browser.close();

console.log(JSON.stringify({ ok: failures.length === 0, url, results }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
