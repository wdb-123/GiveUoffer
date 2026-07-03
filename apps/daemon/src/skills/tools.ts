import type { SkillDefinition } from "@ucareer/shared";

export type SkillToolDefinition = NonNullable<SkillDefinition["connectorTools"]>[number];

export const mailboxSearchTool: SkillToolDefinition = {
  id: "mailbox.search_messages",
  connectorId: "qq-email",
  label: "搜索 QQ 邮箱消息",
  description: "通过已连接的 qq-email 连接器只读搜索 QQ 邮箱邮件。返回结果会包含 connectorLabel、protocol、account、mailbox 和 messages 摘要；适合按日期、发件人、主题、正文关键词搜索邮箱消息，也可用于识别 HR 回复、拒信、面试邀请、账单和投递状态变化。搜索字段之间是 AND 关系：同时填写 from、subject、content 会明显收窄结果。查公司 offer/面试进度时要多策略：先用 subject/content 搜公司名或职位，再用 subject/content 搜 offer/录用/聘用/邀请函/恭喜，不要默认把公司名放进 from，因为 HR 可能用个人邮箱或第三方招聘系统发信。offer 命中时工具会尝试拉取最相关邮件的附件，并把附件本地路径放到 message.attachments。",
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
      from: { type: "string", description: "发件人邮箱、域名或 HR 名称。不要默认用公司名填 from；很多 offer 来自 HR 个人邮箱或招聘系统。" },
      subject: { type: "string", description: "主题关键词。查 offer 可单独搜“聘用/邀请函/录用/offer/恭喜”，或只搜公司名；不要和 from/content 同时锁太死。" },
      content: { type: "string", description: "正文关键词。查公司进度可搜公司名；查 offer 可搜 offer/录用/聘用/邀请函/恭喜。IMAP BODY 搜索依赖服务端匹配，多关键词场景应拆成多次调用。" },
      snippetBytes: { type: "number", default: 4000, minimum: 800, maximum: 12000, description: "每封邮件摘要字节数上限；工具不会返回授权码或完整邮箱内容" },
    },
  },
};

export const jobSearchTool: SkillToolDefinition = {
  id: "jobsearch.search_jobs",
  connectorId: "jobsearch",
  label: "搜索招聘网站岗位",
  description: "通过 jobsearch 搜索已接入招聘网站，把发现的新岗位写入本地岗位市场，并返回搜索统计和岗位摘要。适合用户说“去 Boss/BOSS 直聘看看岗位”“在 Boss/智联/猎聘找职位”“找岗位”“跑岗位雷达”“从招聘网站搜今天值得推进的岗位”等请求。默认用 all 让系统按 Codex Chrome、Boss Agent、中国平台爬虫依次尝试；用户明确要求只读当前已登录 Chrome/Boss 页面时，source 才选 codex-chrome。注意：Boss /web/geek/jobs?... 可能同时展示当前选中岗位详情，不能仅凭 URL 判定它不是岗位详情。",
  capability: "import_jobs",
  risk: "medium",
  readonly: false,
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", enum: ["codex-chrome", "boss-agent", "china-crawler", "all"], default: "all", description: "搜索来源；默认 all，会依次运行可用来源并自动兜底；只有用户明确要求只读当前 Chrome/Boss 页面时才用 codex-chrome；只有本机 boss CLI 可用且用户明确要求 Boss Agent 时才用 boss-agent" },
      city: { type: "string", default: "深圳", description: "城市，例如 深圳、上海、北京、杭州" },
      queries: { type: "array", items: { type: "string" }, description: "岗位关键词数组，例如 ['机器人系统工程师','ROS2']" },
      max: { type: "number", default: 25, minimum: 1, maximum: 100, description: "最多新增/返回的候选岗位数量" },
      minMatchScore: { type: "number", default: 0, description: "最低匹配分，默认不过滤" },
      withDetails: { type: "boolean", default: true, description: "是否抓取详情页并把 JD 正文写入 workspace/jobs/jds，可能更慢" },
      dryRun: { type: "boolean", default: false, description: "只试跑不写入本地岗位市场" },
    },
  },
};

export const currentJobImportTool: SkillToolDefinition = {
  id: "jobsearch.import_current_job",
  connectorId: "jobsearch",
  label: "读取当前 Boss 选中岗位",
  description: "通过 Ucareer Chrome 扩展读取用户当前 Chrome/Boss 直聘标签页里已经选中的单个岗位详情，并写入本地岗位市场。适合用户粘贴 Boss /web/geek/jobs?... 当前页链接、说“这个岗位/当前选中的岗位/这个链接里的岗位/读取这个 Boss 岗位/导入这个岗位”。它只处理当前可见选中岗位，不会搜索更多岗位；只有用户明确说只记录、先保存、不解析时才不要用它。",
  capability: "import_jobs",
  risk: "medium",
  readonly: false,
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "用户粘贴的 Boss/Zhipin 当前页 URL，可选；工具优先读取当前 Chrome 活跃 Boss 标签页。" },
      dryRun: { type: "boolean", default: false, description: "只试读不写入本地岗位市场" },
    },
  },
};

