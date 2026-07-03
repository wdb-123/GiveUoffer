import { useState } from "react";
import type { ExperienceOverview } from "@ucareer/shared";
import { getExperienceOverview, saveExperienceMetadata } from "../api";

export function useExperienceData(setStatus: (status: string) => void) {
  const [experienceOverview, setExperienceOverview] = useState<ExperienceOverview | null>(null);

  async function load() {
    setExperienceOverview(await getExperienceOverview());
  }

  async function refreshExperienceOverview() {
    const overview = await getExperienceOverview();
    setExperienceOverview(overview);
    return overview;
  }

  async function onUpdateExperience(id: string, patch?: Partial<Pick<ExperienceOverview["experiences"][number], "title" | "category" | "role" | "sourceFile" | "summary" | "tags" | "evidence" | "gaps" | "publicLevel">>) {
    const item = experienceOverview?.experiences.find((experience) => experience.id === id);
    if (!experienceOverview || !item) return;
    const fallbackPatch = patch ? null : {
      summary: window.prompt("更新经历摘要", item.summary) ?? item.summary,
      evidence: (window.prompt("更新证据（每行一条）", item.evidence.join("\n")) ?? item.evidence.join("\n")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    };
    const nextExperiences = experienceOverview.experiences.map((experience) => (
      experience.id === id
        ? { ...experience, ...(patch || fallbackPatch || {}) }
        : experience
    ));
    const next = await saveExperienceMetadata({
      metadata: {
        updatedAt: experienceOverview.updatedAt,
        experiences: nextExperiences,
      },
    });
    setExperienceOverview(next);
    setStatus(`经历已更新：${item.title}`);
  }

  return {
    state: { experienceOverview },
    actions: {
      load,
      onUpdateExperience,
      refreshExperienceOverview,
    },
  };
}
