import type { ApiEnvelope, RoutePreviewRequest } from "@ucareer/shared";
import { getSkillUiContracts, getSkillsForPage, skillRegistry } from "../skills/registry";
import { getWorkflow } from "../workflow/workflow-registry";
import { workflowRegistry } from "../workflow/workflow-registry";
import { createWorkflowRunService, type WorkflowRunService } from "../services/workflow-run-service";
import { createSqliteWorkflowRunStore } from "../stores/workflow-run-store";
import type { DaemonRouteContext } from "./context";
import { ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerWorkflowRoutes(ctx: DaemonRouteContext): void {
  const { app, services } = ctx;

  app.get("/api/skills", async () => {
    return ok({ skills: skillRegistry, workflows: workflowRegistry });
  });

  app.get("/api/skills/file-management", async () => {
    return ok(skillRegistry.map((skill) => ({
      skillId: skill.id,
      label: skill.label,
      domain: skill.domain,
      fileManagement: skill.fileManagement,
    })));
  });

  app.get("/api/skills/ui-contracts", async () => {
    return ok(getSkillUiContracts());
  });

  app.get<{
    Params: { pageId: string };
  }>("/api/skills/pages/:pageId", async (request) => {
    return ok(getSkillsForPage(request.params.pageId as Parameters<typeof getSkillsForPage>[0]));
  });

  app.get("/api/memory/sources", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.services.memoryService.getMemorySnapshot());
  });

  app.post<{
    Body: RoutePreviewRequest;
  }>("/api/agent-route/preview", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    return ok(await scope.services.routePreviewService.preview(request.body));
  });

  app.get("/api/workflow-runs", async (request) => {
    const authError = requirePermission(ctx, request, "agent.run");
    if (authError) return authError;
    const workflowRunService = createScopedWorkflowRunService(ctx, request);
    if (isWorkflowRunServiceError(workflowRunService)) return workflowRunService;
    return ok(workflowRunService.listRuns());
  });

  app.get<{
    Params: { runId: string };
  }>("/api/workflow-runs/:runId", async (request) => {
    const authError = requirePermission(ctx, request, "agent.run");
    if (authError) return authError;
    const workflowRunService = createScopedWorkflowRunService(ctx, request);
    if (isWorkflowRunServiceError(workflowRunService)) return workflowRunService;
    const run = workflowRunService.getRun(request.params.runId);
    if (!run) {
      return {
        ok: false,
        error: { code: "workflow_run_not_found", message: `Workflow run not found: ${request.params.runId}` },
      };
    }
    return ok({
      run,
      steps: workflowRunService.listStepRuns(run.id),
      ...(getWorkflow(run.workflowId) ? { workflow: getWorkflow(run.workflowId) } : {}),
    });
  });
}

function createScopedWorkflowRunService(
  ctx: DaemonRouteContext,
  request: { headers: Record<string, string | string[] | undefined> },
): WorkflowRunService | ApiEnvelope<never> {
  const scope = getTenantRouteScope(ctx, request);
  if (isScopeError(scope)) return scope;
  return createWorkflowRunService({
    workflowRunStore: createSqliteWorkflowRunStore(ctx.daemonDbPath, { tenantId: scope.session.activeTenant.id }),
  });
}

function isWorkflowRunServiceError(value: WorkflowRunService | ApiEnvelope<never>): value is ApiEnvelope<never> {
  return "ok" in value && value.ok === false;
}
