import { useState } from "react";
import type { ApplicationsOverview } from "@ucareer/shared";
import {
  createApplicationEvent,
  deleteApplicationEvent,
  getApplications,
  updateApplicationEvent,
} from "../api";
import type { ApplicationEventFormInput } from "../sections/ApplicationsSection";

export function useApplicationsData(setStatus: (status: string) => void) {
  const [applications, setApplications] = useState<ApplicationsOverview | null>(null);

  async function load() {
    setApplications(await getApplications());
  }

  async function onCreateApplicationEvent(input: ApplicationEventFormInput) {
    await createApplicationEvent(input);
    setApplications(await getApplications());
    setStatus("投递事件已保存");
  }

  async function onUpdateLatestApplicationEvent(applicationId: string) {
    const application = applications?.applications.find((item) => item.id === applicationId);
    const latestEvent = application?.latestEvent;
    if (!latestEvent) return;
    const nextAction = window.prompt("更新下一步动作", latestEvent.next_action || application?.notes || "") ?? latestEvent.next_action;
    await updateApplicationEvent({
      event_id: latestEvent.event_id,
      company: latestEvent.company,
      role: latestEvent.role,
      event: latestEvent.event,
      next_action: nextAction,
      note: latestEvent.note,
      due: latestEvent.due,
      evidence: latestEvent.evidence,
    });
    setApplications(await getApplications());
    setStatus("投递事件已更新");
  }

  async function onDeleteLatestApplicationEvent(eventId: string) {
    if (!eventId) return;
    if (!window.confirm("删除最近投递事件？")) return;
    await deleteApplicationEvent({ event_id: eventId });
    setApplications(await getApplications());
    setStatus("投递事件已删除");
  }

  return {
    state: { applications },
    actions: {
      load,
      onCreateApplicationEvent,
      onDeleteLatestApplicationEvent,
      onUpdateLatestApplicationEvent,
    },
  };
}
