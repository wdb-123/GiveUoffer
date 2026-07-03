export type ViewId = "resumes" | "experience" | "market" | "applications" | "evidence" | "admin" | "agent";

export interface AppView {
  id: ViewId;
  label: string;
  icon: string;
}

export const views: AppView[] = [
  { id: "agent", label: "Ucareer", icon: "U" },
  { id: "resumes", label: "我的简历", icon: "▤" },
  { id: "experience", label: "经历资产", icon: "✦" },
  { id: "market", label: "岗位列表", icon: "⌕" },
  { id: "applications", label: "投递进度", icon: "↗" },
  { id: "evidence", label: "复盘中心", icon: "◎" },
  { id: "admin", label: "管理员设置", icon: "▣" },
];
