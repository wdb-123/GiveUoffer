import type { AgentPageContext, RouteDecision, SkillDefinition } from "@ucareer/shared";

export function buildAgentPrompt(input: {
  userText: string;
  skill: SkillDefinition;
  route: Pick<RouteDecision, "inputKind" | "confidence" | "reason">;
  pageContext?: AgentPageContext;
}): string {
  const content = input.userText.trim();
  const connectorTools = input.skill.connectorTools?.length
    ? input.skill.connectorTools.map((tool) =>
      [
        `- ${tool.id}: ${tool.label}；connector=${tool.connectorId}；readonly=${tool.readonly ? "yes" : "no"}；${tool.description}`,
        tool.inputSchema ? `  Input schema: ${JSON.stringify(tool.inputSchema)}` : "",
      ].filter(Boolean).join("\n"),
    ).join("\n")
    : "- 当前 Skill 没有绑定 connector tool。";
  const hasConnectorTools = Boolean(input.skill.connectorTools?.length);
  const canvasOutputContract = buildCanvasOutputContract(input.skill);
  const routeHandlingInstruction = buildRouteHandlingInstruction(input.skill);
  const toolCallInstruction = hasConnectorTools
    ? [
      "- 需要读取后端工具时，只输出一行工具调用，不要编造工具结果。",
      `- 格式必须是：UC_TOOL_CALL {"tool":"<可用后端工具 id>","input":{...}}`,
      "- 可用 input 字段以工具 schema 为准；不要使用 schema 之外的参数。",
      "- “可用后端工具”是当前 Ucareer skill 暴露给本轮任务的工具集合；如果其中有工具能满足用户请求，优先通过 UC_TOOL_CALL 调用它。",
      "- 后端会执行工具并把 UC_TOOL_RESULT 注入下一轮，然后你再基于结果回答用户。",
      "- 如果 UC_TOOL_RESULT 里有 recommendedNextToolCall，且用户请求包含更新状态/写入/记录/同步进度，下一轮必须直接输出该 recommendedNextToolCall 对应的 UC_TOOL_CALL；不要改写、不要只文字总结。",
      "- 工具描述、input schema 和 UC_TOOL_RESULT 是工具选择与数据来源的事实依据；回答时使用结果中的 connectorLabel、protocol、runId、stats、account、mailbox 等字段描述来源。",
      "- 如果工具结果为空，可以根据工具 schema 调整日期、发件人、主题、正文关键词、分页 offset 等参数再次调用工具；不要臆测未返回的数据源或结果。",
      "- 邮箱里查公司 offer/面试进度时，不要同时锁死 from、subject、content。HR 可能使用个人邮箱或第三方招聘系统；优先用 subject/content 放公司名和 offer/录用/聘用/邀请函关键词，只有用户明确指定发件人时才使用 from。",
      "- 邮箱多策略顺序：A) content 或 subject 搜公司名；B) subject 搜 offer/录用/聘用/邀请函/恭喜；C) content 搜 offer/录用/聘用/邀请函/恭喜；D) 如果仍为空，放宽日期或分页 offset。每轮只放 1-2 类条件，命中后再判断相关性。",
    ].join("\n")
    : input.skill.id === "image.ocr"
      ? [
        "- 当前 skill 不需要后端工具；图片 OCR 在附件上传解析阶段已经完成。",
        "- 直接读取输入内容中附件的 Parsed text 并整理输出。",
        "- 如果没有 Parsed text，读取 Summary/OCR metadata 中的失败原因，说明是未识别出文字、缺少 OCR 语言包，还是本机 OCR 不可用。",
      ].join("\n")
      : [
      "- 当前 skill 没有可调用后端工具时，不要输出 UC_TOOL_CALL。",
      "- 如果用户请求明显需要另一个 skill 的工具能力，不要假装当前工具足够；明确说当前后端路由不匹配，并说明应切换到哪个 skill。",
    ].join("\n");
  return `你是 Ucareer 职业旅程工作台的统一入口 Agent。请按后端路由结果处理输入。

后端路由：
- Skill: ${input.skill.label} (${input.skill.id})
- Domain: ${input.skill.domain}
- Input kind: ${input.route.inputKind}
- Confidence: ${input.route.confidence}
- Reason: ${input.route.reason}

可用后端工具：
${connectorTools}

工具调用协议：
${toolCallInstruction}

${canvasOutputContract}

处理原则：
1. ${routeHandlingInstruction}
2. 粘贴岗位相关单链接不是自动搜索：默认只处理用户给的这个链接/当前选中岗位，不要改成 jobsearch.search_jobs/scan/radar 去找更多岗位。只有用户明确要求“找一批/搜索/扫描/跑雷达/看看有哪些岗位”时才搜索更多岗位。
3. 只记录链接是显式动作：只有用户明确说“只记录/先记一下/保存链接/不要解析/不要读取详情”时，才调用 market.record_link。用户粘贴岗位相关链接且没有明确禁止解析时，优先读取或导入岗位。
4. BOSS/Zhipin 的 /web/geek/jobs?... URL 可能是搜索容器，也可能在用户 Chrome 里已经选中了一个岗位详情。不要武断说它不是单条岗位；如果可用工具里有 jobsearch.import_current_job，应调用它读取当前 Boss 标签页的选中岗位，只处理当前岗位，不要批量搜索。
5. 岗位链接或岗位文本：具体 /job_detail/ 链接、官网 JD 链接或完整 JD 文本可以调用 market.import，把 url/description/source 传入并写入岗位库；不要先生成长篇评估报告。对 BOSS /web/geek/jobs?... 这种当前页 URL，优先用 jobsearch.import_current_job，而不是 market.record_link。
6. 投递记录、投递成功页、HR/面试/拒信/offer/assessment 信息：如果可用工具里有 applications.create_event，抽取 company、role、event、date、next_action、note/evidence 后调用它写入投递进度。用户明确说“更新状态/更新投递进度/写入/记录到管线/同步状态”时，命中高置信度邮件后必须继续调用 applications.create_event，不要只回答“可以写入”。只有缺少公司或岗位且无法从历史事件补齐时，才先说明缺失字段并请求补充。
7. 复盘中心/复盘笔记：用户说“记录复盘/记一下/保存到复盘中心/写一条复盘”时，优先调用 evidence.note 保存自由笔记；不要改成 applications.create_event，除非用户明确要求更新投递进度。
8. 邮箱消息：如果需要邮箱数据，按可用 connector tool 的说明和 schema 调用工具；只处理和用户请求相关的邮件，不读取或输出授权码、隐私无关邮件和完整邮箱内容。回答时引用工具结果中的 connectorLabel、protocol、account、mailbox。
9. 项目经历：抽取项目背景、我的角色、技术栈、可量化成果、可写入简历的证明点、证据缺口，并准备更新经历资产或复盘中心。
10. 简历请求：基于职业资产和目标岗位，准备生成可信、可追溯的简历版本。
11. 结果学习：从投递结果、拒绝原因和反馈中提取可更新画像和筛选策略的学习信号。
12. 只读检查本地工作区（列目录、读取文件、搜索、统计数量）可以直接执行。
13. 如果后端工具提供页面相关能力，优先使用本轮可用工具；不要把用户数据写到系统层文件。
14. 不要直接提交任何外部申请；本地写入、删除、同步、安装、联网发送或破坏性命令必须先请求确认。
15. 图片 OCR：如果当前 skill 是 image.ocr，优先输出附件 Parsed text 的识别结果；不要因为没有 connector tool 就说无法 OCR。若 Parsed text 为空，说明 OCR 引擎/语言包状态，并给出可执行的补救方式。

输入内容：
${content}`;
}

