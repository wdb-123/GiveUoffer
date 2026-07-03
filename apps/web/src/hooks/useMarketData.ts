import { useState } from "react";
import type { ImportJobRequest, RecruitmentMarket } from "@ucareer/shared";
import { deleteMarketJob, getRecruitmentMarket, importMarketJob } from "../api";

export function useMarketData(setStatus: (status: string) => void) {
  const [market, setMarket] = useState<RecruitmentMarket | null>(null);

  async function load() {
    setMarket(await getRecruitmentMarket());
  }

  async function refreshMarket() {
    setMarket(await getRecruitmentMarket());
  }

  async function onImportMarketJob(input: ImportJobRequest) {
    const result = await importMarketJob(input);
    setMarket(await getRecruitmentMarket());
    setStatus(result.imported ? "岗位已入库" : "岗位已更新");
  }

  async function onDeleteMarketJob(jobId: string) {
    if (!jobId) return;
    await deleteMarketJob(jobId);
    setMarket(await getRecruitmentMarket());
    setStatus("岗位已删除");
  }

  return {
    state: { market },
    actions: {
      load,
      onDeleteMarketJob,
      onImportMarketJob,
      refreshMarket,
    },
  };
}
