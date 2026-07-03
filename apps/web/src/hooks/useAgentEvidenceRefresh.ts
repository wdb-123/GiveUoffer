import { useEffect, useRef } from "react";
import type { AgentEvent, EvidenceRequestsOverview } from "@ucareer/shared";

export function useAgentEvidenceRefresh(input: {
  selectedTaskEvents: AgentEvent[];
  selectedTaskId: string;
  refreshEvidenceRequests(): Promise<EvidenceRequestsOverview>;
}): void {
  const refreshedTaskIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const selectedTaskId = input.selectedTaskId;
    if (!selectedTaskId || refreshedTaskIdsRef.current.has(selectedTaskId)) return;
    const completed = input.selectedTaskEvents.some((event) => (
      event.type === "task_status" && event.taskId === selectedTaskId && event.status === "completed"
    ));
    const wroteEvidence = input.selectedTaskEvents.some((event) => (
      event.type === "message"
        && event.role === "system"
        && (event.text.includes("UC_TOOL_CALL") || event.text.includes("UC_TOOL_RESULT"))
        && event.text.includes("evidence.")
    ));
    if (!completed || !wroteEvidence) return;
    refreshedTaskIdsRef.current.add(selectedTaskId);
    void input.refreshEvidenceRequests();
  }, [input]);
}
