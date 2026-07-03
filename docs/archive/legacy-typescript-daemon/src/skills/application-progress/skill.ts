import type { SkillDefinition } from "@ucareer/shared";
import { applicationTools, mailboxSearchTool } from "../tools";

export const applicationProgressSkill: SkillDefinition = {
  id: "application.progress",
  label: "投递进度导入",
  domain: "application_crm",
  description: "从 HR 消息、拒信、面试邀请、offer、投递成功页、招聘平台投递记录链接或用户备注中抽取投递事件，并写入本地投递进度。邮箱查找必须使用多策略，避免因为发件人、主题、正文条件过窄漏掉 HR 个人邮箱或第三方系统邮件。",
  inputKinds: ["application_update"],
  defaultProviderId: "codex",
  risk: "low",
  connectorTools: [mailboxSearchTool, ...applicationTools],
  ui: {
    primaryPage: "applications",
    pages: ["applications", "agent"],
    entryActions: [
      {
        id: "applications.import_progress_event",
        label: "导入投递事件",
        description: "从 HR 邮件、拒信、面试邀请、offer 或用户备注中抽取并写入投递事件。",
        kind: "primary",
        inputKind: "application_update",
        promptTemplate: "请从当前内容里抽取投递进度事件，写入投递进度，并说明证据和下一步。",
        capabilities: ["read", "write", "import", "sync"],
        toolIds: ["applications.create_event", "mailbox.search_messages"],
        outputArtifacts: ["application_event", "follow_up_note"],
      },
      {
        id: "applications.find_interview_emails",
        label: "查找面试邮件",
        description: "从邮箱中查找面试、HR 回复、投递回执、测评、拒信和 offer 相关邮件并更新进度；必须多策略宽搜，不能只用一组 from+subject+content 条件。",
        kind: "contextual",
        inputKind: "application_update",
        promptTemplate: "请直接检索已连接邮箱，找和求职/面试/投递进度有关的邮件，并把高置信度事件写入投递进度。查公司 offer 时按多策略：先搜 subject/content 公司名，再搜 subject/content offer/录用/聘用/邀请函/恭喜，不要默认用公司名限制 from。用户要求更新状态时，命中高置信度 offer/面试/拒信后必须继续调用 applications.create_event 写入管线；offer 邮件返回 message.attachments 时，要原样写进 email_snapshot.attachments。",
        capabilities: ["read", "write", "import", "sync"],
        toolIds: ["mailbox.search_messages", "applications.create_event"],
        outputArtifacts: ["application_event", "application_signal"],
      },
    ],
    quickPrompts: [
      "把这封 HR 邮件记录到投递进度。",
      "查找最近的面试邀约并更新进度。",
      "根据拒信更新我的筛选策略。",
    ],
  },
  fileManagement: {
    intakeFolder: "applications",
    acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
    acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
    readPaths: ["workspace/ops/data/applications.md", "workspace/ops/imports/agent-attachments/{date}/applications"],
    writePaths: ["workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md", "workspace/ops/exports"],
    outputArtifacts: ["application_event", "follow_up_note", "application_signal"],
  },
};
