import { useEffect, useReducer, useState } from "react";
import type {
  AgentEvent,
  AgentExecutionQueueOverview,
  AgentAttachment,
  AgentTask,
  AgentTaskTurn,
  AgentPageContext,
  ApprovalDecisionRequest,
  ApprovalRequest,
  CreateAgentTaskRequest,
  ProviderInstallStatus,
  ProviderSummary,
  WorkflowRunDetail,
} from "@ucareer/shared";
import {
  cancelAgentTask,
  checkProvider,
  createAgentTask,
  createLocalCommand,
  deleteAgentTask,
  decideApproval,
  getAgentTaskEvents,
  getAgentTasks,
  getAgentTaskTurns,
  getApprovals,
  getAgentExecutionQueue,
  getProviders,
  getWorkflowRun,
  subscribeAgentTaskEvents,
  type AgentTaskSnapshot,
} from "../api";

export interface AgentDataState {
  approvals: ApprovalRequest[];
  executionQueue: AgentExecutionQueueOverview | null;
  installStatus: Record<string, ProviderInstallStatus>;
  prompt: string;
  providers: ProviderSummary[];
  selectedProvider: string;
  selectedTaskEvents: AgentEvent[];
  selectedTaskTurns: AgentTaskTurn[];
  selectedTaskId: string;
  status: string;
  tasks: AgentTask[];
  workflowRunDetail: WorkflowRunDetail | null;
}

type AgentDomainAction =
  | { type: "load"; providers: ProviderSummary[]; tasks: AgentTask[]; approvals: ApprovalRequest[]; executionQueue: AgentExecutionQueueOverview | null }
  | { type: "events"; taskId: string; events: AgentEvent[]; turns: AgentTaskTurn[]; workflowRunDetail?: WorkflowRunDetail | null }
  | { type: "snapshot"; snapshot: AgentTaskSnapshot }
  | { type: "select_task"; taskId: string; events: AgentEvent[]; turns: AgentTaskTurn[]; workflowRunDetail: WorkflowRunDetail | null }
  | { type: "start_new" }
  | { type: "delete_task"; taskId: string; tasks: AgentTask[]; approvals: ApprovalRequest[] }
  | { type: "set_tasks"; tasks: AgentTask[]; approvals: ApprovalRequest[] }
  | { type: "set_execution_queue"; executionQueue: AgentExecutionQueueOverview | null }
  | { type: "set_workflow"; workflowRunDetail: WorkflowRunDetail | null }
  | { type: "set_provider"; providerId: string }
  | { type: "set_prompt"; prompt: string }
  | { type: "set_install_status"; providerId: string; status: ProviderInstallStatus }
  | { type: "set_status"; status: string };

const initialAgentState: AgentDataState = {
  approvals: [],
  executionQueue: null,
  installStatus: {},
  prompt: "帮我总结当前求职 pipeline 的下一步动作",
  providers: [],
  selectedProvider: "codex",
  selectedTaskEvents: [],
  selectedTaskTurns: [],
  selectedTaskId: "",
  status: "正在连接本地 daemon...",
  tasks: [],
  workflowRunDetail: null,
};

const runningTaskStatuses = new Set(["queued", "running", "waiting_approval"]);

