import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type {
  ExperienceFile,
  ExperienceMetadataItem,
  ExperienceOverview,
  SaveExperienceMetadataInput,
} from "@offeru/shared";
import { isInsideDir } from "./path-guards";

interface ExperienceMetadataFile {
  updatedAt?: string;
  experiences?: ExperienceMetadataItem[];
}

export interface ExperienceStore {
  getExperienceOverview(): Promise<ExperienceOverview>;
  saveExperienceMetadata(input: SaveExperienceMetadataInput): Promise<ExperienceOverview>;
}

export function createExperienceStore(workspaceRoot: string): ExperienceStore {
  const projectNotesDir = join(workspaceRoot, "mycv/project-notes");
  const mycvDir = join(workspaceRoot, "mycv");
  const headshotsDir = join(workspaceRoot, "mycv/headshots");
  const intentionsDir = join(workspaceRoot, "mycv/intentions");
  const metadataPath = join(workspaceRoot, "data/experience-metadata.json");

  return {
    async getExperienceOverview() {
      const [files, photos, intentions, metadata] = await Promise.all([
        listExperienceFiles(projectNotesDir),
        listHeadshotAssets(mycvDir, headshotsDir),
        listIntentionAssets(mycvDir, intentionsDir),
        readExperienceMetadata(metadataPath),
      ]);
      const hydratedExperiences = await Promise.all((metadata.experiences || []).map((item) => hydrateExperienceSource(workspaceRoot, item)));
      return {
        updatedAt: metadata.updatedAt || "",
        files,
        photos,
        intentions,
        experiences: hydratedExperiences,
      };
    },

    async saveExperienceMetadata(input) {
      const next = normalizeExperienceMetadata(input.metadata || { experiences: [] });
      next.updatedAt = new Date().toISOString();
      await mkdir(dirname(metadataPath), { recursive: true });
      await writeFile(metadataPath, JSON.stringify(next, null, 2) + "\n", "utf8");
      return this.getExperienceOverview();
    },
  };
}

