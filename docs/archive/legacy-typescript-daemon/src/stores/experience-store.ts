import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type {
  ExperienceFile,
  ExperienceMetadataItem,
  ExperienceOverview,
  SaveExperienceMetadataInput,
} from "@ucareer/shared";
import { isInsideDir } from "../path-guards";
import { workspaceDataPath } from "../workspace-paths";

interface ExperienceMetadataFile {
  updatedAt?: string;
  experiences?: ExperienceMetadataItem[];
}

export interface ExperienceStore {
  getExperienceOverview(): Promise<ExperienceOverview>;
  saveExperienceMetadata(input: SaveExperienceMetadataInput): Promise<ExperienceOverview>;
  upsertExperience(input: Partial<ExperienceMetadataItem> & { title: string }): Promise<ExperienceMetadataItem>;
  deleteExperience(id: string): Promise<string>;
}

export function createExperienceStore(workspaceRoot: string): ExperienceStore {
  const workspaceAssetsDir = join(workspaceRoot, "workspace");
  const projectNotesDir = workspaceDataPath(workspaceRoot, "projectNotes");
  const headshotsDir = workspaceDataPath(workspaceRoot, "headshots");
  const intentionsDir = workspaceDataPath(workspaceRoot, "intentions");
  const metadataPath = workspaceDataPath(workspaceRoot, "experienceMetadata");

  return {
    async getExperienceOverview() {
      const [files, photos, intentions, metadata] = await Promise.all([
        listExperienceFiles(projectNotesDir),
        listHeadshotAssets(workspaceAssetsDir, headshotsDir),
        listIntentionAssets(workspaceAssetsDir, intentionsDir),
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

    async upsertExperience(input) {
      const current = await readExperienceMetadata(metadataPath);
      const experiences = current.experiences || [];
      const normalizedInput = normalizeExperienceMetadata({
        experiences: [{
          id: input.id || slugId(input.title),
          title: input.title,
          category: input.category || "",
          role: input.role || "",
          sourceFile: input.sourceFile || "",
          summary: input.summary || "",
          tags: input.tags || [],
          evidence: input.evidence || [],
          gaps: input.gaps || [],
          publicLevel: input.publicLevel || "",
        }],
      }).experiences[0];
      if (!normalizedInput) throw new Error("Invalid experience item");
      const index = experiences.findIndex((item) => item.id === normalizedInput.id);
      const nextExperiences = [...experiences];
      if (index >= 0) nextExperiences[index] = { ...nextExperiences[index], ...normalizedInput };
      else nextExperiences.push(normalizedInput);
      await this.saveExperienceMetadata({ metadata: { experiences: nextExperiences } });
      return normalizedInput;
    },

    async deleteExperience(id) {
      const experienceId = String(id || "").trim();
      if (!experienceId) throw new Error("Missing experience id");
      const current = await readExperienceMetadata(metadataPath);
      const experiences = current.experiences || [];
      const nextExperiences = experiences.filter((item) => item.id !== experienceId);
      if (nextExperiences.length === experiences.length) throw new Error(`Experience not found: ${experienceId}`);
      await this.saveExperienceMetadata({ metadata: { experiences: nextExperiences } });
      return experienceId;
    },
  };
}

function slugId(value: string): string {
  const slug = String(value || "").trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `exp-${Date.now().toString(36)}`;
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
      path: normalizeRelativePath(`workspace/jobs/project-notes/${name}`),
      title: experienceTitleFromContent(name, content),
      kind: extname(name).replace(".", "").toLowerCase(),
      updatedAt: info.mtime.toISOString(),
      content,
    };
  }));
  return entries.filter((entry): entry is ExperienceFile => Boolean(entry));
}

async function listIntentionAssets(workspaceAssetsDir: string, intentionsDir: string): Promise<ExperienceFile[]> {
  const explicit = await listTextAssets(intentionsDir, "workspace/profile/intentions", () => true);
  const rootCandidates = await listTextAssets(workspaceAssetsDir, "workspace", (name) => /投递|偏好|意向|提示词|记忆导出/i.test(name));
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

async function listHeadshotAssets(workspaceAssetsDir: string, headshotsDir: string): Promise<Array<ExperienceFile & { dataUrl: string }>> {
  const sources = [
    { dir: workspaceAssetsDir, rel: "workspace" },
    { dir: headshotsDir, rel: "workspace/profile/headshots" },
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
  return /^workspace\/jobs\/project-notes\/[^/]+\.(md|txt)$/i.test(sourceFile);
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
