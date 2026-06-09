import type { AgentTask } from "@ucareer/shared";
import {
  formatTaskName,
  formatTaskTime,
  taskStatusLabel,
} from "./agentConversation";

interface AgentConversationPickerProps {
  canContinueSelectedTask: boolean;
  menuOpen: boolean;
  recentTasks: AgentTask[];
  selectedTask: AgentTask | null;
  selectedTaskId: string;
  onClose(): void;
  onSelectTask(taskId: string): void;
  onStartNewTask(): void;
  onToggle(): void;
}

export function AgentConversationPicker(props: AgentConversationPickerProps) {
  return (
    <div className="agent-mode-picker">
      <button
        type="button"
        className={props.canContinueSelectedTask ? "agent-mode-trigger is-followup" : "agent-mode-trigger"}
        aria-expanded={props.menuOpen}
        aria-haspopup="menu"
        onClick={props.onToggle}
      >
        <span>
          <strong>新建/历史</strong>
        </span>
        <b aria-hidden="true">⌄</b>
      </button>
      {props.menuOpen ? (
        <div className="agent-mode-menu" role="menu" aria-label="选择对话模式">
          <button
            type="button"
            className={!props.selectedTaskId ? "is-selected" : ""}
            role="menuitem"
            onClick={() => {
              props.onStartNewTask();
              props.onClose();
            }}
          >
            <span>新建对话</span>
            <small>从空白上下文开始</small>
          </button>
          {props.recentTasks.length ? (
            <div className="agent-mode-history" aria-label="历史对话">
              <div className="agent-mode-section-label">历史对话</div>
              {props.recentTasks.map((task) => (
                <button
                  type="button"
                  className={task.id === props.selectedTaskId ? "is-selected" : ""}
                  key={task.id}
                  role="menuitem"
                  onClick={() => {
                    props.onSelectTask(task.id);
                    props.onClose();
                  }}
                >
                  <span>{formatTaskName(task.prompt)}</span>
                  <small>{taskStatusLabel(task.status)} · {formatTaskTime(task.updatedAt || task.createdAt)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="agent-mode-empty">暂无历史对话</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
