import { useState } from "react";
import { LoginPage, type LoginCredentials } from "./auth/LoginPage";
import { createAccount, getAuthSession, login, logout, setApiSessionToken } from "./api";
import { useAgentData } from "./hooks/useAgentData";
import { useAgentEvidenceRefresh } from "./hooks/useAgentEvidenceRefresh";
import { useJobSearch } from "./hooks/useJobSearch";
import { useUcareerData } from "./hooks/useUcareerData";
import { useViewBadges } from "./hooks/useViewBadges";
import { AppLayout } from "./layout/AppLayout";
import { ViewRenderer } from "./layout/ViewRenderer";
import { buildAgentPageContext } from "./agentPageContext";
import { views, type ViewId } from "./views";
import type { AuthSession } from "@ucareer/shared";

const SESSION_STORAGE_KEY = "ucareer.session";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  setApiSessionToken(session?.token || "");

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
            password: `google-local-2026-${credentials.email}`,
            remember: credentials.remember,
            tenantName: "Personal Workspace",
          }).catch(async () => login({ email: credentials.email, password: `google-local-2026-${credentials.email}`, remember: credentials.remember }))
        : await login({ email: credentials.email, password: credentials.password, remember: credentials.remember });
    applySession(nextSession);
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
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function applySession(nextSession: AuthSession) {
    setSession(nextSession);
    setApiSessionToken(nextSession.token);
    const storage = window.localStorage.getItem(SESSION_STORAGE_KEY) ? window.localStorage : window.sessionStorage;
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AuthenticatedWorkspace key={session.activeTenant.id} session={session} onLogout={handleLogout} onSessionChange={applySession} />;
}

function AuthenticatedWorkspace(props: {
  session: AuthSession;
  onLogout(): void;
  onSessionChange(session: AuthSession): void;
}) {
  const [activeView, setActiveView] = useState<ViewId>("agent");
  const [lastWorkspaceView, setLastWorkspaceView] = useState<ViewId>("resumes");
  const { actions, state } = useUcareerData(true);
  const { actions: agentActions, state: agentState } = useAgentData(true);
  const jobSearch = useJobSearch(true, actions.refreshMarket);
  const viewBadges = useViewBadges(state);
  useAgentEvidenceRefresh({
    selectedTaskEvents: agentState.selectedTaskEvents,
    selectedTaskId: agentState.selectedTaskId,
    refreshEvidenceRequests: actions.refreshEvidenceRequests,
  });

  function handleViewChange(viewId: ViewId) {
    setActiveView(viewId);
    if (viewId !== "agent") {
      setLastWorkspaceView(viewId);
    }
  }

  return (
    <AppLayout
        activeView={activeView}
        accountEmail={props.session.account.email}
        session={props.session}
        agentConversations={{
          onDeleteTask: (taskId) => agentActions.onDeleteTask(taskId),
          onSelectTask: (taskId) => void agentActions.onSelectTask(taskId),
          onStartNewTask: agentActions.onStartNewTask,
          selectedProvider: agentState.selectedProvider,
          selectedTaskId: agentState.selectedTaskId,
          tasks: agentState.tasks,
        }}
        authMethod="password"
      viewBadges={viewBadges}
      views={views}
      onLogout={props.onLogout}
      onViewChange={handleViewChange}
    >
      <ViewRenderer
        activeView={activeView}
        session={props.session}
        onSessionChange={props.onSessionChange}
        onViewChange={handleViewChange}
        views={views}
        agent={{
          approvals: agentState.approvals,
          installStatus: agentState.installStatus,
          executionQueue: agentState.executionQueue,
          onCheckProvider: (providerId) => void agentActions.onCheckProvider(providerId),
          onCancelTask: (taskId) => void agentActions.onCancelTask(taskId),
          onCreateLocalCommand: (command, args) => void agentActions.onCreateLocalCommand(command, args),
          onCreateTask: (promptOverride, permissionMode, attachments, pageContext) => agentActions.onCreateTask(
            promptOverride,
            permissionMode,
            attachments,
            pageContext || buildAgentPageContext({
              applications: state.applications,
              evidence: state.evidenceRequests,
              experience: state.experienceOverview,
              market: state.market,
              profile: state.profile,
              reports: state.reports,
              resumes: {
                data: state.resumes,
                selectedResume: state.selectedResume,
              },
              selectedReport: state.selectedReport,
              viewId: activeView === "agent" ? lastWorkspaceView : activeView,
            }),
          ),
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
          onSaveEvidenceNote: (content) => void actions.onSaveEvidenceNote(content),
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
        onImportMarketJob={(input) => actions.onImportMarketJob(input)}
        onDeleteMarketJob={(jobId) => actions.onDeleteMarketJob(jobId)}
        profile={state.profile}
        reports={{
          data: state.reports,
          selectedReport: state.selectedReport,
          onClearReport: actions.onClearReport,
          onSelectReport: (file) => void actions.onSelectReport(file),
        }}
        resumes={{
          data: state.resumes,
          diagnostics: state.resumeDiagnostics,
          exportResult: state.resumeExportResult,
          preview: state.resumePreview,
          selectedResume: state.selectedResume,
          onExportResume: (file, format, style) => actions.onExportResume(file, format, style),
          onGeneratePreview: (baseFile, targetJobId) => void actions.onGenerateResumePreview(baseFile, targetJobId),
          onSavePreview: () => void actions.onSaveResumePreview(),
          onSaveResume: (file, title, markdown) => void actions.onSaveResume(file, title, markdown),
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
