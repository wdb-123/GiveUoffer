import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import type { AgentProvider } from "@offeru/agent-core";
import { toProviderInstallStatus } from "@offeru/agent-core";
import type {
  AgentEvent,
  AgentTask,
  ApiEnvelope,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  CreateLocalCommandRequest,
  ProviderInstallStatus,
  ProviderSummary,
} from "@offeru/shared";
import { createClaudeProvider } from "@offeru/provider-claude";
import { createCodexProvider } from "@offeru/provider-codex";
import { createGeminiProvider } from "@offeru/provider-gemini";
import { createDaemonRuntime, getProvider } from "./index";
import { createApplicationStore } from "./application-store";
import { createEvidenceStore } from "./evidence-store";
import { createExperienceStore } from "./experience-store";
import { createMarketStore } from "./market-store";
import { createProfileStore } from "./profile-store";
import { createReportStore } from "./report-store";
import { createResumeExportStore } from "./resume-export-store";
import { createResumeStore } from "./resume-store";
import { runApprovedLocalCommand, runApprovedTask } from "./runner";
import { createSqliteTaskStore, listSyncOutbox, markSyncEventsPushed } from "./sqlite-task-store";
import { isInsideOrSameDir } from "./path-guards";

const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "127.0.0.1";
const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const runtime = createDaemonRuntime({
  workspaceRoot,
  providers: [createCodexProvider(), createClaudeProvider(), createGeminiProvider()],
});
const daemonDbPath = resolve(workspaceRoot, ".offeru/daemon.sqlite");
const taskStore = createSqliteTaskStore(daemonDbPath);
const resumeStore = createResumeStore(workspaceRoot);
const marketStore = createMarketStore(workspaceRoot);
const profileStore = createProfileStore(workspaceRoot);
const reportStore = createReportStore(workspaceRoot);
const resumeExportStore = createResumeExportStore(workspaceRoot);
const applicationStore = createApplicationStore(workspaceRoot);
const experienceStore = createExperienceStore(workspaceRoot);
const evidenceStore = createEvidenceStore(workspaceRoot);

const app = Fastify({
  logger: false,
});

app.setErrorHandler((cause: unknown, _request, reply) => {
  const message = cause instanceof Error ? cause.message : "Internal daemon error";
  reply.code(500).send(error("internal_error", message));
});

app.addHook("onRequest", async (_request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "content-type");
});

app.options("/*", async (_request, reply) => {
  reply.code(204).send();
});

app.get("/health", async (): Promise<ApiEnvelope<{ service: string; workspaceRoot: string }>> => {
  return ok({
    service: "offeru-daemon-api",
    workspaceRoot: runtime.workspaceRoot,
  });
});

app.get("/api/providers", async (): Promise<ApiEnvelope<ProviderSummary[]>> => {
  return ok(runtime.providers.map(toProviderSummary));
});

app.get("/api/resumes", async () => {
  return ok(await resumeStore.listResumes());
});

app.get("/api/recruitment-market", async () => {
  return ok(await marketStore.getRecruitmentMarket());
});

app.get("/api/profile-overview", async () => {
  return ok(await profileStore.getProfileOverview());
});

app.get("/api/reports", async () => {
  return ok(await reportStore.listReports());
});

app.get<{
  Querystring: { file?: string };
}>("/api/report", async (request) => {
  const file = request.query.file || "";
  const report = await reportStore.getReport(file);
  if (!report) return error("report_not_found", `Report not found: ${file}`);
  return ok(report);
});

app.get("/api/applications", async () => {
  return ok(await applicationStore.listApplications());
});

app.post<{
  Body: import("@offeru/shared").CreateApplicationEventRequest;
}>("/api/application-events", async (request) => {
  return ok({
    event: await applicationStore.createApplicationEvent(request.body),
  });
});

app.post<{
  Body: import("@offeru/shared").UpdateApplicationEventRequest;
}>("/api/application-events/update", async (request) => {
  return ok({
    event: await applicationStore.updateApplicationEvent(request.body),
  });
});

app.post<{
  Body: import("@offeru/shared").DeleteApplicationEventRequest;
}>("/api/application-events/delete", async (request) => {
  return ok({
    deleted: await applicationStore.deleteApplicationEvent(request.body),
  });
});

app.get("/api/experience-overview", async () => {
  return ok(await experienceStore.getExperienceOverview());
});

app.post<{
  Body: import("@offeru/shared").SaveExperienceMetadataInput;
}>("/api/experience-metadata", async (request) => {
  return ok(await experienceStore.saveExperienceMetadata(request.body));
});

app.get("/api/evidence-requests", async () => {
  return ok(await evidenceStore.listEvidenceRequests());
});