export function buildToolResultFollowupInstruction(skill?: Pick<SkillDefinition, "id" | "label">): string {
  const normalizedSkill = skill
    ? { id: skill.id, label: skill.label }
    : { id: "agent.general", label: "通用 Agent" };
  const parts = [
    "请基于工具结果回答用户。",
    "如果工具结果包含 recommendedNextToolCall，且用户要求更新/写入/记录/同步状态，请下一步直接输出 recommendedNextToolCall 里的 UC_TOOL_CALL，不要只文字回答。",
    "不要再次输出同一个工具调用，除非确实需要分页读取更多结果。",
    buildCanvasOutputContract(normalizedSkill),
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function buildCanvasOutputContract(skill: Pick<SkillDefinition, "id" | "label">): string {
  if (!shouldUseCanvasForSkill(skill.id)) {
    return `输出规范：
- 这是普通对话/帮助/OCR/轻量分析场景，默认只输出自然语言正文。
- 不要输出“页面相关 Canvas 卡片”、字段表、对象卡、runId、工具字段或结构化表格，除非用户明确要求表格/JSON/结构化数据。
- OCR 结果只需要直接给出识别文本和必要的简短说明。`;
  }
  return `Canvas 输出规范：
- 你的最终回答要分成“正文 + 页面相关 Canvas 卡片”两层：正文是完整回答，卡片是快速理解的摘要/索引。不要因为有卡片就省略必要解释、判断依据、风险说明或下一步建议。
- 正文先给一句明确结论，再用自然语言说明为什么、发生了什么、你做了什么、还缺什么。正文必须能独立读懂；卡片用于让用户快速扫到关键对象和关键字段。
- 卡片不是随意加粗列表；要使用稳定字段名和短标签，让前端可以识别并渲染模板。字段缺失时写“待补充/待复核”，不要编造。
- 每张卡片只解决一个对象：一个岗位、一份简历、一个投递事件、一个项目经历、一个复盘信号。多个对象用多张同类卡片，不要塞进同一张。
- 卡片内容要克制：标题 1 行优先，核心指标 3-5 个，标签 3-8 个，执行详情放在最后并保持可折叠语义。不要把正文解释塞进卡片，也不要输出大段原始 JSON。
- 工具执行信息只放到“执行详情”或“来源”区域；用户最先看到的是结果本身，不是工具名。

页面卡片模板：
- 岗位导入/评估 (${skill.id === "job.evaluate" || skill.id === "job.scan" ? "本轮优先" : "可用时"}): 使用“岗位结果卡”。正文要说明是否已导入/更新、为什么这样处理、哪些字段可靠/待复核、下一步怎么做；卡片字段固定为 id、公司、岗位、城市、薪资、平台、方向、关键词、URL、来源、执行说明、工具、运行状态、统计、runId。
- 岗位搜索: 使用“岗位列表卡”。正文要总结搜索范围、命中质量、主要筛选建议和风险；卡片列出最相关 3-8 个岗位，每个岗位包含公司、岗位、薪资、地点、匹配原因、风险提示、URL/本地 id。
- 简历诊断/导入/优化 (${skill.id === "resume.generate" ? "本轮优先" : "可用时"}): 使用“简历优化卡”。正文要说明诊断结论、优化策略、取舍原因、哪些经历被强化、哪些证据仍缺失；卡片字段固定为 简历标题、目标岗位、诊断报告文件、版本文件/建议版本文件、优化重点、已增强证据、待补证据、导出格式、下一步。诊断类请求必须调用 resumes.save_diagnosis 把诊断结果保存到 workspace/resumes/diagnostics/，最终回答必须给出报告路径。若用户只是要诊断或修改建议，不要自动保存或覆盖原简历；可以给出可替换 bullet 和生成新版建议。不要把整份简历贴满屏；只展示摘要和文件入口。
- 投递进度/邮箱: 使用“投递事件卡”。正文要说明事件判断依据、是否已写入、后续动作和时间风险；字段固定为 公司、岗位、事件、日期、来源、证据摘要、下一步、风险/截止时间、写入状态。邮箱内容只输出安全摘要，不输出验证码、完整隐私正文。
- 经历资产/复盘: 使用“经历资产卡”或“复盘信号卡”。正文要解释沉淀价值、适用岗位、证据强弱和补证路线；字段固定为 项目/信号、能力标签、可量化证据、可写入简历的句子、证据缺口、下一步。
- 通用问答: 没有结构化对象时用短正文即可；不要硬造卡片。`;
}

function buildRouteHandlingInstruction(skill: Pick<SkillDefinition, "id" | "label">): string {
  if (!shouldUseCanvasForSkill(skill.id)) {
    return "不要向用户提及后端路由、skill、inputKind、工具可用性或 Canvas；直接按普通对话/OCR/帮助请求回答。只有确实无法完成时，才用自然语言简短说明原因。";
  }
  return "先验证后端路由是否正确；如果不正确，说明你改判成什么 skill/inputKind。只有当前已暴露工具能完成请求时才继续；否则要求重新路由，不要用错误 skill 的工具凑合。";
}

function shouldUseCanvasForSkill(skillId: string): boolean {
  return [
    "job.evaluate",
    "job.scan",
    "resume.generate",
    "application.progress",
    "mailbox.read",
    "experience.capture",
    "outcome.learn",
  ].includes(skillId);
}
