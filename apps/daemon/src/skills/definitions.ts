import type { SkillDefinition } from "@ucareer/shared";
import { agentGeneralSkill } from "./agent-general/skill";
import { applicationProgressSkill } from "./application-progress/skill";
import { experienceCaptureSkill } from "./experience-capture/skill";
import { imageOcrSkill } from "./image-ocr/skill";
import { jobEvaluateSkill } from "./job-evaluate/skill";
import { jobScanSkill } from "./job-scan/skill";
import { mailboxReadSkill } from "./mailbox-read/skill";
import { outcomeLearnSkill } from "./outcome-learn/skill";
import { resumeGenerateSkill } from "./resume-generate/skill";
import { workspaceHelpSkill } from "./workspace-help/skill";

export const skillDefinitions: SkillDefinition[] = [
  jobEvaluateSkill,
  jobScanSkill,
  resumeGenerateSkill,
  mailboxReadSkill,
  applicationProgressSkill,
  experienceCaptureSkill,
  outcomeLearnSkill,
  imageOcrSkill,
  agentGeneralSkill,
  workspaceHelpSkill,
];
