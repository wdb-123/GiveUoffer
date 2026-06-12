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
  const toolCallInstruction = hasConnectorTools
    ? [
      "- 需要读取后端工具时，只输出一行工具调用，不要编造工具结果。",
      `- 格式必须是：UC_TOOL_CALL {"tool":"<可用后端工具 id>","input":{...}}`,
      "- 可用 input 字段以工具 schema 为准；不要使用 schema 之外的参数。",
      "- “可用后端工具”是当前 Ucareer skill 暴露给本轮任务的工具集合；如果其中有工具能满足用户请求，优先通过 UC_TOOL_CALL 调用它。",
      "- 后端会执行工具并把 UC_TOOL_RESULT 注入下一轮，然后你再基于结果回答用户。",
      "- 工具描述、input schema 和 UC_TOOL_RESULT 是工具选择与数据来源的事实依据；回答时使用结果中的 connectorLabel、protocol、runId、stats、account、mailbox 等字段描述来源。",
      "- 如果工具结果为空，可以根据工具 schema 调整日期、发件人、主题、正文关键词、分页 offset 等参数再次调用工具；不要臆测未返回的数据源或结果。",
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

处理原则：
1. 先验证后端路由是否正确；如果不正确，说明你改判成什么 skill/inputKind。只有当前已暴露工具能完成请求时才继续；否则要求重新路由，不要用错误 skill 的工具凑合。
2. 岗位信息：读取链接或岗位文本，抽取公司、岗位、地点、薪资、JD 信号、匹配点、风险点，并准备进入岗位评估/岗位库流程。
3. 招聘进度：抽取公司、岗位、事件类型、日期、下一步动作、截止时间和证据原文，并准备更新投递事件。
4. 邮箱消息：如果需要邮箱数据，按可用 connector tool 的说明和 schema 调用工具；只处理和用户请求相关的邮件，不读取或输出授权码、隐私无关邮件和完整邮箱内容。回答时引用工具结果中的 connectorLabel、protocol、account、mailbox。
5. 项目经历：抽取项目背景、我的角色、技术栈、可量化成果、可写入简历的证明点、证据缺口，并准备更新经历资产或复盘中心。
6. 简历请求：基于职业资产和目标岗位，准备生成可信、可追溯的简历版本。
7. 结果学习：从投递结果、拒绝原因和反馈中提取可更新画像和筛选策略的学习信号。
8. 只读检查本地工作区（列目录、读取文件、搜索、统计数量）可以直接执行。
9. 如果后端工具提供页面相关能力，优先使用本轮可用工具；不要把用户数据写到系统层文件。
10. 不要直接提交任何外部申请；本地写入、删除、同步、安装、联网发送或破坏性命令必须先请求确认。

输入内容：
${content}`;
}
