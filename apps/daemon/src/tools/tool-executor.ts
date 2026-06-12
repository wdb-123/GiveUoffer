import type {
  CreateApplicationEventRequest,
  EmailMessageSummary,
  EvidenceRequest,
  ExperienceMetadataItem,
  ImportEmailMessagesRequest,
  ImportJobRequest,
  JobSearchRequest,
  MarketJob,
  SaveGeneratedResumeRequest,
  UpdateApplicationEventRequest,
} from "@ucareer/shared";
import { importQqEmailMessages } from "../connectors/imap-connector";

export interface AgentToolCall {
  tool: string;
  input?: Record<string, unknown>;
}

export interface AgentToolExecutor {
  execute(call: AgentToolCall): Promise<string>;
}

export function createAgentToolExecutor(input: {
  connectorCredentialStore: ReturnType<typeof import("../stores/connector-credential-store").createConnectorCredentialStore>;
  applicationStore: ReturnType<typeof import("../stores/application-store").createApplicationStore>;
  evidenceStore: ReturnType<typeof import("../stores/evidence-store").createEvidenceStore>;
  experienceStore: ReturnType<typeof import("../stores/experience-store").createExperienceStore>;
  marketStore: ReturnType<typeof import("../stores/market-store").createMarketStore>;
  resumeStore: ReturnType<typeof import("../stores/resume-store").createResumeStore>;
  jobSearchService: ReturnType<typeof import("../services/jobsearch-service").createJobSearchService>;
}): AgentToolExecutor {
  return {
    async execute(call) {
      const workspaceToolResult = await executeWorkspaceTool(call, input);
      if (workspaceToolResult) return workspaceToolResult;

      if (call.tool === "jobsearch.search_jobs") {
        const request = normalizeJobSearchInput(call.input);
        const result = await input.jobSearchService.search(request);
        return JSON.stringify({
          tool: call.tool,
          input: request,
          connectorKind: "job_board",
          connectorId: "jobsearch",
          connectorLabel: "jobsearch",
          protocol: "local search module",
          runId: result.runId,
          status: result.status,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          marketUpdatedAt: result.marketUpdatedAt,
          stats: {
            added: result.added,
            candidatesSeen: result.candidatesSeen,
            duplicatesSkipped: result.duplicatesSkipped,
            failedQueries: result.failedQueries,
          },
          message: result.message,
          resultContract: {
            sourceFields: ["connectorLabel", "protocol", "runId", "stats"],
            jobFields: ["id", "company", "title", "location", "salary", "source", "url", "score"],
            safety: "tool may update local recruitment market unless dryRun is true; it never submits applications",
          },
          jobs: result.jobs.slice(0, 20).map(toSafeJobSummary),
          omittedJobs: Math.max(0, result.jobs.length - 20),
        }, null, 2);
      }
      if (call.tool !== "mailbox.search_messages") throw new Error(`Unsupported tool: ${call.tool}`);
      const credential = input.connectorCredentialStore.getSecret("qq-email");
      if (!credential?.secret) throw new Error("QQ 邮箱尚未连接，请先保存 IMAP 授权码");
      const request = normalizeMailboxSearchInput(call.input);
      const result = await importQqEmailMessages({
        email: credential.account,
        authorizationCode: credential.secret,
        request,
      });
      return JSON.stringify({
        tool: call.tool,
        input: request,
        connectorKind: "mailbox",
        connectorId: result.connectorId,
        connectorLabel: "QQ邮箱",
        protocol: "IMAP readonly",
        account: redactEmailAddress(result.account),
        mailbox: result.mailbox,
        importedAt: result.importedAt,
        resultContract: {
          sourceFields: ["connectorLabel", "account", "protocol", "mailbox"],
          messageFields: ["uid", "date", "from", "subject", "snippet"],
          privacy: "messages are redacted snippets; authorization secrets and full mailbox contents are never returned",
        },
        messages: result.messages.slice(0, 40).map(toSafeEmailSummary),
      }, null, 2);
    },
  };
}

