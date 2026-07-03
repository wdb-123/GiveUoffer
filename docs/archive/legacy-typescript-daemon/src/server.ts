import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import type { ApiEnvelope } from "@ucareer/shared";
import { createApplicationStore } from "./stores/application-store";
import { createAuthStore } from "./stores/auth-store";
import { createConnectorCredentialStore } from "./stores/connector-credential-store";
import { createEvidenceStore } from "./stores/evidence-store";
import { createExperienceStore } from "./stores/experience-store";
import { createDaemonRuntime } from "./index";
import { createMarketStore } from "./stores/market-store";
import { createPaperclipAdapterProviders } from "./providers/paperclip-adapter-provider";
import { createProviderDefinitions } from "./providers/provider-definitions";
import { createProfileStore } from "./stores/profile-store";
import { createReportStore } from "./stores/report-store";
import { registerAgentRoutes } from "./routes/agent-routes";
import { registerApplicationRoutes } from "./routes/application-routes";
import { registerAttachmentRoutes } from "./routes/attachment-routes";
import { registerAuthRoutes } from "./routes/auth-routes";
import { registerBillingRoutes } from "./routes/billing-routes";
import { registerChromeBridgeRoutes } from "./routes/chrome-bridge-routes";
import { registerConnectorRoutes } from "./routes/connector-routes";
import type { DaemonRouteContext } from "./routes/context";
import { error, ok, readSessionToken } from "./routes/context";
import { registerEvidenceRoutes } from "./routes/evidence-routes";
import { registerExperienceRoutes } from "./routes/experience-routes";
import { registerFileRoutes } from "./routes/file-routes";
import { registerMarketRoutes } from "./routes/market-routes";
import { registerProfileRoutes } from "./routes/profile-routes";
import { registerReportRoutes } from "./routes/report-routes";
import { registerResumeRoutes } from "./routes/resume-routes";
import { registerSearchRoutes } from "./routes/search-routes";
import { registerSyncRoutes } from "./routes/sync-routes";
import { registerWorkflowRoutes } from "./routes/workflow-routes";
import { createAttachmentParserService } from "./services/attachment-parser-service";
import { recoverInterruptedAgentExecutions } from "./services/agent-execution-recovery-service";
import { createChromeBridgeService } from "./services/chrome-bridge-service";
import { createJobSearchService } from "./services/jobsearch-service";
import { createRoutePreviewService } from "./services/route-preview-service";
import { createResumeExportService } from "./services/resume-export-service";
import { createWorkspaceFilePreviewService } from "./services/workspace-file-preview-service";
import { createWorkflowRunService } from "./services/workflow-run-service";
import { createMemoryService } from "./memory";
import { createResumeStore } from "./stores/resume-store";
import { createSqliteTaskStore } from "./stores/sqlite-task-store";
import { createSqliteWorkflowRunStore } from "./stores/workflow-run-store";

const port = Number(process.env.PORT || 54321);
const host = process.env.HOST || "127.0.0.1";
const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const daemonDbPath = resolve(workspaceRoot, ".ucareer/daemon.sqlite");

const runtime = createDaemonRuntime({
  workspaceRoot,
  providers: createPaperclipAdapterProviders({
    definitions: createProviderDefinitions(),
  }),
});

const authStore = createAuthStore(daemonDbPath);
const recoveryResult = recoverInterruptedAgentExecutions({ daemonDbPath });
if (recoveryResult.failedRunning > 0 || recoveryResult.failedQueued > 0) {
  console.warn(JSON.stringify({
    event: "ucareer.agent_execution_recovery",
    ...recoveryResult,
  }));
}
const taskStore = createSqliteTaskStore(daemonDbPath);
const workflowRunStore = createSqliteWorkflowRunStore(daemonDbPath);
const app = Fastify({ logger: false });
const chromeBridgeService = createChromeBridgeService();

const ctx: DaemonRouteContext = {
  app,
  runtime,
  workspaceRoot,
  daemonDbPath,
  authStore,
  taskStore,
  workflowRunStore,
  stores: {
    applicationStore: createApplicationStore(workspaceRoot),
    connectorCredentialStore: createConnectorCredentialStore(daemonDbPath, workspaceRoot),
    evidenceStore: createEvidenceStore(workspaceRoot),
    experienceStore: createExperienceStore(workspaceRoot),
    marketStore: createMarketStore(workspaceRoot),
    profileStore: createProfileStore(workspaceRoot),
    reportStore: createReportStore(workspaceRoot),
    resumeStore: createResumeStore(workspaceRoot),
  },
  services: {
    attachmentParserService: createAttachmentParserService(workspaceRoot),
    chromeBridgeService,
    jobSearchService: createJobSearchService(workspaceRoot, chromeBridgeService),
    memoryService: createMemoryService(workspaceRoot),
    routePreviewService: createRoutePreviewService({ runtime, workspaceRoot }),
    resumeExportService: createResumeExportService(workspaceRoot),
    workspaceFilePreviewService: createWorkspaceFilePreviewService(workspaceRoot),
    workflowRunService: createWorkflowRunService({ workflowRunStore }),
  },
};

app.setErrorHandler((cause: unknown, _request, reply) => {
  const message = cause instanceof Error ? cause.message : "Internal daemon error";
  reply.code(500).send(error("internal_error", message));
});

app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "content-type,x-ucareer-session");
});

app.options("/*", async (_request, reply) => {
  reply.code(204).send();
});

app.addHook("preHandler", async (request, reply) => {
  if (request.method === "OPTIONS") return;
  if (!request.url.startsWith("/api/") || request.url.startsWith("/api/auth/")) return;
  const session = authStore.getSession(readSessionToken(request));
  if (!session) {
    reply.code(401).send(error("unauthenticated", "A valid Ucareer session is required"));
  }
});

app.get("/health", async (): Promise<ApiEnvelope<{ service: string; workspaceRoot: string }>> => {
  return ok({
    service: "ucareer-daemon-api",
    workspaceRoot: runtime.workspaceRoot,
  });
});

registerAuthRoutes(ctx);
registerBillingRoutes(ctx);
registerChromeBridgeRoutes(ctx);
registerConnectorRoutes(ctx);
registerAttachmentRoutes(ctx);
registerWorkflowRoutes(ctx);
registerProfileRoutes(ctx);
registerMarketRoutes(ctx);
registerReportRoutes(ctx);
registerResumeRoutes(ctx);
registerSearchRoutes(ctx);
registerApplicationRoutes(ctx);
registerExperienceRoutes(ctx);
registerEvidenceRoutes(ctx);
registerFileRoutes(ctx);
registerAgentRoutes(ctx);
registerSyncRoutes(ctx);

app.listen({ host, port }).then((address) => {
  console.log(`Ucareer daemon API: ${address}`);
});
