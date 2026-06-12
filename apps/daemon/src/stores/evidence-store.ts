import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  EvidenceRequestsOverview,
  EvidenceRequest,
  FulfillEvidenceRequestInput,
  FulfillEvidenceRequestResult,
} from "@ucareer/shared";
import { isInsideDir } from "../path-guards";

export interface EvidenceStore {
  listEvidenceRequests(): Promise<EvidenceRequestsOverview>;
  upsertEvidenceRequest(input: Partial<EvidenceRequest> & { id?: string; direction: string; gap: string }): Promise<EvidenceRequest>;
  deleteEvidenceRequest(id: string): Promise<string>;
  fulfillEvidenceRequest(input: FulfillEvidenceRequestInput): Promise<FulfillEvidenceRequestResult>;
}

export function createEvidenceStore(workspaceRoot: string): EvidenceStore {
  const evidenceRequestsPath = join(workspaceRoot, "workspace/ops/data/evidence-requests.json");

  return {
    async listEvidenceRequests() {
      return readJsonFile(evidenceRequestsPath, {
        updatedAt: "",
        summary: { open: 0, highPriority: 0 },
        requests: [],
      });
    },

    async upsertEvidenceRequest(input) {
      const overview = await this.listEvidenceRequests();
      const request = normalizeEvidenceRequest(input);
      const index = overview.requests.findIndex((item) => item.id === request.id);
      const requests = [...overview.requests];
      if (index >= 0) requests[index] = { ...requests[index], ...request };
      else requests.push(request);
      await writeEvidenceRequests(evidenceRequestsPath, { ...overview, requests });
      return request;
    },

    async deleteEvidenceRequest(id) {
      const requestId = String(id || "").trim();
      if (!requestId) throw new Error("Missing evidence request id");
      const overview = await this.listEvidenceRequests();
      const requests = overview.requests.filter((item) => item.id !== requestId);
      if (requests.length === overview.requests.length) throw new Error(`Evidence request not found: ${requestId}`);
      await writeEvidenceRequests(evidenceRequestsPath, { ...overview, requests });
      return requestId;
    },

    async fulfillEvidenceRequest(input) {
      const overview = await this.listEvidenceRequests();
      const request = overview.requests.find((item) => item.id === input.requestId);
      if (!request) throw new Error(`Evidence request not found: ${input.requestId}`);
      if (!input.content.trim()) throw new Error("Evidence content is required");
      if (!isSafeTargetFile(request.targetFile)) throw new Error("Invalid evidence target file");

      const targetPath = resolve(workspaceRoot, request.targetFile);
      if (!isInsideDir(workspaceRoot, targetPath)) throw new Error("Invalid evidence target path");
      await mkdir(dirname(targetPath), { recursive: true });

      const appendedAt = new Date().toISOString();
      const markdown = [
        "",
        "",
        `## 证据补充 ${request.id} - ${appendedAt}`,
        "",
        `来源：${input.source?.trim() || "Ucareer 复盘中心"}`,
        "",
        input.content.trim(),
        "",
      ].join("\n");
      await appendFile(targetPath, markdown, "utf8");
      return {
        requestId: request.id,
        targetFile: request.targetFile,
        appended: true,
        appendedAt,
      };
    },
  };
}

function normalizeEvidenceRequest(input: Partial<EvidenceRequest> & { id?: string; direction: string; gap: string }): EvidenceRequest {
  const id = String(input.id || `ev-${Date.now().toString(36)}`).trim();
  const priority = String(input.priority || "medium").trim();
  const status = String(input.status || "open").trim();
  return {
    id,
    priority,
    status,
    direction: String(input.direction || "").trim(),
    gap: String(input.gap || "").trim(),
    marketSignal: String(input.marketSignal || "").trim(),
    currentEvidence: String(input.currentEvidence || "").trim(),
    askHuman: Array.isArray(input.askHuman) ? input.askHuman.map((item) => String(item).trim()).filter(Boolean) : [],
    targetFile: String(input.targetFile || "workspace/jobs/project-notes/evidence.md").trim(),
    resumeImpact: String(input.resumeImpact || "").trim(),
  };
}

async function writeEvidenceRequests(path: string, overview: EvidenceRequestsOverview): Promise<void> {
  const requests = overview.requests || [];
  const open = requests.filter((request) => request.status === "open").length;
  const highPriority = requests.filter((request) => request.priority === "high").length;
  const next: EvidenceRequestsOverview = {
    ...overview,
    updatedAt: new Date().toISOString(),
    summary: {
      ...overview.summary,
      open,
      highPriority,
    },
    requests,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function isSafeTargetFile(path: string): boolean {
  return /^workspace\/jobs\/project-notes\/[^/]+\.(md|txt)$/i.test(path);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const text = (await readFile(path, "utf8")).trim();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return fallback;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
