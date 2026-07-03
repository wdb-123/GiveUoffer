import type { ApiEnvelope, ImportEmailMessagesRequest, SaveEmailConnectorCredentialRequest, TestEmailConnectorRequest } from "@ucareer/shared";
import { connectorRegistry, getConnector } from "../connectors/connector-registry";
import { importQqEmailAttachments, importQqEmailMessages, testQqEmailImapConnection } from "../connectors/imap-connector";
import { createConnectorCredentialStore } from "../stores/connector-credential-store";
import { joinWorkspaceDataPath } from "../workspace-paths";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerConnectorRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/connectors", async () => {
    return ok({ connectors: connectorRegistry });
  });

  app.get<{
    Params: { connectorId: string };
  }>("/api/connectors/:connectorId", async (request) => {
    const connector = getConnector(request.params.connectorId);
    if (!connector) return error("connector_not_found", `Connector not found: ${request.params.connectorId}`);
    return ok(connector);
  });

  app.post<{
    Body: TestEmailConnectorRequest;
  }>("/api/connectors/qq-email/test", async (request) => {
    const authError = requirePermission(ctx, request, "applications.read");
    if (authError) return authError;
    try {
      return ok(await testQqEmailImapConnection(request.body));
    } catch (cause) {
      return error("qq_email_imap_test_failed", cause instanceof Error ? cause.message : "QQ 邮箱 IMAP 连接失败");
    }
  });

  app.get("/api/connectors/qq-email/credential", async (request) => {
    const authError = requirePermission(ctx, request, "applications.read");
    if (authError) return authError;
    const store = createScopedConnectorCredentialStore(ctx, request);
    if (isConnectorStoreError(store)) return store;
    return ok(store.getSummary("qq-email") || null);
  });

  app.post<{
    Body: SaveEmailConnectorCredentialRequest;
  }>("/api/connectors/qq-email/credential", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    const store = createScopedConnectorCredentialStore(ctx, request);
    if (isConnectorStoreError(store)) return store;
    try {
      return ok(store.saveQqEmail(request.body));
    } catch (cause) {
      return error("qq_email_credential_save_failed", cause instanceof Error ? cause.message : "QQ 邮箱凭证保存失败");
    }
  });

  app.post<{
    Body: ImportEmailMessagesRequest;
  }>("/api/connectors/qq-email/messages", async (request) => {
    const authError = requirePermission(ctx, request, "applications.read");
    if (authError) return authError;
    const store = createScopedConnectorCredentialStore(ctx, request);
    if (isConnectorStoreError(store)) return store;
    const credential = store.getSecret("qq-email");
    if (!credential?.secretStored) {
      return error("qq_email_credential_missing", "请先连接并保存 QQ 邮箱 IMAP 授权码");
    }
    try {
      return ok(await importQqEmailMessages({
        email: credential.account,
        authorizationCode: credential.secret,
        request: request.body,
      }));
    } catch (cause) {
      return error("qq_email_import_failed", cause instanceof Error ? cause.message : "QQ 邮箱消息读取失败");
    }
  });

  app.post<{
    Body: { mailbox?: string; uid?: string; applicationId?: string; application_id?: string };
  }>("/api/connectors/qq-email/attachments", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    const store = createConnectorCredentialStore(ctx.daemonDbPath, scope.workspaceRoot, {
      tenantId: scope.session.activeTenant.id,
    });
    const credential = store.getSecret("qq-email");
    if (!credential?.secretStored) {
      return error("qq_email_credential_missing", "请先连接并保存 QQ 邮箱 IMAP 授权码");
    }
    const uid = String(request.body?.uid || "").trim();
    if (!uid) return error("qq_email_attachment_uid_missing", "邮件 UID 不能为空");
    const outputDir = joinWorkspaceDataPath(
      scope.workspaceRoot,
      "emailAttachments",
      sanitizeAttachmentFolderName(`${request.body?.application_id || request.body?.applicationId || "mail"}-${uid}`),
    );
    try {
      return ok({
        attachments: await importQqEmailAttachments({
          email: credential.account,
          authorizationCode: credential.secret,
          mailbox: String(request.body?.mailbox || "INBOX"),
          uid,
          outputDir,
          workspaceRoot: scope.workspaceRoot,
        }),
      });
    } catch (cause) {
      return error("qq_email_attachment_import_failed", cause instanceof Error ? cause.message : "QQ 邮箱附件读取失败");
    }
  });
}

function createScopedConnectorCredentialStore(
  ctx: DaemonRouteContext,
  request: { headers: Record<string, string | string[] | undefined> },
): ReturnType<typeof createConnectorCredentialStore> | ApiEnvelope<never> {
  const scope = getTenantRouteScope(ctx, request);
  if (isScopeError(scope)) return scope;
  return createConnectorCredentialStore(ctx.daemonDbPath, scope.workspaceRoot, {
    tenantId: scope.session.activeTenant.id,
  });
}

function isConnectorStoreError(value: ReturnType<typeof createConnectorCredentialStore> | ApiEnvelope<never>): value is ApiEnvelope<never> {
  return "ok" in value && value.ok === false;
}

function sanitizeAttachmentFolderName(value: string): string {
  return String(value || "mail").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "mail";
}
