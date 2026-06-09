import type { RouteDecision } from "@ucareer/shared";
import { buildAgentPrompt } from "./prompt-builder";
import { getSkill } from "./skill-registry";
import { findWorkflowForRoute } from "./workflow-registry";

type SkillMatch = Pick<RouteDecision, "inputKind" | "skillId" | "confidence" | "reason">;

export function classifyIntake(input: {
  text: string;
  preferredProviderId?: string;
  promptText?: string;
}): RouteDecision {
  const text = input.text.trim().toLowerCase();
  const matched = chooseSkill(text);
  const skill = getSkill(matched.skillId) || getSkill("agent.general");
  if (!skill) throw new Error("Skill registry is missing agent.general");
  const workflow = findWorkflowForRoute({ skillId: skill.id, inputKind: matched.inputKind });
  const route: Omit<RouteDecision, "agentPrompt"> = {
    inputKind: matched.inputKind,
    skillId: skill.id,
    ...(workflow ? { workflowId: workflow.id } : {}),
    skill,
    confidence: matched.confidence,
    reason: matched.reason,
    recommendedProviderId: input.preferredProviderId || skill.defaultProviderId || "codex",
    nextAction: skill.id === "agent.general" && matched.confidence === "low" ? "clarify" : "create_agent_task",
  };
  return {
    ...route,
    agentPrompt: buildAgentPrompt({
      userText: input.promptText ?? input.text,
      skill,
      route,
    }),
  };
}

function chooseSkill(text: string): SkillMatch {
  const latestText = extractLatestInput(text);
  const routeText = latestText || text;
  if (!routeText) {
    return {
      inputKind: "general",
      skillId: "agent.general",
      confidence: "low",
      reason: "输入为空，需要先澄清用户目标。",
    };
  }

  if (isJobSearchRequest(routeText)) {
    return {
      inputKind: "scan_request",
      skillId: "job.scan",
      confidence: "high",
      reason: "检测到 jobsearch、岗位搜索或岗位雷达请求。",
    };
  }

  if (score(routeText, ["greenhouse.io", "ashbyhq.com", "lever.co", "workable.com", "smartrecruiters.com", "/jobs/", "careers", "jd", "requirements", "responsibilities", "岗位", "招聘", "职位"]) > 0) {
    return {
      inputKind: routeText.includes("http") ? "job_url" : "job_description",
      skillId: "job.evaluate",
      confidence: "high",
      reason: "检测到岗位链接、JD 文本或招聘关键词。",
    };
  }

  if (score(routeText, ["scan", "扫描", "门户", "新岗位", "pipeline", "portals"]) > 0) {
    return {
      inputKind: "scan_request",
      skillId: "job.scan",
      confidence: "medium",
      reason: "检测到岗位扫描或 pipeline 请求。",
    };
  }

  if (score(routeText, ["简历", "resume", "cv", "pdf", "docx", "导出", "生成一份"]) > 0) {
    return {
      inputKind: "resume_request",
      skillId: "resume.generate",
      confidence: "medium",
      reason: "检测到简历生成、导出或版本请求。",
    };
  }

  if (score(routeText, ["邮箱", "邮件", "qq邮箱", "qq邮件", "qq mail", "qq", "imap", "收件箱", "前十条", "前10条", "最近十条", "最近10条", "更多邮件", "继续读取", "hr邮件", "hr消息", "面试", "邀约", "拒信", "投递", "已申请", "rejected", "interview", "application", "applied", "offer", "hr"]) > 0) {
    const isMailboxRequest = score(routeText, ["邮箱", "邮件", "qq邮箱", "qq邮件", "qq mail", "qq", "imap", "收件箱", "前十条", "前10条", "最近十条", "最近10条", "更多邮件", "继续读取", "hr邮件", "hr消息"]) > 0;
    return {
      inputKind: isMailboxRequest ? "mailbox_messages" : "application_update",
      skillId: isMailboxRequest ? "mailbox.read" : "application.progress",
      confidence: "medium",
      reason: "检测到邮箱消息、招聘进度、面试、拒信或投递状态。",
    };
  }

  if (score(routeText, ["项目", "经历", "复盘", "证明", "证据", "github.com", "portfolio", "case study", "demo"]) > 0) {
    return {
      inputKind: "project_note",
      skillId: "experience.capture",
      confidence: "medium",
      reason: "检测到项目经历、作品集或证据沉淀信号。",
    };
  }

  if (score(routeText, ["为什么没过", "拒绝原因", "模式", "复盘", "转化率", "rejection", "pattern", "outcome"]) > 0) {
    return {
      inputKind: "outcome_feedback",
      skillId: "outcome.learn",
      confidence: "medium",
      reason: "检测到结果学习或模式分析请求。",
    };
  }

  return {
    inputKind: "general",
    skillId: "agent.general",
    confidence: "low",
    reason: "未匹配到明确职业工作流，交给通用 Agent 先理解目标。",
  };
}

function extractLatestInput(text: string): string {
  const matches = [...text.matchAll(/latest input:\s*([\s\S]*?)(?=\n(?:previous skill|previous input kind|previous source|latest input):|$)/giu)];
  const latest = matches.at(-1)?.[1]?.trim();
  return latest || "";
}

function isJobSearchRequest(text: string): boolean {
  return score(text, [
    "jobsearch",
    "找岗位",
    "找工作",
    "找职位",
    "搜岗位",
    "搜一些岗位",
    "随便搜",
    "岗位给我",
    "岗位搜索",
    "职位搜索",
    "岗位雷达",
    "机会发现",
    "跑雷达",
    "招聘平台",
    "新岗位",
    "今天值得推进",
    "boss",
    "智联",
    "猎聘",
    "拉勾",
  ]) > 0;
}

function score(text: string, keywords: string[]): number {
  return keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}
