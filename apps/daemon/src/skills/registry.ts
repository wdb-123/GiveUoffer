import type { SkillDefinition } from "@ucareer/shared";
import { skillDefinitions } from "./definitions";

export const skillRegistry: SkillDefinition[] = skillDefinitions;

export function getSkill(skillId: string): SkillDefinition | undefined {
  return skillRegistry.find((skill) => skill.id === skillId);
}

export function getSkillFileManagement(skillId: string): SkillDefinition["fileManagement"] | undefined {
  return getSkill(skillId)?.fileManagement;
}

export function getSkillsForPage(pageId: NonNullable<SkillDefinition["ui"]>["primaryPage"]): SkillDefinition[] {
  return skillRegistry.filter((skill) => skill.ui?.pages.includes(pageId));
}

export function getSkillUiContracts(): Array<{
  skillId: string;
  label: string;
  domain: SkillDefinition["domain"];
  risk: SkillDefinition["risk"];
  ui: NonNullable<SkillDefinition["ui"]>;
}> {
  return skillRegistry.flatMap((skill) => skill.ui
    ? [{
      skillId: skill.id,
      label: skill.label,
      domain: skill.domain,
      risk: skill.risk,
      ui: skill.ui,
    }]
    : []);
}
