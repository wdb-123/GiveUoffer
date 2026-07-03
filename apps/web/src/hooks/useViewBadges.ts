import type { UcareerDataState } from "./useUcareerData";
import type { ViewId } from "../views";

export function useViewBadges(state: UcareerDataState): Partial<Record<ViewId, number | string>> {
  return {
    resumes: state.resumes.length,
    experience: state.experienceOverview?.experiences.length || 0,
    market: state.market?.jobs.length || 0,
    applications: state.applications?.metrics.active || 0,
    evidence: state.evidenceRequests?.requests.length || 0,
  };
}
