import type { SkillDefinition } from "@ucareer/shared";
import { currentJobImportTool, jobSearchTool, marketTools } from "../tools";

export const jobScanSkill: SkillDefinition = {
  id: "job.scan",
  label: "招聘平台岗位搜索",
  domain: "job_intelligence",
  description: "去 Boss/BOSS 直聘、智联、猎聘等招聘平台或公司招聘门户批量搜索岗位，把发现的新岗位写入本地岗位市场或 pipeline。只有用户明确想找一批岗位、搜索、浏览、扫描、跑雷达时选这个；用户只是粘贴链接让读取/记录时不要选这个。",
  inputKinds: ["scan_request"],
  defaultProviderId: "codex",
  legacyModeFile: "modes/scan.md",
  risk: "medium",
  connectorTools: [jobSearchTool, currentJobImportTool, ...marketTools],
  ui: {
    primaryPage: "market",
    pages: ["market", "agent"],
    entryActions: [
      {
        id: "market.search_jobs",
        label: "搜索岗位",
        description: "按城市、关键词和来源搜索招聘平台岗位，并写入岗位列表。",
        kind: "primary",
        inputKind: "scan_request",
        promptTemplate: "请按我的目标方向搜索一批岗位，导入高相关结果，并说明新增、重复和失败统计。",
        capabilities: ["read", "write", "import", "sync"],
        toolIds: ["jobsearch.search_jobs", "market.list"],
        outputArtifacts: ["pipeline_urls", "scan_history"],
      },
    ],
    quickPrompts: [
      "去 Boss 直聘看看今天值得推进的岗位。",
      "在深圳搜索机器人/ROS2 方向岗位。",
      "跑一次岗位雷达，只返回高相关岗位。",
    ],
  },
  fileManagement: {
    intakeFolder: "jobs",
    acceptedAttachmentKinds: ["text"],
    acceptedExtensions: [".txt", ".md", ".csv", ".json", ".yml", ".yaml"],
    readPaths: ["workspace/profile/portals.yml", "workspace/ops/data/scan-history.tsv", "workspace/ops/data/pipeline.md"],
    writePaths: ["workspace/ops/data/pipeline.md", "workspace/ops/data/scan-history.tsv", "workspace/ops/imports/agent-attachments/{date}/jobs"],
    outputArtifacts: ["pipeline_urls", "scan_history"],
  },
};
