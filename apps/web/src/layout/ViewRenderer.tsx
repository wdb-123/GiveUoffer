import type {
  AgentEvent,
  AgentAttachment,
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
  ProviderInstallStatus,
  ProviderSummary,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
  JobSearchRequest,
  JobSearchResult,
  JobSearchSource,
  WorkflowRunDetail,
} from "@ucareer/shared";
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
    selectedTaskTurns: AgentTaskTurn[];
    selectedTaskId: string;
    tasks: AgentTask[];
    workflowRunDetail: WorkflowRunDetail | null;
    onCheckProvider(providerId: string): void;
    onCancelTask(taskId?: string): void | Promise<void>;
    onCreateLocalCommand(command: string, args: string): void;
    onCreateTask(promptOverride?: string, permissionMode?: CreateAgentTaskRequest["permissionMode"], attachments?: AgentAttachment[]): void | Promise<void>;
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
  profile: CareerProfileOverview | null;
  reports: {
    data: ReportsOverview | null;
    selectedReport: ReportDocument | null;
    onClearReport(): void;
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
        jobSearch={props.jobSearch}
        onGenerateReport={(job) => props.agent.onCreateTask(buildMarketReportPrompt(job))}
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
      exportResult={props.resumes.exportResult}
      onGeneratePreview={props.resumes.onGeneratePreview}
      onSavePreview={props.resumes.onSavePreview}
      onSelectResume={props.resumes.onSelectResume}
      preview={props.resumes.preview}
      resumes={props.resumes.data}
      selectedResume={props.resumes.selectedResume}
    />
  );
}

function buildMarketReportPrompt(job: RecruitmentMarket["jobs"][number]): string {
  return `请为这个岗位生成一份评估报告，并按 Ucareer 报告规范写入 workspace/jobs/reports/，必要时更新岗位/投递相关记录。不要提交任何外部申请。

岗位信息：
- ID：${job.id || "未提供"}
- 公司：${job.company || "待复核"}
- 岗位：${job.role || "待复核岗位"}
- 链接：${job.url || "未提供"}
- 地点：${job.location || "未披露"}
- 薪资：${job.salary || "未披露"}
- 来源：${job.source || job.platform || "来源未知"}
- 方向：${job.direction || "未分类"}
- 当前评分：${typeof job.matchScore === "number" ? job.matchScore.toFixed(1) : "未评分"}
- 关键词：${job.keywords?.join("、") || "无"}
- 匹配理由：${job.fitReason || "未记录"}
- 证据缺口：${job.evidenceGap || "未记录"}

要求：
1. 先验证岗位链接是否仍有效；无法确认时在报告里标注。
2. 按匹配度、薪资/职级、方向、风险、证据缺口给出结论。
3. 报告生成后告诉我报告文件名和是否建议投递。`;
}