async function executeWorkspaceTool(
  call: AgentToolCall,
  input: {
    applicationStore: ReturnType<typeof import("../stores/application-store").createApplicationStore>;
    evidenceStore: ReturnType<typeof import("../stores/evidence-store").createEvidenceStore>;
    experienceStore: ReturnType<typeof import("../stores/experience-store").createExperienceStore>;
    marketStore: ReturnType<typeof import("../stores/market-store").createMarketStore>;
    resumeStore: ReturnType<typeof import("../stores/resume-store").createResumeStore>;
  },
): Promise<string | undefined> {
  switch (call.tool) {
    case "applications.list": {
      const result = await input.applicationStore.listApplications();
      return toolJson(call.tool, { metrics: result.metrics, applications: result.applications.slice(0, 80) });
    }
    case "applications.create_event": {
      const event = await input.applicationStore.createApplicationEvent(normalizeApplicationCreate(call.input));
      return toolJson(call.tool, { event });
    }
    case "applications.update_event": {
      const event = await input.applicationStore.updateApplicationEvent(normalizeApplicationUpdate(call.input));
      return toolJson(call.tool, { event });
    }
    case "applications.delete_event": {
      const eventId = await input.applicationStore.deleteApplicationEvent({ event_id: stringOrUndefined(call.input?.eventId) || stringOrUndefined(call.input?.event_id) || "" });
      return toolJson(call.tool, { deletedEventId: eventId });
    }
    case "market.list": {
      const market = await input.marketStore.getRecruitmentMarket();
      const limit = clampNumber(call.input?.limit, 1, 200, 80);
      return toolJson(call.tool, { updatedAt: market.updatedAt, jobsCount: market.jobs.length, jobs: market.jobs.slice(0, limit).map(toSafeJobSummary) });
    }
    case "market.import": {
      const result = await input.marketStore.importJob(normalizeImportJob(call.input));
      return toolJson(call.tool, result);
    }
    case "market.update": {
      const job = await input.marketStore.updateJob(requiredString(call.input?.id, "id"), normalizeMarketPatch(call.input));
      return toolJson(call.tool, { job: toSafeJobSummary(job) });
    }
    case "market.delete": {
      const id = await input.marketStore.deleteJob(requiredString(call.input?.id, "id"));
      return toolJson(call.tool, { deletedJobId: id });
    }
    case "experience.list": {
      const overview = await input.experienceStore.getExperienceOverview();
      return toolJson(call.tool, {
        updatedAt: overview.updatedAt,
        files: overview.files.map(({ content: _content, ...file }) => file),
        photos: overview.photos.map(({ content: _content, dataUrl: _dataUrl, ...photo }) => photo),
        intentions: overview.intentions.map(({ content: _content, ...item }) => item),
        experiences: overview.experiences.map(({ sourceContent: _sourceContent, ...item }) => item),
      });
    }
    case "experience.upsert": {
      const item = await input.experienceStore.upsertExperience(normalizeExperienceUpsert(call.input));
      return toolJson(call.tool, { experience: item });
    }
    case "experience.delete": {
      const id = await input.experienceStore.deleteExperience(requiredString(call.input?.id, "id"));
      return toolJson(call.tool, { deletedExperienceId: id });
    }
    case "resumes.list": {
      const resumes = await input.resumeStore.listResumes();
      return toolJson(call.tool, { resumes });
    }
    case "resumes.get": {
      const resume = await input.resumeStore.getResume(requiredString(call.input?.file, "file"));
      if (!resume) throw new Error("Resume not found");
      return toolJson(call.tool, { resume });
    }
    case "resumes.save": {
      const resume = await input.resumeStore.saveResume(normalizeResumeSave(call.input));
      return toolJson(call.tool, { resume: { file: resume.file, title: resume.title } });
    }
    case "resumes.delete": {
      const file = await input.resumeStore.deleteResume(requiredString(call.input?.file, "file"));
      return toolJson(call.tool, { deletedResumeFile: file });
    }
    case "evidence.list": {
      return toolJson(call.tool, await input.evidenceStore.listEvidenceRequests());
    }
    case "evidence.upsert": {
      const request = await input.evidenceStore.upsertEvidenceRequest(normalizeEvidenceUpsert(call.input));
      return toolJson(call.tool, { request });
    }
    case "evidence.fulfill": {
      const result = await input.evidenceStore.fulfillEvidenceRequest({
        requestId: requiredString(call.input?.requestId || call.input?.id, "requestId"),
        content: requiredString(call.input?.content, "content"),
        source: stringOrUndefined(call.input?.source) || "Agent tool",
      });
      return toolJson(call.tool, result);
    }
    case "evidence.delete": {
      const id = await input.evidenceStore.deleteEvidenceRequest(requiredString(call.input?.id, "id"));
      return toolJson(call.tool, { deletedEvidenceRequestId: id });
    }
    default:
      return undefined;
  }
}

