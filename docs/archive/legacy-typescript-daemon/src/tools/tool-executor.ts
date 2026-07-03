import type {
  CreateApplicationEventRequest,
  EmailAttachmentSummary,
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
import { importQqEmailAttachments, importQqEmailMessages } from "../connectors/imap-connector";
import { joinWorkspaceDataPath, workspaceRelativeDataPath } from "../workspace-paths";

export interface AgentToolCall {
  tool: string;
  input?: Record<string, unknown>;
}

export interface AgentToolExecutor {
  execute(call: AgentToolCall): Promise<string>;
}

export function createAgentToolExecutor(input: {
  workspaceRoot: string;
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
            jobFields: ["id", "company", "title", "location", "salary", "source", "url", "score", "jdPath"],
            safety: "tool may update local recruitment market unless dryRun is true; it never submits applications",
          },
          jobs: result.jobs.slice(0, 20).map(toSafeJobSummary),
          omittedJobs: Math.max(0, result.jobs.length - 20),
        }, null, 2);
      }
      if (call.tool === "jobsearch.import_current_job") {
        const request = normalizeCurrentJobImportInput(call.input);
        const result = await input.jobSearchService.importCurrentJob(request);
        return currentJobImportToolJson(call.tool, request, result);
      }
      if (call.tool !== "mailbox.search_messages") throw new Error(`Unsupported tool: ${call.tool}`);
      const credential = input.connectorCredentialStore.getSecret("qq-email");
      if (!credential?.secret) {
        throw new Error("QQ 邮箱尚未连接：请先在邮箱连接器里保存 QQ 邮箱 IMAP 授权码，然后重试。");
      }
      const request = normalizeMailboxSearchInput(call.input);
      const search = await searchMailboxWithFallback({
        email: credential.account,
        authorizationCode: credential.secret,
        workspaceRoot: input.workspaceRoot,
        request,
      });
      const safeMessages = search.result.messages.slice(0, 40).map(toSafeEmailSummary);
      const recommendedApplicationEvent = await buildRecommendedApplicationEvent({
        applicationStore: input.applicationStore,
        message: search.result.messages[0],
        request,
      });
      return JSON.stringify({
        tool: call.tool,
        input: request,
        connectorKind: "mailbox",
        connectorId: search.result.connectorId,
        connectorLabel: "QQ邮箱",
        protocol: "IMAP readonly",
        account: redactEmailAddress(search.result.account),
        mailbox: search.result.mailbox,
        importedAt: search.result.importedAt,
        resultContract: {
          sourceFields: ["connectorLabel", "account", "protocol", "mailbox"],
          messageFields: ["uid", "date", "from", "subject", "snippet", "attachments"],
          privacy: "messages are redacted snippets; authorization secrets and full mailbox contents are never returned",
        },
        searchSemantics: {
          fieldCombination: "from、subject、content、date、mailbox 之间是 AND 关系；字段越多越容易漏掉 HR 个人邮箱或招聘系统邮件。",
          recommendedStrategy: "查 offer/面试进度时先宽搜 subject/content，公司名不要默认放进 from；空结果时调整一个维度后重试。",
        },
        searchAttempts: search.attempts,
        ...(recommendedApplicationEvent ? {
          recommendedNextToolCall: {
            tool: "applications.create_event",
            input: recommendedApplicationEvent,
          },
          instruction: "如果用户要求更新投递状态/写入管线，并且 recommendedNextToolCall 存在，下一步必须原样调用该工具，不要只文字回答。",
        } : {}),
        ...(safeMessages.length ? {} : { retryPlan: buildMailboxRetryPlan(request) }),
        messages: safeMessages,
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
    jobSearchService: ReturnType<typeof import("../services/jobsearch-service").createJobSearchService>;
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
    case "market.record_link": {
      const result = await input.marketStore.recordLink(normalizeRecordMarketLink(call.input));
      return toolJson(call.tool, result);
    }
    case "market.import": {
      const request = normalizeImportJob(call.input);
      if (isBossSearchContainerUrlOnlyImport(request)) {
        const currentJobInput = { url: request.url, dryRun: false };
        const result = await input.jobSearchService.importCurrentJob(currentJobInput);
        return currentJobImportToolJson("jobsearch.import_current_job", currentJobInput, result);
      }
      const result = await input.marketStore.importJob(request);
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
    case "resumes.save_diagnosis": {
      const report = await input.resumeStore.saveDiagnosis(normalizeResumeDiagnosisSave(call.input));
      return toolJson(call.tool, { report });
    }
    case "resumes.delete": {
      const file = await input.resumeStore.deleteResume(requiredString(call.input?.file, "file"));
      return toolJson(call.tool, { deletedResumeFile: file });
    }
    case "evidence.list": {
      return toolJson(call.tool, await input.evidenceStore.listEvidenceRequests());
    }
    case "evidence.note": {
      const title = stringOrUndefined(call.input?.title);
      const result = await input.evidenceStore.saveEvidenceNote({
        content: requiredString(call.input?.content || call.input?.note, "content"),
        ...(title ? { title } : {}),
      });
      return toolJson(call.tool, result);
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

function currentJobImportToolJson(tool: string, input: { url?: string; dryRun?: boolean }, result: Awaited<ReturnType<ReturnType<typeof import("../services/jobsearch-service").createJobSearchService>["importCurrentJob"]>>): string {
  return JSON.stringify({
    tool,
    input,
    connectorKind: "job_board",
    connectorId: "jobsearch",
    connectorLabel: "Ucareer Chrome",
    protocol: "chrome bridge current page import",
    runId: result.runId,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
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
      safety: "tool reads the currently open Boss/Zhipin page through the Ucareer Chrome extension; it never searches extra jobs or submits applications",
    },
    jobs: result.jobs.slice(0, 10).map(toSafeJobSummary),
    omittedJobs: Math.max(0, result.jobs.length - 10),
  }, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { result: value };
}

function normalizeJobSearchInput(input: Record<string, unknown> | undefined): JobSearchRequest {
  const source = stringOrUndefined(input?.source);
  const request: JobSearchRequest = {
    source: source === "codex-chrome" || source === "boss-agent" || source === "china-crawler" || source === "all" ? source : "all",
    city: stringOrUndefined(input?.city) || "深圳",
    max: clampNumber(input?.max, 1, 50, 12),
    minMatchScore: clampNumber(input?.minMatchScore, 0, 5, 0),
    withDetails: input?.withDetails !== false,
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

function normalizeCurrentJobImportInput(input: Record<string, unknown> | undefined): { url?: string; dryRun?: boolean } {
  const request: { url?: string; dryRun?: boolean } = {
    dryRun: Boolean(input?.dryRun),
  };
  const url = stringOrUndefined(input?.url);
  if (url) request.url = url;
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
  setIfDefined(out, "jdPath", job.jdPath);
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
  const emailSnapshot = normalizeEmailSnapshot(input?.email_snapshot || input?.emailSnapshot);
  if (emailSnapshot) request.email_snapshot = emailSnapshot;
  const applicationId = stringOrUndefined(input?.application_id || input?.applicationId);
  const date = stringOrUndefined(input?.date);
  if (applicationId) request.application_id = applicationId;
  if (date) request.date = date;
  return request;
}

async function buildRecommendedApplicationEvent(input: {
  applicationStore: ReturnType<typeof import("../stores/application-store").createApplicationStore>;
  message: EmailMessageSummary | undefined;
  request: ImportEmailMessagesRequest;
}): Promise<CreateApplicationEventRequest | undefined> {
  if (!input.message || !hasOfferSearchIntent(input.request) || scoreOfferMessage(input.message) < 6) return undefined;
  const overview = await input.applicationStore.listApplications();
  const company = extractOfferCompany(input.message);
  const application = company
    ? overview.applications.find((item) => normalizeToolSearchText(item.company).includes(normalizeToolSearchText(company)))
    : undefined;
  const role = application?.role || extractRoleFromOfferMessage(input.message) || "";
  if (!company || !role) return undefined;
  const date = normalizeMailboxMessageDate(input.message.date);
  const due = extractOfferDueDate(input.message.snippet);
  const request: CreateApplicationEventRequest = {
    company,
    role,
    event: "offer",
    source: "qq_email_agent",
    next_action: due
      ? `核对聘用邀请函附件与薪资、试用期、社保公积金、入职时间；如接受需在 ${due} 前邮件回复确认。`
      : "核对聘用邀请函附件与薪资、试用期、社保公积金、入职时间，并确认是否接受。",
    note: compactText(`QQ 邮箱识别到 ${input.message.subject}。${input.message.snippet}`, 500),
    evidence: compactText(`邮件主题：${input.message.subject}；发件人：${input.message.from}；UID：${input.message.uid}。`, 500),
    email_snapshot: {
      uid: input.message.uid,
      mailbox: input.message.mailbox,
      from: input.message.from,
      subject: input.message.subject,
      date: input.message.date,
      snippet: input.message.snippet,
      rawText: input.message.snippet,
      ...(input.message.attachments?.length ? { attachments: input.message.attachments } : {}),
    },
  };
  if (application?.id) request.application_id = application.id;
  if (date) request.date = date;
  if (due) request.due = due;
  return request;
}

function extractOfferCompany(message: EmailMessageSummary): string {
  const subjectCompany = message.subject.match(/^(.+?)(?:聘用邀请函|聘用邀约|录用通知|offer|Offer)/u)?.[1]?.trim();
  if (subjectCompany) return subjectCompany;
  const snippetCompany = message.snippet.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}(?:有限公司|公司|科技|集团))/u)?.[1]?.trim();
  return snippetCompany || "";
}

function extractRoleFromOfferMessage(message: EmailMessageSummary): string {
  return message.snippet.match(/(?:岗位|职位|职务)[：:]\s*([^\s，。,；;]+)/u)?.[1]?.trim() || "";
}

function normalizeMailboxMessageDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  return formatDateForMailboxSearch(new Date(parsed));
}

function extractOfferDueDate(value: string): string {
  const match = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/u);
  if (!match) return "";
  const [, year, month, day] = match;
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeEmailSnapshot(value: unknown): CreateApplicationEventRequest["email_snapshot"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const snapshot: NonNullable<CreateApplicationEventRequest["email_snapshot"]> = {};
  const uid = stringOrUndefined(input.uid);
  const mailbox = stringOrUndefined(input.mailbox);
  const account = stringOrUndefined(input.account);
  const from = stringOrUndefined(input.from);
  const subject = stringOrUndefined(input.subject);
  const date = stringOrUndefined(input.date);
  const snippet = stringOrUndefined(input.snippet);
  const rawText = stringOrUndefined(input.rawText || input.raw_text);
  if (uid) snapshot.uid = uid;
  if (mailbox) snapshot.mailbox = mailbox;
  if (account) snapshot.account = account;
  if (from) snapshot.from = from;
  if (subject) snapshot.subject = subject;
  if (date) snapshot.date = date;
  if (snippet) snapshot.snippet = snippet;
  if (rawText) snapshot.rawText = rawText;
  const attachments = normalizeEmailAttachments(input.attachments);
  if (attachments.length) snapshot.attachments = attachments;
  return Object.values(snapshot).some(Boolean) ? snapshot : undefined;
}

function normalizeEmailAttachments(value: unknown): EmailAttachmentSummary[] {
  if (!Array.isArray(value)) return [];
  const attachments: EmailAttachmentSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const input = item as Record<string, unknown>;
    const filename = stringOrUndefined(input.filename);
    if (!filename) continue;
    const attachment: EmailAttachmentSummary = {
      filename,
      size: clampNumber(input.size, 0, 1000 * 1000 * 1000, 0),
    };
    const contentType = stringOrUndefined(input.contentType || input.content_type);
    const path = stringOrUndefined(input.path);
    if (contentType) attachment.contentType = contentType;
    if (path) attachment.path = path;
    attachments.push(attachment);
  }
  return attachments;
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

function isBossSearchContainerUrlOnlyImport(input: ImportJobRequest): input is ImportJobRequest & { url: string } {
  if (input.description?.trim()) return false;
  const url = stringOrUndefined(input.url);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /(^|\.)zhipin\.com$/i.test(parsed.hostname) && parsed.pathname === "/web/geek/jobs";
  } catch {
    return false;
  }
}

function normalizeRecordMarketLink(input: Record<string, unknown> | undefined): { url: string; note?: string; source?: string } {
  const request: { url: string; note?: string; source?: string } = {
    url: requiredString(input?.url, "url"),
  };
  const note = stringOrUndefined(input?.note);
  const source = stringOrUndefined(input?.source);
  if (note) request.note = note;
  if (source) request.source = source;
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

function normalizeResumeDiagnosisSave(input: Record<string, unknown> | undefined): { file?: string; title: string; markdown: string; resumeFile?: string; targetJobId?: string } {
  const out: { file?: string; title: string; markdown: string; resumeFile?: string; targetJobId?: string } = {
    title: requiredString(input?.title, "title"),
    markdown: requiredString(input?.markdown, "markdown"),
  };
  const file = stringOrUndefined(input?.file);
  const resumeFile = stringOrUndefined(input?.resumeFile);
  const targetJobId = stringOrUndefined(input?.targetJobId);
  if (file) out.file = file;
  if (resumeFile) out.resumeFile = resumeFile;
  if (targetJobId) out.targetJobId = targetJobId;
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
    targetFile: stringOrUndefined(input?.targetFile) || `${workspaceRelativeDataPath("projectNotes")}/evidence.md`,
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

async function searchMailboxWithFallback(input: {
  email: string;
  authorizationCode: string;
  workspaceRoot: string;
  request: ImportEmailMessagesRequest;
}): Promise<{
  result: Awaited<ReturnType<typeof importQqEmailMessages>>;
  attempts: Array<{ reason: string; input: ImportEmailMessagesRequest; matches: number; used: boolean }>;
}> {
  const attempts: Array<{ reason: string; input: ImportEmailMessagesRequest; matches: number; used: boolean }> = [];
  const candidateMessages = new Map<string, EmailMessageSummary>();
  const isOfferSearch = hasOfferSearchIntent(input.request);
  const initial = await importQqEmailMessages(input);
  for (const message of initial.messages) candidateMessages.set(`${message.mailbox}:${message.uid}`, message);
  const initialRelevantMessages = isOfferSearch ? rankRelevantOfferMessages(initial.messages) : initial.messages;
  attempts.push({ reason: "initial", input: input.request, matches: initial.messages.length, used: initialRelevantMessages.length > 0 });
  if (!isOfferSearch && initial.messages.length) return { result: initial, attempts };
  if (isOfferSearch && initialRelevantMessages.length) {
    return { result: { ...initial, messages: await withOfferAttachments(input, initialRelevantMessages) }, attempts };
  }

  for (const retry of buildMailboxRetryPlan(input.request)) {
    if (isSameMailboxSearchInput(retry.input, input.request)) continue;
    const result = await importQqEmailMessages({
      email: input.email,
      authorizationCode: input.authorizationCode,
      request: retry.input,
    });
    for (const message of result.messages) candidateMessages.set(`${message.mailbox}:${message.uid}`, message);
    const relevantMessages = isOfferSearch ? rankRelevantOfferMessages([...candidateMessages.values()]) : result.messages;
    attempts.push({ reason: retry.reason, input: retry.input, matches: result.messages.length, used: relevantMessages.length > 0 });
    if (!isOfferSearch && result.messages.length) return { result, attempts };
    if (isOfferSearch && relevantMessages.length) {
      return { result: { ...result, messages: await withOfferAttachments(input, relevantMessages) }, attempts };
    }
  }
  return { result: initial, attempts };
}

async function withOfferAttachments(input: {
  email: string;
  authorizationCode: string;
  workspaceRoot: string;
  request: ImportEmailMessagesRequest;
}, messages: EmailMessageSummary[]): Promise<EmailMessageSummary[]> {
  const [first, ...rest] = messages;
  if (!first || scoreOfferMessage(first) < 6) return messages;
  try {
    const attachments = await importQqEmailAttachments({
      email: input.email,
      authorizationCode: input.authorizationCode,
      mailbox: first.mailbox || input.request.mailbox || "INBOX",
      uid: first.uid,
      outputDir: joinWorkspaceDataPath(input.workspaceRoot, "emailAttachments", sanitizeAttachmentFolderName(`offer-${first.uid}`)),
      workspaceRoot: input.workspaceRoot,
    });
    return [{ ...first, attachments }, ...rest];
  } catch (cause) {
    return [{
      ...first,
      attachments: [{
        filename: "附件拉取失败",
        size: 0,
        path: cause instanceof Error ? cause.message : "QQ 邮箱附件读取失败",
      }],
    }, ...rest];
  }
}

function hasOfferSearchIntent(request: ImportEmailMessagesRequest): boolean {
  return /offer|录用|聘用|邀约|邀请函|入职|恭喜/i.test([
    request.from,
    request.subject,
    request.content,
  ].filter(Boolean).join(" "));
}

function rankRelevantOfferMessages(messages: EmailMessageSummary[]): EmailMessageSummary[] {
  return messages
    .map((message) => ({ message, score: scoreOfferMessage(message) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.message.date) - Date.parse(left.message.date))
    .map((item) => item.message);
}

function scoreOfferMessage(message: EmailMessageSummary): number {
  const text = normalizeToolSearchText(`${message.from} ${message.subject} ${message.snippet}`);
  let score = 0;
  if (/聘用邀请函|聘用邀约|聘用|录用|入职|offer letter|正式 offer|正式offer|恭喜/u.test(text)) score += 5;
  if (/hr|招聘|人力资源|hire|recruit|talent|飞书|feishu|xsparkai|无界智航/u.test(text)) score += 3;
  if (/面试邀约|现场面试|视频面试|测评|笔试/u.test(text)) score += 2;
  if (/github|actions|run failed|pull request|ci|workflow/u.test(text)) score -= 6;
  if (/newsletter|pricing|release|digest/u.test(text)) score -= 3;
  return score;
}

function sanitizeAttachmentFolderName(value: string): string {
  return String(value || "mail").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "mail";
}

function normalizeToolSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildMailboxRetryPlan(request: ImportEmailMessagesRequest): Array<{ reason: string; input: ImportEmailMessagesRequest }> {
  const base: ImportEmailMessagesRequest = {
    mailbox: request.mailbox || "INBOX",
    limit: Math.min(Math.max(Number(request.limit || 20), 20), 50),
    offset: 0,
    query: request.query || "all",
    snippetBytes: Math.max(Number(request.snippetBytes || 4000), 4000),
    ...(request.sinceDate ? { sinceDate: request.sinceDate } : {}),
    ...(request.beforeDate ? { beforeDate: request.beforeDate } : {}),
  };
  const plan: Array<{ reason: string; input: ImportEmailMessagesRequest }> = [];
  if (request.subject) {
    plan.push({
      reason: "只保留主题关键词，去掉 from/content，避免 HR 个人邮箱或正文摘要不匹配导致漏掉。",
      input: { ...base, subject: request.subject },
    });
  }
  if (request.content) {
    plan.push({
      reason: "只保留正文关键词，去掉 from/subject，适合公司名在正文签名或 offer 正文里出现的情况。",
      input: { ...base, content: request.content },
    });
  }
  if (request.from && (request.subject || request.content)) {
    plan.push({
      reason: "去掉 from 限制，因为 offer 可能来自 HR 个人邮箱或第三方招聘系统。",
      input: {
        ...base,
        ...(request.subject ? { subject: request.subject } : {}),
        ...(request.content ? { content: request.content } : {}),
      },
    });
  }
  plan.push({
    reason: "按中文 offer 常见词宽搜主题，不限定公司和发件人，避开只搜英文 offer 的噪声。",
    input: { ...base, subject: "录用 聘用 邀请函 恭喜 入职" },
  });
  plan.push({
    reason: "按中文 offer 常见词宽搜正文，不限定公司和发件人。",
    input: { ...base, content: "录用 聘用 邀请函 恭喜 入职" },
  });
  plan.push({
    reason: "按英文 offer 词兜底，但结果需要相关性筛选，避免 GitHub/项目名噪声。",
    input: { ...base, content: "offer offer letter employment" },
  });
  return plan.slice(0, 6);
}

function isSameMailboxSearchInput(left: ImportEmailMessagesRequest, right: ImportEmailMessagesRequest): boolean {
  return JSON.stringify(normalizeMailboxSearchInputForCompare(left)) === JSON.stringify(normalizeMailboxSearchInputForCompare(right));
}

function normalizeMailboxSearchInputForCompare(input: ImportEmailMessagesRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["mailbox", "limit", "offset", "query", "snippetBytes", "sinceDate", "beforeDate", "from", "subject", "content"] as const) {
    const value = input[key];
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
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
