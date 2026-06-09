import type { RoutePreviewRequest } from "@ucareer/shared";
import { classifyIntake } from "../workflow/classify-intake";
import { skillRegistry } from "../workflow/skill-registry";
import { getWorkflow } from "../workflow/workflow-registry";
import { workflowRegistry } from "../workflow/workflow-registry";
import type { DaemonRouteContext } from "./context";
import { ok } from "./context";

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

  app.post<{
    Body: RoutePreviewRequest;
  }>("/api/agent-route/preview", async (request) => {
    return ok(classifyIntake({
      text: composePreviewText(request.body),
      ...(request.body?.preferredProviderId ? { preferredProviderId: request.body.preferredProviderId } : {}),
    }));
  });

  app.get("/api/workflow-runs", async () => {
    return ok(services.workflowRunService.listRuns());
  });

  app.get<{
    Params: { runId: string };
  }>("/api/workflow-runs/:runId", async (request) => {
    const run = services.workflowRunService.getRun(request.params.runId);
    if (!run) {
      return {
        ok: false,
        error: { code: "workflow_run_not_found", message: `Workflow run not found: ${request.params.runId}` },
      };
    }
    return ok({
      run,
      steps: services.workflowRunService.listStepRuns(run.id),
      ...(getWorkflow(run.workflowId) ? { workflow: getWorkflow(run.workflowId) } : {}),
    });
  });
}

function composePreviewText(body: RoutePreviewRequest | undefined): string {
  const text = String(body?.text || "");
  const attachmentText = (body?.attachments || [])
    .map((attachment) => `[${attachment.kind}] ${attachment.fileName}: ${attachment.parsed.summary}`)
    .join("\n");
  return [text, attachmentText].filter(Boolean).join("\n\n");
}
