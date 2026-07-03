import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { ConnectorCredentialSummary, SaveEmailConnectorCredentialRequest } from "@ucareer/shared";
import { connectorCredentials } from "../db/schema";
import { openDaemonDatabase } from "../db/sqlite";

interface ConnectorCredentialSecret extends ConnectorCredentialSummary {
  secret: string;
}

export function createConnectorCredentialStore(dbPath: string, workspaceRoot: string, options: { tenantId?: string } = {}) {
  const sqlite = openDaemonDatabase(dbPath);
  const db = drizzle(sqlite);
  const key = readOrCreateEncryptionKey(join(workspaceRoot, ".ucareer", "connector.key"));
  const tenantId = options.tenantId || "legacy";

  return {
    saveQqEmail(input: SaveEmailConnectorCredentialRequest): ConnectorCredentialSummary {
      const now = new Date().toISOString();
      const existing = db.select().from(connectorCredentials).where(connectorWhere("qq-email")).get();
      const encrypted = encryptSecret(normalizeAuthorizationCode(input.authorizationCode), key);
      const row = {
        tenantId,
        connectorId: "qq-email",
        account: normalizeEmail(input.email),
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretAuthTag: encrypted.authTag,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        verifiedAt: input.verifiedAt || now,
      };
      db.insert(connectorCredentials).values(row).onConflictDoUpdate({
        target: [connectorCredentials.tenantId, connectorCredentials.connectorId],
        set: {
          account: row.account,
          secretCiphertext: row.secretCiphertext,
          secretIv: row.secretIv,
          secretAuthTag: row.secretAuthTag,
          updatedAt: row.updatedAt,
          verifiedAt: row.verifiedAt,
        },
      }).run();
      return toSummary(row);
    },

    getSummary(connectorId = "qq-email"): ConnectorCredentialSummary | undefined {
      const row = db.select().from(connectorCredentials).where(connectorWhere(connectorId)).get();
      return row ? toSummary(row) : undefined;
    },

    getSecret(connectorId = "qq-email"): ConnectorCredentialSecret | undefined {
      const row = db.select().from(connectorCredentials).where(connectorWhere(connectorId)).get();
      if (!row) return undefined;
      return {
        ...toSummary(row),
        secret: decryptSecret({
          ciphertext: row.secretCiphertext,
          iv: row.secretIv,
          authTag: row.secretAuthTag,
        }, key),
      };
    },
  };

  function connectorWhere(connectorId: string) {
    return and(eq(connectorCredentials.tenantId, tenantId), eq(connectorCredentials.connectorId, connectorId));
  }
}

function readOrCreateEncryptionKey(path: string): Buffer {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) return Buffer.from(readFileSync(path, "utf8").trim(), "base64");
  const key = randomBytes(32);
  writeFileSync(path, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
}

function encryptSecret(secret: string, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(input: { ciphertext: string; iv: string; authTag: string }, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeAuthorizationCode(value: unknown): string {
  return String(value || "").replace(/\s+/g, "");
}

function toSummary(row: typeof connectorCredentials.$inferSelect): ConnectorCredentialSummary {
  return {
    connectorId: row.connectorId,
    account: row.account,
    secretStored: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt } : {}),
  };
}
