import type { AgentEvent } from "@ucareer/shared";

export function formatEvent(event: AgentEvent): string {
  if (event.type === "message") return `${event.role}: ${event.text}`;
  if (event.type === "command") return `${event.status}: ${event.command}`;
  if (event.type === "file_change") return `${event.path}: ${event.summary || "file changed"}`;
  if (event.type === "approval_request") return `${event.approval.action}: ${event.approval.summary}`;
  if (event.type === "task_status") return event.status;
  if (event.type === "usage") return `usage: ${event.totalTokens} tokens`;
  return event.message;
}
