import { useEffect, useState } from "react";
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
import {
  checkProvider,
  createAgentTask,
  createApplicationEvent,
  createLocalCommand,
  deleteApplicationEvent,
  decideApproval,
  exportResume,
  fulfillEvidenceRequest,
  generateResumePreview,
  getAgentTaskEvents,
  getAgentTasks,
  getApplications,
  getApprovals,
  getEvidenceRequests,
  getExperienceOverview,
  getProfileOverview,
  getProviders,
  getRecruitmentMarket,
  getReport,
  getReports,
  getResume,
  getResumes,
  pushSyncToCloud,
  saveExperienceMetadata,
  saveGeneratedResume,
  updateApplicationEvent,
} from "../api";
import type { ApplicationEventFormInput } from "../sections/ApplicationsSection";

export interface OfferUDataState {
  applications: ApplicationsOverview | null;
  approvals: ApprovalRequest[];
  evidenceRequests: EvidenceRequestsOverview | null;
  experienceOverview: ExperienceOverview | null;
  installStatus: Record<string, ProviderInstallStatus>;
  market: RecruitmentMarket | null;
  profile: CareerProfileOverview | null;
  prompt: string;
  providers: ProviderSummary[];
  reports: ReportsOverview | null;
  resumeExportResult: ExportResumeResult | null;
  resumePreview: GenerateResumePreviewResult | null;
  resumes: ResumeSummary[];
  selectedProvider: string;
  selectedReport: ReportDocument | null;
  selectedResume: ResumeDocument | null;
  selectedTaskEvents: AgentEvent[];
  selectedTaskId: string;
  status: string;
  tasks: AgentTask[];
}

