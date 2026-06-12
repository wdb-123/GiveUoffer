import type {
  AgentEvent,
  AgentAttachment,
  AgentTask,
  AgentTaskTurn,
  ApplicationsOverview,
  AuthSession,
  CreateAccountRequest,
  CreateApplicationEventRequest,
  DeleteApplicationEventRequest,
  EvidenceRequestsOverview,
  ExportResumeRequest,
  ExportResumeResult,
  FulfillEvidenceRequestInput,
  FulfillEvidenceRequestResult,
  GenerateResumePreviewRequest,
  GenerateResumePreviewResult,
  ImportEmailMessagesRequest,
  ImportEmailMessagesResult,
  ImportJobRequest,
  ImportJobResult,
  ExperienceOverview,
  ApiEnvelope,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CareerProfileOverview,
  CreateAgentTaskRequest,
  CreateLocalCommandRequest,
  CreateLocalCommandResult,
  LoginRequest,
  ProviderInstallStatus,
  ProviderSummary,
  PushSyncRequest,
  PushSyncResult,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  RouteDecision,
  RoutePreviewRequest,
  ResumeDocument,
  ResumeSummary,
  SaveExperienceMetadataInput,
  SaveGeneratedResumeRequest,
  SaveGeneratedResumeResult,
  JobSearchRequest,
  JobSearchResult,
  JobSearchSource,
  UpdateApplicationEventRequest,
  UploadAgentAttachmentRequest,
  WorkspaceFilePreview,
  WorkflowRun,
  WorkflowRunDetail,
} from "@ucareer/shared";

const API_BASE =
  import.meta.env.VITE_DAEMON_API_URL || (typeof window !== "undefined"
    ? `http://${window.location.hostname || "127.0.0.1"}:54321`
    : "http://127.0.0.1:54321");
let sessionToken = "";

export function setApiSessionToken(token: string): void {
  sessionToken = token;
}

