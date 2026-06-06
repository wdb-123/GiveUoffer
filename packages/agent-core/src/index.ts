import type {
  AgentEvent,
  EntityId,
  PermissionAction,
  ProviderInstallStatus,
  RiskLevel,
  TaskStatus,
} from "@offeru/shared";

export interface InstallStatus {
  installed: boolean;
  version?: string;
  path?: string;
  message?: string;
}

export function toProviderInstallStatus(providerId: EntityId, status: InstallStatus): ProviderInstallStatus {
  return {
    providerId,
    installed: status.installed,
    ...(status.version ? { version: status.version } : {}),
    ...(status.path ? { path: status.path } : {}),
    ...(status.message ? { message: status.message } : {}),
    checkedAt: createAgentEventTimestamp(),
  };
}

export interface AgentCapabilities {
  structuredRunner: boolean;
  ptyRunner: boolean;
  resumeSession: boolean;
  approvals: boolean;
  mcp: boolean;
}

export interface AgentSessionInput {
  taskId: EntityId;
  workspacePath: string;
  prompt?: string;
  model?: string;
  mode: "structured" | "pty";
  allowedActions?: PermissionAction[];
}

export interface AgentSessionHandle {
  id: EntityId;
  providerId: string;
  status: TaskStatus;
}

export interface AgentExecutionCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface ApprovalPolicy {
  action: PermissionAction;
  risk: RiskLevel;
  scope: "once" | "task" | "workspace";
}

export interface AgentProvider {
  id: string;
  label: string;
  capabilities: AgentCapabilities;

  checkInstalled(): Promise<InstallStatus>;
  createStructuredCommand?(input: AgentSessionInput): AgentExecutionCommand;
  startSession(input: AgentSessionInput): Promise<AgentSessionHandle>;
  sendMessage(sessionId: EntityId, message: string): Promise<void>;
  stopSession(sessionId: EntityId): Promise<void>;
}

export interface AgentEventSink {
  publish(taskId: EntityId, event: AgentEvent): Promise<void>;
}

export function createAgentEventTimestamp(): string {
  return new Date().toISOString();
}
