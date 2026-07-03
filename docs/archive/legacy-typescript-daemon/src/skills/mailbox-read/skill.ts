import type { SkillDefinition } from "@ucareer/shared";
import { applicationTools, mailboxSearchTool } from "../tools";

export const mailboxReadSkill: SkillDefinition = {
  id: "mailbox.read",
  label: "邮箱读取",
  domain: "application_crm",
  description: "读取和搜索已连接邮箱消息，按数量、日期、发件人、主题或正文关键词返回安全摘要。",
  inputKinds: ["mailbox_messages"],
  defaultProviderId: "codex",
  risk: "low",
  connectorTools: [mailboxSearchTool, ...applicationTools],
  ui: {
    primaryPage: "applications",
    pages: ["applications", "agent"],
    entryActions: [
      {
        id: "applications.search_mailbox",
        label: "搜索邮箱",
        description: "只读搜索已连接邮箱中的求职相关邮件。",
        kind: "secondary",
        inputKind: "mailbox_messages",
        promptTemplate: "请搜索已连接邮箱中和求职、面试、投递进度有关的邮件，只返回安全摘要。",
        capabilities: ["read", "import"],
        toolIds: ["mailbox.search_messages"],
        outputArtifacts: ["mailbox_summary", "application_signal"],
      },
    ],
    quickPrompts: [
      "找最近 10 封和面试有关的邮件。",
      "查一下有没有 HR 回复或拒信。",
    ],
  },
  fileManagement: {
    intakeFolder: "applications",
    acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
    acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
    readPaths: ["workspace/ops/data/applications.md"],
    writePaths: ["workspace/ops/exports"],
    outputArtifacts: ["mailbox_summary", "application_signal"],
  },
};
