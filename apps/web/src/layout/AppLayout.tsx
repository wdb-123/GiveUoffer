import type { ReactNode } from "react";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import type { AppView, ViewId } from "../views";
import type { LoginCredentials } from "../auth/LoginPage";
import type { AgentTask } from "@ucareer/shared";

export interface SidebarAgentConversations {
  selectedProvider: string;
  selectedTaskId: string;
  tasks: AgentTask[];
  onDeleteTask(taskId: string): void | Promise<void>;
  onSelectTask(taskId: string): void;
  onStartNewTask(): void;
}

interface AppLayoutProps {
  activeView: ViewId;
  accountEmail: string;
  agentConversations?: SidebarAgentConversations;
  authMethod: LoginCredentials["method"];
  children: ReactNode;
  views: AppView[];
  onLogout(): void;
  onViewChange(viewId: ViewId): void;
}

export function AppLayout({ activeView, accountEmail, agentConversations, authMethod, children, views, onLogout, onViewChange }: AppLayoutProps) {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const layoutClasses = [
    "shell",
    "app-layout",
    "workspace-layout",
    navCollapsed ? "nav-collapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <main className={layoutClasses}>
      <Sidebar
        activeView={activeView}
        accountEmail={accountEmail}
        agentConversations={agentConversations}
        authMethod={authMethod}
        collapsed={navCollapsed}
        views={views}
        onLogout={onLogout}
        onToggleCollapsed={() => setNavCollapsed((collapsed) => !collapsed)}
        onViewChange={onViewChange}
      />
      <section className={`view-shell view-${activeView}`}>{children}</section>
    </main>
  );
}