app.post<{
  Body: import("@offeru/shared").FulfillEvidenceRequestInput;
}>("/api/evidence-requests/fulfill", async (request) => {
  return ok(await evidenceStore.fulfillEvidenceRequest(request.body));
});

app.get<{
  Querystring: { file?: string };
}>("/api/resume", async (request) => {
  const file = request.query.file || "";
  const resume = await resumeStore.getResume(file);
  if (!resume) return error("resume_not_found", `Resume not found: ${file}`);
  return ok(resume);
});

app.post<{
  Body: import("@offeru/shared").GenerateResumePreviewRequest;
}>("/api/resumes/generate-preview", async (request) => {
  const market = await marketStore.getRecruitmentMarket();
  return ok(await resumeStore.generatePreview(request.body, market.jobs));
});

app.post<{
  Body: import("@offeru/shared").SaveGeneratedResumeRequest;
}>("/api/resumes/save-generated", async (request) => {
  return ok(await resumeStore.saveGeneratedResume(request.body));
});

app.post<{
  Body: import("@offeru/shared").ExportResumeRequest;
}>("/api/resumes/export", async (request) => {
  return ok(await resumeExportStore.exportResume(request.body));
});

app.post<{
  Params: { providerId: string };
}>("/api/providers/:providerId/check", async (request): Promise<ApiEnvelope<ProviderInstallStatus>> => {
  const provider = getProvider(runtime, request.params.providerId);
  if (!provider) {
    return error("provider_not_found", `Provider not found: ${request.params.providerId}`);
  }

  return ok(toProviderInstallStatus(provider.id, await provider.checkInstalled()));
});

app.get("/api/agent-tasks", async (): Promise<ApiEnvelope<AgentTask[]>> => {
  return ok(taskStore.listTasks());
});

app.post<{
  Body: CreateAgentTaskRequest;
}>("/api/agent-tasks", async (request): Promise<ApiEnvelope<AgentTask | { task: AgentTask; approval: ApprovalRequest }>> => {
  const body = request.body;
  if (!body?.providerId || !body.prompt?.trim()) {
    return error("invalid_task", "providerId and prompt are required");
  }

  const provider = getProvider(runtime, body.providerId);
  if (!provider) {
    return error("provider_not_found", `Provider not found: ${body.providerId}`);
  }

  const task = taskStore.createTask({
    providerId: body.providerId,
    workspacePath: body.workspacePath || runtime.workspaceRoot,
    prompt: body.prompt.trim(),
    mode: body.mode || "structured",
  });

  await provider.startSession({
    taskId: task.id,
    workspacePath: task.workspacePath,
    prompt: task.prompt,
    mode: task.mode,
  });

  taskStore.appendEvent(task.id, {
    type: "message",
    role: "system",
    text: `${provider.label} session queued. Execution is blocked until approval rules are implemented.`,
    createdAt: new Date().toISOString(),
  });

  const approval = taskStore.createApproval({
    taskId: task.id,
    action: "run_shell",
    risk: "medium",
    summary: `Allow ${provider.label} to start a ${task.mode} agent session`,
    command: provider.id,
    cwd: task.workspacePath,
  });

  return ok({ task: taskStore.getTask(task.id) ?? task, approval });
});

app.post<{
  Body: CreateLocalCommandRequest;
}>("/api/local-commands", async (request): Promise<ApiEnvelope<import("@offeru/shared").CreateLocalCommandResult>> => {
  const body = request.body;
  const command = String(body?.command || "").trim();
  if (!command) return error("invalid_local_command", "command is required");
  const args = Array.isArray(body.args) ? body.args.map((arg) => String(arg)) : [];
  const cwd = resolve(workspaceRoot, body.cwd || ".");
  if (!isInsideOrSameDir(workspaceRoot, cwd)) return error("invalid_cwd", "cwd must stay inside workspace");

  const task = taskStore.createTask({
    providerId: "local-shell",
    workspacePath: cwd,
    prompt: body.label || [command, ...args].join(" "),
    mode: "structured",
  });
  const approval = taskStore.createApproval({
    taskId: task.id,
    action: "run_shell",
    risk: "medium",
    summary: `Run local command: ${[command, ...args].join(" ")}`,
    command: JSON.stringify({ command, args, cwd }),
    cwd,
  });

  return ok({ task: taskStore.getTask(task.id) ?? task, approval });
});

app.get<{
  Params: { taskId: string };
}>("/api/agent-tasks/:taskId", async (request): Promise<ApiEnvelope<AgentTask>> => {
  const task = taskStore.getTask(request.params.taskId);
  if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
  return ok(task);
});

app.get<{
  Params: { taskId: string };
}>("/api/agent-tasks/:taskId/events", async (request): Promise<ApiEnvelope<AgentEvent[]>> => {
  const task = taskStore.getTask(request.params.taskId);
  if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
  return ok(taskStore.listEvents(task.id));
});

