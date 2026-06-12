import type { AgentPageContext, RouteDecision } from "@ucareer/shared";
import { buildAgentPrompt } from "./prompt-builder";
import { getSkill, skillRegistry } from "./skill-registry";
import { findWorkflowForRoute } from "./workflow-registry";

type SkillMatch = Pick<RouteDecision, "inputKind" | "skillId" | "confidence" | "reason">;

export async function classifyIntake(input: {
  text: string;
  preferredProviderId?: string;
  promptText?: string;
  pageContext?: AgentPageContext;
  routeWithAgent(prompt: string): Promise<string>;
}): Promise<RouteDecision> {
  const matched = await chooseSkillWithLlm(input);
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
    "If the user wants to go to Boss/BOSS/Zhipin, browse recruiting platforms, search job boards, find jobs, or run a radar, choose job.scan with inputKind scan_request.",
    "If the user provides one specific job URL or a pasted JD to analyze, choose job.evaluate with inputKind job_url or job_description.",
    "If the user asks to create, tailor, export, or manage resumes/CV files, choose resume.generate.",
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
