import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { isInsideOrSameDir } from "../path-guards";
import { memoryRegistry } from "./registry";
import type { MemorySnapshot } from "./types";

export interface MemoryService {
  getMemorySnapshot(): Promise<MemorySnapshot>;
}

export function createMemoryService(workspaceRoot: string): MemoryService {
  return {
    async getMemorySnapshot() {
      const items = await Promise.all(memoryRegistry.map(async (source) => {
        const availablePaths = await Promise.all(source.readPaths.map((path) => pathExists(workspaceRoot, path)));
        const availableCount = availablePaths.filter(Boolean).length;
        return {
          ...source,
          available: availableCount > 0,
          summary: `${availableCount}/${source.readPaths.length} source path(s) available`,
        };
      }));
      return {
        generatedAt: new Date().toISOString(),
        items,
      };
    },
  };
}

async function pathExists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  const resolved = resolve(workspaceRoot, relativePath);
  if (!isInsideOrSameDir(workspaceRoot, resolved)) return false;
  try {
    await access(resolved);
    return true;
  } catch {
    return false;
  }
}
