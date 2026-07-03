from __future__ import annotations

import re
from typing import Any


def preview_agent_route(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    text = _compose_preview_text(payload)
    match = _choose_skill(text)
    skill = _get_skill(match["skillId"])
    workflow = _find_workflow(skill["id"], match["inputKind"])
    route: dict[str, Any] = {
        "inputKind": match["inputKind"],
        "skillId": skill["id"],
        "skill": skill,
        "confidence": match["confidence"],
        "reason": match["reason"],
        "recommendedProviderId": str(payload.get("preferredProviderId") or skill.get("defaultProviderId") or "codex"),
        "nextAction": "clarify" if skill["id"] == "agent.general" and match["confidence"] == "low" else "create_agent_task",
    }
    if workflow:
        route["workflowId"] = workflow["id"]
    route["agentPrompt"] = _build_agent_prompt(str(payload.get("text") or text), skill, route)
    return route


def list_skills() -> list[dict[str, Any]]:
    return SKILLS.copy()


def list_workflows() -> list[dict[str, Any]]:
    return WORKFLOWS.copy()


def _compose_preview_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    if payload.get("text"):
        parts.append(str(payload["text"]))
    attachments = payload.get("attachments")
    if isinstance(attachments, list):
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            parsed = attachment.get("parsed") if isinstance(attachment.get("parsed"), dict) else {}
            parts.append(f"[{attachment.get('kind') or 'unknown'}] {attachment.get('fileName') or ''}: {parsed.get('summary') or ''}")
    return "\n\n".join(part for part in parts if part).strip()


def _choose_skill(text: str) -> dict[str, str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    lowered = normalized.lower()
    if _is_simple_general_conversation(normalized):
        return _match("agent.general", "general", "high", "User sent ordinary greeting or lightweight small talk.")
    if re.search(r"(ocr|提取(?:图片|截图|照片|图中)?文字|识别(?:图片|截图|照片).*(?:文字|内容)|图片中的文字|截图里的文字|read text from image|extract text from image)", normalized, re.I):
        return _match("image.ocr", "image_ocr", "high", "User asked to extract or recognize text from an image/screenshot.")
    if re.search(r"(怎么|如何|绑定|连接|接入|配置).*(邮箱|qq|mail|boss|招聘平台|官网|portal|ucareer|功能|页面|skill)", normalized, re.I):
        return _match("workspace.help", "general", "high", "User asked how to configure or use Ucareer, connectors, mailbox, or job sources.")
    if re.search(r"(简历|resume|cv|ats|导出|pdf|docx|markdown|诊断|改写|润色|优化)", normalized, re.I):
        return _match("resume.generate", "resume_request", "high", "User asked to create, diagnose, export, or optimize a resume/CV.")
    if re.search(r"(offer|录用|聘用|邀请函|面试|拒信|拒绝|投递|进度|hr|测评|邮箱|邮件|mailbox|email)", lowered, re.I):
        if re.search(r"(查|搜|找|看看|读取|邮箱|邮件|mailbox|email)", normalized, re.I) and not re.search(r"(更新|写入|记录|同步|管线|进度)", normalized, re.I):
            return _match("mailbox.read", "mailbox_messages", "high", "User asked to search or read connected mailbox messages.")
        return _match("application.progress", "application_update", "high", "User provided or requested an application status/progress event.")
    if re.search(r"https?://", normalized):
        return _match("job.evaluate", "job_url", "high", "User provided a job link or job description for handling.")
    if re.search(r"(搜索|找一批|找.*岗位|岗位搜索|扫描|scan|jobsearch|radar|跑.*雷达|boss|boss直聘|智联|猎聘)", normalized, re.I):
        return _match("job.scan", "scan_request", "high", "User explicitly wants to search or scan multiple jobs.")
    if re.search(r"(岗位|职位|jd|job description|招聘|职责|任职要求)", normalized, re.I):
        return _match("job.evaluate", "job_description", "high", "User provided a job link or job description for handling.")
    if re.search(r"(项目|经历|证明点|证据|star|复盘|沉淀|案例)", normalized, re.I):
        input_kind = "evidence_note" if re.search(r"(复盘|证据|证明)", normalized, re.I) else "project_note"
        return _match("experience.capture", input_kind, "medium", "User asked to capture experience assets or evidence.")
    return _match("agent.general", "general", "low", "No specific Ucareer workflow intent was detected.")


def _match(skill_id: str, input_kind: str, confidence: str, reason: str) -> dict[str, str]:
    return {"skillId": skill_id, "inputKind": input_kind, "confidence": confidence, "reason": reason}


def _is_simple_general_conversation(text: str) -> bool:
    if not text:
        return False
    return bool(re.match(r"^(你好|你好啊|您好|您好啊|嗨|哈喽|hello|hi|hey|在吗|在不在|早上好|中午好|下午好|晚上好|谢谢|感谢|thanks|thank you)[！!。.?？~～\s]*$", text, re.I))


def _get_skill(skill_id: str) -> dict[str, Any]:
    for skill in SKILLS:
        if skill["id"] == skill_id:
            return skill
    raise ValueError(f"Unknown skillId: {skill_id}")


def _find_workflow(skill_id: str, input_kind: str) -> dict[str, Any] | None:
    for workflow in WORKFLOWS:
        if skill_id in workflow["skillIds"] and input_kind in workflow["inputKinds"]:
            return workflow
    return None


def _build_agent_prompt(user_text: str, skill: dict[str, Any], route: dict[str, Any]) -> str:
    connector_tools = skill.get("connectorTools") or []
    tool_lines = "\n".join(
        f"- {tool['id']}: {tool['label']}；connector={tool.get('connectorId', 'local')}；readonly={'yes' if tool.get('readonly') else 'no'}；{tool.get('description', '')}"
        for tool in connector_tools
    ) or "- 当前 Skill 没有绑定 connector tool。"
    tool_instruction = _tool_instruction(skill, bool(connector_tools))
    canvas_contract = _canvas_contract(str(skill["id"]))
    return f"""你是 Ucareer 职业旅程工作台的统一入口 Agent。请按后端路由结果处理输入。

后端路由：
- Skill: {skill["label"]} ({skill["id"]})
- Domain: {skill["domain"]}
- Input kind: {route["inputKind"]}
- Confidence: {route["confidence"]}
- Reason: {route["reason"]}

可用后端工具：
{tool_lines}

工具调用协议：
{tool_instruction}

{canvas_contract}

处理原则：
1. 如果后端路由不正确，说明应改判成什么 skill/inputKind；只有当前已暴露工具能完成请求时才继续。
2. 粘贴岗位相关单链接不是自动搜索：默认只处理用户给的链接或当前选中岗位。
3. 投递记录、HR/面试/拒信/offer 信息：如果可用工具里有 applications.create_event，抽取 company、role、event、date、next_action、note/evidence 后调用它写入投递进度。
4. 邮箱多策略顺序：先搜公司名，再搜 offer/录用/聘用/邀请函/恭喜；不要同时锁死 from、subject、content。
5. 简历请求：基于职业资产和目标岗位，准备生成可信、可追溯的简历版本。
6. 图片 OCR：优先输出附件 Parsed text 的识别结果。

输入内容：
{user_text.strip()}"""


def _tool_instruction(skill: dict[str, Any], has_connector_tools: bool) -> str:
    if has_connector_tools:
        return "\n".join([
            "- 需要读取后端工具时，只输出一行工具调用，不要编造工具结果。",
            '格式必须是：UC_TOOL_CALL {"tool":"<可用后端工具 id>","input":{...}}',
            "- 如果 UC_TOOL_RESULT 里有 recommendedNextToolCall，且用户请求包含更新状态/写入/记录/同步进度，下一轮必须直接输出对应 UC_TOOL_CALL。",
        ])
    if skill["id"] == "image.ocr":
        return "- 当前 skill 不需要后端工具；图片 OCR 在附件上传解析阶段已经完成。"
    return "- 当前 skill 没有可调用后端工具时，不要输出 UC_TOOL_CALL。"


def _canvas_contract(skill_id: str) -> str:
    if skill_id not in {
        "job.evaluate",
        "job.scan",
        "resume.generate",
        "application.progress",
        "mailbox.read",
        "experience.capture",
        "outcome.learn",
    }:
        return "输出规范：这是普通对话/帮助/OCR/轻量分析场景，默认只输出自然语言正文。"
    return "Canvas 输出规范：最终回答分成正文和页面相关 Canvas 卡片；正文先给明确结论，卡片只保留关键字段。"


def _skill(
    skill_id: str,
    label: str,
    domain: str,
    description: str,
    input_kinds: list[str],
    risk: str,
    primary_page: str,
    pages: list[str],
    tool_ids: list[str] | None = None,
) -> dict[str, Any]:
    connector_tools = [
        {
            "id": tool_id,
            "label": TOOL_LABELS.get(tool_id, tool_id),
            "connectorId": tool_id.split(".")[0],
            "readonly": not tool_id.endswith(".create_event") and not tool_id.endswith(".save") and not tool_id.endswith(".upsert"),
            "description": TOOL_DESCRIPTIONS.get(tool_id, ""),
        }
        for tool_id in (tool_ids or [])
    ]
    return {
        "id": skill_id,
        "label": label,
        "domain": domain,
        "description": description,
        "inputKinds": input_kinds,
        "defaultProviderId": "codex",
        "risk": risk,
        **({"connectorTools": connector_tools} if connector_tools else {}),
        "ui": {
            "primaryPage": primary_page,
            "pages": pages,
            "entryActions": [],
        },
        "fileManagement": {
            "intakeFolder": primary_page,
            "acceptedAttachmentKinds": ["text", "pdf", "docx", "image", "unknown"],
            "acceptedExtensions": [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"],
            "readPaths": [],
            "writePaths": [],
            "outputArtifacts": [],
        },
    }


TOOL_LABELS = {
    "mailbox.search_messages": "搜索邮箱",
    "applications.create_event": "写入投递事件",
    "jobsearch.search_jobs": "搜索岗位",
    "jobsearch.import_current_job": "导入当前岗位",
    "market.import": "导入岗位",
    "resumes.get": "读取简历",
    "resumes.save": "保存简历",
    "resumes.save_diagnosis": "保存诊断",
    "experience.upsert": "保存经历资产",
    "evidence.note": "保存复盘笔记",
}

TOOL_DESCRIPTIONS = {
    "mailbox.search_messages": "搜索已连接邮箱并返回安全摘要。",
    "applications.create_event": "把高置信度投递事件写入投递进度。",
    "jobsearch.search_jobs": "按关键词和来源批量搜索岗位。",
    "jobsearch.import_current_job": "读取当前浏览器选中的岗位。",
    "market.import": "导入岗位链接或 JD 文本。",
    "resumes.get": "读取当前简历内容。",
    "resumes.save": "保存生成的简历版本。",
    "resumes.save_diagnosis": "保存简历诊断报告。",
    "experience.upsert": "写入项目经历和证明点。",
    "evidence.note": "保存复盘或证据笔记。",
}

SKILLS = [
    _skill("job.evaluate", "岗位评估", "job_intelligence", "处理用户提供的岗位/JD 链接或岗位文本。", ["job_url", "job_description"], "medium", "market", ["market", "agent"], ["jobsearch.import_current_job", "market.import"]),
    _skill("job.scan", "招聘平台岗位搜索", "job_intelligence", "批量搜索招聘平台或公司招聘门户岗位。", ["scan_request"], "medium", "market", ["market", "agent"], ["jobsearch.search_jobs", "market.import"]),
    _skill("resume.generate", "简历生成", "resume_engine", "诊断、改写、优化并生成可信、可追溯的简历版本。", ["resume_request", "job_description"], "medium", "resumes", ["resumes", "market", "agent"], ["resumes.get", "resumes.save", "resumes.save_diagnosis"]),
    _skill("mailbox.read", "邮箱读取", "application_crm", "读取和搜索已连接邮箱消息。", ["mailbox_messages"], "low", "applications", ["applications", "agent"], ["mailbox.search_messages"]),
    _skill("application.progress", "投递进度导入", "application_crm", "从 HR 消息、拒信、面试邀请、offer 或用户备注中抽取投递事件。", ["application_update"], "low", "applications", ["applications", "agent"], ["mailbox.search_messages", "applications.create_event"]),
    _skill("experience.capture", "经历资产沉淀", "career_profile", "把项目、复盘、证明点和证据缺口沉淀到职业资产层。", ["project_note", "evidence_note"], "low", "experience", ["experience", "resumes", "agent"], ["experience.upsert", "evidence.note"]),
    _skill("outcome.learn", "结果学习", "outcome_learning", "记录复盘笔记，并从投递结果和反馈中更新画像与筛选策略。", ["outcome_feedback"], "medium", "evidence", ["evidence", "applications", "agent"], ["evidence.note", "applications.create_event"]),
    _skill("image.ocr", "图片文字识别", "agent_workspace", "从截图、图片附件中提取文字。", ["image_ocr"], "low", "agent", ["agent"]),
    _skill("agent.general", "通用 Agent", "agent_workspace", "无法明确归类时，进入通用 agent 对话。", ["general"], "medium", "agent", ["agent"]),
    _skill("workspace.help", "使用帮助", "agent_workspace", "解释 Ucareer 的功能、连接器、邮箱绑定和岗位来源配置方式。", ["general"], "low", "agent", ["agent", "resumes", "experience", "market", "applications", "evidence"]),
]

WORKFLOWS = [
    {"id": "job.auto_pipeline", "label": "岗位自动评估流程", "skillIds": ["job.evaluate", "resume.generate", "application.progress"], "inputKinds": ["job_url", "job_description"]},
    {"id": "resume.generate_variant", "label": "简历版本生成流程", "skillIds": ["resume.generate"], "inputKinds": ["resume_request", "job_description"]},
    {"id": "application.import_progress", "label": "投递进度导入流程", "skillIds": ["mailbox.read", "application.progress", "outcome.learn"], "inputKinds": ["application_update", "mailbox_messages", "outcome_feedback"]},
    {"id": "experience.capture_evidence", "label": "经历资产沉淀流程", "skillIds": ["experience.capture"], "inputKinds": ["project_note", "evidence_note"]},
]
