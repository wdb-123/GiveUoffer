import type {
  AgentPageContext,
  RecruitmentMarket,
  ResumeDocument,
} from "@ucareer/shared";

export function buildMailboxProgressPrompt(): string {
  return `请直接检索已连接邮箱，找和求职/面试/投递进度有关的邮件，并把高置信度事件写入投递进度。

检索范围：
- 时间：最近 90 天，优先最近 30 天。
- 邮箱目录：优先 INBOX；如果结果太少，再尝试常见目录（收件箱/已归档可用时）。
- 关键词分组多次搜索，不要只搜一个词：
  1. 面试、邀约、预约、interview、invitation
  2. HR、招聘、recruit、talent、面试官
  3. 投递、申请、简历、已收到、application、applied、received
  4. 测评、笔试、assessment
  5. 拒绝、不合适、unfortunately、rejected
  6. offer、录用、意向

处理规则：
1. 使用 mailbox.search_messages 只读搜索邮件摘要，不要输出完整邮件正文、验证码或无关隐私内容。
2. 只处理和工作申请、面试、HR 跟进、测评、拒信、offer 明确相关的邮件。
3. 二次过滤规则：必须同时满足“招聘上下文”和“投递/面试事件”。招聘上下文包括：招聘系统、HR、recruit/talent/hire、BOSS/智联/猎聘/飞书招聘、公司招聘邮箱等；事件包括：面试、邀约、投递回执、测评、拒信、offer。只有 schedule/news/event/webinar/pricing/SLA/newsletter 这类词时不要算求职邮件。
4. 排除营销、新闻订阅、云服务价格更新、活动通知、账单、验证码、无关技术社区邮件。
5. 对每封命中邮件提取：公司、岗位、事件类型、日期、下一步动作、证据摘要。
6. 必须先调用 applications.list 对照已有投递，避免重复。
7. 对每封高置信度邮件，必须调用 applications.create_event 写入投递进度。字段至少包含 company、role、event、date、next_action、note、evidence、email_snapshot；email_snapshot 里放 uid、mailbox、from、subject、date、snippet，能拿到更完整正文摘要时放 rawText，offer 邮件如果 message.attachments 有本地附件路径也必须放进 email_snapshot.attachments。同公司同岗位多封不同日期/阶段的面试邮件可以分别写入。
8. 如果没有成功调用 applications.create_event，不要说“已写入”或“已入库”，只能说“识别到但未写入”。
9. 公司或岗位不确定时，用“待确认公司/待确认岗位”，并在 note 里说明不确定点。
10. 最终只输出：找到几封相关邮件、成功写入几条投递事件、跳过了几条重复事件、需要用户确认的事项。`;
}

export function buildMailboxProgressContext(): AgentPageContext {
  return {
    pageId: "applications",
    pageLabel: "投递进度",
    suggestedSkillId: "application.progress",
    suggestedInputKind: "application_update",
    summary: "让 Agent 从已连接邮箱中查找面试、HR 回复、投递回执、测评、拒信和 offer 相关邮件，并更新投递进度。",
    readPaths: ["workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md"],
    writePaths: ["workspace/ops/data/application-events.jsonl", "workspace/ops/data/applications.md", "workspace/ops/data/follow-ups.md", "workspace/ops/exports"],
    capabilities: ["read", "write", "import", "sync"],
  };
}

export function buildMarketReportPrompt(job: RecruitmentMarket["jobs"][number]): string {
  return `请为这个岗位生成一份评估报告，并按 Ucareer 报告规范写入 workspace/jobs/reports/，必要时更新岗位/投递相关记录。不要提交任何外部申请。

岗位信息：
- 公司：${job.company || "待复核"}
- 岗位：${job.role || "待复核岗位"}
- 链接：${job.url || "未提供"}
- 地点：${job.location || "未披露"}
- 薪资：${job.salary || "未披露"}
- 来源：${job.source || job.platform || "来源未知"}
- 方向：${job.direction || "未分类"}
- 当前评分：${typeof job.matchScore === "number" ? job.matchScore.toFixed(1) : "未评分"}
- 关键词：${job.keywords?.join("、") || "无"}
- 匹配理由：${job.fitReason || "未记录"}
- 证据缺口：${job.evidenceGap || "未记录"}

要求：
1. 先验证岗位链接是否仍有效；无法确认时在报告里标注。
2. 按匹配度、薪资/职级、方向、风险、证据缺口给出结论。
3. 报告生成后告诉我报告文件名和是否建议投递。`;
}

