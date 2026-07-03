import type { AgentPageContext, RouteDecision } from "@ucareer/shared";
import { buildAgentPrompt } from "./prompt-builder";
import { getSkill, skillRegistry } from "../skills/registry";
import { findWorkflowForRoute } from "./workflow-registry";

type SkillMatch = Pick<RouteDecision, "inputKind" | "skillId" | "confidence" | "reason">;

export async function classifyIntake(input: {
  text: string;
  preferredProviderId?: string;
  promptText?: string;
  pageContext?: AgentPageContext;
  routeWithAgent(prompt: string): Promise<string>;
}): Promise<RouteDecision> {
  const matched = chooseDeterministicSkill(input.text) ?? await chooseSkillWithLlm(input);
  const skill = getSkill(matched.skillId);
  if (!skill) throw new Error(`LLM router returned unknown skillId: ${matched.skillId}`);
  if (!skill.inputKinds.includes(matched.inputKind)) {
    throw new Error(`LLM router returned inputKind "${matched.inputKind}" which is not valid for ${skill.id}`);
  }
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
      ...(input.pageContext ? { pageContext: input.pageContext } : {}),
    }),
  };
}

function chooseDeterministicSkill(text: string): SkillMatch | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (isSimpleGeneralConversation(normalized)) {
    return {
      skillId: "agent.general",
      inputKind: "general",
      confidence: "high",
      reason: "User sent ordinary greeting or lightweight small talk.",
    };
  }
  if (/(?:OCR|提取(?:图片|截图|照片|图中)?文字|识别(?:图片|截图|照片).*(?:文字|内容)|图片中的文字|截图里的文字|read text from image|extract text from image)/iu.test(normalized)) {
    return {
      skillId: "image.ocr",
      inputKind: "image_ocr",
      confidence: "high",
      reason: "User asked to extract or recognize text from an image/screenshot.",
    };
  }
  return null;
}

export function isSimpleGeneralConversation(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return /^(?:你好|你好啊|您好|您好啊|嗨|哈喽|hello|hi|hey|在吗|在不在|早上好|中午好|下午好|晚上好|谢谢|感谢|thanks|thank you)[！!。.?？~～\s]*$/iu.test(normalized);
}

async function chooseSkillWithLlm(input: {
  text: string;
  pageContext?: AgentPageContext;
  routeWithAgent(prompt: string): Promise<string>;
}): Promise<SkillMatch> {
  const raw = await input.routeWithAgent(buildRouterPrompt(input));
  const parsed = parseRouterJson(raw);
  if (!isRouterConfidence(parsed.confidence)) throw new Error("LLM router returned invalid confidence");
  if (typeof parsed.skillId !== "string" || typeof parsed.inputKind !== "string") {
    throw new Error("LLM router response must include skillId and inputKind");
  }
  return {
    skillId: parsed.skillId,
    inputKind: parsed.inputKind,
    confidence: parsed.confidence,
    reason: typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 600)
      : "LLM router selected this skill.",
  };
}

function buildRouterPrompt(input: { text: string; pageContext?: AgentPageContext }): string {
  const skills = skillRegistry.map((skill) => ({
    id: skill.id,
    label: skill.label,
    domain: skill.domain,
    description: skill.description,
    inputKinds: skill.inputKinds,
  }));
  return [
    "You are the Ucareer intake router. Choose exactly one skill and one valid inputKind for the user's request.",
    "Return only JSON with this schema: {\"skillId\":\"...\",\"inputKind\":\"...\",\"confidence\":\"low|medium|high\",\"reason\":\"...\"}.",
    "Do not call tools. Do not answer the user. Do not invent skill IDs or input kinds.",
    "Route by the user's latest intent, not by the currently open page. Page context is only weak context.",
    "First decide whether this is ordinary conversation/help/OCR or a career workflow. Only choose career service skills when the user explicitly asks for job search/import/evaluation, resume/CV work, application progress, interview/recruiter signals, experience assets, evidence gaps, or outcome learning.",
    "For ordinary chat, general questions, UI feedback, product behavior questions, or lightweight reasoning not requiring career data/tools, choose agent.general with inputKind general unless a more specific non-career skill applies.",
    "If the user asks how to use Ucareer, what a page/skill does, how to connect email, how to bind QQ Mail, how to add other mailboxes, how to connect job boards, or how to configure company career portals, choose workspace.help with inputKind general.",
    "If the user asks to extract text from an image, read a screenshot, OCR a picture, recognize text in a pasted image, or says 提取图片文字/识别截图/OCR, choose image.ocr with inputKind image_ocr.",
    "If the user pasted a URL, or asks to read/import/record that link, do not treat it as a scan. Choose job.evaluate with inputKind job_url for job/JD/company career links, unless the text is clearly an application-status update.",
    "Boss/Zhipin /web/geek/jobs URLs can still have a selected job detail panel in the live browser. Do not call them non-job links; route them as job.evaluate when the user wants that selected/current job handled.",
    "If the pasted link or text is about an application status, HR follow-up, interview, rejection, assessment, offer, or submitted application record, choose application.progress with inputKind application_update.",
    "If the user explicitly wants to search/find/browse multiple jobs, go to Boss/BOSS/Zhipin, run jobsearch/radar, or scan recruiting platforms, choose job.scan with inputKind scan_request.",
    "If the user provides a pasted JD without a URL, choose job.evaluate with inputKind job_description.",
    "If the user asks to create, tailor, export, manage, diagnose, review, improve, rewrite, polish, ATS-check, or give modification suggestions for resumes/CV files, choose resume.generate with inputKind resume_request.",
    "",
    `Available skills:\n${JSON.stringify(skills, null, 2)}`,
    input.pageContext ? `\nPage context:\n${JSON.stringify(input.pageContext, null, 2)}` : "",
    `\nUser input:\n${input.text.trim() || "(empty input)"}`,
  ].filter(Boolean).join("\n");
}

function parseRouterJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    }
  }
  throw new Error("LLM router returned invalid JSON");
}

function isRouterConfidence(value: unknown): value is SkillMatch["confidence"] {
  return value === "low" || value === "medium" || value === "high";
}