export function useOfferUData() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [installStatus, setInstallStatus] = useState<Record<string, ProviderInstallStatus>>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskEvents, setSelectedTaskEvents] = useState<AgentEvent[]>([]);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [profile, setProfile] = useState<CareerProfileOverview | null>(null);
  const [selectedResume, setSelectedResume] = useState<ResumeDocument | null>(null);
  const [resumeExportResult, setResumeExportResult] = useState<ExportResumeResult | null>(null);
  const [resumePreview, setResumePreview] = useState<GenerateResumePreviewResult | null>(null);
  const [market, setMarket] = useState<RecruitmentMarket | null>(null);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDocument | null>(null);
  const [applications, setApplications] = useState<ApplicationsOverview | null>(null);
  const [experienceOverview, setExperienceOverview] = useState<ExperienceOverview | null>(null);
  const [evidenceRequests, setEvidenceRequests] = useState<EvidenceRequestsOverview | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("codex");
  const [prompt, setPrompt] = useState("帮我总结当前求职 pipeline 的下一步动作");
  const [status, setStatus] = useState("正在连接本地 daemon...");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const nextProviders = await getProviders();
      setProviders(nextProviders);
      setSelectedProvider((current) => current || nextProviders[0]?.id || "codex");
      setTasks(await getAgentTasks());
      setApprovals(await getApprovals());
      setProfile(await getProfileOverview());
      setResumes(await getResumes());
      setMarket(await getRecruitmentMarket());
      setReports(await getReports());
      setApplications(await getApplications());
      setExperienceOverview(await getExperienceOverview());
      setEvidenceRequests(await getEvidenceRequests());
      setStatus("daemon 已连接");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "daemon 连接失败");
    }
  }

  async function onCheckProvider(providerId: string) {
    const result = await checkProvider(providerId);
    setInstallStatus((current) => ({ ...current, [providerId]: result }));
  }

  async function onCreateTask(promptOverride?: string) {
    const effectivePrompt = (promptOverride || prompt).trim();
    if (!effectivePrompt) return;
    const result = await createAgentTask({
      providerId: selectedProvider,
      prompt: effectivePrompt,
      mode: "structured",
    });
    const taskId = "task" in result ? result.task.id : result.id;
    setStatus(`任务已创建：${taskId}`);
    setTasks(await getAgentTasks());
    setApprovals(await getApprovals());
    await onSelectTask(taskId);
  }

  async function onCreateLocalCommand(command: string, args: string) {
    const result = await createLocalCommand({
      command,
      args: parseCommandArgs(args),
      label: [command, args].filter(Boolean).join(" "),
    });
    setStatus(`本地命令待审批：${result.task.id}`);
    setTasks(await getAgentTasks());
    setApprovals(await getApprovals());
    await onSelectTask(result.task.id);
  }

  async function onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]) {
    await decideApproval(approvalId, { decision });
    setApprovals(await getApprovals());
    setTasks(await getAgentTasks());
    if (selectedTaskId) setSelectedTaskEvents(await getAgentTaskEvents(selectedTaskId));
    setStatus(`审批已提交：${decision}`);
  }

  async function onSelectTask(taskId: string) {
    setSelectedTaskId(taskId);
    setSelectedTaskEvents(await getAgentTaskEvents(taskId));
  }

  async function onRefreshTaskEvents() {
    setTasks(await getAgentTasks());
    setApprovals(await getApprovals());
    if (selectedTaskId) setSelectedTaskEvents(await getAgentTaskEvents(selectedTaskId));
  }

  async function onPushSync() {
    const result = await pushSyncToCloud();
    setStatus(`同步完成：发送 ${result.sent}，确认 ${result.marked}`);
  }

  async function onSelectResume(file: string) {
    setSelectedResume(await getResume(file));
  }

  async function onSelectReport(file: string) {
    setSelectedReport(await getReport(file));
  }

  async function onGenerateResumePreview(baseFile: string, targetJobId: string) {
    const preview = await generateResumePreview({ baseFile, targetJobId });
    setResumePreview(preview);
    setStatus("简历预览已生成");
  }

  async function onSaveResumePreview() {
    if (!resumePreview) return;
    const saved = await saveGeneratedResume({
      title: resumePreview.title,
      markdown: resumePreview.markdown,
      baseFile: resumePreview.baseFile,
      targetJobId: resumePreview.targetJobId,
      targetJobTitle: resumePreview.targetJobTitle,
    });
    setResumes(await getResumes());
    setStatus(`简历已保存：${saved.file}`);
  }

  async function onExportResume(file: string, format: ResumeExportFormat) {
    const result = await exportResume({ file, format });
    setResumeExportResult(result);
    setStatus(`简历已导出：${result.file}`);
  }

  async function onFulfillEvidence(requestId: string, content: string) {
    await fulfillEvidenceRequest({ requestId, content });
    setExperienceOverview(await getExperienceOverview());
    setStatus(`证据已写入：${requestId}`);
  }

  async function onUpdateExperience(id: string, patch?: Partial<Pick<ExperienceOverview["experiences"][number], "title" | "category" | "role" | "sourceFile" | "summary" | "tags" | "evidence" | "gaps" | "publicLevel">>) {
    const item = experienceOverview?.experiences.find((experience) => experience.id === id);
    if (!experienceOverview || !item) return;
    const fallbackPatch = patch ? null : {
      summary: window.prompt("更新经历摘要", item.summary) ?? item.summary,
      evidence: (window.prompt("更新证据（每行一条）", item.evidence.join("\n")) ?? item.evidence.join("\n")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    };
    const nextExperiences = experienceOverview.experiences.map((experience) => (
      experience.id === id
        ? { ...experience, ...(patch || fallbackPatch || {}) }
        : experience
    ));
    const next = await saveExperienceMetadata({
      metadata: {
        updatedAt: experienceOverview.updatedAt,
        experiences: nextExperiences,
      },
    });
    setExperienceOverview(next);
    setStatus(`经历已更新：${item.title}`);
  }

  async function onCreateApplicationEvent(input: ApplicationEventFormInput) {
    await createApplicationEvent(input);
    setApplications(await getApplications());
    setStatus("投递事件已保存");
  }

  async function onUpdateLatestApplicationEvent(applicationId: string) {
    const application = applications?.applications.find((item) => item.id === applicationId);
    const latestEvent = application?.latestEvent;
    if (!latestEvent) return;
    const nextAction = window.prompt("更新下一步动作", latestEvent.next_action || application?.notes || "") ?? latestEvent.next_action;
    await updateApplicationEvent({
      event_id: latestEvent.event_id,
      company: latestEvent.company,
      role: latestEvent.role,
      event: latestEvent.event,
      next_action: nextAction,
      note: latestEvent.note,
      due: latestEvent.due,
      evidence: latestEvent.evidence,
    });
    setApplications(await getApplications());
    setStatus("投递事件已更新");
  }

  async function onDeleteLatestApplicationEvent(eventId: string) {
    if (!eventId) return;
    if (!window.confirm("删除最近投递事件？")) return;
    await deleteApplicationEvent({ event_id: eventId });
    setApplications(await getApplications());
    setStatus("投递事件已删除");
  }

  return {
    state: {
      applications,
      approvals,
      evidenceRequests,
      experienceOverview,
      installStatus,
      market,
      profile,
      prompt,
      providers,
      reports,
      resumeExportResult,
      resumePreview,
      resumes,
      selectedProvider,
      selectedReport,
      selectedResume,
      selectedTaskEvents,
      selectedTaskId,
      status,
      tasks,
    } satisfies OfferUDataState,
    actions: {
      onCheckProvider,
      onCreateApplicationEvent,
      onCreateLocalCommand,
      onCreateTask,
      onDecideApproval,
      onDeleteLatestApplicationEvent,
      onExportResume,
      onFulfillEvidence,
      onGenerateResumePreview,
      onPushSync,
      onRefreshTaskEvents,
      onSaveResumePreview,
      onSelectReport,
      onSelectResume,
      onSelectTask,
      onUpdateExperience,
      onUpdateLatestApplicationEvent,
      setPrompt,
      setSelectedProvider,
    },
  };
}

function parseCommandArgs(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}
