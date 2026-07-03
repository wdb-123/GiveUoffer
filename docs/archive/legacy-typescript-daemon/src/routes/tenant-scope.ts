import type { ApiEnvelope, AuthSession } from "@ucareer/shared";
import { createApplicationStore } from "../stores/application-store";
import { createEvidenceStore } from "../stores/evidence-store";
import { createExperienceStore } from "../stores/experience-store";
import { createMarketStore } from "../stores/market-store";
import { createProfileStore } from "../stores/profile-store";
import { createReportStore } from "../stores/report-store";
import { createResumeStore } from "../stores/resume-store";
import { createAttachmentParserService } from "../services/attachment-parser-service";
import { createJobSearchService } from "../services/jobsearch-service";
import { createMemoryService } from "../memory";
import { createResumeExportService } from "../services/resume-export-service";
import { createRoutePreviewService } from "../services/route-preview-service";
import { createWorkspaceFilePreviewService } from "../services/workspace-file-preview-service";
import { ensureTenantWorkspaceInitialized, tenantWorkspaceRoot } from "../workspace-paths";
import type { DaemonRouteContext } from "./context";
import { error, readSessionToken } from "./context";

type RequestWithHeaders = { headers: Record<string, string | string[] | undefined> };

export interface TenantRouteScope {
  session: AuthSession;
  workspaceRoot: string;
  stores: {
    applicationStore: ReturnType<typeof createApplicationStore>;
    evidenceStore: ReturnType<typeof createEvidenceStore>;
    experienceStore: ReturnType<typeof createExperienceStore>;
    marketStore: ReturnType<typeof createMarketStore>;
    profileStore: ReturnType<typeof createProfileStore>;
    reportStore: ReturnType<typeof createReportStore>;
    resumeStore: ReturnType<typeof createResumeStore>;
  };
  services: {
    attachmentParserService: ReturnType<typeof createAttachmentParserService>;
    jobSearchService: ReturnType<typeof createJobSearchService>;
    memoryService: ReturnType<typeof createMemoryService>;
    resumeExportService: ReturnType<typeof createResumeExportService>;
    routePreviewService: ReturnType<typeof createRoutePreviewService>;
    workspaceFilePreviewService: ReturnType<typeof createWorkspaceFilePreviewService>;
  };
}

export function getTenantRouteScope(
  ctx: DaemonRouteContext,
  request: RequestWithHeaders,
): TenantRouteScope | ApiEnvelope<never> {
  const session = ctx.authStore.getSession(readSessionToken(request));
  if (!session) return error("unauthenticated", "A valid Ucareer session is required");
  const workspaceRoot = tenantWorkspaceRoot(ctx.workspaceRoot, session.activeTenant.id);
  ensureTenantWorkspaceInitialized(ctx.workspaceRoot, workspaceRoot);
  return {
    session,
    workspaceRoot,
    stores: {
      applicationStore: createApplicationStore(workspaceRoot),
      evidenceStore: createEvidenceStore(workspaceRoot),
      experienceStore: createExperienceStore(workspaceRoot),
      marketStore: createMarketStore(workspaceRoot),
      profileStore: createProfileStore(workspaceRoot),
      reportStore: createReportStore(workspaceRoot),
      resumeStore: createResumeStore(workspaceRoot),
    },
    services: {
      attachmentParserService: createAttachmentParserService(workspaceRoot),
      jobSearchService: createJobSearchService(workspaceRoot, ctx.services.chromeBridgeService),
      memoryService: createMemoryService(workspaceRoot),
      resumeExportService: createResumeExportService(workspaceRoot),
      routePreviewService: createRoutePreviewService({ runtime: ctx.runtime, workspaceRoot }),
      workspaceFilePreviewService: createWorkspaceFilePreviewService(workspaceRoot),
    },
  };
}

export function isScopeError(scope: TenantRouteScope | ApiEnvelope<never>): scope is ApiEnvelope<never> {
  return "ok" in scope && scope.ok === false;
}
