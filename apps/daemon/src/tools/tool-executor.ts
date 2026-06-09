import type { EmailMessageSummary, ImportEmailMessagesRequest, JobSearchRequest, MarketJob } from "@ucareer/shared";
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
  jobSearchService: ReturnType<typeof import("../services/jobsearch-service").createJobSearchService>;
}): AgentToolExecutor {
  return {
    async execute(call) {
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
      if (call.tool !== "mailbox.search_messages") {
        throw new Error(`Unsupported tool: ${call.tool}`);
      }
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

function normalizeJobSearchInput(input: Record<string, unknown> | undefined): JobSearchRequest {
  const source = stringOrUndefined(input?.source);
  const request: JobSearchRequest = {
    source: source === "china-crawler" || source === "all" ? source : "boss-agent",
    city: stringOrUndefined(input?.city) || "深圳",
    max: clampNumber(input?.max, 1, 100, 25),
    minMatchScore: clampNumber(input?.minMatchScore, 0, 5, 0),
    withDetails: Boolean(input?.withDetails),
    dryRun: Boolean(input?.dryRun),
  };
  if (Array.isArray(input?.queries)) {
    const queries = input.queries.map((value) => stringOrUndefined(value)).filter((value): value is string => Boolean(value));
    if (queries.length) request.queries = queries.slice(0, 12);
  }
  return request;
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
