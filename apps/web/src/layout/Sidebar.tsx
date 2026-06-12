import { useEffect, useMemo, useRef, useState } from "react";
import type { AppView, ViewId } from "../views";
import type { LoginCredentials } from "../auth/LoginPage";
import type { SidebarAgentConversations } from "./AppLayout";
import { formatTaskName } from "../sections/agent/agentConversation";

interface SidebarProps {
  activeView: ViewId;
  accountEmail: string;
  agentConversations: SidebarAgentConversations | undefined;
  authMethod: LoginCredentials["method"];
  collapsed: boolean;
  views: AppView[];
  onLogout(): void;
  onToggleCollapsed(): void;
  onViewChange(viewId: ViewId): void;
}

export function Sidebar({ activeView, accountEmail, agentConversations, authMethod, collapsed, views, onLogout, onToggleCollapsed, onViewChange }: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationExpanded, setConversationExpanded] = useState(true);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const settingsRef = useRef<HTMLElement | null>(null);
  const accountLabel = authMethod === "google" ? "Google 登录" : "个人空间";
  const navViews = views.filter((view) => view.id !== "agent");
  const recentTasks = useMemo(
    () => sortAgentTasksByActivity(agentConversations?.tasks || []).slice(0, 6),
    [agentConversations?.tasks],
  );

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  function selectAgentTask(taskId: string) {
    agentConversations?.onSelectTask(taskId);
    onViewChange("agent");
  }

  function startNewAgentTask() {
    agentConversations?.onStartNewTask();
    onViewChange("agent");
  }

  async function deleteAgentConversation(taskId: string) {
    if (!agentConversations || deletingTaskId) return;
    if (confirmDeleteTaskId !== taskId) {
      setConfirmDeleteTaskId(taskId);
      setDeleteError("");
      return;
    }
    setDeletingTaskId(taskId);
    setConfirmDeleteTaskId("");
    setDeleteError("");
    try {
      await agentConversations.onDeleteTask(taskId);
      onViewChange("agent");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除对话失败");
    } finally {
      setDeletingTaskId("");
    }
  }

  return (
    <aside className="app-nav">
      <div className="brand">
        <button
          type="button"
          className={activeView === "agent" ? "brand-main is-active" : "brand-main"}
          aria-current={activeView === "agent" ? "page" : undefined}
          onClick={() => onViewChange("agent")}
        >
          <img className="brand-wordmark" src="/assets/ucareer-primary-logo.svg" alt="Ucareer" />
          <img className="brand-mark" src="/assets/ucareer-journey-mark.svg" alt="" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nav-collapse-button"
          aria-label={collapsed ? "展开导航栏" : "收起导航栏"}
          aria-pressed={collapsed}
          onClick={onToggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
        </button>
      </div>
      <nav aria-label="主导航">
        {navViews.map((view) => (
          <button
            className={activeView === view.id ? "nav-item is-active" : "nav-item"}
            key={view.id}
            type="button"
            onClick={() => onViewChange(view.id)}
          >
            <span className="nav-item-main">
              <span className="nav-item-icon" aria-hidden="true">{view.icon}</span>
              <span>{view.label}</span>
            </span>
          </button>
        ))}
      </nav>
      {agentConversations ? (
        <section className="nav-agent-conversation" aria-label="Agent 对话">
          <div className="nav-agent-header">
            <button
              type="button"
              className="nav-agent-toggle"
              aria-expanded={conversationExpanded}
              aria-controls="nav-agent-history"
              onClick={() => setConversationExpanded((expanded) => !expanded)}
            >
              <span>对话</span>
              <b aria-hidden="true">{conversationExpanded ? "⌄" : "›"}</b>
            </button>
            <button type="button" className="nav-agent-add" aria-label="新建对话" onClick={startNewAgentTask}>
              <span aria-hidden="true">+</span>
              <em role="tooltip">新建对话</em>
            </button>
          </div>
          {conversationExpanded && recentTasks.length ? (
            <div className="nav-agent-history" id="nav-agent-history" aria-label="对话列表">
              {recentTasks.map((task) => {
                const selected = task.id === agentConversations.selectedTaskId;
                return (
                  <div
                    className={selected ? "nav-agent-history-item is-active" : "nav-agent-history-item"}
                    key={task.id}
                  >
                    <button
                      type="button"
                      className="nav-agent-history-main"
                      title={formatTaskName(task.prompt)}
                      onClick={() => selectAgentTask(task.id)}
                    >
                      <strong>{formatTaskName(task.prompt)}</strong>
                    </button>
                    <button
                      type="button"
                      className="nav-agent-delete"
                      aria-label={confirmDeleteTaskId === task.id ? `确认删除对话：${formatTaskName(task.prompt)}` : `删除对话：${formatTaskName(task.prompt)}`}
                      disabled={Boolean(deletingTaskId)}
                      title={confirmDeleteTaskId === task.id ? "再次点击确认删除" : "删除对话"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteAgentConversation(task.id);
                      }}
                    >
                      {deletingTaskId === task.id ? "…" : confirmDeleteTaskId === task.id ? "✓" : "×"}
                    </button>
                  </div>
                );
              })}
              {deleteError ? <small className="nav-agent-delete-error">{deleteError}</small> : null}
            </div>
          ) : conversationExpanded ? (
            <div className="nav-agent-empty">暂无历史对话</div>
          ) : null}
        </section>
      ) : null}
      <section className="tenant-switcher" aria-label="账户设置" ref={settingsRef}>
        <button
          type="button"
          className="tenant-settings-button"
          aria-haspopup="menu"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span className="tenant-settings-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M9.7 3.4 10.4 2h3.2l.7 1.4c.2.5.8.8 1.3.6l1.5-.5 2.2 2.2-.5 1.5c-.2.5.1 1.1.6 1.3l1.4.7v3.2l-1.4.7c-.5.2-.8.8-.6 1.3l.5 1.5-2.2 2.2-1.5-.5c-.5-.2-1.1.1-1.3.6l-.7 1.4h-3.2l-.7-1.4c-.2-.5-.8-.8-1.3-.6l-1.5.5-2.2-2.2.5-1.5c.2-.5-.1-1.1-.6-1.3L3 12.4V9.2l1.4-.7c.5-.2.8-.8.6-1.3l-.5-1.5 2.2-2.2 1.5.5c.7.2 1.3-.1 1.5-.6Z" />
              <circle cx="12" cy="10.8" r="3.2" />
            </svg>
          </span>
          <span>设置</span>
        </button>
        {settingsOpen ? (
          <div className="tenant-menu" role="menu">
            <div className="tenant-menu-header">
              <strong>{accountEmail}</strong>
              <span>{accountLabel}</span>
            </div>
            <div className="tenant-menu-group" role="presentation">
              <button type="button" role="menuitem" onClick={onLogout}>
                <span className="tenant-menu-icon" aria-hidden="true">↪</span>
                <span>退出登录</span>
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function sortAgentTasksByActivity<T extends { createdAt: string; updatedAt: string }>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => {
    const leftScore = conversationSortScore(left);
    const rightScore = conversationSortScore(right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function conversationSortScore(task: { createdAt: string; updatedAt: string }): number {
  return Math.max(
    Date.parse(task.updatedAt) || 0,
    Date.parse(task.createdAt) || 0,
  );
}
