import { useState } from "react";
import type { ReportDocument, ReportsOverview } from "@ucareer/shared";
import { getReport, getReports } from "../api";

export function useReportsData() {
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDocument | null>(null);

  async function load() {
    setReports(await getReports());
  }

  async function onSelectReport(file: string) {
    setSelectedReport(await getReport(file));
  }

  function onClearReport() {
    setSelectedReport(null);
  }

  return {
    state: {
      reports,
      selectedReport,
    },
    actions: {
      load,
      onClearReport,
      onSelectReport,
    },
  };
}
