import type { SkillDefinition } from "@ucareer/shared";
import { currentJobImportTool, marketTools } from "../tools";

export const jobEvaluateSkill: SkillDefinition = {
  id: "job.evaluate",
  label: "岗位评估",
  domain: "job_intelligence",
  description: "处理用户提供的岗位/JD 链接或岗位文本：可以只记录原始链接到 pipeline，也可以在用户明确要求读取/导入/评估时抽取岗位信息并写入本地岗位库。不是批量岗位搜索。",
  inputKinds: ["job_url", "job_description"],
  defaultProviderId: "codex",
  legacyModeFile: "modes/auto-pipeline.md",
  risk: "medium",
  connectorTools: [currentJobImportTool, ...marketTools],
  ui: {
    primaryPage: "market",
    pages: ["market", "agent"],
    entryActions: [
      {
        id: "market.import_or_evaluate_job",
        label: "读取/评估岗位",
        description: "读取当前选中岗位、导入岗位链接或基于岗位文本生成评估入口。",
        kind: "primary",
        inputKind: "job_description",
        promptTemplate: "请读取或评估当前岗位，先导入岗位信息，再给出是否值得继续推进的判断。",
        capabilities: ["read", "write", "generate", "diagnose", "import"],
        toolIds: ["jobsearch.import_current_job", "market.import", "market.list"],
        outputArtifacts: ["job_report", "tracker_entry", "resume_variant"],
      },
      {
        id: "market.generate_report_for_selected_job",
        label: "生成评估报告",
        description: "为岗位列表中选中的岗位生成匹配评估报告。",
        kind: "contextual",
        inputKind: "job_description",
        promptTemplate: "请为当前选中的岗位生成评估报告，包含匹配分、风险、证据缺口和是否建议投递。",
        requiresSelection: true,
        requiredEntityTypes: ["market_job", "job_report"],
        capabilities: ["read", "write", "generate", "diagnose"],
        toolIds: ["market.list", "market.import"],
        outputArtifacts: ["job_report", "tracker_entry"],
      },
    ],
    quickPrompts: [
      "这个岗位值得投吗？",
      "把当前 Boss 选中的岗位导入岗位列表。",
      "基于我的经历指出这个岗位的证据缺口。",
    ],
  },
  fileManagement: {
    intakeFolder: "jobs",
    acceptedAttachmentKinds: ["text", "pdf", "docx"],
    acceptedExtensions: [".txt", ".md", ".pdf", ".docx", ".csv", ".json"],
    readPaths: ["workspace/ops/imports/agent-attachments/{date}/jobs", "workspace/jobs/jds", "workspace/ops/data/pipeline.md", "workspace/ops/data/applications.md"],
    writePaths: ["workspace/jobs/reports", "workspace/ops/batch/tracker-additions", "workspace/ops/data/applications.md", "workspace/ops/exports"],
    outputArtifacts: ["job_report", "tracker_entry", "resume_variant"],
  },
};
