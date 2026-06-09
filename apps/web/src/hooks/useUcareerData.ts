import { useEffect, useState } from "react";
import type {
  ApplicationsOverview,
  CareerProfileOverview,
  EvidenceRequestsOverview,
  ExportResumeResult,
  ExperienceOverview,
  GenerateResumePreviewResult,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
} from "@ucareer/shared";
import {
  createApplicationEvent,
  deleteApplicationEvent,
  exportResume,
  fulfillEvidenceRequest,
  generateResumePreview,
  getApplications,
  getEvidenceRequests,
  getExperienceOverview,
  getProfileOverview,
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

export interface UcareerDataState {
  applications: ApplicationsOverview | null;
  evidenceRequests: EvidenceRequestsOverview | null;
  experienceOverview: ExperienceOverview | null;
  market: RecruitmentMarket | null;
  profile: CareerProfileOverview | null;
  reports: ReportsOverview | null;
  resumeExportResult: ExportResumeResult | null;
  resumePreview: GenerateResumePreviewResult | null;
  resumes: ResumeSummary[];
  selectedReport: ReportDocument | null;
  selectedResume: ResumeDocument | null;
  status: string;
}

export function useUcareerData(enabled = true) {
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
  const [status, setStatus] = useState("正在连接本地 daemon...");

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled]);

  async function refresh() {
    try {
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

  async function refreshMarket() {
    setMarket(await getRecruitmentMarket());
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

  function onClearReport() {
    setSelectedReport(null);
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
      evidenceRequests,
      experienceOverview,
      market,
      profile,
      reports,
      resumeExportResult,
      resumePreview,
      resumes,
      selectedReport,
      selectedResume,
      status,
    } satisfies UcareerDataState,
    actions: {
      onCreateApplicationEvent,
      onClearReport,
      onDeleteLatestApplicationEvent,
      onExportResume,
      onFulfillEvidence,
      onGenerateResumePreview,
      onPushSync,
      refreshMarket,
      onSaveResumePreview,
      onSelectReport,
      onSelectResume,
      onUpdateExperience,
      onUpdateLatestApplicationEvent,
    },
  };
}
