import type { ApiEnvelope, AgentAttachment, UploadAgentAttachmentRequest } from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

export function registerAttachmentRoutes(ctx: DaemonRouteContext): void {
  const { app, services } = ctx;

  app.post<{
    Body: UploadAgentAttachmentRequest;
  }>("/api/agent-attachments", async (request): Promise<ApiEnvelope<AgentAttachment>> => {
    const authError = requirePermission(ctx, request, "workspace.write");
    if (authError) return authError;
    try {
      return ok(await services.attachmentParserService.upload(request.body));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Attachment upload failed";
      return error("attachment_upload_failed", message);
    }
  });
}
