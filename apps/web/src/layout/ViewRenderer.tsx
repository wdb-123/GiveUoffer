import type {
  AgentEvent,
  AgentTask,
  ApplicationsOverview,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CareerProfileOverview,
  EvidenceRequestsOverview,
  ExportResumeResult,
  ExperienceOverview,
  GenerateResumePreviewResult,
  ProviderInstallStatus,
  ProviderSummary,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
} from "@offeru/shared";
import { AgentSection } from "../sections/AgentSection";
import { ApplicationsSection, type ApplicationEventFormInput } from "../sections/ApplicationsSection";
import { EvidenceSection } from "../sections/EvidenceSection";
import { ExperienceSection } from "../sections/ExperienceSection";
import { MarketSection } from "../sections/MarketSection";
import { ResumeSection } from "../sections/ResumeSection";
import type { AppView, ViewId } from "../views";

export interface ViewRendererProps {
  activeView: ViewId;
  views: AppView[];
  onViewChange(viewId: ViewId): void;
  agent: {
    approvals: ApprovalRequest[];
    installStatus: Record<string, ProviderInstallStatus>;
    prompt: string;
    providers: ProviderSummary[];
    selectedProvider: string;
    selectedTaskEvents: AgentEvent[];
    selectedTaskId: string;
    tasks: AgentTask[];
    onCheckProvider(providerId: string): void;
    onCreateLocalCommand(command: string, args: string): void;
    onCreateTask(promptOverride?: string): void;
    onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]): void;
    onPromptChange(value: string): void;
    onProviderChange(value: string): void;
    onRefreshTaskEvents(): void;
    onSelectTask(taskId: string): void;
    onPushSync(): void;
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
  };
  experience: {
    data: ExperienceOverview | null;
    onUpdateExperience(
      id: string,
      patch?: Partial<Pick<ExperienceOverview["experiences"][number], "title" | "category" | "role" | "sourceFile" | "summary" | "tags" | "evidence" | "gaps" | "publicLevel">>
    ): void;
  };
  market: RecruitmentMarket | null;
  profile: CareerProfileOverview | null;
  reports: {
    data: ReportsOverview | null;
    selectedReport: ReportDocument | null;
    onSelectReport(file: string): void;
  };
  resumes: {
    data: ResumeSummary[];
    exportResult: ExportResumeResult | null;
    preview: GenerateResumePreviewResult | null;
    selectedResume: ResumeDocument | null;
    onExportResume(file: string, format: ResumeExportFormat): void;
    onGeneratePreview(baseFile: string, targetJobId: string): void;
    onSavePreview(): void;
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
        onCreateLocalCommand={props.agent.onCreateLocalCommand}
        onCreateTask={props.agent.onCreateTask}
        onDecideApproval={props.agent.onDecideApproval}
        onPromptChange={props.agent.onPromptChange}
        onProviderChange={props.agent.onProviderChange}
        onRefreshTaskEvents={props.agent.onRefreshTaskEvents}
        onSelectTask={props.agent.onSelectTask}
        onPushSync={props.agent.onPushSync}
        onOpenView={props.onViewChange}
        prompt={props.agent.prompt}
        providers={props.agent.providers}
        selectedProvider={props.agent.selectedProvider}
        selectedTaskEvents={props.agent.selectedTaskEvents}
        selectedTaskId={props.agent.selectedTaskId}
        tasks={props.agent.tasks}
        workspaceViews={props.views.filter((view) => view.id !== "agent")}
      />
    );
  }

  if (props.activeView === "evidence") {
    return <EvidenceSection evidenceRequests={props.evidence.data} onFulfillEvidence={props.evidence.onFulfillEvidence} />;
  }
  if (props.activeView === "experience") {
    return <ExperienceSection experienceOverview={props.experience.data} profile={props.profile} onUpdateExperience={props.experience.onUpdateExperience} />;
  }
  if (props.activeView === "applications") {
    return (
      <ApplicationsSection
        applications={props.applications.data}
        onCreateEvent={props.applications.onCreateEvent}
        onDeleteLatestEvent={props.applications.onDeleteLatestEvent}
        onUpdateLatestEvent={props.applications.onUpdateLatestEvent}
      />
    );
  }
  if (props.activeView === "market") {
    return (
      <MarketSection
        market={props.market}
        onSelectReport={props.reports.onSelectReport}
        reports={props.reports.data}
      />
    );
  }
  return (
    <ResumeSection
      jobs={props.market?.jobs || []}
      exportResult={props.resumes.exportResult}
      onExportResume={props.resumes.onExportResume}
      onGeneratePreview={props.resumes.onGeneratePreview}
      onSavePreview={props.resumes.onSavePreview}
      onSelectResume={props.resumes.onSelectResume}
      preview={props.resumes.preview}
      resumes={props.resumes.data}
      selectedResume={props.resumes.selectedResume}
    />
  );
}