export async function login(input: LoginRequest): Promise<AuthSession> {
  return unwrap(
    await request<ApiEnvelope<AuthSession>>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function createAccount(input: CreateAccountRequest): Promise<AuthSession> {
  return unwrap(
    await request<ApiEnvelope<AuthSession>>("/api/auth/create-account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getAuthSession(token: string): Promise<AuthSession | null> {
  return unwrap(await request<ApiEnvelope<AuthSession | null>>("/api/auth/session", { headers: sessionHeaders(token) }));
}

export async function logout(token: string): Promise<{ loggedOut: boolean }> {
  return unwrap(
    await request<ApiEnvelope<{ loggedOut: boolean }>>("/api/auth/logout", {
      method: "POST",
      headers: sessionHeaders(token),
    }),
  );
}

export async function getProviders(): Promise<ProviderSummary[]> {
  return unwrap(await request<ApiEnvelope<ProviderSummary[]>>("/api/providers"));
}

export async function checkProvider(providerId: string): Promise<ProviderInstallStatus> {
  return unwrap(
    await request<ApiEnvelope<ProviderInstallStatus>>(`/api/providers/${encodeURIComponent(providerId)}/check`, {
      method: "POST",
    }),
  );
}

export async function createAgentTask(input: CreateAgentTaskRequest): Promise<AgentTask | { task: AgentTask; approval: ApprovalRequest }> {
  return unwrap(
    await request<ApiEnvelope<AgentTask | { task: AgentTask; approval: ApprovalRequest }>>("/api/agent-tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function uploadAgentAttachment(input: UploadAgentAttachmentRequest): Promise<AgentAttachment> {
  return unwrap(
    await request<ApiEnvelope<AgentAttachment>>("/api/agent-attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function previewAgentRoute(input: RoutePreviewRequest): Promise<RouteDecision> {
  return unwrap(
    await request<ApiEnvelope<RouteDecision>>("/api/agent-route/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function importEmailMessages(input: ImportEmailMessagesRequest): Promise<ImportEmailMessagesResult> {
  return unwrap(
    await request<ApiEnvelope<ImportEmailMessagesResult>>("/api/connectors/qq-email/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getWorkflowRuns(): Promise<WorkflowRun[]> {
  return unwrap(await request<ApiEnvelope<WorkflowRun[]>>("/api/workflow-runs"));
}

export async function getWorkflowRun(runId: string): Promise<WorkflowRunDetail> {
  return unwrap(await request<ApiEnvelope<WorkflowRunDetail>>(`/api/workflow-runs/${encodeURIComponent(runId)}`));
}

export async function createLocalCommand(input: CreateLocalCommandRequest): Promise<CreateLocalCommandResult> {
  return unwrap(
    await request<ApiEnvelope<CreateLocalCommandResult>>("/api/local-commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getApprovals(): Promise<ApprovalRequest[]> {
  return unwrap(await request<ApiEnvelope<ApprovalRequest[]>>("/api/approvals"));
}

export async function decideApproval(approvalId: string, input: ApprovalDecisionRequest): Promise<unknown> {
  return unwrap(
    await request<ApiEnvelope<unknown>>(`/api/approvals/${encodeURIComponent(approvalId)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getAgentTasks(): Promise<AgentTask[]> {
  return unwrap(await request<ApiEnvelope<AgentTask[]>>("/api/agent-tasks"));
}

export async function getAgentTask(taskId: string): Promise<AgentTask> {
  return unwrap(await request<ApiEnvelope<AgentTask>>(`/api/agent-tasks/${encodeURIComponent(taskId)}`));
}

export async function deleteAgentTask(taskId: string): Promise<AgentTask> {
  return unwrap(
    await request<ApiEnvelope<AgentTask>>(`/api/agent-tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    }),
  );
}

export async function cancelAgentTask(taskId: string): Promise<AgentTask> {
  return unwrap(
    await request<ApiEnvelope<AgentTask>>(`/api/agent-tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
    }),
  );
}

export async function getAgentTaskEvents(taskId: string): Promise<AgentEvent[]> {
  return unwrap(await request<ApiEnvelope<AgentEvent[]>>(`/api/agent-tasks/${encodeURIComponent(taskId)}/events`));
}

export async function getAgentTaskTurns(taskId: string): Promise<AgentTaskTurn[]> {
  return unwrap(await request<ApiEnvelope<AgentTaskTurn[]>>(`/api/agent-tasks/${encodeURIComponent(taskId)}/turns`));
}

export async function getWorkspaceFilePreview(path: string): Promise<WorkspaceFilePreview> {
  return unwrap(await request<ApiEnvelope<WorkspaceFilePreview>>(`/api/workspace-file?path=${encodeURIComponent(path)}`));
}

export interface AgentTaskSnapshot {
  task: AgentTask;
  events: AgentEvent[];
  turns?: AgentTaskTurn[];
  approvals: ApprovalRequest[];
}

export function subscribeAgentTaskEvents(
  taskId: string,
  onSnapshot: (snapshot: AgentTaskSnapshot) => void,
  onError?: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(apiUrl(`/api/agent-tasks/${encodeURIComponent(taskId)}/events/stream`), {
        headers: sessionHeaders(sessionToken),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Agent event stream failed: ${response.status}`);
      if (!response.body) throw new Error("Agent event stream is not readable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        frames.forEach((frame) => {
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) return;
          onSnapshot(JSON.parse(data) as AgentTaskSnapshot);
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => controller.abort();
}

export async function pushSyncToCloud(input: PushSyncRequest = {}): Promise<PushSyncResult> {
  return unwrap(
    await request<ApiEnvelope<PushSyncResult>>("/api/sync/push-to-cloud", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getResumes(): Promise<ResumeSummary[]> {
  return unwrap(await request<ApiEnvelope<ResumeSummary[]>>("/api/resumes"));
}

export async function getResume(file: string): Promise<ResumeDocument> {
  return unwrap(await request<ApiEnvelope<ResumeDocument>>(`/api/resume?file=${encodeURIComponent(file)}`));
}

export async function generateResumePreview(input: GenerateResumePreviewRequest): Promise<GenerateResumePreviewResult> {
  return unwrap(
    await request<ApiEnvelope<GenerateResumePreviewResult>>("/api/resumes/generate-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function saveGeneratedResume(input: SaveGeneratedResumeRequest): Promise<SaveGeneratedResumeResult> {
  return unwrap(
    await request<ApiEnvelope<SaveGeneratedResumeResult>>("/api/resumes/save-generated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function exportResume(input: ExportResumeRequest): Promise<ExportResumeResult> {
  return unwrap(
    await request<ApiEnvelope<ExportResumeResult>>("/api/resumes/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function downloadExportedResume(file: string): Promise<Blob> {
  return requestBlob(`/api/resumes/export-file?file=${encodeURIComponent(file)}`);
}

export async function getRecruitmentMarket(): Promise<RecruitmentMarket> {
  return unwrap(await request<ApiEnvelope<RecruitmentMarket>>("/api/recruitment-market"));
}

export async function importMarketJob(input: ImportJobRequest): Promise<ImportJobResult> {
  return unwrap(
    await request<ApiEnvelope<ImportJobResult>>("/api/recruitment-market/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getJobSearchSources(): Promise<JobSearchSource[]> {
  return unwrap(await request<ApiEnvelope<JobSearchSource[]>>("/api/search/jobsearch/sources"));
}

export async function runJobSearch(input: JobSearchRequest): Promise<JobSearchResult> {
  return unwrap(
    await request<ApiEnvelope<JobSearchResult>>("/api/search/jobsearch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getProfileOverview(): Promise<CareerProfileOverview> {
  return unwrap(await request<ApiEnvelope<CareerProfileOverview>>("/api/profile-overview"));
}

export async function getReports(): Promise<ReportsOverview> {
  return unwrap(await request<ApiEnvelope<ReportsOverview>>("/api/reports"));
}

export async function getReport(file: string): Promise<ReportDocument> {
  return unwrap(await request<ApiEnvelope<ReportDocument>>(`/api/report?file=${encodeURIComponent(file)}`));
}

export async function getApplications(): Promise<ApplicationsOverview> {
  return unwrap(await request<ApiEnvelope<ApplicationsOverview>>("/api/applications"));
}

export async function createApplicationEvent(input: CreateApplicationEventRequest): Promise<unknown> {
  return unwrap(
    await request<ApiEnvelope<unknown>>("/api/application-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateApplicationEvent(input: UpdateApplicationEventRequest): Promise<unknown> {
  return unwrap(
    await request<ApiEnvelope<unknown>>("/api/application-events/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteApplicationEvent(input: DeleteApplicationEventRequest): Promise<unknown> {
  return unwrap(
    await request<ApiEnvelope<unknown>>("/api/application-events/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getExperienceOverview(): Promise<ExperienceOverview> {
  return unwrap(await request<ApiEnvelope<ExperienceOverview>>("/api/experience-overview"));
}

export async function saveExperienceMetadata(input: SaveExperienceMetadataInput): Promise<ExperienceOverview> {
  return unwrap(
    await request<ApiEnvelope<ExperienceOverview>>("/api/experience-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getEvidenceRequests(): Promise<EvidenceRequestsOverview> {
  return unwrap(await request<ApiEnvelope<EvidenceRequestsOverview>>("/api/evidence-requests"));
}

export async function fulfillEvidenceRequest(input: FulfillEvidenceRequestInput): Promise<FulfillEvidenceRequestResult> {
  return unwrap(
    await request<ApiEnvelope<FulfillEvidenceRequestResult>>("/api/evidence-requests/fulfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (sessionToken && !headers.has("x-ucareer-session")) headers.set("x-ucareer-session", sessionToken);
  const response = await fetch(apiUrl(path), { ...init, headers });
  return (await response.json()) as T;
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const headers = new Headers(init?.headers);
  if (sessionToken && !headers.has("x-ucareer-session")) headers.set("x-ucareer-session", sessionToken);
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const envelope = (await response.json()) as ApiEnvelope<unknown>;
    throw new Error(envelope.ok ? "Download failed" : envelope.error?.message || "Download failed");
  }
  return response.blob();
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function sessionHeaders(token: string): HeadersInit {
  return token ? { "x-ucareer-session": token } : {};
}

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.ok || envelope.data === undefined) {
    throw new Error(envelope.error?.message || "API request failed");
  }
  return envelope.data;
}
