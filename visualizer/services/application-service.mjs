import { mkdir } from 'fs/promises';
import { readJsonLines, appendJsonLine } from '../data-store.mjs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonBody } from './request-utils.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const dataDir = join(root, 'data');
const applicationEventsPath = join(dataDir, 'application-events.jsonl');

export function registerApplicationRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/applications', listApplications);
  registerJsonRoute('POST', '/api/application-events', saveApplicationEvent);
}

export async function listApplications() {
  const eventGroups = await readApplicationEvents();
  const applications = [...eventGroups.entries()].map(([id, events]) => {
    const firstEvent = events[0] || {};
    const latestEvent = events[events.length - 1] || null;
    const eventStatusKey = latestEvent ? applicationEventStatusKey(latestEvent.event) : '';
    return {
      id,
      date: firstEvent.date || latestEvent?.date || '',
      company: firstEvent.company || latestEvent?.company || '待确认公司',
      role: firstEvent.role || latestEvent?.role || '待确认岗位',
      score: 0,
      scoreRaw: '-',
      status: eventStatusLabel(eventStatusKey || latestEvent?.event || 'note'),
      statusKey: eventStatusKey || 'note',
      pdf: '-',
      reportLabel: '',
      reportPath: '',
      notes: latestEvent?.next_action || latestEvent?.note || '',
      events,
      eventCount: events.length,
      latestEvent,
      progressStatusKey: eventStatusKey || 'note',
      hasManualProgress: true,
    };
  });

  return { applications, metrics: applicationMetrics(applications) };
}

async function readApplicationEvents() {
  const groups = new Map();
  for (const item of await readJsonLines(applicationEventsPath)) {
    const id = String(item.application_id || item.applicationId || '').replace(/^#/, '').padStart(3, '0');
    if (!/^\d{3,}$/.test(id)) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }

  for (const events of groups.values()) {
    events.sort((a, b) => String(a.created_at || a.date || '').localeCompare(String(b.created_at || b.date || '')));
  }
  return groups;
}

function applicationEventStatusKey(event) {
  const map = {
    applied: 'applied',
    application_received: 'applied',
    responded: 'responded',
    assessment: 'responded',
    interview: 'interview',
    offer: 'offer',
    rejected: 'rejected',
    discarded: 'discarded',
    skip: 'skip',
    followup_sent: 'responded',
  };
  return map[String(event || '').toLowerCase()] || '';
}

export async function saveApplicationEvent(req) {
  const body = await readJsonBody(req);
  let applicationId = normalizeProgressId(body.application_id || body.applicationId || '');
  const event = String(body.event || '').trim().toLowerCase();
  const allowedEvents = new Set([
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
  if (!allowedEvents.has(event)) throw new Error('Invalid application event');

  const due = String(body.due || '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Invalid due date');

  const now = new Date().toISOString();
  const eventGroups = await readApplicationEvents();
  const existingEvents = applicationId ? eventGroups.get(applicationId) || [] : [];
  if (!applicationId) {
    applicationId = nextProgressId(eventGroups);
  }
  const latestExisting = existingEvents[existingEvents.length - 1] || {};
  const company = String(body.company || body.companyHint || latestExisting.company || '').trim();
  const role = String(body.role || body.roleHint || latestExisting.role || '').trim();
  if (!company || !role) throw new Error('Missing company or role');

  const record = {
    date: String(body.date || now.slice(0, 10)).trim(),
    application_id: applicationId,
    company,
    role,
    event,
    source: String(body.source || 'manual_import').trim(),
    next_action: String(body.next_action || body.nextAction || '').trim(),
    due,
    note: String(body.note || '').trim().slice(0, 500),
    evidence: String(body.evidence || '').trim().slice(0, 500),
    created_at: now,
  };

  await mkdir(dataDir, { recursive: true });
  await appendJsonLine(applicationEventsPath, record);
  return { ok: true, event: record };
}

function applicationMetrics(applications) {
  const metrics = emptyApplicationMetrics();
  metrics.total = applications.length;

  for (const app of applications) {
    metrics.byStatus[app.statusKey] = (metrics.byStatus[app.statusKey] || 0) + 1;
    if (app.score > 0) {
      metrics.scored += 1;
      metrics.scoreSum += app.score;
      metrics.topScore = Math.max(metrics.topScore, app.score);
    }
    if (!['skip', 'rejected', 'discarded'].includes(app.statusKey)) {
      metrics.active += 1;
    }
  }

  metrics.avgScore = metrics.scored ? Number((metrics.scoreSum / metrics.scored).toFixed(1)) : 0;
  metrics.applied = ['applied', 'responded', 'interview', 'offer'].reduce((sum, key) => {
    return sum + (metrics.byStatus[key] || 0);
  }, 0);
  metrics.responded = ['responded', 'interview', 'offer'].reduce((sum, key) => {
    return sum + (metrics.byStatus[key] || 0);
  }, 0);
  metrics.interview = (metrics.byStatus.interview || 0) + (metrics.byStatus.offer || 0);
  metrics.offer = metrics.byStatus.offer || 0;
  metrics.toDiscuss = 0;

  delete metrics.scoreSum;
  delete metrics.scored;
  return metrics;
}

function emptyApplicationMetrics() {
  return {
    total: 0,
    active: 0,
    applied: 0,
    responded: 0,
    interview: 0,
    offer: 0,
    toDiscuss: 0,
    avgScore: 0,
    topScore: 0,
    scored: 0,
    scoreSum: 0,
    byStatus: {},
  };
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('interview') || s.includes('面试')) return 'interview';
  if (s.includes('offer')) return 'offer';
  if (s.includes('responded') || s.includes('respondido') || s.includes('已回复')) return 'responded';
  if (s.includes('applied') || s.includes('aplicado') || s.includes('已投递')) return 'applied';
  if (s.includes('rejected') || s.includes('拒')) return 'rejected';
  if (s.includes('discarded') || s.includes('放弃')) return 'discarded';
  if (s.includes('skip') || s.includes('no aplicar') || s.includes('不投')) return 'skip';
  if (s.includes('evaluated') || s.includes('评估')) return 'evaluated';
  return s.trim() || 'unknown';
}

function eventStatusLabel(statusKey) {
  const labels = {
    applied: '已投递',
    responded: '已回复',
    interview: '面试中',
    offer: 'Offer',
    rejected: '已拒绝',
    discarded: '已放弃',
    skip: '不投',
    note: '备注',
  };
  return labels[statusKey] || statusKey || '备注';
}

function normalizeProgressId(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!raw || raw === '{tracker编号}') return '';
  const numeric = raw.match(/^\d+$/);
  if (numeric) return raw.padStart(3, '0');
  return '';
}

function nextProgressId(eventGroups) {
  const max = [...eventGroups.keys()].reduce((current, id) => {
    return Math.max(current, Number(String(id).match(/\d+/)?.[0] || 0));
  }, 0);
  return String(max + 1).padStart(3, '0');
}
