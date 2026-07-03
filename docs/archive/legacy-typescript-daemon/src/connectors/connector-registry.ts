import type { ConnectorDefinition, EntityId } from "@ucareer/shared";

export const connectorRegistry: ConnectorDefinition[] = [
  {
    id: "jobsearch",
    label: "jobsearch",
    kind: "job_board",
    status: "available",
    description: "Search module entry for readonly job discovery and market import.",
    capabilities: ["import_jobs"],
    readScopes: ["workspace.read"],
    writeScopes: ["workspace.write"],
    workspacePaths: ["workspace/ops/data/recruitment-market.json", "workspace/profile/portals.yml"],
    requiresAuth: false,
    syncable: false,
  },
  {
    id: "qq-email",
    label: "QQ邮箱",
    kind: "mailbox",
    status: "available",
    description: "Connects QQ Mail through IMAP readonly access for recruiter replies and application email signals.",
    capabilities: ["search_messages"],
    readScopes: ["applications.read"],
    writeScopes: [],
    workspacePaths: ["workspace/ops/data"],
    requiresAuth: true,
    syncable: false,
    protocol: {
      type: "imap",
      host: "imap.qq.com",
      port: 993,
      secure: true,
      mode: "readonly",
    },
    authFields: [
      {
        id: "email",
        label: "QQ邮箱地址",
        kind: "email",
        required: true,
        secret: false,
      },
      {
        id: "authorizationCode",
        label: "IMAP授权码",
        kind: "authorization_code",
        required: true,
        secret: true,
        helpText: "在 QQ 邮箱网页版开启 IMAP/SMTP 后生成的 16 位授权码，不是 QQ 登录密码。",
      },
    ],
  },
];

export function getConnector(id: EntityId): ConnectorDefinition | undefined {
  return connectorRegistry.find((connector) => connector.id === id);
}
