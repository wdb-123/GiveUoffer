import { useState } from "react";
import type {
  ExportResumeResult,
  GenerateResumePreviewResult,
  ResumeDiagnosisReport,
  ResumeDocument,
  ResumeExportFormat,
  ResumeSummary,
} from "@ucareer/shared";
import {
  downloadExportedResume,
  exportResume,
  generateResumePreview,
  getResume,
  getResumeDiagnostics,
  getResumes,
  saveGeneratedResume,
  saveResume,
} from "../api";
import { downloadBlob } from "./ucareerDataUtils";

export function useResumeData(setStatus: (status: string) => void) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [selectedResume, setSelectedResume] = useState<ResumeDocument | null>(null);
  const [resumeExportResult, setResumeExportResult] = useState<ExportResumeResult | null>(null);
  const [resumeDiagnostics, setResumeDiagnostics] = useState<ResumeDiagnosisReport[]>([]);
  const [resumePreview, setResumePreview] = useState<GenerateResumePreviewResult | null>(null);

  async function load() {
    const [nextResumes, nextDiagnostics] = await Promise.all([
      getResumes(),
      getResumeDiagnostics(),
    ]);
    setResumes(nextResumes);
    setResumeDiagnostics(nextDiagnostics);
  }

  async function onSelectResume(file: string) {
    setSelectedResume(await getResume(file));
  }

  async function onGenerateResumePreview(baseFile: string, targetJobId: string) {
    const preview = await generateResumePreview({ baseFile, targetJobId });
    setResumePreview(preview);
    setStatus("简历预览已生成");
  }

  async function onSaveResumePreview() {
    if (!resumePreview) return;
    const saved = await saveGeneratedResume({
      title: resumePreview.title,
      markdown: resumePreview.markdown,
      baseFile: resumePreview.baseFile,
      targetJobId: resumePreview.targetJobId,
      targetJobTitle: resumePreview.targetJobTitle,
    });
    setResumes(await getResumes());
    setStatus(`简历已保存：${saved.title}`);
  }

  async function onSaveResume(file: string, title: string, markdown: string) {
    const saved = await saveResume({ file, title, markdown });
    setSelectedResume(saved);
    setResumes(await getResumes());
    setResumeDiagnostics(await getResumeDiagnostics());
    setStatus(`简历已更新：${saved.title}`);
  }

  async function refreshResumeDiagnostics() {
    const diagnostics = await getResumeDiagnostics();
    setResumeDiagnostics(diagnostics);
    return diagnostics;
  }

  async function onExportResume(file: string, format: ResumeExportFormat, style?: import("@ucareer/shared").ResumeExportStyle) {
    const result = await exportResume({ file, format, ...(style ? { style } : {}) });
    const blob = await downloadExportedResume(result.file);
    downloadBlob(blob, result.file);
    setResumeExportResult(result);
    setStatus("简历已导出");
  }

  return {
    state: {
      resumeDiagnostics,
      resumeExportResult,
      resumePreview,
      resumes,
      selectedResume,
    },
    actions: {
      load,
      onExportResume,
      onGenerateResumePreview,
      onSaveResume,
      onSaveResumePreview,
      onSelectResume,
      refreshResumeDiagnostics,
    },
  };
}
