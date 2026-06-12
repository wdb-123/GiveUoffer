import type { SkillDefinition } from "@ucareer/shared";

const mailboxSearchTool: NonNullable<SkillDefinition["connectorTools"]>[number] = {
  id: "mailbox.search_messages",
  connectorId: "qq-email",
  label: "搜索 QQ 邮箱消息",
  description: "通过已连接的 qq-email 连接器只读搜索 QQ 邮箱邮件。返回结果会包含 connectorLabel、protocol、account、mailbox 和 messages 摘要；适合按日期、发件人、主题、正文关键词搜索邮箱消息，也可用于识别 HR 回复、拒信、面试邀请、账单和投递状态变化。",
  capability: "search_messages",
  risk: "low",
  readonly: true,
  inputSchema: {
    type: "object",
    properties: {
      mailbox: { type: "string", default: "INBOX", description: "邮箱目录，默认 INBOX" },
      limit: { type: "number", default: 20, minimum: 1, maximum: 100, description: "返回数量上限；例如“前十条”应使用 limit: 10" },
      offset: { type: "number", default: 0, minimum: 0, description: "分页偏移量；日期窗口内结果较多时递增 offset 读取更早结果" },
      query: { type: "string", enum: ["all", "unseen"], default: "all", description: "all 搜索全部邮件；unseen 只搜索未读邮件" },
      sinceDate: { type: "string", description: "YYYY-MM-DD，包含该日期；用于限定搜索起始日期" },
      beforeDate: { type: "string", description: "YYYY-MM-DD，不包含该日期；用于限定搜索结束日期" },
      from: { type: "string", description: "发件人邮箱、域名、公司名或名称关键词，例如招聘系统域名、HR 名称" },
      subject: { type: "string", description: "主题关键词，适合搜索面试邀约、拒信、账单、验证码、招聘平台通知等标题信号" },
      content: { type: "string", description: "正文关键词；IMAP BODY 搜索可能依赖服务端匹配策略，中文或多关键词场景可拆成多次调用，或配合 subject/from/date/offset 使用" },
      snippetBytes: { type: "number", default: 4000, minimum: 800, maximum: 12000, description: "每封邮件摘要字节数上限；工具不会返回授权码或完整邮箱内容" },
    },
  },
};

const jobSearchTool: NonNullable<SkillDefinition["connectorTools"]>[number] = {
  id: "jobsearch.search_jobs",
  connectorId: "jobsearch",
  label: "搜索招聘网站岗位",
  description: "通过 jobsearch 搜索已接入招聘网站，把发现的新岗位写入本地岗位市场，并返回搜索统计和岗位摘要。适合用户说“去 Boss/BOSS 直聘看看岗位”“在 Boss/智联/猎聘找职位”“找岗位”“跑岗位雷达”“从招聘网站搜今天值得推进的岗位”等请求。用户明确要求 Codex Chrome、已登录 Chrome、读取 Boss 当前页面时，source 选 codex-chrome。",
  capability: "import_jobs",
  risk: "medium",
  readonly: false,
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", enum: ["codex-chrome", "boss-agent", "china-crawler", "all"], default: "boss-agent", description: "搜索来源；默认 boss-agent，适合 Boss / 智联的本地登录态通道；用户明确要求 Codex Chrome 或已登录 Chrome 读取 Boss 时用 codex-chrome；all 会依次运行可用来源" },
      city: { type: "string", default: "深圳", description: "城市，例如 深圳、上海、北京、杭州" },
      queries: { type: "array", items: { type: "string" }, description: "岗位关键词数组，例如 ['机器人系统工程师','ROS2']" },
      max: { type: "number", default: 25, minimum: 1, maximum: 100, description: "最多新增/返回的候选岗位数量" },
      minMatchScore: { type: "number", default: 0, description: "最低匹配分，默认不过滤" },
      withDetails: { type: "boolean", default: false, description: "是否抓取详情页，可能更慢" },
      dryRun: { type: "boolean", default: false, description: "只试跑不写入本地岗位市场" },
    },
  },
};

