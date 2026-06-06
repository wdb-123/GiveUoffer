export type ViewId = "resumes" | "experience" | "market" | "applications" | "evidence" | "agent";

export interface AppView {
  id: ViewId;
  label: string;
}

export const views: AppView[] = [
  { id: "agent", label: "Agent 控制台" },
  { id: "resumes", label: "我的简历库" },
  { id: "experience", label: "经历资产" },
  { id: "market", label: "岗位列表" },
  { id: "applications", label: "投递进度导入" },
  { id: "evidence", label: "复盘中心" },
];
