import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApplicationEvent,
  ApplicationSummary,
  ApplicationsOverview,
  CreateApplicationEventRequest,
  DeleteApplicationEventRequest,
  UpdateApplicationEventRequest,
} from "@offeru/shared";

export interface ApplicationStore {
  listApplications(): Promise<ApplicationsOverview>;
  createApplicationEvent(input: CreateApplicationEventRequest): Promise<ApplicationEvent>;
  updateApplicationEvent(input: UpdateApplicationEventRequest): Promise<ApplicationEvent>;
  deleteApplicationEvent(input: DeleteApplicationEventRequest): Promise<string>;
}

export function createApplicationStore(workspaceRoot: string): ApplicationStore {
  const trackerPath = join(workspaceRoot, "data/applications.md");
  const applicationEventsPath = join(workspaceRoot, "data/application-events.jsonl");
  const dataDir = join(workspaceRoot, "data");

  return {
    async listApplications() {
      const markdown = await readTextFile(trackerPath);
      const events = await readApplicationEvents(applicationEventsPath);
      const applications = parseApplicationsMarkdown(markdown);
      const merged = mergeApplicationEvents(applications, events);
      return {
        applications: merged,
        metrics: buildMetrics(merged),
      };
    },

    async createApplicationEvent(input) {
      const event = normalizeApplicationEvent(input, await readApplicationEvents(applicationEventsPath));
      await mkdir(dataDir, { recursive: true });
      await appendFile(applicationEventsPath, `${JSON.stringify(event)}\n`, "utf8");
      return event;
    },

    async updateApplicationEvent(input) {
      const eventId = String(input.event_id || input.eventId || "").trim();
      if (!eventId) throw new Error("Missing event_id");
      const events = await readApplicationEvents(applicationEventsPath);
      const index = events.findIndex((event) => event.event_id === eventId);
      if (index < 0) throw new Error("Application event not found");
      const current = events[index];
      if (!current) throw new Error("Application event not found");
      const updated = normalizeUpdatedApplicationEvent(current, input);
      events[index] = updated;
      await writeApplicationEvents(applicationEventsPath, events);
      return updated;
    },

    async deleteApplicationEvent(input) {
      const eventId = String(input.event_id || input.eventId || "").trim();
      if (!eventId) throw new Error("Missing event_id");
      const events = await readApplicationEvents(applicationEventsPath);
      const filtered = events.filter((event) => event.event_id !== eventId);
      if (filtered.length === events.length) throw new Error("Application event not found");
      await writeApplicationEvents(applicationEventsPath, filtered);
      return eventId;
    },
  };
}

function parseApplicationsMarkdown(markdown: string): ApplicationSummary[] {
  const lines = markdown.split(/\r?\n/);
  const rows = lines.filter((line) => /^\|\s*\d+/.test(line));
  return rows.map(parseApplicationRow).filter((item): item is ApplicationSummary => Boolean(item));
}

function parseApplicationRow(line: string): ApplicationSummary | null {
  const cells = splitMarkdownTableRow(line);
  if (cells.length < 9) return null;
  const id = cells[0]?.replace(/^#/, "").padStart(3, "0") || "";
  if (!/^\d{3,}$/.test(id)) return null;
  const scoreRaw = cells[4] || "-";
  const report = cells[7] || "";
  return {
    id,
    date: cells[1] || "",
    company: cells[2] || "",
    role: cells[3] || "",
    score: parseScore(scoreRaw),
    scoreRaw,
    status: cells[5] || "",
    statusKey: normalizeStatusKey(cells[5] || ""),
    pdf: cells[6] || "",
    reportLabel: extractMarkdownLinkLabel(report),
    reportPath: extractMarkdownLinkHref(report),
    notes: cells[8] || "",
  };
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseScore(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, "_");
}

function extractMarkdownLinkLabel(value: string): string {
  return value.match(/\[([^\]]+)\]/)?.[1] || "";
}

function extractMarkdownLinkHref(value: string): string {
  return value.match(/\]\(([^)]+)\)/)?.[1] || "";
}

function buildMetrics(applications: ApplicationSummary[]): ApplicationsOverview["metrics"] {
  return {
    total: applications.length,
    evaluated: countStatus(applications, "evaluated"),
    applied: countStatus(applications, "applied"),
    interview: countStatus(applications, "interview"),
    offer: countStatus(applications, "offer"),
    rejected: countStatus(applications, "rejected"),
  };
}

async function readApplicationEvents(path: string): Promise<ApplicationEvent[]> {
  const text = await readTextFile(path);
  const events: ApplicationEvent[] = [];
  let index = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(normalizePersistedEvent(JSON.parse(trimmed), index));
      index += 1;
    } catch {
      continue;
    }
  }
  return events;
}