function workspaceTool(id: string, label: string, description: string, readonly: boolean, properties: Record<string, unknown> = {}): NonNullable<SkillDefinition["connectorTools"]>[number] {
  return {
    id,
    connectorId: "local-workspace",
    label,
    description,
    capability: readonly ? "export_artifacts" : "sync_events",
    risk: readonly ? "low" : "medium",
    readonly,
    inputSchema: {
      type: "object",
      properties,
    },
  };
}

const applicationTools = [
  workspaceTool("applications.list", "读取投递进度", "读取本地投递列表、指标和最近事件。", true, { limit: { type: "number" } }),
  workspaceTool("applications.create_event", "新增投递事件", "为投递记录新增事件，例如已投递、HR 回复、面试、拒绝、备注。", false, {
    application_id: { type: "string" },
    company: { type: "string" },
    role: { type: "string" },
    event: { type: "string" },
    next_action: { type: "string" },
    note: { type: "string" },
    evidence: { type: "string" },
  }),
  workspaceTool("applications.update_event", "更新投递事件", "按 event_id 更新一条投递事件。", false, { event_id: { type: "string" }, event: { type: "string" }, next_action: { type: "string" }, note: { type: "string" } }),
  workspaceTool("applications.delete_event", "删除投递事件", "按 event_id 删除一条投递事件。", false, { event_id: { type: "string" } }),
];

const marketTools = [
  workspaceTool("market.list", "读取岗位列表", "读取本地岗位市场，返回岗位摘要。", true, { limit: { type: "number", default: 80 } }),
  workspaceTool("market.import", "导入岗位", "把岗位链接或岗位描述导入本地岗位市场。", false, { url: { type: "string" }, description: { type: "string" }, source: { type: "string" } }),
  workspaceTool("market.update", "更新岗位", "按岗位 id 更新公司、岗位、薪资、方向、评分、关键词等字段。", false, { id: { type: "string" }, company: { type: "string" }, role: { type: "string" }, matchScore: { type: "number" }, keywords: { type: "array", items: { type: "string" } } }),
  workspaceTool("market.delete", "删除岗位", "按岗位 id 从本地岗位市场删除岗位。", false, { id: { type: "string" } }),
];

const resumeTools = [
  workspaceTool("resumes.list", "读取简历列表", "读取本地简历库列表和岗位绑定信息。", true),
  workspaceTool("resumes.get", "读取简历", "按文件名读取一份简历 markdown。", true, { file: { type: "string" } }),
  workspaceTool("resumes.save", "保存简历", "新增或更新一份简历 markdown。", false, { file: { type: "string" }, title: { type: "string" }, markdown: { type: "string" }, targetJobId: { type: "string" } }),
  workspaceTool("resumes.delete", "删除简历", "按文件名删除一份本地简历。", false, { file: { type: "string" } }),
];

const experienceTools = [
  workspaceTool("experience.list", "读取经历资产", "读取项目经历、职业画像资产、职业照和意向资产摘要。", true),
  workspaceTool("experience.upsert", "新增或更新经历资产", "新增或更新一条经历 metadata。", false, { id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, tags: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } } }),
  workspaceTool("experience.delete", "删除经历资产", "按 id 删除一条经历 metadata。", false, { id: { type: "string" } }),
];

const evidenceTools = [
  workspaceTool("evidence.list", "读取复盘证据请求", "读取复盘中心的证据请求列表。", true),
  workspaceTool("evidence.upsert", "新增或更新证据请求", "新增或更新一个复盘/证据缺口请求。", false, { id: { type: "string" }, direction: { type: "string" }, gap: { type: "string" }, priority: { type: "string" }, targetFile: { type: "string" } }),
  workspaceTool("evidence.fulfill", "补充证据", "按 requestId 把补充内容追加到目标项目文件。", false, { requestId: { type: "string" }, content: { type: "string" }, source: { type: "string" } }),
  workspaceTool("evidence.delete", "删除证据请求", "按 id 删除证据请求。", false, { id: { type: "string" } }),
];

