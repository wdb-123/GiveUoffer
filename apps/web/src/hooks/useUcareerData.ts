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
  ResumeDiagnosisReport,
  ResumeDocument,
  ResumeSummary,
} from "@ucareer/shared";
import { getProfileOverview, pushSyncToCloud } from "../api";
import { useApplicationsData } from "./useApplicationsData";
import { useEvidenceData } from "./useEvidenceData";
import { useExperienceData } from "./useExperienceData";
import { useMarketData } from "./useMarketData";
import { useReportsData } from "./useReportsData";
import { useResumeData } from "./useResumeData";

export interface UcareerDataState {
  applications: ApplicationsOverview | null;
  evidenceRequests: EvidenceRequestsOverview | null;
  experienceOverview: ExperienceOverview | null;
  market: RecruitmentMarket | null;
  profile: CareerProfileOverview | null;
  reports: ReportsOverview | null;
  resumeExportResult: ExportResumeResult | null;
  resumeDiagnostics: ResumeDiagnosisReport[];
  resumePreview: GenerateResumePreviewResult | null;
  resumes: ResumeSummary[];
  selectedReport: ReportDocument | null;
  selectedResume: ResumeDocument | null;
  status: string;
}

export function useUcareerData(enabled = true) {
  const [profile, setProfile] = useState<CareerProfileOverview | null>(null);
  const [status, setStatus] = useState("正在连接本地 daemon...");
  const resumes = useResumeData(setStatus);
  const market = useMarketData(setStatus);
  const reports = useReportsData();
  const applications = useApplicationsData(setStatus);
  const experience = useExperienceData(setStatus);
  const evidence = useEvidenceData({
    refreshExperienceOverview: experience.actions.refreshExperienceOverview,
    setStatus,
  });

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled]);

  async function refresh() {
    try {
      await Promise.all([
        loadProfile(),
        resumes.actions.load(),
        market.actions.load(),
        reports.actions.load(),
        applications.actions.load(),
        experience.actions.load(),
        evidence.actions.load(),
      ]);
      setStatus("daemon 已连接");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "daemon 连接失败");
    }
  }

  async function loadProfile() {
    setProfile(await getProfileOverview());
  }

  async function onPushSync() {
    const result = await pushSyncToCloud();
    setStatus(`同步完成：发送 ${result.sent}，确认 ${result.marked}`);
  }

  return {
    state: {
      applications: applications.state.applications,
      evidenceRequests: evidence.state.evidenceRequests,
      experienceOverview: experience.state.experienceOverview,
      market: market.state.market,
      profile,
      reports: reports.state.reports,
      resumeDiagnostics: resumes.state.resumeDiagnostics,
      resumeExportResult: resumes.state.resumeExportResult,
      resumePreview: resumes.state.resumePreview,
      resumes: resumes.state.resumes,
      selectedReport: reports.state.selectedReport,
      selectedResume: resumes.state.selectedResume,
      status,
    } satisfies UcareerDataState,
    actions: {
      onCreateApplicationEvent: applications.actions.onCreateApplicationEvent,
      onClearReport: reports.actions.onClearReport,
      onDeleteLatestApplicationEvent: applications.actions.onDeleteLatestApplicationEvent,
      onDeleteMarketJob: market.actions.onDeleteMarketJob,
      onExportResume: resumes.actions.onExportResume,
      onFulfillEvidence: evidence.actions.onFulfillEvidence,
      onGenerateResumePreview: resumes.actions.onGenerateResumePreview,
      onImportMarketJob: market.actions.onImportMarketJob,
      onPushSync,
      onSaveEvidenceNote: evidence.actions.onSaveEvidenceNote,
      refreshEvidenceRequests: evidence.actions.refreshEvidenceRequests,
      refreshMarket: market.actions.refreshMarket,
      refreshResumeDiagnostics: resumes.actions.refreshResumeDiagnostics,
      onSaveResume: resumes.actions.onSaveResume,
      onSaveResumePreview: resumes.actions.onSaveResumePreview,
      onSelectReport: reports.actions.onSelectReport,
      onSelectResume: resumes.actions.onSelectResume,
      onUpdateExperience: experience.actions.onUpdateExperience,
      onUpdateLatestApplicationEvent: applications.actions.onUpdateLatestApplicationEvent,
    },
  };
}
