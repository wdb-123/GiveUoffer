import type { SkillDefinition } from "@ucareer/shared";
import { applicationTools, evidenceTools, experienceTools } from "../tools";

export const outcomeLearnSkill: SkillDefinition = {
  id: "outcome.learn",
  label: "结果学习",
  domain: "outcome_learning",
  description: "记录复盘笔记，并从投递结果、拒绝原因和面试反馈中更新画像与筛选策略。",
  inputKinds: ["outcome_feedback"],
  defaultProviderId: "codex",
  legacyModeFile: "modes/patterns.md",
  risk: "medium",
  connectorTools: [...applicationTools, ...evidenceTools, ...experienceTools],
  ui: {
    primaryPage: "evidence",
    pages: ["evidence", "applications", "agent"],
    entryActions: [
      {
        id: "evidence.learn_from_outcome",
        label: "复盘结果",
        description: "把自由输入保存为复盘记录；必要时再从拒绝、推进、面试反馈或误评分中更新画像、筛选策略和证据缺口。",
        kind: "primary",
        inputKind: "outcome_feedback",
        promptTemplate: "请把这次投递/面试/沟通反馈保存为复盘记录；如果有明显模式，再更新我的筛选策略、画像偏好或证据缺口。",
        capabilities: ["read", "write", "diagnose", "sync"],
        toolIds: ["evidence.note", "evidence.list", "applications.list", "evidence.upsert", "experience.upsert"],
        outputArtifacts: ["review_note", "learning_signal", "profile_update", "pattern_report"],
      },
    ],
    quickPrompts: [
      "帮我记录一条复盘。",
      "这次拒绝说明我的定位哪里要调整？",
      "把这个反馈变成证据缺口。",
      "更新我的岗位筛选偏好。",
    ],
  },
  fileManagement: {
    intakeFolder: "applications",
    acceptedAttachmentKinds: ["text", "pdf", "docx"],
    acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json"],
    readPaths: ["workspace/ops/data/applications.md", "workspace/jobs/reports", "workspace/ops/data/follow-ups.md"],
    writePaths: ["workspace/jobs/project-notes/evidence.md", "workspace/ops/data/evidence-requests.json", "workspace/profile/_profile.md", "workspace/profile/profile.yml", "workspace/profile/article-digest.md", "workspace/ops/exports"],
    outputArtifacts: ["review_note", "learning_signal", "profile_update", "pattern_report"],
  },
};
