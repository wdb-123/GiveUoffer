import type {
  AgentPageContext,
  ApplicationsOverview,
  CareerProfileOverview,
  EvidenceRequestsOverview,
  ExperienceOverview,
  RecruitmentMarket,
  ReportDocument,
  ReportsOverview,
  ResumeDocument,
  ResumeSummary,
} from "@ucareer/shared";
import type { ViewId } from "./views";

export interface AgentPageContextInput {
  viewId: ViewId;
  applications: ApplicationsOverview | null;
  evidence: EvidenceRequestsOverview | null;
  experience: ExperienceOverview | null;
  market: RecruitmentMarket | null;
  profile: CareerProfileOverview | null;
  reports: ReportsOverview | null;
  selectedReport: ReportDocument | null;
  resumes: {
    data: ResumeSummary[];
    selectedResume: ResumeDocument | null;
  };
}

export function buildAgentPageContext(input: AgentPageContextInput): AgentPageContext {
  switch (input.viewId) {
    case "resumes":
      return buildResumeContext(input);
    case "experience":
      return buildExperienceContext(input);
    case "market":
      return buildMarketContext(input);
    case "applications":
      return buildApplicationsContext(input);
    case "evidence":
      return buildEvidenceContext(input);
    case "agent":
    default:
      return {
        pageId: "agent",
        pageLabel: "Ucareer 对话",
        summary: "统一对话入口；未绑定具体业务页面时由后端按用户输入自动路由。",
        readPaths: ["workspace/profile/cv.md", "workspace/profile/profile.yml", "workspace/ops/data/applications.md"],
        writePaths: ["workspace/ops/exports"],
        capabilities: ["read", "sync"],
      };
  }
}

function buildResumeContext(input: AgentPageContextInput): AgentPageContext {
  const selected = input.resumes.selectedResume;
  return {
    pageId: "resumes",
    pageLabel: "我的简历",
    suggestedSkillId: "resume.generate",
    suggestedInputKind: "resume_request",
    summary: `当前共有 ${input.resumes.data.length} 份简历；${selected ? `选中「${selected.title}」` : "未选中具体简历"}。`,
    ...(selected ? { selectedEntity: { type: "resume", title: selected.title, file: selected.file, path: `workspace/resumes/library/${selected.file}` } } : {}),
    readPaths: ["workspace/profile/cv.md", "workspace/resumes/library", "workspace/resumes/source", "workspace/resumes/diagnostics"],
    writePaths: ["workspace/resumes/library", "workspace/resumes/source", "workspace/resumes/rendered", "workspace/resumes/diagnostics", "workspace/ops/exports"],
    capabilities: ["read", "write", "generate", "diagnose"],
  };
}

function buildExperienceContext(input: AgentPageContextInput): AgentPageContext {
  const experienceCount = input.experience?.experiences.length || 0;
  const profileTitle = input.profile?.headline || input.profile?.cvTitle || "";
  return {
    pageId: "experience",
    pageLabel: "经历资产",
    suggestedSkillId: "experience.capture",
    suggestedInputKind: "project_note",
    summary: `当前有 ${experienceCount} 条经历资产；${profileTitle ? `职业画像为「${profileTitle}」。` : "未读取到职业画像摘要。"}`,
    readPaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
    writePaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
    capabilities: ["read", "write", "generate", "diagnose"],
  };
}

function buildMarketContext(input: AgentPageContextInput): AgentPageContext {
  const jobs = input.market?.jobs || [];
  const selectedReport = input.selectedReport || input.reports?.reports[0];
  return {
    pageId: "market",
    pageLabel: "岗位列表",
    suggestedSkillId: "job.evaluate",
    suggestedInputKind: "job_description",
    summary: `当前岗位库共有 ${jobs.length} 个岗位；${selectedReport ? `最近报告为「${selectedReport.title}」。` : "未选中评估报告。"}`,
    ...(selectedReport ? { selectedEntity: { type: "job_report", title: selectedReport.title, file: selectedReport.file, path: `workspace/jobs/reports/${selectedReport.file}` } } : {}),
    readPaths: ["workspace/jobs/jds", "workspace/jobs/reports", "workspace/ops/data/applications.md"],
    writePaths: ["workspace/jobs/jds", "workspace/jobs/reports", "workspace/ops/batch/tracker-additions", "workspace/ops/data/applications.md"],
    capabilities: ["read", "write", "generate", "diagnose", "import"],
  };
}

function buildApplicationsContext(input: AgentPageContextInput): AgentPageContext {
  const applications = (input.applications?.applications || []).filter(isActiveApplicationProgress);
  const latest = applications.find((application) => application.latestEvent) || applications[0];
  return {
    pageId: "applications",
    pageLabel: "投递进度",
    suggestedSkillId: "application.progress",
    suggestedInputKind: "application_update",
    summary: `当前有 ${applications.length} 条投递记录；${latest ? `最近关注「${latest.company} - ${latest.role}」。` : "暂未读取到投递记录。"}`,
    ...(latest ? { selectedEntity: { type: "application", id: latest.id, title: `${latest.company} - ${latest.role}` } } : {}),
    readPaths: ["workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md"],
    writePaths: ["workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md", "workspace/ops/exports"],
    capabilities: ["read", "write", "import", "sync"],
  };
}

function isActiveApplicationProgress(application: ApplicationsOverview["applications"][number]): boolean {
  return new Set(["applied", "responded", "interview", "offer", "rejected"]).has(application.statusKey);
}

function buildEvidenceContext(input: AgentPageContextInput): AgentPageContext {
  const requests = input.evidence?.requests || [];
  const activeRequest = requests.find((request) => request.status !== "done") || requests[0];
  return {
    pageId: "evidence",
    pageLabel: "复盘中心",
    suggestedSkillId: "outcome.learn",
    suggestedInputKind: "outcome_feedback",
    summary: `复盘中心是自由笔记页面。用户要求记录/保存复盘时，优先调用 evidence.note 写入复盘记录；当前有 ${requests.length} 条记录。${activeRequest ? `最近记录「${activeRequest.direction || activeRequest.gap}」。` : "暂无记录。"}`,
    ...(activeRequest ? { selectedEntity: { type: "evidence_request", id: activeRequest.id, title: activeRequest.gap, path: activeRequest.targetFile } } : {}),
    readPaths: ["workspace/ops/data/evidence-requests.json", "workspace/jobs/project-notes/evidence.md", "workspace/ops/data/applications.md", "workspace/jobs/reports", "workspace/profile/article-digest.md"],
    writePaths: ["workspace/jobs/project-notes/evidence.md", "workspace/ops/data/evidence-requests.json", "workspace/profile/_profile.md", "workspace/profile/profile.yml", "workspace/profile/article-digest.md", "workspace/ops/exports"],
    capabilities: ["read", "write", "diagnose", "sync"],
  };
}
