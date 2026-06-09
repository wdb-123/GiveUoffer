#!/usr/bin/env node
/**
 * tracker-workflow.mjs - Application workflow summary and event log.
 *
 * Keeps workspace/ops/data/applications.md as the human-facing tracker and layers a
 * JSONL event log on top for next actions, due dates, and email evidence.
 *
 * Usage:
 *   npm run tracker --
 *   npm run tracker -- --summary
 *   npm run tracker -- --add-event 12 --event applied --next-action "Follow up" --due 2026-06-10 --note "Submitted via company site"
 *   npm run tracker -- --parse-email email.txt
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APPS_FILE = existsSync(join(ROOT, 'workspace/ops/data/applications.md'))
  ? join(ROOT, 'workspace/ops/data/applications.md')
  : join(ROOT, 'applications.md');
const EVENTS_FILE = join(ROOT, 'workspace/ops/data/application-events.jsonl');

const ACTIVE_STATUSES = new Set(['evaluated', 'applied', 'responded', 'interview', 'offer']);
const CLOSED_STATUSES = new Set(['rejected', 'discarded', 'skip']);
const VALID_EVENTS = new Set([
  'evaluated',
  'applied',
  'application_received',
  'responded',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'discarded',
  'skip',
  'followup_sent',
  'note',
]);

const STATUS_ALIASES = {
  evaluated: 'evaluated',
  evaluada: 'evaluated',
  applied: 'applied',
  aplicado: 'applied',
  enviada: 'applied',
  sent: 'applied',
  responded: 'responded',
  respondido: 'responded',
  interview: 'interview',
  entrevista: 'interview',
  offer: 'offer',
  oferta: 'offer',
  rejected: 'rejected',
  rechazado: 'rejected',
  rechazada: 'rejected',
  discarded: 'discarded',
  descartado: 'discarded',
  descartada: 'discarded',
  skip: 'skip',
  'no aplicar': 'skip',
  no_aplicar: 'skip',
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return null;
  return new Date(`${String(value).trim()}T00:00:00Z`);
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.floor((db - da) / (24 * 60 * 60 * 1000));
}

function normalizeStatus(raw) {
  const clean = String(raw || '')
    .replace(/\*\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')
    .trim();
  return STATUS_ALIASES[clean] || clean;
}

function padId(num) {
  return String(num).padStart(3, '0');
}

function parseScore(score) {
  const match = String(score || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseTracker() {
  if (!existsSync(APPS_FILE)) return [];
  const lines = readFileSync(APPS_FILE, 'utf-8').split('\n');
  const entries = [];

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;
    const parts = line.split('|').map(part => part.trim());
    if (parts.length < 9) continue;
    const num = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(num)) continue;

    entries.push({
      num,
      id: padId(num),
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      scoreValue: parseScore(parts[5]),
      status: parts[6],
      normalizedStatus: normalizeStatus(parts[6]),
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }

  return entries;
}

function parseEvents() {
  if (!existsSync(EVENTS_FILE)) return [];
  const events = [];
  const lines = readFileSync(EVENTS_FILE, 'utf-8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (!event.application_id) continue;
      events.push({ ...event, line: i + 1 });
    } catch {
      events.push({
        invalid: true,
        line: i + 1,
        error: 'Invalid JSONL event',
      });
    }
  }

  return events;
}

function groupEvents(events) {
  const grouped = new Map();
  for (const event of events) {
    if (event.invalid) continue;
    const id = padId(Number.parseInt(event.application_id, 10));
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push({ ...event, application_id: id });
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }
  return grouped;
}

function defaultWorkflow(app, now) {
  const status = app.normalizedStatus;

  if (status === 'evaluated') {
    return {
      nextAction: app.scoreValue !== null && app.scoreValue < 4
        ? 'Decide skip or keep as backup'
        : 'Decide apply or research more',
      due: now,
    };
  }
  if (status === 'applied') {
    return {
      nextAction: 'Follow up if no response',
      due: addDays(app.date, 7),
    };
  }
  if (status === 'responded') {
    return { nextAction: 'Reply to recruiter', due: now };
  }
  if (status === 'interview') {
    return { nextAction: 'Prepare interview stories and technical proof', due: now };
  }
  if (status === 'offer') {
    return { nextAction: 'Compare offer and prepare negotiation', due: now };
  }
  if (status === 'rejected') {
    return { nextAction: 'Extract learning and update targeting', due: addDays(app.date, 1) };
  }
  if (status === 'discarded' || status === 'skip') {
    return { nextAction: 'No action', due: null };
  }

  return { nextAction: 'Review tracker entry', due: now };
}

function workflowFromEvents(app, eventsForApp, now) {
  const base = defaultWorkflow(app, now);
  const latest = eventsForApp.at(-1);
  if (!latest) return { ...base, latestEvent: null };

  return {
    nextAction: latest.next_action || latest.nextAction || base.nextAction,
    due: latest.due || latest.due_date || base.due,
    latestEvent: latest,
  };
}

function classifyDue(due, status, now) {
  if (!due || CLOSED_STATUSES.has(status)) return 'none';
  const delta = daysBetween(due, now);
  if (delta === null) return 'invalid_due';
  if (delta > 0) return 'overdue';
  if (delta === 0) return 'due_today';
  if (delta >= -3) return 'upcoming';
  return 'scheduled';
}

function analyze() {
  const now = todayISO();
  const apps = parseTracker();
  const events = parseEvents();
  const groupedEvents = groupEvents(events);
  const invalidEvents = events.filter(event => event.invalid);

  const entries = apps.map(app => {
    const eventsForApp = groupedEvents.get(app.id) || [];
    const workflow = workflowFromEvents(app, eventsForApp, now);
    const dueState = classifyDue(workflow.due, app.normalizedStatus, now);
    return {
      ...app,
      events: eventsForApp,
      eventCount: eventsForApp.length,
      nextAction: workflow.nextAction,
      due: workflow.due,
      dueState,
      latestEvent: workflow.latestEvent,
      active: ACTIVE_STATUSES.has(app.normalizedStatus),
    };
  });

  const byStatus = {};
  const byDueState = {};
  for (const entry of entries) {
    byStatus[entry.normalizedStatus] = (byStatus[entry.normalizedStatus] || 0) + 1;
    byDueState[entry.dueState] = (byDueState[entry.dueState] || 0) + 1;
  }

  const actionQueue = entries
    .filter(entry => entry.active && ['overdue', 'due_today', 'upcoming', 'invalid_due'].includes(entry.dueState))
    .sort((a, b) => {
      const order = { overdue: 0, due_today: 1, invalid_due: 2, upcoming: 3 };
      return (order[a.dueState] ?? 9) - (order[b.dueState] ?? 9) ||
        String(a.due || '').localeCompare(String(b.due || ''));
    });

  const evaluated = entries.filter(entry => entry.normalizedStatus === 'evaluated');
  const appliedOrBeyond = entries.filter(entry => ['applied', 'responded', 'interview', 'offer', 'rejected'].includes(entry.normalizedStatus));
  const replied = entries.filter(entry => ['responded', 'interview', 'offer'].includes(entry.normalizedStatus));
  const rejected = entries.filter(entry => entry.normalizedStatus === 'rejected');

  return {
    metadata: {
      analysisDate: now,
      trackerFile: APPS_FILE.replace(`${ROOT}/`, ''),
      eventsFile: EVENTS_FILE.replace(`${ROOT}/`, ''),
      total: entries.length,
      active: entries.filter(entry => entry.active).length,
      eventCount: events.filter(event => !event.invalid).length,
      invalidEventCount: invalidEvents.length,
    },
    funnel: {
      evaluated: evaluated.length,
      appliedOrBeyond: appliedOrBeyond.length,
      replied: replied.length,
      rejected: rejected.length,
      applyRate: rate(appliedOrBeyond.length, entries.length),
      replyRate: rate(replied.length, appliedOrBeyond.length),
      rejectionRate: rate(rejected.length, appliedOrBeyond.length),
    },
    byStatus,
    byDueState,
    actionQueue,
    entries,
    invalidEvents,
  };
}

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function truncate(value, max) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}.`;
}

function displayRate(value) {
  return value === null ? 'n/a' : `${value}%`;
}

function printSummary(result) {
  const { metadata, funnel, byStatus, byDueState, actionQueue } = result;
  console.log(`\nTracker Workflow - ${metadata.analysisDate}`);
  console.log('='.repeat(72));
  console.log(`${metadata.total} tracked | ${metadata.active} active | ${metadata.eventCount} events | ${metadata.invalidEventCount} invalid events`);
  console.log('');
  console.log(`Funnel: evaluated ${funnel.evaluated}, applied+ ${funnel.appliedOrBeyond}, replied ${funnel.replied}, rejected ${funnel.rejected}`);
  console.log(`Rates: apply ${displayRate(funnel.applyRate)}, reply ${displayRate(funnel.replyRate)}, rejection ${displayRate(funnel.rejectionRate)}`);
  console.log('');
  console.log(`Status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  console.log(`Due: ${Object.entries(byDueState).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  console.log('');

  if (actionQueue.length === 0) {
    console.log('No immediate actions.');
    console.log('');
    return;
  }

  console.log('Action queue');
  console.log('-'.repeat(72));
  console.log(`${'#'.padEnd(5)}${'Due'.padEnd(12)}${'State'.padEnd(12)}${'Company'.padEnd(18)}${'Status'.padEnd(12)}Next action`);
  for (const entry of actionQueue.slice(0, 25)) {
    console.log(
      `${entry.id.padEnd(5)}` +
      `${String(entry.due || '-').padEnd(12)}` +
      `${entry.dueState.padEnd(12)}` +
      `${truncate(entry.company, 17).padEnd(18)}` +
      `${entry.normalizedStatus.padEnd(12)}` +
      truncate(entry.nextAction, 40)
    );
  }
  if (actionQueue.length > 25) {
    console.log(`... ${actionQueue.length - 25} more`);
  }
  console.log('');
}

function addEvent(args) {
  const appIdRaw = args['add-event'] || args.application || args['application-id'];
  const appIdNum = Number.parseInt(appIdRaw, 10);
  if (!Number.isFinite(appIdNum)) {
    throw new Error('--add-event requires an application number, e.g. --add-event 12');
  }

  const eventType = String(args.event || '').trim().toLowerCase();
  if (!VALID_EVENTS.has(eventType)) {
    throw new Error(`--event must be one of: ${Array.from(VALID_EVENTS).join(', ')}`);
  }

  const apps = parseTracker();
  const app = apps.find(entry => entry.num === appIdNum);
  if (!app) throw new Error(`Application #${appIdNum} not found in tracker`);

  const event = {
    date: args.date || todayISO(),
    application_id: padId(appIdNum),
    company: args.company || app.company,
    role: args.role || app.role,
    event: eventType,
    source: args.source || 'manual',
  };

  if (args['next-action']) event.next_action = args['next-action'];
  if (args.due) event.due = args.due;
  if (args.note) event.note = args.note;
  if (args.evidence) event.evidence = args.evidence;

  mkdirSync(dirname(EVENTS_FILE), { recursive: true });
  appendFileSync(EVENTS_FILE, `${JSON.stringify(event)}\n`);
  console.log(JSON.stringify({ added: event, file: EVENTS_FILE.replace(`${ROOT}/`, '') }, null, 2));
}

function parseEmailFile(path) {
  if (!path || path === true) throw new Error('--parse-email requires a file path');
  if (!existsSync(path)) throw new Error(`Email file not found: ${path}`);
  const text = readFileSync(path, 'utf-8');
  const subject = firstMatch(text, /^subject:\s*(.+)$/im);
  const from = firstMatch(text, /^from:\s*(.+)$/im);

  let event = 'note';
  if (/(interview|面试|面談|面邀)/i.test(text)) event = 'interview';
  if (/(assessment|test|coding challenge|笔试|测评|在线测验)/i.test(text)) event = 'assessment';
  if (/(offer|录用|录取|聘用)/i.test(text)) event = 'offer';
  if (/(unfortunately|regret|not move forward|不合适|遗憾|未能进入|感谢.*投递)/i.test(text)) event = 'rejected';
  if (/(received your application|application received|感谢.*申请|已收到.*简历|投递成功)/i.test(text)) event = 'application_received';

  const deadline = firstMatch(text, /(\d{4}-\d{2}-\d{2})/) ||
    normalizeChineseDate(firstMatch(text, /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/));

  const proposal = {
    event,
    source: 'email_paste',
    subject,
    from,
    due: deadline,
    next_action: nextActionForEmailEvent(event),
    confidence: confidenceForEmail(text, event),
    evidence: truncate(text.replace(/\s+/g, ' ').trim(), 240),
  };

  if (from) {
    const domain = firstMatch(from, /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    if (domain) proposal.company_hint = domain.split('.')[0];
  }

  return proposal;
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? (match[1] || match[0]).trim() : null;
}

function normalizeChineseDate(value) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\s*月\s*(\d{1,2})/);
  if (!match) return null;
  const year = new Date().getUTCFullYear();
  return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function nextActionForEmailEvent(event) {
  const actions = {
    application_received: 'Wait for recruiter response',
    assessment: 'Complete assessment before deadline',
    interview: 'Schedule or prepare interview',
    offer: 'Review offer and prepare negotiation',
    rejected: 'Extract learning and update targeting',
    note: 'Review email and decide tracker update',
  };
  return actions[event] || actions.note;
}

function confidenceForEmail(text, event) {
  if (event === 'note') return 'low';
  if (/subject:/i.test(text) && /from:/i.test(text)) return 'high';
  return 'medium';
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['add-event'] || args.application || args['application-id']) {
    addEvent(args);
    return;
  }

  if (args['parse-email']) {
    console.log(JSON.stringify(parseEmailFile(args['parse-email']), null, 2));
    return;
  }

  const result = analyze();
  if (args.summary) {
    printSummary(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
