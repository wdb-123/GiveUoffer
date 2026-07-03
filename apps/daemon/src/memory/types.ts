import type { EntityId } from "@ucareer/shared";

export type MemoryKind =
  | "user_profile"
  | "preference"
  | "career_evidence"
  | "application_history"
  | "job_report"
  | "resume_version"
  | "workflow_trace"
  | "agent_learning";

export type MemoryScope = "long_term" | "working" | "task";

export interface MemorySourceDefinition {
  id: EntityId;
  kind: MemoryKind;
  scope: MemoryScope;
  label: string;
  description: string;
  readPaths: string[];
  writePaths?: string[];
  owner: "workspace" | "sqlite";
}

export interface MemorySnapshotItem extends MemorySourceDefinition {
  available: boolean;
  summary: string;
}

export interface MemorySnapshot {
  generatedAt: string;
  items: MemorySnapshotItem[];
}