export function useAgentData(enabled = true) {
  const [state, dispatch] = useReducer(agentDomainReducer, initialAgentState);
  const [streamFallbackTick, setStreamFallbackTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void refreshExecutionQueue();
    const timer = window.setInterval(() => void refreshExecutionQueue(), 2000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !state.selectedTaskId) return undefined;
    const unsubscribe = subscribeAgentTaskEvents(
      state.selectedTaskId,
      (snapshot) => {
        dispatch({ type: "snapshot", snapshot });
        void refreshWorkflowRunDetail(snapshot.task);
      },
      () => setStreamFallbackTick((value) => value + 1),
    );
    const fallbackTimer = window.setInterval(() => void refreshSelectedTask(state.selectedTaskId), 5000);
    return () => {
      unsubscribe();
      window.clearInterval(fallbackTimer);
    };
  }, [enabled, state.selectedTaskId, streamFallbackTick]);

  useEffect(() => {
    if (!enabled || !state.selectedTaskId) return undefined;
    const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId);
    if (!selectedTask || !runningTaskStatuses.has(selectedTask.status)) return undefined;
    const timer = window.setInterval(() => void refreshSelectedTask(selectedTask.id), 1000);
    return () => window.clearInterval(timer);
  }, [enabled, state.selectedTaskId, state.tasks]);

  async function refresh() {
    try {
      const [providers, tasks, approvals] = await Promise.all([
        getProviders(),
        getAgentTasks(),
        safeGetApprovals(),
      ]);
      const executionQueue = await getAgentExecutionQueue().catch(() => null);
      dispatch({ type: "load", providers, tasks, approvals, executionQueue });
      dispatch({ type: "set_status", status: "daemon 已连接" });
    } catch (error) {
      dispatch({ type: "set_status", status: error instanceof Error ? error.message : "daemon 连接失败" });
    }
  }

  async function refreshExecutionQueue() {
    try {
      dispatch({ type: "set_execution_queue", executionQueue: await getAgentExecutionQueue() });
    } catch {
      dispatch({ type: "set_execution_queue", executionQueue: null });
    }
  }

  async function refreshSelectedTask(taskId = state.selectedTaskId) {
    if (!taskId) return;
    try {
      const [tasks, approvals, events, turns] = await Promise.all([
        getAgentTasks(),
        safeGetApprovals(),
        getAgentTaskEvents(taskId),
        getAgentTaskTurns(taskId),
      ]);
      const selectedTask = tasks.find((task) => task.id === taskId);
      const workflowRunDetail = await loadWorkflowRunDetail(selectedTask);
      dispatch({ type: "set_tasks", tasks, approvals });
      dispatch({ type: "events", taskId, events, turns, workflowRunDetail });
    } catch {
      // Keep the current transcript visible if a transient daemon poll fails.
    }
  }

  async function onCheckProvider(providerId: string) {
    const result = await checkProvider(providerId);
    dispatch({ type: "set_install_status", providerId, status: result });
  }

  async function onCreateTask(
    promptOverride?: string,
    permissionMode?: CreateAgentTaskRequest["permissionMode"],
    attachments?: AgentAttachment[],
    pageContext?: AgentPageContext,
  ): Promise<string> {
    const effectivePrompt = (promptOverride || state.prompt).trim();
    if (!effectivePrompt) return "";

    const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId);
    const canContinueSelectedTask = selectedTask
      && selectedTask.providerId === state.selectedProvider
      && (selectedTask.status === "completed" || selectedTask.status === "failed" || selectedTask.status === "cancelled");
    const request: CreateAgentTaskRequest = {
      providerId: state.selectedProvider,
      prompt: effectivePrompt,
      mode: "structured",
      ...(attachments?.length ? { attachments } : {}),
      ...(canContinueSelectedTask ? { continueTaskId: selectedTask.id } : {}),
      ...(permissionMode ? { permissionMode } : {}),
      ...(pageContext ? { pageContext } : {}),
    };
    const result = await createAgentTask(request);
    const task = "task" in result ? result.task : result;
    const pendingApproval = "approval" in result;
    if (task.providerId !== state.selectedProvider) dispatch({ type: "set_provider", providerId: task.providerId });
    const routePrefix = task.routeDecision?.skill.label ? `${task.routeDecision.skill.label} / ` : "";
    dispatch({
      type: "set_status",
      status: pendingApproval
        ? `${routePrefix}本地 ${task.providerId} 待审批：${task.id}`
        : canContinueSelectedTask ? `${routePrefix}本地 ${task.providerId} 继续对话：${task.id}` : `${routePrefix}本地 ${task.providerId} 已启动：${task.id}`,
    });
    const [tasks, approvals] = await Promise.all([getAgentTasks(), safeGetApprovals()]);
    dispatch({ type: "set_tasks", tasks, approvals });
    void refreshExecutionQueue();
    await onSelectTask(task.id);
    return task.id;
  }

  async function onCreateLocalCommand(command: string, args: string) {
    const result = await createLocalCommand({
      command,
      args: parseCommandArgs(args),
      label: [command, args].filter(Boolean).join(" "),
    });
    dispatch({ type: "set_status", status: `本地命令待审批：${result.task.id}` });
    const [tasks, approvals] = await Promise.all([getAgentTasks(), safeGetApprovals()]);
    dispatch({ type: "set_tasks", tasks, approvals });
    void refreshExecutionQueue();
    await onSelectTask(result.task.id);
  }

  async function onDecideApproval(approvalId: string, decision: ApprovalDecisionRequest["decision"]) {
    await decideApproval(approvalId, { decision });
    const [tasks, approvals] = await Promise.all([getAgentTasks(), safeGetApprovals()]);
    dispatch({ type: "set_tasks", tasks, approvals });
    void refreshExecutionQueue();
    if (state.selectedTaskId) await refreshSelectedTask(state.selectedTaskId);
    dispatch({ type: "set_status", status: `审批已提交：${decision}` });
  }

  async function onSelectTask(taskId: string) {
    const [tasks, events, turns] = await Promise.all([getAgentTasks(), getAgentTaskEvents(taskId), getAgentTaskTurns(taskId)]);
    const selectedTask = tasks.find((task) => task.id === taskId) || state.tasks.find((task) => task.id === taskId);
    dispatch({
      type: "select_task",
      taskId,
      events,
      turns,
      workflowRunDetail: await loadWorkflowRunDetail(selectedTask),
    });
  }

  function onStartNewTask() {
    dispatch({ type: "start_new" });
  }

  async function onDeleteTask(taskId: string) {
    await deleteAgentTask(taskId);
    const [tasks, approvals] = await Promise.all([getAgentTasks(), safeGetApprovals()]);
    dispatch({ type: "delete_task", taskId, tasks, approvals });
    dispatch({ type: "set_status", status: "对话已删除" });
  }

  async function onCancelTask(taskId = state.selectedTaskId) {
    if (!taskId) return;
    const task = await cancelAgentTask(taskId);
    const [tasks, approvals, events, turns] = await Promise.all([
      getAgentTasks(),
      safeGetApprovals(),
      getAgentTaskEvents(task.id),
      getAgentTaskTurns(task.id),
    ]);
    dispatch({ type: "set_tasks", tasks, approvals });
    dispatch({ type: "events", taskId: task.id, events, turns, workflowRunDetail: await loadWorkflowRunDetail(task) });
    void refreshExecutionQueue();
    dispatch({ type: "set_status", status: "Agent 已打断" });
  }

  async function refreshWorkflowRunDetail(task: AgentTask | undefined) {
    const detail = await loadWorkflowRunDetail(task);
    dispatch({ type: "set_workflow", workflowRunDetail: detail });
  }

  return {
    state,
    actions: {
      onCheckProvider,
      onCreateLocalCommand,
      onCreateTask,
      onDecideApproval,
      onCancelTask,
      onRefreshTaskEvents: () => refreshSelectedTask(),
      onDeleteTask,
      onSelectTask,
      onStartNewTask,
      setPrompt: (prompt: string) => dispatch({ type: "set_prompt", prompt }),
      setSelectedProvider: (providerId: string) => dispatch({ type: "set_provider", providerId }),
    },
  };
}