export function buildMarketReportContext(job: RecruitmentMarket["jobs"][number]): AgentPageContext {
  return {
    pageId: "market",
    pageLabel: "岗位列表",
    suggestedSkillId: "job.evaluate",
    suggestedInputKind: "job_description",
    summary: `从岗位列表为「${job.company || "待复核公司"} - ${job.role || "待复核岗位"}」生成评估报告。`,
    selectedEntity: {
      type: "market_job",
      title: `${job.company || "待复核公司"} - ${job.role || "待复核岗位"}`,
      ...(job.url ? { path: job.url } : {}),
    },
    readPaths: ["workspace/jobs/jds", "workspace/jobs/reports", "workspace/ops/data/applications.md"],
    writePaths: ["workspace/jobs/jds", "workspace/jobs/reports", "workspace/ops/batch/tracker-additions", "workspace/ops/data/applications.md"],
    capabilities: ["read", "write", "generate", "diagnose", "import"],
  };
}

export function buildResumeDiagnosisPrompt(input: {
  file: string;
  targetJobId?: string | undefined;
  selectedResume: ResumeDocument | null;
  jobs: RecruitmentMarket["jobs"];
}): string {
  const targetJob = input.targetJobId ? input.jobs.find((job) => job.id === input.targetJobId) : null;
  return `请诊断并优化这份简历。本轮必须生成一份诊断报告文件，但不要直接覆盖原简历；先输出“诊断结论 + 修改建议 + 可改写片段 + 是否建议生成新版简历”的方案。

简历信息：
- 内部读取键：${input.file}
- 标题：${input.selectedResume?.title || "未读取到标题"}
- 目标岗位：${targetJob ? `${targetJob.company || "待复核公司"} - ${targetJob.role || "待复核岗位"}` : "未绑定具体岗位"}
- 目标岗位薪资/地点：${targetJob ? `${targetJob.salary || "未披露"} / ${targetJob.location || "未披露"}` : "未绑定"}

要求：
1. 使用 resume.generate / resumes.get 读取当前简历，必要时读取 resumes.list 和目标岗位信息。
2. 生成 Markdown 诊断报告，包含：结论、主要问题、修改优先级、证据缺口、3-6 条可替换 bullet、是否建议生成新版、下一步。
3. 必须调用 resumes.save_diagnosis 保存诊断报告；文件名用可读中文标题，不要使用 MJ 编号或莫名其妙的数字 ID。
4. 不要自动保存、不要覆盖原简历、不要虚构经历或指标；保存的是诊断报告，不是新版简历。
5. 输出正文：一句结论 + 主要问题 + 修改优先级 + 证据缺口 + 建议下一步。不要向用户展示内部文件名、路径或岗位 ID。
6. 输出“简历优化卡”：包含简历标题、目标岗位、优化重点、已增强证据、待补证据、导出格式、下一步。
7. 给出 3-6 条可以直接替换进简历的 bullet 改写建议；每条说明为什么这样改。
8. 如果证据不足，明确指出需要用户补充哪些项目数据，不要硬编。`;
}

export function buildResumeDiagnosisContext(selectedResume: ResumeDocument | null): AgentPageContext {
  return {
    pageId: "resumes",
    pageLabel: "我的简历",
    suggestedSkillId: "resume.generate",
    suggestedInputKind: "resume_request",
    summary: `诊断当前选中的简历${selectedResume ? `「${selectedResume.title}」` : ""}，生成诊断报告文件并输出修改建议和可执行的改写方案。`,
    selectedEntity: selectedResume
      ? { type: "resume", title: selectedResume.title }
      : { type: "resume" },
    readPaths: ["workspace/profile/cv.md", "workspace/profile/profile.yml", "workspace/profile/_profile.md", "workspace/resumes/library", "workspace/resumes/diagnostics", "workspace/jobs/jds", "workspace/ops/data/market.json"],
    writePaths: ["workspace/resumes/library", "workspace/resumes/rendered", "workspace/resumes/diagnostics", "workspace/ops/exports"],
    capabilities: ["read", "write", "generate", "diagnose"],
  };
}
