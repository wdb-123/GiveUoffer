import { useState } from "react";
import { useOfferUData } from "./hooks/useOfferUData";
import { AppLayout } from "./layout/AppLayout";
import { ViewRenderer } from "./layout/ViewRenderer";
import { views, type ViewId } from "./views";

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("agent");
  const { actions, state } = useOfferUData();

  return (
    <AppLayout activeView={activeView} status={state.status} views={views} onViewChange={setActiveView}>
      <ViewRenderer
        activeView={activeView}
        onViewChange={setActiveView}
        views={views}
        agent={{
          approvals: state.approvals,
          installStatus: state.installStatus,
          onCheckProvider: (providerId) => void actions.onCheckProvider(providerId),
          onCreateLocalCommand: (command, args) => void actions.onCreateLocalCommand(command, args),
          onCreateTask: (promptOverride) => void actions.onCreateTask(promptOverride),
          onDecideApproval: (approvalId, decision) => void actions.onDecideApproval(approvalId, decision),
          onPromptChange: actions.setPrompt,
          onProviderChange: actions.setSelectedProvider,
          onRefreshTaskEvents: () => void actions.onRefreshTaskEvents(),
          onSelectTask: (taskId) => void actions.onSelectTask(taskId),
          onPushSync: () => void actions.onPushSync(),
          prompt: state.prompt,
          providers: state.providers,
          selectedProvider: state.selectedProvider,
          selectedTaskEvents: state.selectedTaskEvents,
          selectedTaskId: state.selectedTaskId,
          tasks: state.tasks,
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
        profile={state.profile}
        reports={{
          data: state.reports,
          selectedReport: state.selectedReport,
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