function normalizeExperienceMetadata(input: SaveExperienceMetadataInput["metadata"]): Required<SaveExperienceMetadataInput["metadata"]> {
  const experiences = Array.isArray(input.experiences) ? input.experiences : [];
  return {
    updatedAt: String(input.updatedAt || ""),
    experiences: experiences.map((item, index) => ({
      id: String(item.id || `exp-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, "-") || `exp-${index + 1}`,
      title: String(item.title || "").trim(),
      category: String(item.category || "").trim(),
      role: String(item.role || "").trim(),
      sourceFile: String(item.sourceFile || "").trim(),
      summary: String(item.summary || "").trim(),
      tags: normalizeStringList(item.tags),
      evidence: normalizeStringList(item.evidence),
      gaps: normalizeStringList(item.gaps),
      publicLevel: String(item.publicLevel || "").trim(),
    })).filter((item) => item.title),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

async function listExperienceFiles(projectNotesDir: string): Promise<ExperienceFile[]> {
  if (!existsSync(projectNotesDir)) await mkdir(projectNotesDir, { recursive: true });
  const entries = await Promise.all((await readdir(projectNotesDir)).sort().map(async (name) => {
    const fullPath = join(projectNotesDir, name);
    const info = await stat(fullPath);
    if (!info.isFile() || !/\.(md|txt)$/i.test(name)) return null;
    const content = await readFile(fullPath, "utf8");
    return {
      name,
      path: normalizeRelativePath(`mycv/project-notes/${name}`),
      title: experienceTitleFromContent(name, content),
      kind: extname(name).replace(".", "").toLowerCase(),
      updatedAt: info.mtime.toISOString(),
      content,
    };
  }));
  return entries.filter((entry): entry is ExperienceFile => Boolean(entry));
}

async function listIntentionAssets(mycvDir: string, intentionsDir: string): Promise<ExperienceFile[]> {
  const explicit = await listTextAssets(intentionsDir, "mycv/intentions", () => true);
  const rootCandidates = await listTextAssets(mycvDir, "mycv", (name) => /投递|偏好|意向|提示词|记忆导出/i.test(name));
  return dedupeByPath([...explicit, ...rootCandidates]);
}

async function listTextAssets(dir: string, rel: string, includeName: (name: string) => boolean): Promise<ExperienceFile[]> {
  if (!existsSync(dir)) return [];
  const entries = await Promise.all((await readdir(dir)).sort().map(async (name) => {
    const fullPath = join(dir, name);
    const info = await stat(fullPath);
    if (!info.isFile() || !/\.(md|txt)$/i.test(name) || !includeName(name)) return null;
    const content = await readFile(fullPath, "utf8");
    return {
      name,
      path: normalizeRelativePath(`${rel}/${name}`),
      title: experienceTitleFromContent(name, content),
      kind: extname(name).replace(".", "").toLowerCase(),
      updatedAt: info.mtime.toISOString(),
      content,
    };
  }));
  return entries.filter((entry): entry is ExperienceFile => Boolean(entry));
}

async function listHeadshotAssets(mycvDir: string, headshotsDir: string): Promise<Array<ExperienceFile & { dataUrl: string }>> {
  const sources = [
    { dir: mycvDir, rel: "mycv" },
    { dir: headshotsDir, rel: "mycv/headshots" },
  ];
  const photos: Array<ExperienceFile & { dataUrl: string }> = [];
  for (const source of sources) {
    if (!existsSync(source.dir)) continue;
    for (const name of (await readdir(source.dir)).sort()) {
      const fullPath = join(source.dir, name);
      const info = await stat(fullPath);
      if (!info.isFile() || !/\.(png|jpe?g|webp)$/i.test(name)) continue;
      const kind = extname(name).replace(".", "").toLowerCase();
      const data = await readFile(fullPath);
      photos.push({
        name,
        path: normalizeRelativePath(`${source.rel}/${name}`),
        title: name.replace(/\.(png|jpe?g|webp)$/i, ""),
        kind,
        updatedAt: info.mtime.toISOString(),
        content: "",
        dataUrl: `data:${imageMimeType(kind)};base64,${data.toString("base64")}`,
      });
    }
  }
  return dedupeByPath(photos);
}

function imageMimeType(kind: string): string {
  if (kind === "jpg" || kind === "jpeg") return "image/jpeg";
  if (kind === "webp") return "image/webp";
  return "image/png";
}

function dedupeByPath<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

async function readExperienceMetadata(path: string): Promise<ExperienceMetadataFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ExperienceMetadataFile;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { updatedAt: "", experiences: [] };
    throw error;
  }
}

async function hydrateExperienceSource(workspaceRoot: string, item: ExperienceMetadataItem): Promise<ExperienceMetadataItem> {
  const sourceFile = normalizeRelativePath(item.sourceFile || "");
  if (!sourceFile) return { ...item, sourceContent: "", sourceError: "" };
  try {
    if (!isSafeExperiencePath(sourceFile)) throw new Error("Invalid source path");
    const sourcePath = resolve(workspaceRoot, sourceFile);
    if (!isInsideDir(workspaceRoot, sourcePath)) throw new Error("Invalid source path");
    return {
      ...item,
      sourceContent: await readFile(sourcePath, "utf8"),
      sourceError: "",
    };
  } catch (error) {
    return {
      ...item,
      sourceContent: "",
      sourceError: error instanceof Error ? error.message : "Failed to read source",
    };
  }
}

function isSafeExperiencePath(sourceFile: string): boolean {
  return /^mycv\/project-notes\/[^/]+\.(md|txt)$/i.test(sourceFile);
}

function experienceTitleFromContent(name: string, content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1] || name.replace(/\.(md|txt)$/i, "");
}

function normalizeRelativePath(value: string): string {
  return String(value || "").replace(/^\/+/, "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
