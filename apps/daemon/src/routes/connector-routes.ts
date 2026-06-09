import type { ImportEmailMessagesRequest, SaveEmailConnectorCredentialRequest, TestEmailConnectorRequest } from "@ucareer/shared";
import { connectorRegistry, getConnector } from "../connectors/connector-registry";
import { importQqEmailMessages, testQqEmailImapConnection } from "../connectors/imap-connector";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

export function registerConnectorRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

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
    return ok(stores.connectorCredentialStore.getSummary("qq-email") || null);
  });

  app.post<{
    Body: SaveEmailConnectorCredentialRequest;
  }>("/api/connectors/qq-email/credential", async (request) => {
    const authError = requirePermission(ctx, request, "applications.write");
    if (authError) return authError;
    try {
      return ok(stores.connectorCredentialStore.saveQqEmail(request.body));
    } catch (cause) {
      return error("qq_email_credential_save_failed", cause instanceof Error ? cause.message : "QQ 邮箱凭证保存失败");
    }
  });

  app.post<{
    Body: ImportEmailMessagesRequest;
  }>("/api/connectors/qq-email/messages", async (request) => {
    const authError = requirePermission(ctx, request, "applications.read");
    if (authError) return authError;
    const credential = stores.connectorCredentialStore.getSecret("qq-email");
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
}
