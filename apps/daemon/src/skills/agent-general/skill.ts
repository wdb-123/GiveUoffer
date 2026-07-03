import type { SkillDefinition } from "@ucareer/shared";

export const agentGeneralSkill: SkillDefinition = {
  id: "agent.general",
  label: "通用 Agent",
  domain: "agent_workspace",
  description: "无法明确归类时，进入通用 agent 对话并先做澄清或只读分析。",
  inputKinds: ["general"],
  defaultProviderId: "codex",
  risk: "medium",
  ui: {
    primaryPage: "agent",
    pages: ["agent"],
    entryActions: [
      {
        id: "agent.general_chat",
        label: "通用对话",
        description: "无法明确归类时进行澄清、只读分析或轻量工作区检查。",
        kind: "primary",
        inputKind: "general",
        promptTemplate: "请先判断这个请求应该走哪个 Ucareer skill；如果不明确，先澄清或做只读分析。",
        capabilities: ["read", "sync"],
        outputArtifacts: ["analysis_note", "clarification_request"],
      },
    ],
    quickPrompts: [
      "帮我看看现在工作区状态。",
      "这个请求应该走哪个功能？",
    ],
  },
  fileManagement: {
    intakeFolder: "general",
    acceptedAttachmentKinds: ["text", "pdf", "docx", "image", "unknown"],
    acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"],
    readPaths: ["workspace/ops/imports/agent-attachments/{date}/general", "workspace/ops/imports/agent-attachments/{date}/documents"],
    writePaths: ["workspace/ops/exports"],
    outputArtifacts: ["analysis_note", "clarification_request"],
  },
};
