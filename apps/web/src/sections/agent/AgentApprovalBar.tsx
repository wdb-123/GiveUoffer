import type { ApprovalDecisionRequest, ApprovalRequest } from "@ucareer/shared";
import { riskLabel } from "./agentConversation";

interface AgentApprovalBarProps {
  approvals: ApprovalRequest[];
  onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]): void;
}

export function AgentApprovalBar({ approvals, onDecideApproval }: AgentApprovalBarProps) {
  if (!approvals.length) return null;
  return (
    <div className="agent-approval-bar" aria-label="待审批操作">
      {approvals.map((approval) => (
        <article className={`agent-approval-card risk-${approval.risk}`} key={approval.id}>
          <div className="agent-approval-copy">
            <span>{riskLabel(approval.risk)}</span>
            <strong>{formatApprovalTitle(approval)}</strong>
            <small>{formatApprovalSubtitle(approval)}</small>
            <details className="agent-approval-details">
              <summary>查看细节</summary>
              <div className="agent-approval-meta">
                <small>{approval.action}</small>
                {approval.command ? <code>{approval.command}</code> : null}
                {approval.cwd ? <small>{approval.cwd}</small> : null}
                {(approval.affectedPaths || []).length ? (
                  <small>{(approval.affectedPaths || []).slice(0, 3).join(" · ")}</small>
                ) : null}
              </div>
            </details>
          </div>
          <div className="agent-approval-actions">
            <button type="button" onClick={() => onDecideApproval(approval.id, "allow_once")}>允许一次</button>
            <button type="button" className="secondary" onClick={() => onDecideApproval(approval.id, "allow_workspace")}>本工作区始终允许</button>
            <button type="button" className="danger" onClick={() => onDecideApproval(approval.id, "deny")}>拒绝</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatApprovalTitle(approval: ApprovalRequest): string {
  if (approval.action === "start_agent") {
    const provider = parseApprovalCommand(approval.command)?.providerLabel || "Agent";
    return `允许 ${provider} 运行？`;
  }
  return approval.summary;
}

function formatApprovalSubtitle(approval: ApprovalRequest): string {
  if (approval.action === "start_agent") {
    return "也可以在输入框左侧权限菜单里切换运行权限";
  }
  return approval.cwd || approval.action;
}

function parseApprovalCommand(command?: string): { providerLabel?: string } | null {
  if (!command) return null;
  try {
    const parsed = JSON.parse(command) as { providerLabel?: unknown };
    return typeof parsed.providerLabel === "string" ? { providerLabel: parsed.providerLabel } : null;
  } catch {
    return null;
  }
}
