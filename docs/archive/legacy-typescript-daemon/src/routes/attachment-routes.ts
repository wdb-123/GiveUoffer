import type { ApiEnvelope, AgentAttachment, UploadAgentAttachmentRequest } from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerAttachmentRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.post<{
    Body: UploadAgentAttachmentRequest;
  }>("/api/agent-attachments", async (request): Promise<ApiEnvelope<AgentAttachment>> => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    try {
      return ok(await scope.services.attachmentParserService.upload(request.body));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Attachment upload failed";
      return error("attachment_upload_failed", message);
    }
  });
}
