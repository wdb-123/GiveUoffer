import type {
  AgentEvent,
  AgentExecutionQueueOverview,
  AgentAttachment,
  AgentPageContext,
  AgentTask,
  AgentTaskTurn,
  ApplicationsOverview,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CareerProfileOverview,
  CreateAgentTaskRequest,
  EvidenceRequestsOverview,
  ExportResumeResult,
  ExperienceOverview,
  GenerateResumePreviewResult,
  ImportJobRequest,
  ProviderInstallStatus,
  ProviderSummary,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDiagnosisReport,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
  JobSearchRequest,
  JobSearchResult,
  JobSearchSource,
  WorkflowRunDetail,
  AuthSession,
} from "@ucareer/shared";
import { AdminSection } from "../sections/AdminSection";
import { AgentSection } from "../sections/AgentSection";
import { ApplicationsSection, type ApplicationEventFormInput } from "../sections/ApplicationsSection";
import { EvidenceSection } from "../sections/EvidenceSection";
import { ExperienceSection } from "../sections/ExperienceSection";
import { MarketSection } from "../sections/MarketSection";
import { ResumeSection } from "../sections/ResumeSection";
import type { AppView, ViewId } from "../views";
import {
  buildMailboxProgressContext,
  buildMailboxProgressPrompt,
  buildMarketReportContext,
  buildMarketReportPrompt,
  buildResumeDiagnosisContext,
  buildResumeDiagnosisPrompt,
} from "./pageAgentPrompts";

export interface ViewRendererProps {
  activeView: ViewId;
  session: AuthSession;
  views: AppView[];
  onSessionChange(session: AuthSession): void;
  onViewChange(viewId: ViewId): void;
  agent: {
    approvals: ApprovalRequest[];
    executionQueue: AgentExecutionQueueOverview | null;
    installStatus: Record<string, ProviderInstallStatus>;
    prompt: string;
    providers: ProviderSummary[];
    selectedProvider: string;
    selectedTaskEvents: AgentEvent[];
    selectedTaskTurns: AgentTaskTurn[];
    selectedTaskId: string;
    tasks: AgentTask[];
    workflowRunDetail: WorkflowRunDetail | null;
    onCheckProvider(providerId: string): void;
    onCancelTask(taskId?: string): void | Promise<void>;
    onCreateLocalCommand(command: string, args: string): void;
    onCreateTask(promptOverride?: string, permissionMode?: CreateAgentTaskRequest["permissionMode"], attachments?: AgentAttachment[], pageContext?: AgentPageContext): string | Promise<string>;
    onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]): void;
    onPromptChange(value: string): void;
    onProviderChange(value: string): void;
    onRefreshTaskEvents(): void;
    onSelectTask(taskId: string): void;
    onStartNewTask(): void;
    onPushSync(): void;
    onRunJobSearch(input?: Partial<JobSearchRequest>): void;
    jobSearch: {
      sources: JobSearchSource[];
      status: "idle" | "running" | "failed";
      lastResult: JobSearchResult | null;
      error: string;
    };
  };
  applications: {
    data: ApplicationsOverview | null;
    onCreateEvent(input: ApplicationEventFormInput): void;
    onDeleteLatestEvent(eventId: string): void;
    onUpdateLatestEvent(applicationId: string): void;
  };
  evidence: {
    data: EvidenceRequestsOverview | null;
    onFulfillEvidence(requestId: string, content: string): void;
    onSaveEvidenceNote(content: string): void;
  };
  experience: {
    data: ExperienceOverview | null;
    onUpdateExperience(
      id: string,
      patch?: Partial<Pick<ExperienceOverview["experiences"][number], "title" | "category" | "role" | "sourceFile" | "summary" | "tags" | "evidence" | "gaps" | "publicLevel">>
    ): void;
  };
  market: RecruitmentMarket | null;
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
    onSearch(input: JobSearchRequest): void;
  };
  onImportMarketJob(input: ImportJobRequest): Promise<void> | void;
  onDeleteMarketJob(jobId: string): Promise<void> | void;
  profile: CareerProfileOverview | null;
  reports: {
    data: ReportsOverview | null;
    selectedReport: ReportDocument | null;
    onClearReport(): void;
    onSelectReport(file: string): void;
  };
  resumes: {
    data: ResumeSummary[];
    diagnostics: ResumeDiagnosisReport[];
    exportResult: ExportResumeResult | null;
    preview: GenerateResumePreviewResult | null;
    selectedResume: ResumeDocument | null;
    onExportResume(file: string, format: ResumeExportFormat, style?: import("@ucareer/shared").ResumeExportStyle): Promise<void> | void;
    onGeneratePreview(baseFile: string, targetJobId: string): void;
    onSavePreview(): void;
    onSaveResume(file: string, title: string, markdown: string): void;
    onSelectResume(file: string): void;
  };
}

