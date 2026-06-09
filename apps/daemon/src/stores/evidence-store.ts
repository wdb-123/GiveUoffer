import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  EvidenceRequestsOverview,
  FulfillEvidenceRequestInput,
  FulfillEvidenceRequestResult,
} from "@ucareer/shared";
import { isInsideDir } from "../path-guards";

export interface EvidenceStore {
  listEvidenceRequests(): Promise<EvidenceRequestsOverview>;
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