function mergeApplicationEvents(applications: ApplicationSummary[], events: ApplicationEvent[]): ApplicationSummary[] {
  const byId = new Map(applications.map((application) => [application.id, application]));
  const eventsByApplication = groupEvents(events);

  for (const [id, appEvents] of eventsByApplication.entries()) {
    appEvents.sort((a, b) => String(a.created_at || a.date).localeCompare(String(b.created_at || b.date)));
    const latestEvent = appEvents[appEvents.length - 1];
    if (!latestEvent) continue;
    const existing = byId.get(id);
    const statusKey = applicationEventStatusKey(latestEvent.event) || existing?.statusKey || "note";
    byId.set(id, {
      id,
      date: existing?.date || latestEvent.date,
      company: existing?.company || latestEvent.company,
      role: existing?.role || latestEvent.role,
      score: existing?.score || 0,
      scoreRaw: existing?.scoreRaw || "-",
      status: eventStatusLabel(statusKey),
      statusKey,
      pdf: existing?.pdf || "-",
      reportLabel: existing?.reportLabel || "",
      reportPath: existing?.reportPath || "",
      notes: latestEvent.next_action || latestEvent.note || existing?.notes || "",
      eventCount: appEvents.length,
      latestEvent,
    });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function groupEvents(events: ApplicationEvent[]): Map<string, ApplicationEvent[]> {
  const groups = new Map<string, ApplicationEvent[]>();
  for (const event of events) {
    const id = normalizeProgressId(event.application_id);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)?.push(event);
  }
  return groups;
}

function normalizeApplicationEvent(input: CreateApplicationEventRequest, existingEvents: ApplicationEvent[]): ApplicationEvent {
  const event = String(input.event || "").trim().toLowerCase();
  if (!allowedApplicationEvents().has(event)) throw new Error("Invalid application event");

  const due = String(input.due || "").trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Invalid due date");

  const now = new Date().toISOString();
  const groups = groupEvents(existingEvents);
  const applicationId = normalizeProgressId(input.application_id || input.applicationId || "") || nextProgressId(groups);
  const latestExisting = groups.get(applicationId)?.at(-1);
  const company = String(input.company || input.companyHint || latestExisting?.company || "").trim();
  const role = String(input.role || input.roleHint || latestExisting?.role || "").trim();
  if (!company || !role) throw new Error("Missing company or role");

  return {
    event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    date: String(input.date || todayChina()).trim(),
    application_id: applicationId,
    company,
    role,
    event,
    source: String(input.source || "manual_import").trim(),
    next_action: String(input.next_action || input.nextAction || "").trim(),
    due,
    note: String(input.note || "").trim().slice(0, 500),
    evidence: String(input.evidence || "").trim().slice(0, 500),
    created_at: now,
  };
}

function normalizeUpdatedApplicationEvent(current: ApplicationEvent, input: UpdateApplicationEventRequest): ApplicationEvent {
  const event = String(input.event ?? current.event ?? "").trim().toLowerCase();
  if (!allowedApplicationEvents().has(event)) throw new Error("Invalid application event");

  const due = String(input.due ?? current.due ?? "").trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Invalid due date");

  const company = String(input.company ?? current.company ?? "").trim();
  const role = String(input.role ?? current.role ?? "").trim();
  if (!company || !role) throw new Error("Missing company or role");

  return {
    ...current,
    company,
    role,
    event,
    source: String(input.source ?? current.source ?? "manual_import").trim(),
    next_action: String(input.next_action ?? input.nextAction ?? current.next_action ?? "").trim(),
    due,
    note: String(input.note ?? current.note ?? "").trim().slice(0, 500),
    evidence: String(input.evidence ?? current.evidence ?? "").trim().slice(0, 500),
    updated_at: new Date().toISOString(),
  };
}

function normalizePersistedEvent(value: Record<string, unknown>, index: number): ApplicationEvent {
  const applicationId = normalizeProgressId(String(value.application_id || value.applicationId || ""));
  const createdAt = String(value.created_at || value.createdAt || value.date || "").trim();
  return {
    event_id: String(value.event_id || value.eventId || `evt_${applicationId}_${index}`).trim(),
    date: String(value.date || createdAt.slice(0, 10)).trim(),
    application_id: applicationId,
    company: String(value.company || "").trim(),
    role: String(value.role || "").trim(),
    event: String(value.event || "note").trim().toLowerCase(),
    source: String(value.source || "manual_import").trim(),
    next_action: String(value.next_action || value.nextAction || "").trim(),
    due: String(value.due || "").trim(),
    note: String(value.note || "").trim(),
    evidence: String(value.evidence || "").trim(),
    created_at: createdAt,
    ...(value.updated_at ? { updated_at: String(value.updated_at) } : {}),
  };
}

function applicationEventStatusKey(event: string): string {
  const map: Record<string, string> = {
    evaluated: "evaluated",
    applied: "applied",
    application_received: "applied",
    responded: "responded",
    assessment: "responded",
    interview: "interview",
    offer: "offer",
    rejected: "rejected",
    discarded: "discarded",
    skip: "skip",
    followup_sent: "responded",
    note: "note",
  };
  return map[String(event || "").toLowerCase()] || "";
}

function eventStatusLabel(statusKey: string): string {
  const labels: Record<string, string> = {
    evaluated: "Evaluated",
    applied: "已投递",
    responded: "已回复",
    interview: "面试中",
    offer: "Offer",
    rejected: "已拒绝",
    discarded: "已放弃",
    skip: "不投",
    note: "备注",
  };
  return labels[statusKey] || statusKey || "备注";
}

function allowedApplicationEvents(): Set<string> {
  return new Set([
    "evaluated",
    "applied",
    "application_received",
    "responded",
    "assessment",
    "interview",
    "offer",
    "rejected",
    "discarded",
    "skip",
    "followup_sent",
    "note",
  ]);
}

function normalizeProgressId(value: string): string {
  return String(value || "").replace(/^#/, "").padStart(3, "0");
}

function nextProgressId(groups: Map<string, unknown>): string {
  const used = [...groups.keys()].map((id) => Number(id)).filter(Number.isFinite);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return String(next).padStart(3, "0");
}

function todayChina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function countStatus(applications: ApplicationSummary[], statusKey: string): number {
  return applications.filter((application) => application.statusKey === statusKey).length;
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  }
}

async function writeApplicationEvents(path: string, events: ApplicationEvent[]): Promise<void> {
  const content = events.map((event) => JSON.stringify(stripInternalEventFields(event))).join("\n");
  await writeFile(path, content ? `${content}\n` : "", "utf8");
}

function stripInternalEventFields(event: ApplicationEvent): Record<string, unknown> {
  return { ...event };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
