import type { AgentProvider } from "@ucareer/agent-core";
import type { PermissionAction, RiskLevel, WorkflowStepDefinition } from "@ucareer/shared";

export interface ActionApprovalPolicy {
  required: boolean;
  action: PermissionAction;
  risk: RiskLevel;
  summary: string;
  command: string;
  affectedPaths: string[];
}

export type AgentExecutionApprovalPolicy = ActionApprovalPolicy;

export interface ActionPolicyInput {
  action: PermissionAction;
  summary: string;
  command?: string;
  affectedPaths?: string[];
  risk?: RiskLevel;
  permissionMode?: "default" | "auto_review" | "full_access" | undefined;
  hasGrant?: boolean | undefined;
  autoApprove?: boolean | undefined;
}

export function evaluateActionPolicy(input: ActionPolicyInput): ActionApprovalPolicy {
  const fullAccess = input.permissionMode === "full_access";
  const risk = input.risk || riskForAction(input.action);
  return {
    required: !input.autoApprove && !fullAccess && !input.hasGrant,
    action: input.action,
    risk,
    summary: input.summary,
    command: input.command || JSON.stringify({ action: input.action, summary: input.summary }),
    affectedPaths: input.affectedPaths || [],
  };
}

export function evaluateWorkflowStepPolicy(input: {
  step: WorkflowStepDefinition;
  summary?: string;
  command?: string;
  affectedPaths?: string[];
  permissionMode?: "default" | "auto_review" | "full_access" | undefined;
  hasGrant?: boolean | undefined;
}): ActionApprovalPolicy | undefined {
  if (!input.step.requiredPermission) return undefined;
  return evaluateActionPolicy({
    action: input.step.requiredPermission,
    summary: input.summary || `Run workflow step: ${input.step.label}`,
    command: input.command || JSON.stringify({ stepId: input.step.id, stepKind: input.step.kind }),
    affectedPaths: input.affectedPaths || [],
    permissionMode: input.permissionMode,
    hasGrant: input.hasGrant,
  });
}

export function evaluateAgentExecutionPolicy(input: {
  provider: AgentProvider;
  workspacePath: string;
  isContinuation: boolean;
  permissionMode?: "default" | "auto_review" | "full_access" | undefined;
  hasWorkspaceGrant?: boolean | undefined;
}): AgentExecutionApprovalPolicy {
  const explicitAutoStart = process.env.UCAREER_AGENT_AUTO_START === "1";
  const risk = riskForProvider(input.provider.id);
  const verb = input.isContinuation ? "Continue" : "Start";
  return evaluateActionPolicy({
    action: "start_agent",
    risk,
    summary: `${verb} ${input.provider.label} in ${input.workspacePath}`,
    command: JSON.stringify({
      providerId: input.provider.id,
      providerLabel: input.provider.label,
      workspacePath: input.workspacePath,
      continuation: input.isContinuation,
    }),
    affectedPaths: [input.workspacePath],
    permissionMode: input.permissionMode,
    hasGrant: input.hasWorkspaceGrant,
    autoApprove: explicitAutoStart,
  });
}

function riskForProvider(providerId: string): RiskLevel {
  if (providerId === "openclaw") return "critical";
  if (providerId === "opencode" || providerId === "claude") return "high";
  return "medium";
}

function riskForAction(action: PermissionAction): RiskLevel {
  switch (action) {
    case "read_files":
      return "low";
    case "write_files":
    case "network_access":
    case "open_browser":
    case "start_agent":
      return "medium";
    case "run_shell":
    case "install_package":
    case "git_commit":
    case "sync_cloud":
      return "high";
    case "delete_files":
    case "git_push":
    case "send_application":
      return "critical";
    default:
      return "medium";
  }
}
