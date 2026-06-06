import type {
  AgentEvent,
  AgentTask,
  ApplicationsOverview,
  CreateApplicationEventRequest,
  DeleteApplicationEventRequest,
  EvidenceRequestsOverview,
  ExportResumeRequest,
  ExportResumeResult,
  FulfillEvidenceRequestInput,
  FulfillEvidenceRequestResult,
  GenerateResumePreviewRequest,
  GenerateResumePreviewResult,
  ExperienceOverview,
  ApiEnvelope,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CareerProfileOverview,
  CreateAgentTaskRequest,
  CreateLocalCommandRequest,
  CreateLocalCommandResult,
  ProviderInstallStatus,
  ProviderSummary,
  PushSyncRequest,
  PushSyncResult,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDocument,
  ResumeSummary,
  SaveExperienceMetadataInput,
  SaveGeneratedResumeRequest,
  SaveGeneratedResumeResult,
  UpdateApplicationEventRequest,
} from "@offeru/shared";

const API_BASE = import.meta.env.VITE_DAEMON_API_URL || "http://127.0.0.1:4180";

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

export async function getAgentTaskEvents(taskId: string): Promise<AgentEvent[]> {
  return unwrap(await request<ApiEnvelope<AgentEvent[]>>(`/api/agent-tasks/${encodeURIComponent(taskId)}/events`));
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

export async function getRecruitmentMarket(): Promise<RecruitmentMarket> {
  return unwrap(await request<ApiEnvelope<RecruitmentMarket>>("/api/recruitment-market"));
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
  const response = await fetch(`${API_BASE}${path}`, init);
  return (await response.json()) as T;
}

function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.ok || envelope.data === undefined) {
    throw new Error(envelope.error?.message || "API request failed");
  }
  return envelope.data;
}