export const applicationTools = [
  workspaceTool("applications.list", "读取投递进度", "读取本地投递列表、指标和最近事件。", true, { limit: { type: "number" } }),
  workspaceTool("applications.create_event", "新增投递事件", "为投递记录新增事件，例如已投递、HR 回复、面试、拒绝、备注。", false, {
    application_id: { type: "string" },
    company: { type: "string" },
    role: { type: "string" },
    event: { type: "string" },
    date: { type: "string", description: "YYYY-MM-DD，事件发生日期" },
    due: { type: "string", description: "YYYY-MM-DD，回复/面试/截止日期" },
    next_action: { type: "string" },
    note: { type: "string" },
    evidence: { type: "string" },
    email_snapshot: { type: "object", description: "可选，来自邮箱工具的 uid/mailbox/from/subject/date/snippet/rawText/attachments 证据快照" },
  }),
  workspaceTool("applications.update_event", "更新投递事件", "按 event_id 更新一条投递事件。", false, { event_id: { type: "string" }, event: { type: "string" }, next_action: { type: "string" }, note: { type: "string" } }),
  workspaceTool("applications.delete_event", "删除投递事件", "按 event_id 删除一条投递事件。", false, { event_id: { type: "string" } }),
];

export const marketTools = [
  workspaceTool("market.list", "读取岗位列表", "读取本地岗位市场，返回岗位摘要。", true, { limit: { type: "number", default: 80 } }),
  workspaceTool("market.record_link", "记录链接", "只把用户粘贴的原始链接记录到 workspace/ops/data/pipeline.md 的待处理列表；不抓取页面、不解析岗位、不搜索更多岗位。仅适合用户明确说“只记录/先记一下/保存链接/不要解析/不要读取详情”。如果是岗位相关单链接且用户没有明确禁止解析，优先读取或导入岗位。", false, { url: { type: "string" }, note: { type: "string" }, source: { type: "string" } }),
  workspaceTool("market.import", "导入岗位", "把岗位链接或岗位描述导入本地岗位市场。", false, { url: { type: "string" }, description: { type: "string" }, source: { type: "string" } }),
  workspaceTool("market.update", "更新岗位", "按岗位 id 更新公司、岗位、薪资、方向、评分、关键词等字段。", false, { id: { type: "string" }, company: { type: "string" }, role: { type: "string" }, matchScore: { type: "number" }, keywords: { type: "array", items: { type: "string" } } }),
  workspaceTool("market.delete", "删除岗位", "按岗位 id 从本地岗位市场删除岗位。", false, { id: { type: "string" } }),
];

export const resumeTools = [
  workspaceTool("resumes.list", "读取简历列表", "读取本地简历库列表和岗位绑定信息。", true),
  workspaceTool("resumes.get", "读取简历", "按文件名读取一份简历 markdown。", true, { file: { type: "string" } }),
  workspaceTool("resumes.save", "保存简历", "新增或更新一份简历 markdown。", false, { file: { type: "string" }, title: { type: "string" }, markdown: { type: "string" }, targetJobId: { type: "string" } }),
  workspaceTool("resumes.save_diagnosis", "保存简历诊断报告", "把一次简历诊断结果保存为 Markdown 报告，路径固定在 workspace/resumes/diagnostics/；只保存诊断和修改建议，不覆盖原简历。诊断类请求必须优先调用这个工具生成可追踪文件。", false, { file: { type: "string" }, title: { type: "string" }, markdown: { type: "string" }, resumeFile: { type: "string" }, targetJobId: { type: "string" } }),
  workspaceTool("resumes.delete", "删除简历", "按文件名删除一份本地简历。", false, { file: { type: "string" } }),
];

export const experienceTools = [
  workspaceTool("experience.list", "读取经历资产", "读取项目经历、职业画像资产、职业照和意向资产摘要。", true),
  workspaceTool("experience.upsert", "新增或更新经历资产", "新增或更新一条经历 metadata。", false, { id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, tags: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } } }),
  workspaceTool("experience.delete", "删除经历资产", "按 id 删除一条经历 metadata。", false, { id: { type: "string" } }),
];

export const evidenceTools = [
  workspaceTool("evidence.list", "读取复盘记录", "读取复盘中心的手写记录和待补证据请求列表。", true),
  workspaceTool("evidence.note", "保存复盘笔记", "把用户随手输入的投递、沟通、面试、拒信或方向判断保存为复盘中心手写记录。用户说“记录复盘/记一下/保存到复盘中心/写一条复盘”时优先使用这个工具，而不是 applications.create_event。", false, { content: { type: "string" }, title: { type: "string" } }),
  workspaceTool("evidence.upsert", "新增或更新证据请求", "新增或更新一个复盘/证据缺口请求。", false, { id: { type: "string" }, direction: { type: "string" }, gap: { type: "string" }, priority: { type: "string" }, targetFile: { type: "string" } }),
  workspaceTool("evidence.fulfill", "补充证据", "按 requestId 把补充内容追加到目标项目文件。", false, { requestId: { type: "string" }, content: { type: "string" }, source: { type: "string" } }),
  workspaceTool("evidence.delete", "删除证据请求", "按 id 删除证据请求。", false, { id: { type: "string" } }),
];

function workspaceTool(id: string, label: string, description: string, readonly: boolean, properties: Record<string, unknown> = {}): SkillToolDefinition {
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