function toolJson(tool: string, data: unknown): string {
  return JSON.stringify({ tool, ...asRecord(data) }, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { result: value };
}

function normalizeJobSearchInput(input: Record<string, unknown> | undefined): JobSearchRequest {
  const source = stringOrUndefined(input?.source);
  const request: JobSearchRequest = {
    source: source === "codex-chrome" || source === "china-crawler" || source === "all" ? source : "boss-agent",
    city: stringOrUndefined(input?.city) || "深圳",
    max: clampNumber(input?.max, 1, 50, 12),
    minMatchScore: clampNumber(input?.minMatchScore, 0, 5, 0),
    withDetails: Boolean(input?.withDetails),
    dryRun: Boolean(input?.dryRun),
  };
  if (Array.isArray(input?.queries)) {
    const queries = input.queries
      .map((value) => stringOrUndefined(value))
      .filter((value): value is string => Boolean(value))
      .map(normalizeJobSearchQuery)
      .filter((value) => value.length >= 2 && !isJobSearchFilterOnly(value));
    if (queries.length) request.queries = queries.slice(0, 12);
  }
  return request;
}

function normalizeJobSearchQuery(value: string): string {
  return value
    .replace(/[，,、/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isJobSearchFilterOnly(value: string): boolean {
  return /^(\d+\s*[-~到至]\s*\d+\s*(年|k|K|万)?|\d+\s*(年|k|K|万)\+?|薪资|经验|城市|深圳|上海|北京)$/u.test(value);
}

function toSafeJobSummary(job: MarketJob): Partial<MarketJob> {
  const out: Partial<MarketJob> = { id: job.id };
  setIfDefined(out, "company", job.company);
  setIfDefined(out, "role", job.role);
  setIfDefined(out, "location", job.location);
  setIfDefined(out, "salary", job.salary);
  setIfDefined(out, "source", job.source);
  setIfDefined(out, "platform", job.platform);
  setIfDefined(out, "url", job.url);
  setIfDefined(out, "direction", job.direction);
  setIfDefined(out, "keywords", job.keywords);
  setIfDefined(out, "matchScore", job.matchScore);
  setIfDefined(out, "fitReason", job.fitReason);
  setIfDefined(out, "evidenceGap", job.evidenceGap);
  return out;
}

function setIfDefined<K extends keyof MarketJob>(out: Partial<MarketJob>, key: K, value: MarketJob[K] | undefined): void {
  if (value !== undefined) out[key] = value;
}

function normalizeApplicationCreate(input: Record<string, unknown> | undefined): CreateApplicationEventRequest {
  const request: CreateApplicationEventRequest = {
    company: requiredString(input?.company || input?.companyHint, "company"),
    role: requiredString(input?.role || input?.roleHint, "role"),
    event: requiredString(input?.event, "event"),
    source: stringOrUndefined(input?.source) || "agent_tool",
    next_action: stringOrUndefined(input?.next_action || input?.nextAction) || "",
    due: stringOrUndefined(input?.due) || "",
    note: stringOrUndefined(input?.note) || "",
    evidence: stringOrUndefined(input?.evidence) || "",
  };
  const applicationId = stringOrUndefined(input?.application_id || input?.applicationId);
  const date = stringOrUndefined(input?.date);
  if (applicationId) request.application_id = applicationId;
  if (date) request.date = date;
  return request;
}

function normalizeApplicationUpdate(input: Record<string, unknown> | undefined): UpdateApplicationEventRequest {
  const request: UpdateApplicationEventRequest = {
    event_id: requiredString(input?.event_id || input?.eventId, "event_id"),
  };
  const company = stringOrUndefined(input?.company);
  const role = stringOrUndefined(input?.role);
  const event = stringOrUndefined(input?.event);
  const date = stringOrUndefined(input?.date);
  const source = stringOrUndefined(input?.source);
  const nextAction = stringOrUndefined(input?.next_action || input?.nextAction);
  const due = stringOrUndefined(input?.due);
  const note = stringOrUndefined(input?.note);
  const evidence = stringOrUndefined(input?.evidence);
  if (company) request.company = company;
  if (role) request.role = role;
  if (event) request.event = event;
  if (date) request.date = date;
  if (source) request.source = source;
  if (nextAction) request.next_action = nextAction;
  if (due) request.due = due;
  if (note) request.note = note;
  if (evidence) request.evidence = evidence;
  return request;
}

function normalizeImportJob(input: Record<string, unknown> | undefined): ImportJobRequest {
  const request: ImportJobRequest = {
    source: stringOrUndefined(input?.source) || "agent_tool",
  };
  const url = stringOrUndefined(input?.url);
  const description = stringOrUndefined(input?.description);
  if (url) request.url = url;
  if (description) request.description = description;
  return request;
}

function normalizeMarketPatch(input: Record<string, unknown> | undefined): Partial<MarketJob> {
  const patch: Partial<MarketJob> = {};
  for (const key of ["company", "role", "location", "salary", "source", "url", "direction", "fitReason", "evidenceGap", "platform", "importedAt", "discoveredAt", "createdAt"] as const) {
    const value = stringOrUndefined(input?.[key]);
    if (value !== undefined) patch[key] = value;
  }
  if (input?.matchScore !== undefined) patch.matchScore = Number(input.matchScore);
  if (Array.isArray(input?.keywords)) patch.keywords = input.keywords.map((item) => String(item).trim()).filter(Boolean);
  return patch;
}

function normalizeExperienceUpsert(input: Record<string, unknown> | undefined): Partial<ExperienceMetadataItem> & { title: string } {
  const request: Partial<ExperienceMetadataItem> & { title: string } = {
    title: requiredString(input?.title, "title"),
    category: stringOrUndefined(input?.category) || "",
    role: stringOrUndefined(input?.role) || "",
    sourceFile: stringOrUndefined(input?.sourceFile) || "",
    summary: stringOrUndefined(input?.summary) || "",
    tags: normalizeStringArray(input?.tags),
    evidence: normalizeStringArray(input?.evidence),
    gaps: normalizeStringArray(input?.gaps),
    publicLevel: stringOrUndefined(input?.publicLevel) || "",
  };
  const id = stringOrUndefined(input?.id);
  if (id) request.id = id;
  return request;
}

function normalizeResumeSave(input: Record<string, unknown> | undefined): SaveGeneratedResumeRequest & { file?: string } {
  const out: SaveGeneratedResumeRequest & { file?: string } = {
    title: requiredString(input?.title, "title"),
    markdown: requiredString(input?.markdown, "markdown"),
  };
  const baseFile = stringOrUndefined(input?.baseFile);
  const targetJobId = stringOrUndefined(input?.targetJobId);
  const targetJobTitle = stringOrUndefined(input?.targetJobTitle);
  const file = stringOrUndefined(input?.file);
  if (baseFile) out.baseFile = baseFile;
  if (targetJobId) out.targetJobId = targetJobId;
  if (targetJobTitle) out.targetJobTitle = targetJobTitle;
  if (file) out.file = file;
  return out;
}

function normalizeEvidenceUpsert(input: Record<string, unknown> | undefined): Partial<EvidenceRequest> & { direction: string; gap: string } {
  const request: Partial<EvidenceRequest> & { direction: string; gap: string } = {
    priority: stringOrUndefined(input?.priority) || "medium",
    status: stringOrUndefined(input?.status) || "open",
    direction: requiredString(input?.direction, "direction"),
    gap: requiredString(input?.gap, "gap"),
    marketSignal: stringOrUndefined(input?.marketSignal) || "",
    currentEvidence: stringOrUndefined(input?.currentEvidence) || "",
    askHuman: normalizeStringArray(input?.askHuman),
    targetFile: stringOrUndefined(input?.targetFile) || "workspace/jobs/project-notes/evidence.md",
    resumeImpact: stringOrUndefined(input?.resumeImpact) || "",
  };
  const id = stringOrUndefined(input?.id);
  if (id) request.id = id;
  return request;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function normalizeMailboxSearchInput(input: Record<string, unknown> | undefined): ImportEmailMessagesRequest {
  const request: ImportEmailMessagesRequest = {
    mailbox: stringOrUndefined(input?.mailbox) || "INBOX",
    limit: clampNumber(input?.limit, 1, 100, 20),
    offset: clampNumber(input?.offset, 0, 10_000, 0),
    query: input?.query === "unseen" ? "unseen" : "all",
    snippetBytes: clampNumber(input?.snippetBytes, 800, 12_000, 4000),
  };
  for (const key of ["sinceDate", "beforeDate", "from", "subject", "content"] as const) {
    const value = stringOrUndefined(input?.[key]);
    if (value) request[key] = value;
  }
  if (!request.sinceDate && !request.beforeDate) {
    const now = new Date();
    request.sinceDate = formatDateForMailboxSearch(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
    request.beforeDate = formatDateForMailboxSearch(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  }
  return request;
}

function toSafeEmailSummary(message: EmailMessageSummary): EmailMessageSummary {
  return {
    ...message,
    from: redactEmailAddress(message.from),
    snippet: compactText(message.snippet, 700),
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function requiredString(value: unknown, field: string): string {
  const normalized = stringOrUndefined(value);
  if (!normalized) throw new Error(`Missing required field: ${field}`);
  return normalized;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function redactEmailAddress(value: string): string {
  return value.replace(/([A-Z0-9._%+-]{2})[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi, "$1***$2");
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength)}...` : compacted;
}

function formatDateForMailboxSearch(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
