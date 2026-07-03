import type { MemorySourceDefinition } from "./types";

export const memoryRegistry: MemorySourceDefinition[] = [
  {
    id: "profile.cv",
    kind: "user_profile",
    scope: "long_term",
    label: "Canonical CV",
    description: "User-maintained source CV and career baseline.",
    owner: "workspace",
    readPaths: ["workspace/profile/cv.md"],
    writePaths: ["workspace/profile/cv.md"],
  },
  {
    id: "profile.preferences",
    kind: "preference",
    scope: "long_term",
    label: "Profile Preferences",
    description: "Personalized targeting, deal-breakers, scoring preferences and narrative overlays.",
    owner: "workspace",
    readPaths: ["workspace/profile/profile.yml", "workspace/profile/_profile.md"],
    writePaths: ["workspace/profile/profile.yml", "workspace/profile/_profile.md"],
  },
  {
    id: "profile.evidence_digest",
    kind: "career_evidence",
    scope: "long_term",
    label: "Evidence Digest",
    description: "Reusable proof points and portfolio/article evidence.",
    owner: "workspace",
    readPaths: ["workspace/profile/article-digest.md", "workspace/jobs/project-notes"],
    writePaths: ["workspace/profile/article-digest.md", "workspace/jobs/project-notes"],
  },
  {
    id: "applications.history",
    kind: "application_history",
    scope: "long_term",
    label: "Application History",
    description: "Application tracker and event timeline.",
    owner: "workspace",
    readPaths: ["workspace/ops/data/applications.md", "workspace/ops/data/application-events.jsonl", "workspace/ops/data/follow-ups.md"],
    writePaths: ["workspace/ops/data/applications.md", "workspace/ops/data/application-events.jsonl", "workspace/ops/data/follow-ups.md"],
  },
  {
    id: "jobs.reports",
    kind: "job_report",
    scope: "long_term",
    label: "Job Reports",
    description: "Historical job evaluations, risks and fit judgments.",
    owner: "workspace",
    readPaths: ["workspace/jobs/reports", "workspace/jobs/jds"],
    writePaths: ["workspace/jobs/reports", "workspace/jobs/jds"],
  },
  {
    id: "resumes.library",
    kind: "resume_version",
    scope: "long_term",
    label: "Resume Library",
    description: "Generated and curated resume versions plus diagnostics.",
    owner: "workspace",
    readPaths: ["workspace/resumes/library", "workspace/resumes/diagnostics"],
    writePaths: ["workspace/resumes/library", "workspace/resumes/diagnostics"],
  },
  {
    id: "runtime.workflow_traces",
    kind: "workflow_trace",
    scope: "working",
    label: "Workflow Traces",
    description: "Local task, approval and workflow run state stored in the daemon database.",
    owner: "sqlite",
    readPaths: [".ucareer/daemon.sqlite"],
  },
];

export function getMemorySource(sourceId: string): MemorySourceDefinition | undefined {
  return memoryRegistry.find((source) => source.id === sourceId);
}