function agentDomainReducer(state: AgentDataState, action: AgentDomainAction): AgentDataState {
  if (action.type === "load") {
    return {
      ...state,
      providers: action.providers,
      tasks: action.tasks,
      approvals: action.approvals,
      executionQueue: action.executionQueue,
      selectedProvider: state.selectedProvider || action.providers[0]?.id || "codex",
    };
  }
  if (action.type === "events") {
    return action.taskId === state.selectedTaskId
      ? {
          ...state,
          selectedTaskEvents: action.events,
          selectedTaskTurns: action.turns,
          ...(action.workflowRunDetail !== undefined ? { workflowRunDetail: action.workflowRunDetail } : {}),
        }
      : state;
  }
  if (action.type === "snapshot") {
    return {
      ...state,
      tasks: upsertTask(state.tasks, action.snapshot.task),
      approvals: mergeTaskApprovals(state.approvals, action.snapshot.task.id, action.snapshot.approvals),
      selectedTaskEvents: action.snapshot.task.id === state.selectedTaskId ? action.snapshot.events : state.selectedTaskEvents,
      selectedTaskTurns: action.snapshot.task.id === state.selectedTaskId ? action.snapshot.turns || state.selectedTaskTurns : state.selectedTaskTurns,
    };
  }
  if (action.type === "select_task") {
    return {
      ...state,
      selectedTaskId: action.taskId,
      selectedTaskEvents: action.events,
      selectedTaskTurns: action.turns,
      workflowRunDetail: action.workflowRunDetail,
    };
  }
  if (action.type === "start_new") {
    return { ...state, selectedTaskId: "", selectedTaskEvents: [], selectedTaskTurns: [], workflowRunDetail: null };
  }
  if (action.type === "delete_task") {
    return {
      ...state,
      tasks: action.tasks,
      approvals: action.approvals,
      ...(state.selectedTaskId === action.taskId
        ? { selectedTaskId: "", selectedTaskEvents: [], selectedTaskTurns: [], workflowRunDetail: null }
        : {}),
    };
  }
  if (action.type === "set_tasks") {
    return { ...state, tasks: action.tasks, approvals: action.approvals };
  }
  if (action.type === "set_execution_queue") {
    return { ...state, executionQueue: action.executionQueue };
  }
  if (action.type === "set_workflow") {
    return { ...state, workflowRunDetail: action.workflowRunDetail };
  }
  if (action.type === "set_provider") {
    return { ...state, selectedProvider: action.providerId };
  }
  if (action.type === "set_prompt") {
    return { ...state, prompt: action.prompt };
  }
  if (action.type === "set_install_status") {
    return { ...state, installStatus: { ...state.installStatus, [action.providerId]: action.status } };
  }
  if (action.type === "set_status") {
    return { ...state, status: action.status };
  }
  return state;
}

async function safeGetApprovals(): Promise<ApprovalRequest[]> {
  try {
    return await getApprovals();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/permission|forbidden|approve|403/i.test(message)) return [];
    throw error;
  }
}

async function loadWorkflowRunDetail(task: AgentTask | undefined): Promise<WorkflowRunDetail | null> {
  if (!task?.workflowRunId) return null;
  try {
    return await getWorkflowRun(task.workflowRunId);
  } catch {
    return null;
  }
}

function upsertTask(tasks: AgentTask[], nextTask: AgentTask): AgentTask[] {
  const existingIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingIndex < 0) return [nextTask, ...tasks];
  return tasks.map((task, index) => index === existingIndex ? nextTask : task);
}

function mergeTaskApprovals(
  approvals: ApprovalRequest[],
  taskId: string,
  taskApprovals: ApprovalRequest[],
): ApprovalRequest[] {
  return [
    ...taskApprovals,
    ...approvals.filter((approval) => approval.taskId !== taskId),
  ];
}

function parseCommandArgs(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}
