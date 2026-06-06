import { mkdir, writeFile } from 'fs/promises';
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
  registerJsonRoute('POST', '/api/application-events/update', updateApplicationEvent);
  registerJsonRoute('POST', '/api/application-events/delete', deleteApplicationEvent);
}

export async function listApplications() {
  const { groups: eventGroups } = await readApplicationEvents();
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

  return {
    applications,
    metrics: applicationMetrics(applications),
    todos: buildApplicationTodos(applications),
    feedback: buildApplicationFeedback(applications),
  };
}

async function readApplicationEvents() {
  const groups = new Map();
  const records = [];
  let index = 0;
  for (const rawItem of await readJsonLines(applicationEventsPath)) {
    const item = normalizeEventRecord(rawItem, index);
    const id = String(item.application_id || item.applicationId || '').replace(/^#/, '').padStart(3, '0');
    index += 1;
    if (!/^\d{3,}$/.test(id)) continue;
    item.application_id = id;
    records.push(item);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }

  for (const events of groups.values()) {
    events.sort((a, b) => String(a.created_at || a.date || '').localeCompare(String(b.created_at || b.date || '')));
  }
  return { groups, records };
}

function normalizeEventRecord(item, index) {
  const createdAt = String(item.created_at || item.createdAt || item.date || '').trim();
  return {
    ...item,
    event_id: String(item.event_id || item.eventId || stableLegacyEventId(item, index)).trim(),
    event: String(item.event || 'note').trim().toLowerCase(),
    source: String(item.source || 'manual_import').trim(),
    created_at: createdAt,
  };
}

function stableLegacyEventId(item, index) {
  const id = String(item.application_id || item.applicationId || '').replace(/^#/, '').padStart(3, '0');
  return `evt_${id}_${String(item.created_at || item.date || index).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}_${index}`;
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

function buildApplicationTodos(applications) {
  const today = todayChina();
  const active = applications.filter((app) => !['rejected', 'discarded', 'skip', 'offer'].includes(app.statusKey));
  const todos = [];

  for (const app of active) {
    const latest = app.latestEvent || {};
    const due = String(latest.due || '').trim();
    const statusKey = app.progressStatusKey || app.statusKey;
    if (due) {
      const days = daysBetween(today, due);
      if (days <= 0) {
        todos.push(todoFromApp(app, 'overdue', due, latest.next_action || nextActionForStatus(statusKey), days < 0 ? '已逾期' : '今天截止'));
      } else if (days <= 3) {
        todos.push(todoFromApp(app, 'due_soon', due, latest.next_action || nextActionForStatus(statusKey), `${days} 天内`));
      }
      continue;
    }

    const age = daysBetween(String(latest.date || app.date || today), today);
    if (statusKey === 'applied' && age >= 5) {
      todos.push(todoFromApp(app, 'follow_up', today, '跟进投递进展，确认是否进入筛选', `已投递 ${age} 天`));
    } else if (statusKey === 'responded' && age >= 2) {
      todos.push(todoFromApp(app, 'reply', today, '整理招聘方问题并回复', `已回复 ${age} 天`));
    } else if (statusKey === 'interview') {
      todos.push(todoFromApp(app, 'interview_prep', today, '准备面试材料和项目证据', '面试推进中'));
    }
  }

  return todos
    .sort((a, b) => todoRank(a.kind) - todoRank(b.kind) || String(a.due || '').localeCompare(String(b.due || '')))
    .slice(0, 12);
}

function todoFromApp(app, kind, due, action, reason) {
  return {
    id: `${kind}:${app.id}`,
    application_id: app.id,
    company: app.company,
    role: app.role,
    kind,
    due,
    reason,
    action,
    source_event_id: app.latestEvent?.event_id || '',
  };
}

function todoRank(kind) {
  const order = { overdue: 0, due_soon: 1, reply: 2, interview_prep: 3, follow_up: 4 };
  return order[kind] ?? 9;
}

function nextActionForStatus(statusKey) {
  const actions = {
    applied: '等待回复，必要时跟进',
    responded: '整理招聘方问题并回复',
    interview: '准备面试材料和项目证据',
    offer: '进入 Offer 评估和谈薪',
    rejected: '记录拒绝原因并复盘',
    note: '补充下一步动作',
  };
  return actions[statusKey] || '补充下一步动作';
}

function buildApplicationFeedback(applications) {
  const today = todayChina();
  const rejected = applications.filter((app) => app.statusKey === 'rejected');
  const staleApplied = applications.filter((app) => {
    if (app.statusKey !== 'applied') return false;
    const latestDate = app.latestEvent?.date || app.date || today;
    return daysBetween(latestDate, today) >= 7;
  });
  const interviews = applications.filter((app) => app.statusKey === 'interview');
  const responded = applications.filter((app) => ['responded', 'interview', 'offer'].includes(app.statusKey));
  const applied = applications.filter((app) => ['applied', 'responded', 'interview', 'offer'].includes(app.statusKey));
  const insights = [];

  if (rejected.length) {
    insights.push({
      kind: 'rejection',
      title: '拒信复盘',
      summary: `${rejected.length} 条拒绝/暂不匹配记录。优先检查 JD 关键词、岗位级别和简历首屏证据是否错位。`,
      action: '把拒信原文继续导入，标注原因；连续 3 次同类拒绝后暂停该方向。',
      evidence: rejected.slice(0, 3).map(shortAppLabel),
    });
  }

  if (staleApplied.length) {
    insights.push({
      kind: 'no_response',
      title: '无回复风险',
      summary: `${staleApplied.length} 条真实投递超过 7 天没有后续事件。可能是岗位匹配弱、首句证据不够具体，或渠道触达质量低。`,
      action: '优先跟进高意向岗位；下一轮投递前强化项目结果、到岗时间和岗位关键词匹配。',
      evidence: staleApplied.slice(0, 3).map(shortAppLabel),
    });
  }

  if (interviews.length) {
    insights.push({
      kind: 'interview',
      title: '面试推进',
      summary: `${interviews.length} 条进入面试/测评阶段。这里是最值得投入准备材料的岗位。`,
      action: '为每个岗位准备 2 个强相关项目故事、技术追问清单和反问问题。',
      evidence: interviews.slice(0, 3).map(shortAppLabel),
    });
  }

  if (applied.length) {
    const rate = Math.round((responded.length / applied.length) * 100);
    insights.push({
      kind: 'conversion',
      title: '回复率判断',
      summary: `当前真实投递回复率 ${rate}%。样本少时先保证每条记录完整；样本到 10 条后再判断方向。`,
      action: rate < 30 ? '减少低匹配投递，优先投简历证据最强的岗位。' : '保留当前方向，继续记录面试和拒信原因。',
      evidence: [`真实投递 ${applied.length}`, `真实回复 ${responded.length}`],
    });
  }

  if (!insights.length) {
    insights.push({
      kind: 'empty',
      title: '等待真实反馈',
      summary: '还没有足够的投递反馈。先导入投递回执、拒信、面试邀请或 HR 回复。',
      action: '每次有新消息都粘贴到导入框，形成可复盘样本。',
      evidence: [],
    });
  }

  return insights;
}

function shortAppLabel(app) {
  return `${app.company} · ${app.role}`;
}

function todayChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00+08:00`);
  const end = Date.parse(`${to}T00:00:00+08:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
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
  const { groups: eventGroups } = await readApplicationEvents();
  const existingEvents = applicationId ? eventGroups.get(applicationId) || [] : [];
  if (!applicationId) {
    applicationId = nextProgressId(eventGroups);
  }
  const latestExisting = existingEvents[existingEvents.length - 1] || {};
  const company = String(body.company || body.companyHint || latestExisting.company || '').trim();
  const role = String(body.role || body.roleHint || latestExisting.role || '').trim();
  if (!company || !role) throw new Error('Missing company or role');

  const record = {
    event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
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

export async function updateApplicationEvent(req) {
  const body = await readJsonBody(req);
  const eventId = String(body.event_id || body.eventId || '').trim();
  if (!eventId) throw new Error('Missing event_id');

  const { records } = await readApplicationEvents();
  const index = records.findIndex((item) => item.event_id === eventId);
  if (index < 0) throw new Error('Application event not found');

  const current = records[index];
  const event = String(body.event || current.event || '').trim().toLowerCase();
  if (!allowedApplicationEvents().has(event)) throw new Error('Invalid application event');

  const due = String(body.due ?? current.due ?? '').trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Invalid due date');

  const updated = {
    ...current,
    company: String(body.company ?? current.company ?? '').trim(),
    role: String(body.role ?? current.role ?? '').trim(),
    event,
    source: String(body.source ?? current.source ?? 'manual_import').trim(),
    next_action: String(body.next_action ?? body.nextAction ?? current.next_action ?? '').trim(),
    due,
    note: String(body.note ?? current.note ?? '').trim().slice(0, 500),
    evidence: String(body.evidence ?? current.evidence ?? '').trim().slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  if (!updated.company || !updated.role) throw new Error('Missing company or role');

  records[index] = updated;
  await writeApplicationEvents(records);
  return { ok: true, event: updated };
}

export async function deleteApplicationEvent(req) {
  const body = await readJsonBody(req);
  const eventId = String(body.event_id || body.eventId || '').trim();
  if (!eventId) throw new Error('Missing event_id');

  const { records } = await readApplicationEvents();
  const filtered = records.filter((item) => item.event_id !== eventId);
  if (filtered.length === records.length) throw new Error('Application event not found');
  await writeApplicationEvents(filtered);
  return { ok: true, deleted: eventId };
}

async function writeApplicationEvents(records) {
  await mkdir(dataDir, { recursive: true });
  const normalized = records.map((item) => JSON.stringify(stripInternalEventFields(item))).join('\n');
  await writeFile(applicationEventsPath, normalized ? `${normalized}\n` : '', 'utf8');
}

function stripInternalEventFields(item) {
  const out = { ...item };
  delete out.applicationId;
  delete out.eventId;
  return out;
}

function allowedApplicationEvents() {
  return new Set([
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
