import type { SkillDefinition } from "@ucareer/shared";
import { evidenceTools, experienceTools } from "../tools";

export const experienceCaptureSkill: SkillDefinition = {
  id: "experience.capture",
  label: "经历资产沉淀",
  domain: "career_profile",
  description: "把项目、复盘、证明点和证据缺口沉淀到职业资产层。",
  inputKinds: ["project_note", "evidence_note"],
  defaultProviderId: "codex",
  legacyModeFile: "modes/project.md",
  risk: "low",
  connectorTools: [...experienceTools, ...evidenceTools],
  ui: {
    primaryPage: "experience",
    pages: ["experience", "resumes", "agent"],
    entryActions: [
      {
        id: "experience.capture_asset",
        label: "沉淀经历",
        description: "把项目、复盘、证明点和证据缺口整理成职业资产。",
        kind: "primary",
        inputKind: "project_note",
        promptTemplate: "请把当前项目/经历材料整理成职业资产，提取证明点、可写入简历的句子和证据缺口。",
        capabilities: ["read", "write", "generate", "diagnose"],
        toolIds: ["experience.list", "experience.upsert", "evidence.upsert"],
        outputArtifacts: ["experience_note", "evidence_request", "story_bank_item"],
      },
    ],
    quickPrompts: [
      "把这个项目整理成简历证明点。",
      "找出我这段经历还缺什么证据。",
      "生成一条 STAR 面试故事。",
    ],
  },
  fileManagement: {
    intakeFolder: "experience",
    acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
    acceptedExtensions: [".md", ".txt", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
    readPaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
    writePaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
    outputArtifacts: ["experience_note", "evidence_request", "story_bank_item"],
  },
};
