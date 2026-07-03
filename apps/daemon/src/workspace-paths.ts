import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isInsideOrSameDir } from "./path-guards";

export type WorkspaceDataPath =
  | "applications"
  | "applicationEvents"
  | "applicationEmailSnapshots"
  | "emailAttachments"
  | "agentAttachments"
  | "evidenceRequests"
  | "experienceMetadata"
  | "headshots"
  | "intentions"
  | "pipeline"
  | "profileCv"
  | "profileOverlay"
  | "profileYaml"
  | "jobDescriptions"
  | "projectNotes"
  | "recruitmentMarket"
  | "reports"
  | "resumeExports"
  | "resumeDiagnostics"
  | "resumeJobLinks"
  | "resumeLibrary";

const workspaceDataPaths: Record<WorkspaceDataPath, string> = {
  applications: "workspace/ops/data/applications.md",
  applicationEvents: "workspace/ops/data/application-events.jsonl",
  applicationEmailSnapshots: "workspace/ops/data/application-email-snapshots.jsonl",
  emailAttachments: "workspace/ops/data/email-attachments",
  agentAttachments: "workspace/ops/imports/agent-attachments",
  evidenceRequests: "workspace/ops/data/evidence-requests.json",
  experienceMetadata: "workspace/ops/data/experience-metadata.json",
  headshots: "workspace/profile/headshots",
  intentions: "workspace/profile/intentions",
  pipeline: "workspace/ops/data/pipeline.md",
  profileCv: "workspace/profile/cv.md",
  profileOverlay: "workspace/profile/_profile.md",
  profileYaml: "workspace/profile/profile.yml",
  jobDescriptions: "workspace/jobs/jds",
  projectNotes: "workspace/jobs/project-notes",
  recruitmentMarket: "workspace/ops/data/recruitment-market.json",
  reports: "workspace/jobs/reports",
  resumeExports: "workspace/ops/exports/resumes",
  resumeDiagnostics: "workspace/resumes/diagnostics",
  resumeJobLinks: "workspace/ops/data/resume-job-links.json",
  resumeLibrary: "workspace/resumes/library",
};

export function workspaceDataPath(workspaceRoot: string, key: WorkspaceDataPath): string {
  return resolveInsideWorkspaceRoot(workspaceRoot, workspaceDataPaths[key]);
}

export function workspaceRelativeDataPath(key: WorkspaceDataPath): string {
  return workspaceDataPaths[key];
}

export function tenantWorkspaceRoot(workspaceRoot: string, tenantId: string): string {
  const normalizedTenantId = String(tenantId || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedTenantId)) {
    throw new Error("Invalid tenant id");
  }
  return resolveInsideWorkspaceRoot(workspaceRoot, `workspace/tenants/${normalizedTenantId}`);
}

export function ensureTenantWorkspaceInitialized(projectRoot: string, tenantRoot: string): void {
  if (!isInsideOrSameDir(projectRoot, tenantRoot)) {
    throw new Error("Invalid tenant workspace root");
  }
  seedWorkspaceEntryIfMissing(projectRoot, tenantRoot, "workspace/README.md");
  seedWorkspaceEntryIfMissing(projectRoot, tenantRoot, "workspace/jobs");
  seedWorkspaceEntryIfMissing(projectRoot, tenantRoot, "workspace/ops");
  seedDirectoryIfMissing(projectRoot, tenantRoot, "workspace/profile");
  seedDirectoryIfMissing(projectRoot, tenantRoot, "workspace/resumes");
}

export function resolveInsideWorkspaceRoot(workspaceRoot: string, relativePath: string): string {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const resolved = resolve(workspaceRoot, normalized);
  if (!isInsideOrSameDir(workspaceRoot, resolved)) {
    throw new Error(`Invalid workspace path: ${relativePath}`);
  }
  return resolved;
}

export function joinWorkspaceDataPath(workspaceRoot: string, key: WorkspaceDataPath, ...parts: string[]): string {
  const base = workspaceDataPath(workspaceRoot, key);
  const resolved = resolve(base, ...parts);
  if (!isInsideOrSameDir(base, resolved)) {
    throw new Error(`Invalid ${key} path`);
  }
  return resolved;
}

function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = String(value || "").replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(`Invalid workspace-relative path: ${value}`);
  }
  return join(...normalized.split("/"));
}

function seedDirectoryIfMissing(projectRoot: string, tenantRoot: string, relativePath: string): void {
  const source = resolveInsideWorkspaceRoot(projectRoot, relativePath);
  if (!existsSync(source) || !statSync(source).isDirectory()) return;
  const destination = resolveInsideWorkspaceRoot(tenantRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  if (!existsSync(destination)) mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, force: false, errorOnExist: false });
}

function seedWorkspaceEntryIfMissing(projectRoot: string, tenantRoot: string, relativePath: string): void {
  const source = resolveInsideWorkspaceRoot(projectRoot, relativePath);
  if (!existsSync(source)) return;
  if (statSync(source).isDirectory()) {
    seedDirectoryIfMissing(projectRoot, tenantRoot, relativePath);
    return;
  }
  const destination = resolveInsideWorkspaceRoot(tenantRoot, relativePath);
  if (existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { force: false, errorOnExist: false });
}
