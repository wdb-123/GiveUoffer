import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ApplicationEvent,
  ApplicationSummary,
  ApplicationsOverview,
  CreateApplicationEventRequest,
  DeleteApplicationEventRequest,
  UpdateApplicationEventRequest,
} from "@ucareer/shared";
import { workspaceDataPath } from "../workspace-paths";

export interface ApplicationStore {
  listApplications(): Promise<ApplicationsOverview>;
  createApplicationEvent(input: CreateApplicationEventRequest): Promise<ApplicationEvent>;
  updateApplicationEvent(input: UpdateApplicationEventRequest): Promise<ApplicationEvent>;
  deleteApplicationEvent(input: DeleteApplicationEventRequest): Promise<string>;
}

export function createApplicationStore(workspaceRoot: string): ApplicationStore {
  const trackerPath = workspaceDataPath(workspaceRoot, "applications");
  const applicationEventsPath = workspaceDataPath(workspaceRoot, "applicationEvents");
  const applicationEmailSnapshotsPath = workspaceDataPath(workspaceRoot, "applicationEmailSnapshots");

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
      const applications = parseApplicationsMarkdown(await readTextFile(trackerPath));
      const existingEvents = await readApplicationEvents(applicationEventsPath);
      const event = normalizeApplicationEvent(input, existingEvents, applications);
      const duplicate = findDuplicateApplicationEvent(event, existingEvents);
      if (duplicate) return duplicate;
      await writeApplicationEmailSnapshot(applicationEmailSnapshotsPath, event);
      await mkdir(dirname(applicationEventsPath), { recursive: true });
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
      if (input.email_snapshot || input.emailSnapshot) await writeApplicationEmailSnapshot(applicationEmailSnapshotsPath, updated);
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
    active: applications.filter(isActiveApplicationProgress).length,
    evaluated: countStatus(applications, "evaluated"),
    applied: countStatus(applications, "applied"),
    responded: countStatus(applications, "responded"),
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
      events: appEvents,
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

function normalizeApplicationEvent(input: CreateApplicationEventRequest, existingEvents: ApplicationEvent[], existingApplications: ApplicationSummary[] = []): ApplicationEvent {
  const event = String(input.event || "").trim().toLowerCase();
  if (!allowedApplicationEvents().has(event)) throw new Error("Invalid application event");

  const due = String(input.due || "").trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Invalid due date");

  const now = new Date().toISOString();
  const groups = groupEvents(existingEvents);
  const companyInput = String(input.company || input.companyHint || "").trim();
  const roleInput = String(input.role || input.roleHint || "").trim();
  const matchedApplicationId = findExistingApplicationId(companyInput, roleInput, existingEvents, existingApplications);
  const applicationId = matchedApplicationId || normalizeProgressId(input.application_id || input.applicationId || "") || nextProgressId(groups, existingApplications);
  const latestExisting = groups.get(applicationId)?.at(-1);
  const company = String(companyInput || latestExisting?.company || "").trim();
  const role = String(roleInput || latestExisting?.role || "").trim();
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
    ...(input.email_snapshot || input.emailSnapshot ? { email_snapshot: normalizeApplicationEmailSnapshot(input.email_snapshot || input.emailSnapshot) } : {}),
    created_at: now,
  };
}

function findDuplicateApplicationEvent(event: ApplicationEvent, existingEvents: ApplicationEvent[]): ApplicationEvent | undefined {
  const companyKey = normalizeMatchKey(event.company);
  const roleKey = normalizeMatchKey(event.role);
  const evidenceKey = normalizeEventEvidenceKey(event.evidence || event.note || event.next_action);
  return existingEvents.find((existing) => (
    normalizeProgressId(existing.application_id) === normalizeProgressId(event.application_id)
    && normalizeMatchKey(existing.company) === companyKey
    && normalizeMatchKey(existing.role) === roleKey
    && existing.event === event.event
    && existing.date === event.date
    && normalizeEventEvidenceKey(existing.evidence || existing.note || existing.next_action) === evidenceKey
  ));
}

function normalizeEventEvidenceKey(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, "").slice(0, 180);
}

