#!/usr/bin/env node

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const max = clampNumber(readOption("--max", "8"), 1, 20);
const city = readOption("--city", "深圳");
const queries = collectOption("--query");
const searchQueries = queries.length ? queries : ["机器人系统工程师"];
const daemonUrl = process.env.UCAREER_DAEMON_URL || "http://127.0.0.1:54321";
const codexBin = process.env.UCAREER_CODEX_BIN || process.env.CODEX_BIN || "codex";
const codexHome = process.env.UCAREER_CODEX_CHROME_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const timeoutMs = clampNumber(process.env.UCAREER_CODEX_CHROME_TIMEOUT_MS || "300000", 30_000, 900_000);

const prompt = buildPrompt({
  city,
  cityCode: bossCityCode(city),
  queries: searchQueries,
  max,
  dryRun,
  daemonUrl,
});

const result = await runCodex(prompt);
const envelope = parseCodexResult(result.stdout);

if (!result.ok) {
  console.error(result.stderr || result.stdout || "codex chrome radar failed");
  process.exit(1);
}

if (!envelope) {
  console.error(JSON.stringify({
    ok: false,
    reason: "Codex Chrome run did not return a parseable JSON envelope.",
    stdout: result.stdout.slice(-4000),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(normalizeEnvelope(envelope), null, 2));

function buildPrompt(input) {
  const lines = [
    "You are running Ucareer's Boss Chrome job radar.",
    "",
    "Goal:",
    `- Use the Codex Chrome capability through node_repl to operate the user's logged-in Chrome session.`,
    `- Search Boss/Zhipin for jobs in city ${input.city} using city code ${input.cityCode}.`,
    `- Queries: ${input.queries.map((query) => JSON.stringify(query)).join(", ")}.`,
    `- Import at most ${input.max} concrete job-detail postings.`,
    "",
    "Hard rules:",
    "- Read-only only. Do not click apply, communicate, chat, exchange contact details, or submit anything.",
    "- You may open a blank Chrome window or tab if the Chrome extension channel needs a fresh connection; after it connects, continue the Boss search.",
    "- If Chrome reports a disconnected extension/native host, retry once after opening/focusing Chrome before failing.",
    "- Do not import Boss list/home/search summaries. Open or select concrete job detail cards.",
    "- Boss search URL must be: https://www.zhipin.com/web/geek/jobs?city=<CITY_CODE>&query=<ENCODED_QUERY>&industry=&position=",
    "- Boss often keeps the URL on /web/geek/jobs while showing a detail panel. Use the clicked candidate's /job_detail/... href as the job URL.",
    "- Decode and preserve role, company, location, salary, experience, keywords, and the JD text visible in the detail panel.",
    "",
  ];
  if (input.dryRun) {
    lines.push(
      "Dry run:",
      "- Do not call the Ucareer import API.",
      "- Return candidates you could read in discovered[].",
      "",
    );
  } else {
    lines.push(
      "Import API:",
      `- For each concrete job detail, POST JSON to ${input.daemonUrl}/api/recruitment-market/import`,
      '- Body shape: {"url":"https://www.zhipin.com/job_detail/....html","description":"full visible JD text","source":"codex-chrome-boss-detail"}.',
      "- The API response is an envelope; collect data.job from successful imports.",
      "",
    );
  }
  lines.push(
    "Final response:",
    "- Reply with exactly one JSON object and no markdown.",
    "- Shape:",
    JSON.stringify({
      ok: true,
      added: 0,
      stats: {
        queries: input.queries.length,
        candidatesSeen: 0,
        duplicatesSkipped: 0,
        failedQueries: 0,
      },
      queries: input.queries,
      discovered: [],
      message: "",
    }, null, 2),
  );
  return lines.join("\n");
}

function runCodex(stdin) {
  return new Promise((resolve) => {
    const child = spawn(codexBin, [
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "-",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr = `${stderr}\nCodex Chrome radar timed out after ${timeoutMs}ms`.trim();
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

function parseCodexResult(stdout) {
  const messages = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed);
      const text = event?.item?.type === "agent_message" ? event.item.text : "";
      if (typeof text === "string" && text.trim()) messages.push(text.trim());
    } catch {
      // Ignore non-JSON diagnostic lines from Codex/plugin startup.
    }
  }
  for (const text of messages.reverse()) {
    const parsed = parseJsonObject(text);
    if (parsed) return parsed;
  }
  return parseJsonObject(stdout);
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(first, last + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeEnvelope(raw) {
  const discovered = Array.isArray(raw.discovered) ? raw.discovered : [];
  const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  return {
    ok: raw.ok !== false,
    dryRun,
    added: numberFrom(raw.added, discovered.length),
    stats: {
      queries: numberFrom(stats.queries, searchQueries.length),
      candidatesSeen: numberFrom(stats.candidatesSeen, discovered.length),
      duplicatesSkipped: numberFrom(stats.duplicatesSkipped, 0),
      failedQueries: numberFrom(stats.failedQueries, raw.ok === false ? 1 : 0),
    },
    queries: Array.isArray(raw.queries) ? raw.queries : searchQueries,
    discovered,
    ...(raw.message ? { message: String(raw.message).slice(0, 1000) } : {}),
  };
}

function collectOption(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return String(args[index + 1]);
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function clampNumber(value, min, maxValue) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(maxValue, Math.floor(number)));
}

function numberFrom(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
