import { useState } from "react";
import type { EvidenceRequestsOverview, ExperienceOverview } from "@ucareer/shared";
import {
  fulfillEvidenceRequest,
  getEvidenceRequests,
  saveEvidenceNote,
} from "../api";

export function useEvidenceData(input: {
  refreshExperienceOverview(): Promise<ExperienceOverview>;
  setStatus(status: string): void;
}) {
  const [evidenceRequests, setEvidenceRequests] = useState<EvidenceRequestsOverview | null>(null);

  async function load() {
    setEvidenceRequests(await getEvidenceRequests());
  }

  async function onFulfillEvidence(requestId: string, content: string) {
    await fulfillEvidenceRequest({ requestId, content });
    setEvidenceRequests(await getEvidenceRequests());
    await input.refreshExperienceOverview();
    input.setStatus(`证据已写入：${requestId}`);
  }

  async function onSaveEvidenceNote(content: string) {
    const result = await saveEvidenceNote({ content });
    setEvidenceRequests(await getEvidenceRequests());
    input.setStatus(`复盘笔记已保存：${result.noteId}`);
  }

  async function refreshEvidenceRequests() {
    const overview = await getEvidenceRequests();
    setEvidenceRequests(overview);
    return overview;
  }

  return {
    state: { evidenceRequests },
    actions: {
      load,
      onFulfillEvidence,
      onSaveEvidenceNote,
      refreshEvidenceRequests,
    },
  };
}