export const skillRegistry: SkillDefinition[] = [
  {
    id: "job.evaluate",
    label: "岗位评估",
    domain: "job_intelligence",
    description: "解析 JD、判断匹配度、生成评估报告和申请建议。",
    inputKinds: ["job_url", "job_description"],
    defaultProviderId: "codex",
    legacyModeFile: "modes/auto-pipeline.md",
    risk: "medium",
    connectorTools: marketTools,
    fileManagement: {
      intakeFolder: "jobs",
      acceptedAttachmentKinds: ["text", "pdf", "docx"],
      acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json"],
      readPaths: ["workspace/ops/imports/agent-attachments/{date}/jobs", "workspace/jobs/jds", "workspace/ops/data/pipeline.md", "workspace/ops/data/applications.md"],
      writePaths: ["workspace/jobs/reports", "workspace/ops/batch/tracker-additions", "workspace/ops/data/applications.md", "workspace/ops/exports"],
      outputArtifacts: ["job_report", "tracker_entry", "resume_variant"],
    },
  },
  {
    id: "job.scan",
    label: "招聘平台岗位搜索",
    domain: "job_intelligence",
    description: "去 Boss/BOSS 直聘、智联、猎聘等招聘平台或公司招聘门户搜索岗位，把发现的新岗位写入本地岗位市场或 pipeline。用户想主动寻找、浏览、检索、扫描岗位时选这个；用户给出某一个具体岗位链接或完整 JD 时才选岗位评估。",
    inputKinds: ["scan_request"],
    defaultProviderId: "codex",
    legacyModeFile: "modes/scan.md",
    risk: "medium",
    connectorTools: [jobSearchTool, ...marketTools],
    fileManagement: {
      intakeFolder: "jobs",
      acceptedAttachmentKinds: ["text"],
      acceptedExtensions: [".txt", ".md", ".csv", ".json", ".yml", ".yaml"],
      readPaths: ["workspace/profile/portals.yml", "workspace/ops/data/scan-history.tsv", "workspace/ops/data/pipeline.md"],
      writePaths: ["workspace/ops/data/pipeline.md", "workspace/ops/data/scan-history.tsv", "workspace/ops/imports/agent-attachments/{date}/jobs"],
      outputArtifacts: ["pipeline_urls", "scan_history"],
    },
  },
  {
    id: "resume.generate",
    label: "简历生成",
    domain: "resume_engine",
    description: "基于职业资产和目标岗位生成可信、可追溯的简历版本。",
    inputKinds: ["resume_request", "job_description"],
    defaultProviderId: "codex",
    legacyModeFile: "modes/pdf.md",
    risk: "medium",
    connectorTools: resumeTools,
    fileManagement: {
      intakeFolder: "resumes",
      acceptedAttachmentKinds: ["text", "pdf", "docx"],
      acceptedExtensions: [".md", ".txt", ".pdf", ".docx"],
      readPaths: ["workspace/profile/cv.md", "workspace/resumes/library", "workspace/resumes/source", "workspace/ops/imports/agent-attachments/{date}/resumes"],
      writePaths: ["workspace/resumes/library", "workspace/resumes/source", "workspace/resumes/rendered", "workspace/ops/exports"],
      outputArtifacts: ["resume_markdown", "resume_pdf", "resume_docx"],
    },
  },
  {
    id: "mailbox.read",
    label: "邮箱读取",
    domain: "application_crm",
    description: "读取和搜索已连接邮箱消息，按数量、日期、发件人、主题或正文关键词返回安全摘要。",
    inputKinds: ["mailbox_messages"],
    defaultProviderId: "codex",
    risk: "low",
    connectorTools: [mailboxSearchTool, ...applicationTools],
    fileManagement: {
      intakeFolder: "applications",
      acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
      acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
      readPaths: ["workspace/ops/data/applications.md"],
      writePaths: ["workspace/ops/exports"],
      outputArtifacts: ["mailbox_summary", "application_signal"],
    },
  },
  {
    id: "application.progress",
    label: "投递进度导入",
    domain: "application_crm",
    description: "从 HR 消息、拒信、面试邀请或用户备注中抽取投递事件。",
    inputKinds: ["application_update"],
    defaultProviderId: "codex",
    risk: "low",
    connectorTools: [mailboxSearchTool, ...applicationTools],
    fileManagement: {
      intakeFolder: "applications",
      acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
      acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
      readPaths: ["workspace/ops/data/applications.md", "workspace/ops/imports/agent-attachments/{date}/applications"],
      writePaths: ["workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md", "workspace/ops/exports"],
      outputArtifacts: ["application_event", "follow_up_note"],
    },
  },
  {
    id: "experience.capture",
    label: "经历资产沉淀",
    domain: "career_profile",
    description: "把项目、复盘、证明点和证据缺口沉淀到职业资产层。",
    inputKinds: ["project_note", "evidence_note"],
    defaultProviderId: "codex",
    legacyModeFile: "modes/project.md",
    risk: "low",
    connectorTools: [...experienceTools, ...evidenceTools],
    fileManagement: {
      intakeFolder: "experience",
      acceptedAttachmentKinds: ["text", "pdf", "docx", "image"],
      acceptedExtensions: [".md", ".txt", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
      readPaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
      writePaths: ["workspace/jobs/project-notes", "workspace/ops/data/experience-metadata.json", "workspace/profile/article-digest.md"],
      outputArtifacts: ["experience_note", "evidence_request", "story_bank_item"],
    },
  },
  {
    id: "outcome.learn",
    label: "结果学习",
    domain: "outcome_learning",
    description: "从投递结果、拒绝原因和面试反馈中更新画像与筛选策略。",
    inputKinds: ["outcome_feedback"],
    defaultProviderId: "codex",
    legacyModeFile: "modes/patterns.md",
    risk: "medium",
    connectorTools: [...applicationTools, ...evidenceTools, ...experienceTools],
    fileManagement: {
      intakeFolder: "applications",
      acceptedAttachmentKinds: ["text", "pdf", "docx"],
      acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json"],
      readPaths: ["workspace/ops/data/applications.md", "workspace/jobs/reports", "workspace/ops/data/follow-ups.md"],
      writePaths: ["workspace/profile/_profile.md", "workspace/profile/profile.yml", "workspace/profile/article-digest.md", "workspace/ops/exports"],
      outputArtifacts: ["learning_signal", "profile_update", "pattern_report"],
    },
  },
  {
    id: "agent.general",
    label: "通用 Agent",
    domain: "agent_workspace",
    description: "无法明确归类时，进入通用 agent 对话并先做澄清或只读分析。",
    inputKinds: ["general"],
    defaultProviderId: "codex",
    risk: "medium",
    fileManagement: {
      intakeFolder: "general",
      acceptedAttachmentKinds: ["text", "pdf", "docx", "image", "unknown"],
      acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"],
      readPaths: ["workspace/ops/imports/agent-attachments/{date}/general", "workspace/ops/imports/agent-attachments/{date}/documents"],
      writePaths: ["workspace/ops/exports"],
      outputArtifacts: ["analysis_note", "clarification_request"],
    },
  },
];

export function getSkill(skillId: string): SkillDefinition | undefined {
  return skillRegistry.find((skill) => skill.id === skillId);
}

export function getSkillFileManagement(skillId: string): SkillDefinition["fileManagement"] | undefined {
  return getSkill(skillId)?.fileManagement;
}
