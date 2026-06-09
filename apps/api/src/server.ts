import process from "node:process";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { ApiEnvelope } from "@ucareer/shared";

const port = Number(process.env.PORT || 4191);
const host = process.env.HOST || "127.0.0.1";

const app = Fastify({ logger: false });

app.get("/health", async (): Promise<ApiEnvelope<{ service: string }>> => {
  return ok({ service: "ucareer-cloud-api" });
});

app.post("/auth/device-pairing", async (): Promise<ApiEnvelope<{ pairingId: string; code: string; expiresInSeconds: number }>> => {
  return ok({
    pairingId: randomUUID(),
    code: createPairingCode(),
    expiresInSeconds: 300,
  });
});

app.get("/sync/pull", async (): Promise<ApiEnvelope<{ events: unknown[]; cursor: string }>> => {
  return ok({
    events: [],
    cursor: new Date().toISOString(),
  });
});

app.post<{
  Body:
    | { events?: Array<{ id: number; entityType: string; entityId: string; eventType: string; payload: unknown; createdAt: string }> }
    | { ok?: boolean; data?: { events?: Array<{ id: number; entityType: string; entityId: string; eventType: string; payload: unknown; createdAt: string }> } };
}>("/sync/push", async (request): Promise<ApiEnvelope<{ accepted: boolean; acceptedIds: number[]; cursor: string }>> => {
  const body = request.body;
  const events =
    "events" in body && Array.isArray(body.events)
      ? body.events
      : "data" in body && Array.isArray(body.data?.events)
        ? body.data.events
        : [];
  return ok({
    accepted: true,
    acceptedIds: events.map((event) => event.id),
    cursor: new Date().toISOString(),
  });
});

app.post("/approvals/:approvalId/decision", async (): Promise<ApiEnvelope<{ relayed: boolean }>> => {
  return ok({ relayed: true });
});

app.listen({ host, port }).then((address) => {
  console.log(`Ucareer cloud API: ${address}`);
});

function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function createPairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
