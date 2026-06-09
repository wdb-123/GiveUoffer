import { useState } from "react";
import { LoginPage, type LoginCredentials } from "./auth/LoginPage";
import { createAccount, getAuthSession, login, logout, setApiSessionToken } from "./api";
import { useAgentData } from "./hooks/useAgentData";
import { useJobSearch } from "./hooks/useJobSearch";
import { useUcareerData } from "./hooks/useUcareerData";
import { AppLayout } from "./layout/AppLayout";
import { ViewRenderer } from "./layout/ViewRenderer";
import { views, type ViewId } from "./views";
import type { AuthSession } from "@ucareer/shared";

const SESSION_STORAGE_KEY = "ucareer.session";

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("agent");
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  setApiSessionToken(session?.token || "");
  const { actions, state } = useUcareerData(Boolean(session));
  const { actions: agentActions, state: agentState } = useAgentData(Boolean(session));
  const jobSearch = useJobSearch(Boolean(session), actions.refreshMarket);

  async function handleLogin(credentials: LoginCredentials) {
    const nextSession = credentials.method === "create-account"
      ? await createAccount({
          email: credentials.email,
          password: credentials.password,
          remember: credentials.remember,
          tenantName: "Personal Workspace",
        })
      : credentials.method === "google"
        ? await createAccount({
            email: credentials.email,
            password: `google-local-${credentials.email}`,
            remember: credentials.remember,
            tenantName: "Personal Workspace",
          }).catch(async () => login({ email: credentials.email, password: `google-local-${credentials.email}`, remember: credentials.remember }))
        : await login({ email: credentials.email, password: credentials.password, remember: credentials.remember });
    setSession(nextSession);
    setApiSessionToken(nextSession.token);
    if (credentials.remember) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  async function handleLogout() {
    if (session?.token) {
      await logout(session.token).catch(() => undefined);
    }
    setApiSessionToken("");
    setSession(null);
    setActiveView("agent");
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <AppLayout
        activeView={activeView}
        accountEmail={session.account.email}
        agentConversations={{
          onDeleteTask: (taskId) => void agentActions.onDeleteTask(taskId),
          onSelectTask: (taskId) => void agentActions.onSelectTask(taskId),
          onStartNewTask: agentActions.onStartNewTask,
          selectedProvider: agentState.selectedProvider,
          selectedTaskId: agentState.selectedTaskId,
          tasks: agentState.tasks,
        }}
        authMethod="password"
        views={views}
      onLogout={handleLogout}
      onViewChange={setActiveView}
    >
      <ViewRenderer
        activeView={activeView}
        onViewChange={setActiveView}
        views={views}
        agent={{
          approvals: agentState.approvals,
          installStatus: agentState.installStatus,
          onCheckProvider: (providerId) => void agentActions.onCheckProvider(providerId),
          onCancelTask: (taskId) => void agentActions.onCancelTask(taskId),
          onCreateLocalCommand: (command, args) => void agentActions.onCreateLocalCommand(command, args),
          onCreateTask: (promptOverride, permissionMode, attachments) => agentActions.onCreateTask(promptOverride, permissionMode, attachments),
          onDecideApproval: (approvalId, decision) => void agentActions.onDecideApproval(approvalId, decision),
          onPromptChange: agentActions.setPrompt,
          onProviderChange: agentActions.setSelectedProvider,
          onRefreshTaskEvents: () => void agentActions.onRefreshTaskEvents(),
          onSelectTask: (taskId) => void agentActions.onSelectTask(taskId),
          onStartNewTask: agentActions.onStartNewTask,
          onPushSync: () => void actions.onPushSync(),
          onRunJobSearch: (input) => void jobSearch.search(input),
          prompt: agentState.prompt,
          providers: agentState.providers,
          selectedProvider: agentState.selectedProvider,
          selectedTaskEvents: agentState.selectedTaskEvents,
          selectedTaskTurns: agentState.selectedTaskTurns,
          selectedTaskId: agentState.selectedTaskId,
          tasks: agentState.tasks,
          workflowRunDetail: agentState.workflowRunDetail,
          jobSearch: {
            error: jobSearch.error,
            lastResult: jobSearch.lastResult,
            sources: jobSearch.sources,
            status: jobSearch.status,
          },
        }}
        applications={{
          data: state.applications,
          onCreateEvent: (input) => void actions.onCreateApplicationEvent(input),
          onDeleteLatestEvent: (eventId) => void actions.onDeleteLatestApplicationEvent(eventId),
          onUpdateLatestEvent: (applicationId) => void actions.onUpdateLatestApplicationEvent(applicationId),
        }}
        evidence={{
          data: state.evidenceRequests,
          onFulfillEvidence: (requestId, content) => void actions.onFulfillEvidence(requestId, content),
        }}
        experience={{
          data: state.experienceOverview,
          onUpdateExperience: (id, patch) => void actions.onUpdateExperience(id, patch),
        }}
        market={state.market}
        jobSearch={{
          error: jobSearch.error,
          lastResult: jobSearch.lastResult,
          onSearch: (input) => void jobSearch.search(input),
          sources: jobSearch.sources,
          status: jobSearch.status,
        }}
        profile={state.profile}
        reports={{
          data: state.reports,
          selectedReport: state.selectedReport,
          onClearReport: actions.onClearReport,
          onSelectReport: (file) => void actions.onSelectReport(file),
        }}
        resumes={{
          data: state.resumes,
          exportResult: state.resumeExportResult,
          preview: state.resumePreview,
          selectedResume: state.selectedResume,
          onExportResume: (file, format) => void actions.onExportResume(file, format),
          onGeneratePreview: (baseFile, targetJobId) => void actions.onGenerateResumePreview(baseFile, targetJobId),
          onSavePreview: () => void actions.onSaveResumePreview(),
          onSelectResume: (file) => void actions.onSelectResume(file),
        }}
      />
    </AppLayout>
  );
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY) || window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.token || !parsed.account?.email || !parsed.activeTenant?.id) return null;
    void getAuthSession(parsed.token).then((fresh) => {
      if (!fresh) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }).catch(() => undefined);
    return parsed;
  } catch {
    return null;
  }
}
