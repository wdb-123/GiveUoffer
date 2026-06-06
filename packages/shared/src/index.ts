export type EntityId = string;

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionAction =
  | "read_files"
  | "write_files"
  | "delete_files"
  | "run_shell"
  | "install_package"
  | "network_access"
  | "git_commit"
  | "git_push"
  | "open_browser"
  | "send_application"
  | "sync_cloud";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CareerJob {
  id: EntityId;
  title: string;
  company: string;
  url?: string;
  source?: string;
  status: "new" | "evaluated" | "applied" | "discarded" | "interview" | "offer" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface MarketJob {
  id: EntityId;
  company?: string;
  role?: string;
  location?: string;
  salary?: string;
  source?: string;
  url?: string;
  direction?: string;
  keywords?: string[];
  matchScore?: number;
  fitReason?: string;
  evidenceGap?: string;
  platform?: string;
}

export interface RecruitmentMarket {
  updatedAt: string;
  jobs: MarketJob[];
  platforms?: unknown[];
  lastSearch?: unknown;
  jobsCount?: number;
}

export interface ApplicationSummary {
  id: EntityId;
  date: string;
  company: string;
  role: string;
  score: number;
  scoreRaw: string;
  status: string;
  statusKey: string;
  pdf: string;
  reportLabel: string;
  reportPath: string;
  notes: string;
  eventCount?: number;
  latestEvent?: ApplicationEvent;
}

export interface ApplicationsOverview {
  applications: ApplicationSummary[];
  metrics: {
    total: number;
    evaluated: number;
    applied: number;
    interview: number;
    offer: number;
    rejected: number;
  };
}

export interface ApplicationEvent {
  event_id: string;
  date: string;
  application_id: string;
  company: string;
  role: string;
  event: string;
  source: string;
  next_action: string;
  due: string;
  note: string;
  evidence: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateApplicationEventRequest {
  application_id?: string;
  applicationId?: string;
  company?: string;
  companyHint?: string;
  role?: string;
  roleHint?: string;
  event: string;
  date?: string;
  source?: string;
  next_action?: string;
  nextAction?: string;
  due?: string;
  note?: string;
  evidence?: string;
}

export interface UpdateApplicationEventRequest extends Partial<CreateApplicationEventRequest> {
  event_id?: string;
  eventId?: string;
}

export interface DeleteApplicationEventRequest {
  event_id?: string;
  eventId?: string;
}

export interface ExperienceFile {
  name: string;
  path: string;
  title: string;
  kind: string;
  updatedAt: string;
  content: string;
}

export interface ExperienceMetadataItem {
  id: EntityId;
  title: string;
  category: string;
  role: string;
  sourceFile: string;
  summary: string;
  tags: string[];
  evidence: string[];
  gaps: string[];
  publicLevel: string;
  sourceContent?: string;
  sourceError?: string;
}

export interface ExperienceOverview {
  updatedAt: string;
  files: ExperienceFile[];
  photos: Array<ExperienceFile & { dataUrl: string }>;
  intentions: ExperienceFile[];
  experiences: ExperienceMetadataItem[];
}

export interface SaveExperienceMetadataInput {
  metadata: {
    updatedAt?: string;
    experiences: ExperienceMetadataItem[];
  };
}

export interface EvidenceRequest {
  id: EntityId;
  priority: "high" | "medium" | "low" | string;
  status: string;
  direction: string;
  gap: string;
  marketSignal: string;
  currentEvidence: string;
  askHuman: string[];
  targetFile: string;
  resumeImpact: string;
}

export interface EvidenceRequestsOverview {
  updatedAt: string;
  summary: {
    open: number;
    highPriority: number;
    purpose?: string;
  };
  requests: EvidenceRequest[];
}

export interface FulfillEvidenceRequestInput {
  requestId: string;
  content: string;
  source?: string;
}

export interface FulfillEvidenceRequestResult {
  requestId: string;
  targetFile: string;
  appended: boolean;
  appendedAt: string;
}

export interface ResumeVersion {
  id: EntityId;
  file: string;
  title: string;
  targetJobId?: EntityId;
  createdAt: string;
}

export interface ResumeSummary {
  file: string;
  title: string;
  targetJobId: string;
  targetJobTitle: string;
  generatedAt: string;
}

export interface ResumeDocument {
  file: string;
  title: string;
  markdown: string;
}

export interface ReportSummary {
  file: string;
  title: string;
  date: string;
  url: string;
  score: string;
  recommendation: string;
  legitimacy: string;
  excerpt: string;
}

export interface ReportDocument extends ReportSummary {
  markdown: string;
}

export interface ReportsOverview {
  reports: ReportSummary[];
  metrics: {
    total: number;
    withScore: number;
    highLegitimacy: number;
  };
}

export interface CareerProfileOverview {
  candidate: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    github: string;
  };
  headline: string;
  targetRoles: string[];
  cvTitle: string;
  cvMarkdown: string;
  profileYaml: string;
  profileOverlayMarkdown: string;
}

export interface GenerateResumePreviewRequest {
  baseFile: string;
  targetJobId?: string;
}

export interface GenerateResumePreviewResult {
  title: string;
  markdown: string;
  baseFile: string;
  targetJobId: string;
  targetJobTitle: string;
  engine: "local-preview";
}

export interface SaveGeneratedResumeRequest {
  title: string;
  markdown: string;
  baseFile?: string;
  targetJobId?: string;
  targetJobTitle?: string;
}

export interface SaveGeneratedResumeResult {
  file: string;
  title: string;
  baseFile: string;
  targetJobId: string;
  targetJobTitle: string;
  generatedAt: string;
}

export type ResumeExportFormat = "md" | "html" | "pdf" | "docx";

export interface ExportResumeRequest {
  file: string;
  format: ResumeExportFormat;
}

export interface ExportResumeResult {
  file: string;
  sourceFile: string;
  format: ResumeExportFormat;
  outputPath: string;
  sizeBytes: number;
  exportedAt: string;
}

export interface CreateLocalCommandRequest {
  command: string;
  args?: string[];
  cwd?: string;
  label?: string;
}

export interface CreateLocalCommandResult {
  task: AgentTask;
  approval: ApprovalRequest;
}

export interface PushSyncRequest {
  cloudUrl?: string;
  limit?: number;
}

export interface PushSyncResult {
  cloudUrl: string;
  sent: number;
  acceptedIds: number[];
  marked: number;
  cursor: string;
}

export interface ApprovalRequest {
  id: EntityId;
  taskId: EntityId;
  action: PermissionAction;
  risk: RiskLevel;
  summary: string;
  command?: string;
  cwd?: string;
  affectedPaths?: string[];
  createdAt: string;
}

export interface ProviderInstallStatus {
  providerId: EntityId;
  installed: boolean;
  version?: string;
  path?: string;
  message?: string;
  checkedAt: string;
}

export interface ProviderSummary {
  id: EntityId;
  label: string;
  capabilities: {
    structuredRunner: boolean;
    ptyRunner: boolean;
    resumeSession: boolean;
    approvals: boolean;
    mcp: boolean;
  };
}

export interface AgentTask {
  id: EntityId;
  providerId: EntityId;
  workspacePath: string;
  prompt: string;
  mode: "structured" | "pty";
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentTaskRequest {
  providerId: EntityId;
  workspacePath?: string;
  prompt: string;
  mode?: "structured" | "pty";
}

export interface ApprovalDecisionRequest {
  decision: "allow_once" | "allow_task" | "allow_workspace" | "deny";
  note?: string;
}

export type AgentEvent =
  | { type: "message"; role: "user" | "assistant" | "system"; text: string; createdAt: string }
  | {
      type: "command";
      command: string;
      cwd: string;
      status: "requested" | "running" | "done" | "failed";
      createdAt: string;
    }
  | { type: "file_change"; path: string; diff?: string; summary?: string; createdAt: string }
  | { type: "approval_request"; approval: ApprovalRequest; createdAt: string }
  | { type: "task_status"; taskId: EntityId; status: TaskStatus; createdAt: string }
  | { type: "error"; message: string; provider?: string; createdAt: string };
