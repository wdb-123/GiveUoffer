import type { SkillDefinition } from "@ucareer/shared";
import { resumeTools } from "../tools";

export const resumeGenerateSkill: SkillDefinition = {
  id: "resume.generate",
  label: "简历生成",
  domain: "resume_engine",
  description: "基于职业资产和目标岗位诊断、改写、优化并生成可信、可追溯的简历版本；也可只输出修改建议，不自动覆盖原文件。",
  inputKinds: ["resume_request", "job_description"],
  defaultProviderId: "codex",
  legacyModeFile: "modes/pdf.md",
  risk: "medium",
  connectorTools: resumeTools,
  ui: {
    primaryPage: "resumes",
    pages: ["resumes", "market", "agent"],
    entryActions: [
      {
        id: "resumes.diagnose_selected_resume",
        label: "诊断简历",
        description: "诊断当前选中简历，保存诊断报告并给出修改建议。",
        kind: "primary",
        inputKind: "resume_request",
        promptTemplate: "请诊断当前选中的简历，保存诊断报告，并给出可以直接改写的建议。",
        requiresSelection: true,
        requiredEntityTypes: ["resume"],
        capabilities: ["read", "write", "generate", "diagnose"],
        toolIds: ["resumes.get", "resumes.save_diagnosis"],
        outputArtifacts: ["resume_diagnosis_report"],
      },
      {
        id: "resumes.generate_targeted_variant",
        label: "生成岗位定制版",
        description: "基于基础简历和目标岗位生成定制简历版本。",
        kind: "contextual",
        inputKind: "resume_request",
        promptTemplate: "请基于当前简历和目标岗位生成一版可信、可追溯的定制简历。",
        requiresSelection: true,
        requiredEntityTypes: ["resume", "market_job"],
        capabilities: ["read", "write", "generate"],
        toolIds: ["resumes.get", "resumes.save"],
        outputArtifacts: ["resume_markdown"],
      },
    ],
    quickPrompts: [
      "诊断这份简历有什么问题。",
      "基于当前岗位生成一版定制简历。",
      "只给修改建议，不要覆盖原文件。",
    ],
  },
  fileManagement: {
    intakeFolder: "resumes",
    acceptedAttachmentKinds: ["text", "pdf", "docx"],
    acceptedExtensions: [".md", ".txt", ".pdf", ".docx"],
    readPaths: ["workspace/profile/cv.md", "workspace/resumes/library", "workspace/resumes/source", "workspace/resumes/diagnostics", "workspace/ops/imports/agent-attachments/{date}/resumes"],
    writePaths: ["workspace/resumes/library", "workspace/resumes/source", "workspace/resumes/rendered", "workspace/resumes/diagnostics", "workspace/ops/exports"],
    outputArtifacts: ["resume_markdown", "resume_pdf", "resume_docx", "resume_diagnosis_report"],
  },
};