export function ViewRenderer(props: ViewRendererProps) {
  if (props.activeView === "agent") {
    return (
      <AgentSection
        approvals={props.agent.approvals}
        installStatus={props.agent.installStatus}
        onCheckProvider={props.agent.onCheckProvider}
        onCancelTask={props.agent.onCancelTask}
        onDecideApproval={props.agent.onDecideApproval}
        onCreateTask={props.agent.onCreateTask}
        onPromptChange={props.agent.onPromptChange}
        onProviderChange={props.agent.onProviderChange}
        prompt={props.agent.prompt}
        providers={props.agent.providers}
        selectedProvider={props.agent.selectedProvider}
        selectedTaskId={props.agent.selectedTaskId}
        selectedTaskEvents={props.agent.selectedTaskEvents}
        selectedTaskTurns={props.agent.selectedTaskTurns}
        tasks={props.agent.tasks}
        workflowRunDetail={props.agent.workflowRunDetail}
        onSelectTask={props.agent.onSelectTask}
        onStartNewTask={props.agent.onStartNewTask}
        onRunJobSearch={props.agent.onRunJobSearch}
        jobSearch={props.agent.jobSearch}
        workspaceViews={props.views.filter((view) => view.id !== "agent")}
      />
    );
  }

  if (props.activeView === "admin") {
    return (
      <AdminSection
        executionQueue={props.agent.executionQueue}
        installStatus={props.agent.installStatus}
        providers={props.agent.providers}
        session={props.session}
        tasks={props.agent.tasks}
        onSessionChange={props.onSessionChange}
      />
    );
  }

  if (props.activeView === "evidence") {
    return (
      <EvidenceSection
        evidenceRequests={props.evidence.data}
        onFulfillEvidence={props.evidence.onFulfillEvidence}
        onSaveEvidenceNote={props.evidence.onSaveEvidenceNote}
      />
    );
  }
  if (props.activeView === "experience") {
    return (
      <ExperienceSection experienceOverview={props.experience.data} profile={props.profile} onUpdateExperience={props.experience.onUpdateExperience} />
    );
  }
  if (props.activeView === "applications") {
    return (
      <ApplicationsSection
        applications={props.applications.data}
        agentTasks={props.agent.tasks}
        selectedTaskEvents={props.agent.selectedTaskEvents}
        selectedTaskId={props.agent.selectedTaskId}
        onCreateEvent={props.applications.onCreateEvent}
        onFindInterviewEmails={() => props.agent.onCreateTask(buildMailboxProgressPrompt(), undefined, undefined, buildMailboxProgressContext())}
      />
    );
  }
  if (props.activeView === "market") {
    return (
      <MarketSection
        market={props.market}
        jobSearch={props.jobSearch}
        onImportJob={props.onImportMarketJob}
        onDeleteJob={props.onDeleteMarketJob}
        onGenerateReport={(job) => props.agent.onCreateTask(buildMarketReportPrompt(job), undefined, undefined, buildMarketReportContext(job))}
        onClearReport={props.reports.onClearReport}
        onSelectReport={props.reports.onSelectReport}
        reports={props.reports.data}
        selectedReport={props.reports.selectedReport}
      />
    );
  }
  return (
    <ResumeSection
      jobs={props.market?.jobs || []}
      diagnostics={props.resumes.diagnostics}
      exportResult={props.resumes.exportResult}
      agentTasks={props.agent.tasks}
      onExportResume={props.resumes.onExportResume}
      onDiagnoseResume={(file, targetJobId) => props.agent.onCreateTask(buildResumeDiagnosisPrompt({
        file,
        targetJobId,
        selectedResume: props.resumes.selectedResume,
        jobs: props.market?.jobs || [],
      }), undefined, undefined, buildResumeDiagnosisContext(props.resumes.selectedResume))}
      onGeneratePreview={props.resumes.onGeneratePreview}
      onSavePreview={props.resumes.onSavePreview}
      onSaveResume={props.resumes.onSaveResume}
      onSelectResume={props.resumes.onSelectResume}
      preview={props.resumes.preview}
      resumes={props.resumes.data}
      selectedTaskEvents={props.agent.selectedTaskEvents}
      selectedTaskId={props.agent.selectedTaskId}
      selectedTaskTurns={props.agent.selectedTaskTurns}
      selectedResume={props.resumes.selectedResume}
    />
  );
}