function normalizeApplicationEmailSnapshot(value: CreateApplicationEventRequest["email_snapshot"]): NonNullable<ApplicationEvent["email_snapshot"]> {
  const snapshot = value || {};
  return {
    uid: String(snapshot.uid || "").trim(),
    mailbox: String(snapshot.mailbox || "").trim(),
    account: String(snapshot.account || "").trim(),
    from: String(snapshot.from || "").trim(),
    subject: String(snapshot.subject || "").trim(),
    date: String(snapshot.date || "").trim(),
    snippet: String(snapshot.snippet || "").trim().slice(0, 4000),
    rawText: String(snapshot.rawText || "").trim().slice(0, 12_000),
    attachments: Array.isArray(snapshot.attachments)
      ? snapshot.attachments
        .map((attachment) => ({
          filename: String(attachment.filename || "").trim(),
          contentType: String(attachment.contentType || "").trim(),
          size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
          path: String(attachment.path || "").trim(),
        }))
        .filter((attachment) => attachment.filename)
      : [],
  };
}

async function writeApplicationEmailSnapshot(path: string, event: ApplicationEvent): Promise<void> {
  if (!event.email_snapshot) return;
  const { rawText, snippet, ...compactSnapshot } = event.email_snapshot;
  const record = {
    snapshot_id: `mail_${event.event_id}`,
    event_id: event.event_id,
    application_id: event.application_id,
    company: event.company,
    role: event.role,
    event: event.event,
    captured_at: event.created_at,
    ...compactSnapshot,
    snippet,
    rawText,
  };
  event.email_snapshot = {
    ...compactSnapshot,
    snippet: snippet ? snippet.slice(0, 500) : "",
    rawText: rawText || snippet || `workspace/ops/data/application-email-snapshots.jsonl#mail_${event.event_id}`,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function findExistingApplicationId(company: string, role: string, events: ApplicationEvent[], applications: ApplicationSummary[]): string {
  const companyKey = normalizeMatchKey(company);
  const roleKey = normalizeMatchKey(role);
  if (!companyKey || !roleKey) return "";

  const matchedEvent = [...events]
    .reverse()
    .find((event) => normalizeMatchKey(event.company) === companyKey && normalizeMatchKey(event.role) === roleKey);
  if (matchedEvent?.application_id) return normalizeProgressId(matchedEvent.application_id);

  const matchedApplication = applications.find((application) => (
    normalizeMatchKey(application.company) === companyKey && normalizeMatchKey(application.role) === roleKey
  ));
  return matchedApplication?.id || "";
}

function normalizeMatchKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[（）()【】\[\]·,，。.\s_-]+/g, "")
    .replace(/有限公司|有限责任公司|科技|招聘|hr|recruiting|talent/g, "")
    .trim();
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
    ...(input.email_snapshot || input.emailSnapshot
      ? { email_snapshot: normalizeApplicationEmailSnapshot(input.email_snapshot || input.emailSnapshot) }
      : {}),
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
    ...(value.email_snapshot && typeof value.email_snapshot === "object" ? { email_snapshot: normalizeApplicationEmailSnapshot(value.email_snapshot as CreateApplicationEventRequest["email_snapshot"]) } : {}),
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
  const normalized = String(value || "").replace(/^#/, "").padStart(3, "0");
  return Number(normalized) > 0 ? normalized : "";
}

function nextProgressId(groups: Map<string, unknown>, applications: ApplicationSummary[] = []): string {
  const used = [
    ...groups.keys(),
    ...applications.map((application) => application.id),
  ].map((id) => Number(id)).filter(Number.isFinite);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return String(next).padStart(3, "0");
}

function todayChina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function countStatus(applications: ApplicationSummary[], statusKey: string): number {
  return applications.filter((application) => application.statusKey === statusKey).length;
}

function isActiveApplicationProgress(application: ApplicationSummary): boolean {
  return new Set(["applied", "responded", "interview", "offer", "rejected"]).has(application.statusKey);
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
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content ? `${content}\n` : "", "utf8");
}

function stripInternalEventFields(event: ApplicationEvent): Record<string, unknown> {
  return { ...event };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