app.post<{
  Params: { taskId: string };
}>("/api/agent-tasks/:taskId/cancel", async (request): Promise<ApiEnvelope<AgentTask>> => {
  const task = taskStore.updateTaskStatus(request.params.taskId, "cancelled");
  if (!task) return error("task_not_found", `Task not found: ${request.params.taskId}`);
  return ok(task);
});

app.get("/api/approvals", async (): Promise<ApiEnvelope<ApprovalRequest[]>> => {
  return ok(taskStore.listApprovals());
});

app.post<{
  Params: { approvalId: string };
  Body: ApprovalDecisionRequest;
}>("/api/approvals/:approvalId/decision", async (request) => {
  if (!request.body?.decision) {
    return error("invalid_approval_decision", "decision is required");
  }

  const approval = taskStore.getApproval(request.params.approvalId);
  const decision = taskStore.decideApproval(request.params.approvalId, request.body);
  if (!decision) return error("approval_not_found", `Approval not found: ${request.params.approvalId}`);
  if (decision.decision !== "deny") {
    const task = taskStore.getTask(decision.taskId);
    const provider = task ? getProvider(runtime, task.providerId) : undefined;
    if (task?.providerId === "local-shell" && approval?.command) {
      const execution = parseLocalCommandApproval(approval.command);
      if (!execution) {
        taskStore.appendEvent(task.id, {
          type: "error",
          message: "Local command approval payload is invalid",
          provider: "local-shell",
          createdAt: new Date().toISOString(),
        });
        taskStore.updateTaskStatus(task.id, "failed");
      } else if (task.status === "queued" || task.status === "waiting_approval") {
        runApprovedLocalCommand({ task, taskStore, execution });
      }
    } else if (task && provider) {
      if (task.status === "queued" || task.status === "waiting_approval") {
        runApprovedTask({ task, provider, taskStore });
      } else {
        taskStore.appendEvent(task.id, {
          type: "message",
          role: "system",
          text: `Approval accepted but task is already ${task.status}; runner was not started again.`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }
  return ok(decision);
});

app.get<{
  Querystring: { limit?: string };
}>("/api/sync/outbox", async (request) => {
  const limit = Number(request.query.limit || 100);
  return ok({
    events: listSyncOutbox(daemonDbPath, Number.isFinite(limit) ? limit : 100),
  });
});

app.post<{
  Body: { ids?: number[] };
}>("/api/sync/mark-pushed", async (request) => {
  const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
  return ok({
    marked: markSyncEventsPushed(daemonDbPath, ids),
  });
});

app.post<{
  Body: import("@offeru/shared").PushSyncRequest;
}>("/api/sync/push-to-cloud", async (request) => {
  const cloudUrl = String(request.body?.cloudUrl || process.env.OFFERU_CLOUD_URL || "http://127.0.0.1:4191").replace(/\/+$/, "");
  const limit = Number(request.body?.limit || 100);
  const events = listSyncOutbox(daemonDbPath, Number.isFinite(limit) ? limit : 100);
  const response = await fetch(`${cloudUrl}/sync/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
  const envelope = await response.json() as ApiEnvelope<{ acceptedIds?: number[]; cursor?: string }>;
  if (!envelope.ok) {
    return error("sync_push_failed", envelope.error?.message || "Cloud sync push failed");
  }
  const acceptedIds = Array.isArray(envelope.data?.acceptedIds) ? envelope.data.acceptedIds : [];
  const marked = markSyncEventsPushed(daemonDbPath, acceptedIds);
  return ok({
    cloudUrl,
    sent: events.length,
    acceptedIds,
    marked,
    cursor: envelope.data?.cursor || "",
  });
});

app.listen({ host, port }).then((address) => {
  console.log(`OfferU daemon API: ${address}`);
});

function toProviderSummary(provider: AgentProvider): ProviderSummary {
  return {
    id: provider.id,
    label: provider.label,
    capabilities: provider.capabilities,
  };
}

function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function error<T = never>(code: string, message: string): ApiEnvelope<T> {
  return {
    ok: false,
    error: { code, message },
  };
}

function parseLocalCommandApproval(payload: string): { command: string; args: string[]; cwd: string } | undefined {
  try {
    const parsed = JSON.parse(payload) as { command?: unknown; args?: unknown; cwd?: unknown };
    if (typeof parsed.command !== "string" || typeof parsed.cwd !== "string") return undefined;
    return {
      command: parsed.command,
      args: Array.isArray(parsed.args) ? parsed.args.map((arg) => String(arg)) : [],
      cwd: parsed.cwd,
    };
  } catch {
    return undefined;
  }
}
