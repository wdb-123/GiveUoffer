import type { FastifyInstance } from "fastify";
import type { AgentProvider } from "@ucareer/agent-core";
import type { ApiEnvelope, TenantPermission } from "@ucareer/shared";
import type { AuthStore } from "../stores/auth-store";
import type { DaemonRuntime } from "../index";
import type { TaskStore } from "../stores/task-store";
import type { WorkflowRunStore } from "../stores/workflow-run-store";

export interface DaemonRouteContext {
  app: FastifyInstance;
  runtime: DaemonRuntime;
  workspaceRoot: string;
  daemonDbPath: string;
  authStore: AuthStore;
  taskStore: TaskStore;
  workflowRunStore: WorkflowRunStore;
  stores: {
    applicationStore: ReturnType<typeof import("../stores/application-store").createApplicationStore>;
    connectorCredentialStore: ReturnType<typeof import("../stores/connector-credential-store").createConnectorCredentialStore>;
    evidenceStore: ReturnType<typeof import("../stores/evidence-store").createEvidenceStore>;
    experienceStore: ReturnType<typeof import("../stores/experience-store").createExperienceStore>;
    marketStore: ReturnType<typeof import("../stores/market-store").createMarketStore>;
    profileStore: ReturnType<typeof import("../stores/profile-store").createProfileStore>;
    reportStore: ReturnType<typeof import("../stores/report-store").createReportStore>;
    resumeStore: ReturnType<typeof import("../stores/resume-store").createResumeStore>;
  };
  services: {
    attachmentParserService: ReturnType<typeof import("../services/attachment-parser-service").createAttachmentParserService>;
    chromeBridgeService: ReturnType<typeof import("../services/chrome-bridge-service").createChromeBridgeService>;
    jobSearchService: ReturnType<typeof import("../services/jobsearch-service").createJobSearchService>;
    memoryService: ReturnType<typeof import("../memory").createMemoryService>;
    routePreviewService: ReturnType<typeof import("../services/route-preview-service").createRoutePreviewService>;
    resumeExportService: ReturnType<typeof import("../services/resume-export-service").createResumeExportService>;
    workspaceFilePreviewService: ReturnType<typeof import("../services/workspace-file-preview-service").createWorkspaceFilePreviewService>;
    workflowRunService: ReturnType<typeof import("../services/workflow-run-service").createWorkflowRunService>;
  };
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

export function error<T = never>(code: string, message: string): ApiEnvelope<T> {
  return {
    ok: false,
    error: { code, message },
  };
}

export function readSessionToken(request: { headers: Record<string, string | string[] | undefined> }): string {
  const header = request.headers["x-ucareer-session"];
  return Array.isArray(header) ? header[0] || "" : header || "";
}

export function requirePermission(
  ctx: Pick<DaemonRouteContext, "authStore">,
  request: { headers: Record<string, string | string[] | undefined> },
  permission: TenantPermission,
): ApiEnvelope<never> | undefined {
  const session = ctx.authStore.getSession(readSessionToken(request));
  if (!session) return error("unauthenticated", "A valid Ucareer session is required");
  if (!session.permissions.includes(permission)) {
    return error("forbidden", `Permission required: ${permission}`);
  }
  return undefined;
}

export function toProviderSummary(provider: AgentProvider) {
  return {
    id: provider.id,
    label: provider.label,
    ...(provider.contextWindow ? { contextWindow: provider.contextWindow } : {}),
    capabilities: provider.capabilities,
  };
}
