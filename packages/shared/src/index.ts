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
  | "start_agent"
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

export type TenantRole = "owner" | "admin" | "member" | "viewer";

export type TenantPermission =
  | "tenant.manage"
  | "users.manage"
  | "agent.run"
  | "agent.approve"
  | "workspace.read"
  | "workspace.write"
  | "applications.read"
  | "applications.write"
  | "billing.view"
  | "sync.cloud";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface TenantSummary {
  id: EntityId;
  name: string;
  slug: string;
  createdAt: string;
}

export interface AccountSummary {
  id: EntityId;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface TenantMembership {
  tenant: TenantSummary;
  role: TenantRole;
  permissions: TenantPermission[];
}

export interface AuthSession {
  token: string;
  account: AccountSummary;
  activeTenant: TenantSummary;
  role: TenantRole;
  permissions: TenantPermission[];
  memberships: TenantMembership[];
  createdAt: string;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface CreateAccountRequest extends LoginRequest {
  displayName?: string;
  tenantName?: string;
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

export interface WorkspaceFilePreview {
  path: string;
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  updatedAt: string;
  content: string;
  previewType: "text" | "pdf" | "docx" | "unsupported";
  languageHint: string;
  truncated: boolean;
  encoding: "utf8" | "binary";
  dataUrl?: string;
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

export interface ProviderContextWindow {
  tokens: number;
  model?: string;
  source: "model_default" | "configured" | "provider_default" | "unknown";
  note?: string;
}

export interface ProviderSummary {
  id: EntityId;
  label: string;
  contextWindow?: ProviderContextWindow;
  capabilities: {
    structuredRunner: boolean;
    ptyRunner: boolean;
    resumeSession: boolean;
    approvals: boolean;
    mcp: boolean;
  };
}

export type ConnectorKind =
  | "local_workspace"
  | "agent_upload"
  | "cloud_sync"
  | "mobile_relay"
  | "mailbox"
  | "calendar"
  | "drive"
  | "job_board"
  | "browser_import";

export type ConnectorStatus = "available" | "planned" | "disabled";

export type ConnectorCapability =
  | "import_files"
  | "import_jobs"
  | "search_messages"
  | "import_events"
  | "export_artifacts"
  | "sync_events"
  | "approval_relay";

export type ConnectorProtocol = "imap";

export interface ConnectorAuthField {
  id: EntityId;
  label: string;
  kind: "email" | "authorization_code";
  required: boolean;
  secret: boolean;
  helpText?: string;
}

export interface ConnectorProtocolConfig {
  type: ConnectorProtocol;
  host: string;
  port: number;
  secure: boolean;
  mode: "readonly";
}

export interface ConnectorDefinition {
  id: EntityId;
  label: string;
  kind: ConnectorKind;
  status: ConnectorStatus;
  description: string;
  capabilities: ConnectorCapability[];
  readScopes: string[];
  writeScopes: string[];
  workspacePaths: string[];
  requiresAuth: boolean;
  syncable: boolean;
  protocol?: ConnectorProtocolConfig;
  authFields?: ConnectorAuthField[];
}

export interface ConnectorRegistryResponse {
  connectors: ConnectorDefinition[];
}

export type JobSearchSourceId = "boss-agent" | "china-crawler" | "portals" | "all";

export interface JobSearchSource {
  id: JobSearchSourceId;
  label: string;
  description: string;
  available: boolean;
  requiresAuth: boolean;
  defaultCity?: string;
}

export interface JobSearchRequest {
  source: JobSearchSourceId;
  city?: string;
  queries?: string[];
  max?: number;
  minMatchScore?: number;
  withDetails?: boolean;
  dryRun?: boolean;
}

export interface JobSearchResult {
  runId: EntityId;
  source: JobSearchSourceId;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  added: number;
  candidatesSeen: number;
  duplicatesSkipped: number;
  failedQueries: number;
  jobs: MarketJob[];
  message?: string;
  marketUpdatedAt?: string;
}

export interface ImportJobRequest {
  url?: string;
  description?: string;
  source?: string;
}

export interface ImportJobResult {
  job: MarketJob;
  imported: boolean;
  marketUpdatedAt: string;
}

export interface TestEmailConnectorRequest {
  email: string;
  authorizationCode: string;
}

export interface TestEmailConnectorResult {
  connectorId: EntityId;
  email: string;
  connected: boolean;
  checkedAt: string;
  protocol: ConnectorProtocolConfig;
  serverGreeting: string;
}

export interface SaveEmailConnectorCredentialRequest extends TestEmailConnectorRequest {
  verifiedAt?: string;
}

export interface ConnectorCredentialSummary {
  connectorId: EntityId;
  account: string;
  secretStored: boolean;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
}

export interface ImportEmailMessagesRequest {
  mailbox?: string;
  limit?: number;
  offset?: number;
  query?: "all" | "unseen";
  sinceDate?: string;
  beforeDate?: string;
  from?: string;
  subject?: string;
  content?: string;
  snippetBytes?: number;
}

export interface EmailMessageSummary {
  uid: string;
  mailbox: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface ImportEmailMessagesResult {
  connectorId: EntityId;
  account: string;
  mailbox: string;
  importedAt: string;
  messages: EmailMessageSummary[];
}

export type SkillRisk = RiskLevel;

export type SkillDomain =
  | "career_profile"
  | "job_intelligence"
  | "resume_engine"
  | "application_crm"
  | "outcome_learning"
  | "agent_workspace";

export interface SkillFileManagement {
  intakeFolder: string;
  acceptedAttachmentKinds: AgentAttachmentKind[];
  acceptedExtensions: string[];
  readPaths: string[];
  writePaths: string[];
  outputArtifacts: string[];
}

export interface ConnectorToolDefinition {
  id: EntityId;
  connectorId: EntityId;
  label: string;
  description: string;
  capability: ConnectorCapability;
  risk: SkillRisk;
  readonly: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface SkillDefinition {
  id: EntityId;
  label: string;
  domain: SkillDomain;
  description: string;
  inputKinds: string[];
  defaultProviderId?: EntityId;
  legacyModeFile?: string;
  risk: SkillRisk;
  fileManagement: SkillFileManagement;
  connectorTools?: ConnectorToolDefinition[];
}

export interface RouteDecision {
  inputKind: string;
  skillId: EntityId;
  workflowId?: EntityId;
  skill: SkillDefinition;
  confidence: "low" | "medium" | "high";
  reason: string;
  recommendedProviderId: EntityId;
  nextAction: "create_agent_task" | "run_local_workflow" | "clarify";
  agentPrompt: string;
}

export type AgentAttachmentKind = "text" | "pdf" | "docx" | "image" | "unknown";

export interface ParsedAttachment {
  kind: AgentAttachmentKind;
  text: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AgentAttachment {
  id: EntityId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AgentAttachmentKind;
  storedPath: string;
  createdAt: string;
  parsed: ParsedAttachment;
}

export interface UploadAgentAttachmentRequest {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  dataBase64: string;
}

export interface SkillRegistryResponse {
  skills: SkillDefinition[];
  workflows?: WorkflowDefinition[];
}

export interface RoutePreviewRequest {
  text?: string;
  attachments?: AgentAttachment[];
  preferredProviderId?: EntityId;
}

export interface AgentTaskRouteMetadata {
  skillId?: EntityId;
  workflowId?: EntityId;
  workflowRunId?: EntityId;
  inputKind?: string;
  sourceText?: string;
  routeDecision?: RouteDecision;
}

export type WorkflowStepKind =
  | "route"
  | "agent_task"
  | "local_command"
  | "read_store"
  | "write_store"
  | "sync"
  | "approval"
  | "manual";

export interface WorkflowStepDefinition {
  id: EntityId;
  label: string;
  kind: WorkflowStepKind;
  skillId?: EntityId;
  requiredPermission?: PermissionAction;
}

export interface WorkflowDefinition {
  id: EntityId;
  label: string;
  description: string;
  skillIds: EntityId[];
  inputKinds: string[];
  steps: WorkflowStepDefinition[];
  defaultProviderId?: EntityId;
  risk: RiskLevel;
}

export interface WorkflowRun {
  id: EntityId;
  workflowId: EntityId;
  skillId?: EntityId;
  taskId?: EntityId;
  currentStepId?: EntityId;
  status: TaskStatus;
  sourceText?: string;
  routeDecision?: RouteDecision;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepRun {
  id: EntityId;
  workflowRunId: EntityId;
  stepId: EntityId;
  status: TaskStatus;
  taskId?: EntityId;
  approvalId?: EntityId;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunDetail {
  run: WorkflowRun;
  steps: WorkflowStepRun[];
  workflow?: WorkflowDefinition;
}

export interface AgentTask {
  id: EntityId;
  providerId: EntityId;
  workspacePath: string;
  prompt: string;
  mode: "structured" | "pty";
  status: TaskStatus;
  skillId?: EntityId;
  workflowId?: EntityId;
  workflowRunId?: EntityId;
  inputKind?: string;
  sourceText?: string;
  routeDecision?: RouteDecision;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentTaskRequest {
  providerId: EntityId;
  workspacePath?: string;
  prompt: string;
  attachments?: AgentAttachment[];
  mode?: "structured" | "pty";
  continueTaskId?: EntityId;
  permissionMode?: "default" | "auto_review" | "full_access";
  routeMetadata?: AgentTaskRouteMetadata;
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

export interface AgentTaskTurn {
  id: EntityId;
  taskId: EntityId;
  index: number;
  question: Extract<AgentEvent, { type: "message" }> | null;
  answer: Extract<AgentEvent, { type: "message" }> | null;
  processEvents: AgentEvent[];
  events: AgentEvent[];
  startedAt: string;
  updatedAt: string;
  status: "pending" | "answered" | "running" | "failed" | "system";
}
