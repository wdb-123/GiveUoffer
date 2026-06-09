import type { WorkflowDefinition } from "@ucareer/shared";

export const workflowRegistry: WorkflowDefinition[] = [
  {
    id: "job.auto_pipeline",
    label: "岗位自动评估流程",
    description: "从岗位链接或 JD 文本进入评估、报告、简历和投递记录的完整本地流程。",
    skillIds: ["job.evaluate", "resume.generate", "application.progress"],
    inputKinds: ["job_url", "job_description"],
    defaultProviderId: "codex",
    risk: "medium",
    steps: [
      { id: "route", label: "识别岗位输入", kind: "route", skillId: "job.evaluate" },
      { id: "extract_jd", label: "抽取 JD 内容", kind: "agent_task", skillId: "job.evaluate", requiredPermission: "network_access" },
      { id: "evaluate_fit", label: "匹配评分和风险判断", kind: "agent_task", skillId: "job.evaluate" },
      { id: "write_report", label: "生成评估报告", kind: "write_store", skillId: "job.evaluate", requiredPermission: "write_files" },
      { id: "resume_variant", label: "生成针对性简历", kind: "agent_task", skillId: "resume.generate", requiredPermission: "write_files" },
      { id: "tracker_update", label: "更新投递跟踪", kind: "write_store", skillId: "application.progress", requiredPermission: "write_files" },
    ],
  },
  {
    id: "resume.generate_variant",
    label: "简历版本生成流程",
    description: "基于职业资产和目标岗位生成可信、可追溯的简历版本。",
    skillIds: ["resume.generate"],
    inputKinds: ["resume_request", "job_description"],
    defaultProviderId: "codex",
    risk: "medium",
    steps: [
      { id: "route", label: "识别简历请求", kind: "route", skillId: "resume.generate" },
      { id: "read_assets", label: "读取职业资产", kind: "read_store", skillId: "resume.generate", requiredPermission: "read_files" },
      { id: "draft_resume", label: "生成简历草稿", kind: "agent_task", skillId: "resume.generate" },
      { id: "save_resume", label: "保存简历版本", kind: "write_store", skillId: "resume.generate", requiredPermission: "write_files" },
    ],
  },
  {
    id: "application.import_progress",
    label: "投递进度导入流程",
    description: "从 HR 消息、拒信、面试邀请或用户备注中抽取并记录投递事件。",
    skillIds: ["mailbox.read", "application.progress", "outcome.learn"],
    inputKinds: ["application_update", "mailbox_messages", "outcome_feedback"],
    defaultProviderId: "codex",
    risk: "low",
    steps: [
      { id: "route", label: "识别投递事件", kind: "route", skillId: "application.progress" },
      { id: "import_mailbox", label: "读取邮箱消息", kind: "read_store", skillId: "mailbox.read", requiredPermission: "network_access" },
      { id: "extract_event", label: "抽取进度字段", kind: "agent_task", skillId: "application.progress" },
      { id: "write_event", label: "保存投递事件", kind: "write_store", skillId: "application.progress", requiredPermission: "write_files" },
      { id: "learn_signal", label: "沉淀结果学习信号", kind: "write_store", skillId: "outcome.learn", requiredPermission: "write_files" },
    ],
  },
  {
    id: "experience.capture_evidence",
    label: "经历资产沉淀流程",
    description: "把项目、复盘和证明点整理为职业资产与证据缺口。",
    skillIds: ["experience.capture"],
    inputKinds: ["project_note", "evidence_note"],
    defaultProviderId: "codex",
    risk: "low",
    steps: [
      { id: "route", label: "识别经历资产输入", kind: "route", skillId: "experience.capture" },
      { id: "extract_evidence", label: "抽取证明点和缺口", kind: "agent_task", skillId: "experience.capture" },
      { id: "write_assets", label: "保存经历资产", kind: "write_store", skillId: "experience.capture", requiredPermission: "write_files" },
    ],
  },
];

export function getWorkflow(workflowId: string): WorkflowDefinition | undefined {
  return workflowRegistry.find((workflow) => workflow.id === workflowId);
}

export function findWorkflowForRoute(input: {
  skillId: string;
  inputKind: string;
}): WorkflowDefinition | undefined {
  return workflowRegistry.find((workflow) =>
    workflow.skillIds.includes(input.skillId) && workflow.inputKinds.includes(input.inputKind),
  );
}
