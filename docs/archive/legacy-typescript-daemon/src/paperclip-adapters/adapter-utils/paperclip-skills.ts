// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { asBoolean, asString, parseObject } from "./value-utils.js";
import type { AdapterSkillEntry, AdapterSkillSnapshot } from "./types.js";

const PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES = [
  "../../skills",
  "../../../../../skills",
];
const MATERIALIZED_SKILL_SENTINEL = ".paperclip-materialized-skill.json";
const MATERIALIZED_SKILL_LOCK_OWNER = "owner.json";
const MATERIALIZED_SKILL_LOCK_STALE_MS = 30_000;

export interface PaperclipSkillEntry {
  key: string;
  runtimeName: string;
  source: string;
  required?: boolean;
  requiredReason?: string | null;
}

export interface InstalledSkillTarget {
  targetPath: string | null;
  kind: "symlink" | "directory" | "file";
}

export interface MaterializedPaperclipSkillCopyResult {
  copiedFiles: number;
  skippedSymlinks: string[];
}

interface PersistentSkillSnapshotOptions {
  adapterType: string;
  availableEntries: PaperclipSkillEntry[];
  desiredSkills: string[];
  installed: Map<string, InstalledSkillTarget>;
  skillsHome: string;
  locationLabel?: string | null;
  installedDetail?: string | null;
  missingDetail: string;
  externalConflictDetail: string;
  externalDetail: string;
  warnings?: string[];
}

function normalizePathSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function isMaintainerOnlySkillTarget(candidate: string): boolean {
  return normalizePathSlashes(candidate).includes("/.agents/skills/");
}

function skillLocationLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildManagedSkillOrigin(entry: { required?: boolean }): Pick<
  AdapterSkillEntry,
  "origin" | "originLabel" | "readOnly"
> {
  if (entry.required) {
    return {
      origin: "paperclip_required",
      originLabel: "Required by Paperclip",
      readOnly: false,
    };
  }
  return {
    origin: "company_managed",
    originLabel: "Managed by Paperclip",
    readOnly: false,
  };
}

function resolveInstalledEntryTarget(
  skillsHome: string,
  entryName: string,
  dirent: Dirent,
  linkedPath: string | null,
): InstalledSkillTarget {
  const fullPath = path.join(skillsHome, entryName);
  if (dirent.isSymbolicLink()) {
    return {
      targetPath: linkedPath ? path.resolve(path.dirname(fullPath), linkedPath) : null,
      kind: "symlink",
    };
  }
  if (dirent.isDirectory()) {
    return { targetPath: fullPath, kind: "directory" };
  }
  return { targetPath: fullPath, kind: "file" };
}

export async function resolvePaperclipSkillsDir(
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<string | null> {
  const candidates = [
    ...PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES.map((relativePath) => path.resolve(moduleDir, relativePath)),
    ...additionalCandidates.map((candidate) => path.resolve(candidate)),
  ];
  const seenRoots = new Set<string>();

  for (const root of candidates) {
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    const isDirectory = await fs.stat(root).then((stats) => stats.isDirectory()).catch(() => false);
    if (isDirectory) return root;
  }

  return null;
}

async function readSkillRequired(skillDir: string): Promise<boolean> {
  try {
    const content = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const normalized = content.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) return true;
    const closing = normalized.indexOf("\n---\n", 4);
    if (closing < 0) return true;
    const frontmatter = normalized.slice(4, closing);
    return !/^\s*required\s*:\s*false\s*$/m.test(frontmatter);
  } catch {
    return true;
  }
}

export async function listPaperclipSkillEntries(
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<PaperclipSkillEntry[]> {
  const root = await resolvePaperclipSkillsDir(moduleDir, additionalCandidates);
  if (!root) return [];

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());
    return Promise.all(dirs.map(async (entry) => {
      const skillDir = path.join(root, entry.name);
      const required = await readSkillRequired(skillDir);
      return {
        key: `paperclipai/paperclip/${entry.name}`,
        runtimeName: entry.name,
        source: skillDir,
        required,
        requiredReason: required
          ? "Bundled Paperclip skills are always available for local adapters."
          : null,
      };
    }));
  } catch {
    return [];
  }
}

export async function readInstalledSkillTargets(skillsHome: string): Promise<Map<string, InstalledSkillTarget>> {
  const entries = await fs.readdir(skillsHome, { withFileTypes: true }).catch(() => []);
  const out = new Map<string, InstalledSkillTarget>();
  for (const entry of entries) {
    const fullPath = path.join(skillsHome, entry.name);
    const linkedPath = entry.isSymbolicLink() ? await fs.readlink(fullPath).catch(() => null) : null;
    out.set(entry.name, resolveInstalledEntryTarget(skillsHome, entry.name, entry, linkedPath));
  }
  return out;
}

export function buildPersistentSkillSnapshot(
  options: PersistentSkillSnapshotOptions,
): AdapterSkillSnapshot {
  const {
    adapterType,
    availableEntries,
    desiredSkills,
    installed,
    skillsHome,
    locationLabel,
    installedDetail,
    missingDetail,
    externalConflictDetail,
    externalDetail,
  } = options;
  const availableByKey = new Map(availableEntries.map((entry) => [entry.key, entry]));
  const desiredSet = new Set(desiredSkills);
  const entries: AdapterSkillEntry[] = [];
  const warnings = [...(options.warnings ?? [])];

  for (const available of availableEntries) {
    const installedEntry = installed.get(available.runtimeName) ?? null;
    const desired = desiredSet.has(available.key);
    let state: AdapterSkillEntry["state"] = "available";
    let managed = false;
    let detail: string | null = null;

    if (installedEntry?.targetPath === available.source) {
      managed = true;
      state = desired ? "installed" : "stale";
      detail = installedDetail ?? null;
    } else if (installedEntry) {
      state = "external";
      detail = desired ? externalConflictDetail : externalDetail;
    } else if (desired) {
      state = "missing";
      detail = missingDetail;
    }

    entries.push({
      key: available.key,
      runtimeName: available.runtimeName,
      desired,
      managed,
      state,
      sourcePath: available.source,
      targetPath: path.join(skillsHome, available.runtimeName),
      detail,
      required: Boolean(available.required),
      requiredReason: available.requiredReason ?? null,
      ...buildManagedSkillOrigin(available),
    });
  }

  for (const desiredSkill of desiredSkills) {
    if (availableByKey.has(desiredSkill)) continue;
    warnings.push(`Desired skill "${desiredSkill}" is not available from the Paperclip skills directory.`);
    entries.push({
      key: desiredSkill,
      runtimeName: null,
      desired: true,
      managed: true,
      state: "missing",
      sourcePath: null,
      targetPath: null,
      detail: "Paperclip cannot find this skill in the local runtime skills directory.",
      origin: "external_unknown",
      originLabel: "External or unavailable",
      readOnly: false,
    });
  }

  for (const [name, installedEntry] of installed.entries()) {
    if (availableEntries.some((entry) => entry.runtimeName === name)) continue;
    entries.push({
      key: name,
      runtimeName: name,
      desired: false,
      managed: false,
      state: "external",
      origin: "user_installed",
      originLabel: "User-installed",
      locationLabel: skillLocationLabel(locationLabel),
      readOnly: true,
      sourcePath: null,
      targetPath: installedEntry.targetPath ?? path.join(skillsHome, name),
      detail: externalDetail,
    });
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));

  return {
    adapterType,
    supported: true,
    mode: "persistent",
    desiredSkills,
    entries,
    warnings,
  };
}

function normalizeConfiguredPaperclipRuntimeSkills(value: unknown): PaperclipSkillEntry[] {
  if (!Array.isArray(value)) return [];
  const out: PaperclipSkillEntry[] = [];
  for (const rawEntry of value) {
    const entry = parseObject(rawEntry);
    const key = asString(entry.key, asString(entry.name, "")).trim();
    const runtimeName = asString(entry.runtimeName, asString(entry.name, "")).trim();
    const source = asString(entry.source, "").trim();
    if (!key || !runtimeName || !source) continue;
    out.push({
      key,
      runtimeName,
      source,
      required: asBoolean(entry.required, false),
      requiredReason:
        typeof entry.requiredReason === "string" && entry.requiredReason.trim().length > 0
          ? entry.requiredReason.trim()
          : null,
    });
  }
  return out;
}

export async function readPaperclipRuntimeSkillEntries(
  config: Record<string, unknown>,
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<PaperclipSkillEntry[]> {
  const configuredEntries = normalizeConfiguredPaperclipRuntimeSkills(config.paperclipRuntimeSkills);
  if (configuredEntries.length > 0) return configuredEntries;
  return listPaperclipSkillEntries(moduleDir, additionalCandidates);
}

export async function readPaperclipSkillMarkdown(
  moduleDir: string,
  skillKey: string,
): Promise<string | null> {
  const normalized = skillKey.trim().toLowerCase();
  if (!normalized) return null;

  const entries = await listPaperclipSkillEntries(moduleDir);
  const match = entries.find((entry) => entry.key === normalized);
  if (!match) return null;

  try {
    return await fs.readFile(path.join(match.source, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}

export function readPaperclipSkillSyncPreference(config: Record<string, unknown>): {
  explicit: boolean;
  desiredSkills: string[];
} {
  const raw = config.paperclipSkillSync;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { explicit: false, desiredSkills: [] };
  }
  const syncConfig = raw as Record<string, unknown>;
  const desiredValues = syncConfig.desiredSkills;
  const desired = Array.isArray(desiredValues)
    ? desiredValues
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  return {
    explicit: Object.prototype.hasOwnProperty.call(raw, "desiredSkills"),
    desiredSkills: Array.from(new Set(desired)),
  };
}

function canonicalizeDesiredPaperclipSkillReference(
  reference: string,
  availableEntries: Array<{ key: string; runtimeName?: string | null }>,
): string {
  const normalizedReference = reference.trim().toLowerCase();
  if (!normalizedReference) return "";

  const exactKey = availableEntries.find((entry) => entry.key.trim().toLowerCase() === normalizedReference);
  if (exactKey) return exactKey.key;

  const byRuntimeName = availableEntries.filter((entry) =>
    typeof entry.runtimeName === "string" && entry.runtimeName.trim().toLowerCase() === normalizedReference,
  );
  if (byRuntimeName.length === 1) return byRuntimeName[0]!.key;

  const slugMatches = availableEntries.filter((entry) =>
    entry.key.trim().toLowerCase().split("/").pop() === normalizedReference,
  );
  if (slugMatches.length === 1) return slugMatches[0]!.key;

  return normalizedReference;
}

export function resolvePaperclipDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: Array<{ key: string; runtimeName?: string | null; required?: boolean }>,
): string[] {
  const preference = readPaperclipSkillSyncPreference(config);
  const requiredSkills = availableEntries
    .filter((entry) => entry.required)
    .map((entry) => entry.key);
  if (!preference.explicit) {
    return Array.from(new Set(requiredSkills));
  }
  const desiredSkills = preference.desiredSkills
    .map((reference) => canonicalizeDesiredPaperclipSkillReference(reference, availableEntries))
    .filter(Boolean);
  return Array.from(new Set([...requiredSkills, ...desiredSkills]));
}

export function writePaperclipSkillSyncPreference(
  config: Record<string, unknown>,
  desiredSkills: string[],
): Record<string, unknown> {
  const next = { ...config };
  const raw = next.paperclipSkillSync;
  const current =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  current.desiredSkills = Array.from(
    new Set(
      desiredSkills
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  next.paperclipSkillSync = current;
  return next;
}

export async function ensurePaperclipSkillSymlink(
  source: string,
  target: string,
  linkSkill: (source: string, target: string) => Promise<void> = (linkSource, linkTarget) =>
    fs.symlink(linkSource, linkTarget),
): Promise<"created" | "repaired" | "skipped"> {
  const existing = await fs.lstat(target).catch(() => null);
  if (!existing) {
    await linkSkill(source, target);
    return "created";
  }

  if (!existing.isSymbolicLink()) {
    return "skipped";
  }

  const linkedPath = await fs.readlink(target).catch(() => null);
  if (!linkedPath) return "skipped";

  const resolvedLinkedPath = path.resolve(path.dirname(target), linkedPath);
  if (resolvedLinkedPath === source) {
    return "skipped";
  }

  const linkedPathExists = await fs.stat(resolvedLinkedPath).then(() => true).catch(() => false);
  if (linkedPathExists) {
    return "skipped";
  }

  await fs.unlink(target);
  await linkSkill(source, target);
  return "repaired";
}

async function hashSkillDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");

  async function visit(candidate: string, relativePath: string): Promise<void> {
    const stat = await fs.lstat(candidate);
    if (stat.isSymbolicLink()) {
      hash.update(`symlink:${relativePath}\n`);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`dir:${relativePath}\n`);
      const entries = await fs.readdir(candidate, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        await visit(path.join(candidate, entry.name), childRelativePath);
      }
      return;
    }
    if (stat.isFile()) {
      hash.update(`file:${relativePath}:${stat.mode}\n`);
      hash.update(await fs.readFile(candidate));
      hash.update("\n");
      return;
    }
    hash.update(`other:${relativePath}:${stat.mode}\n`);
  }

  await visit(root, "");
  return hash.digest("hex");
}

async function materializedSkillFingerprintMatches(targetRoot: string, sourceFingerprint: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(targetRoot, MATERIALIZED_SKILL_SENTINEL), "utf8")) as unknown;
    const parsed = parseObject(raw);
    return parsed.version === 1 && parsed.sourceFingerprint === sourceFingerprint;
  } catch {
    return false;
  }
}

async function acquireMaterializeLock(lockDir: string): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockDir), { recursive: true });
  const deadline = Date.now() + MATERIALIZED_SKILL_LOCK_STALE_MS;
  while (true) {
    try {
      await fs.mkdir(lockDir);
      await fs.writeFile(
        path.join(lockDir, MATERIALIZED_SKILL_LOCK_OWNER),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      return async () => {
        await fs.rm(lockDir, { recursive: true, force: true });
      };
    } catch (err) {
      const code = err && typeof err === "object" ? (err as { code?: unknown }).code : null;
      if (code !== "EEXIST") throw err;
      if (await removeStaleMaterializeLock(lockDir, MATERIALIZED_SKILL_LOCK_STALE_MS)) continue;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for Paperclip skill materialization lock at ${lockDir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: unknown }).code : null;
    return code === "EPERM";
  }
}

async function removeStaleMaterializeLock(lockDir: string, staleMs: number): Promise<boolean> {
  const ownerPath = path.join(lockDir, MATERIALIZED_SKILL_LOCK_OWNER);
  let shouldRemove = false;
  try {
    const raw = JSON.parse(await fs.readFile(ownerPath, "utf8")) as unknown;
    const owner = parseObject(raw);
    const pid = typeof owner.pid === "number" ? owner.pid : 0;
    const createdAt = typeof owner.createdAt === "string" ? Date.parse(owner.createdAt) : Number.NaN;
    const ageMs = Number.isFinite(createdAt) ? Date.now() - createdAt : staleMs + 1;
    shouldRemove = !isPidAlive(pid) || ageMs > staleMs;
  } catch {
    const stat = await fs.stat(lockDir).catch(() => null);
    shouldRemove = !stat || Date.now() - stat.mtimeMs > staleMs;
  }
  if (!shouldRemove) return false;
  await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
  return true;
}

export async function materializePaperclipSkillCopy(
  source: string,
  target: string,
): Promise<MaterializedPaperclipSkillCopyResult> {
  const sourceRoot = path.resolve(source);
  const targetRoot = path.resolve(target);
  const relativeTarget = path.relative(sourceRoot, targetRoot);
  const relativeSource = path.relative(targetRoot, sourceRoot);
  if (
    !relativeTarget ||
    (!relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget)) ||
    !relativeSource ||
    (!relativeSource.startsWith("..") && !path.isAbsolute(relativeSource))
  ) {
    throw new Error("Refusing to materialize a skill into itself, an ancestor, or one of its descendants.");
  }

  const rootStat = await fs.lstat(sourceRoot);
  if (rootStat.isSymbolicLink()) {
    throw new Error("Refusing to materialize a skill root that is itself a symlink.");
  }
  if (!rootStat.isDirectory()) {
    throw new Error("Paperclip skills must be directories.");
  }

  const result: MaterializedPaperclipSkillCopyResult = {
    copiedFiles: 0,
    skippedSymlinks: [],
  };

  const lockDir = `${targetRoot}.lock`;
  const releaseLock = await acquireMaterializeLock(lockDir);
  const tempRoot = `${targetRoot}.tmp-${process.pid}-${randomUUID()}`;

  async function copyEntry(sourcePath: string, targetPath: string, relativePath: string): Promise<void> {
    const stat = await fs.lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      result.skippedSymlinks.push(relativePath || ".");
      return;
    }

    if (stat.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      const entries = await fs.readdir(sourcePath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        await copyEntry(path.join(sourcePath, entry.name), path.join(targetPath, entry.name), childRelativePath);
      }
      return;
    }

    if (stat.isFile()) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_FICLONE).catch(async () => {
        await fs.copyFile(sourcePath, targetPath);
      });
      await fs.chmod(targetPath, stat.mode).catch(() => {});
      result.copiedFiles += 1;
    }
  }

  try {
    const sourceFingerprint = await hashSkillDirectory(sourceRoot);
    if (await materializedSkillFingerprintMatches(targetRoot, sourceFingerprint)) return result;
    await copyEntry(sourceRoot, tempRoot, "");
    await fs.writeFile(
      path.join(tempRoot, MATERIALIZED_SKILL_SENTINEL),
      `${JSON.stringify({
        version: 1,
        sourceFingerprint,
        copiedFiles: result.copiedFiles,
        skippedSymlinks: result.skippedSymlinks,
      }, null, 2)}\n`,
      "utf8",
    );
    if (await materializedSkillFingerprintMatches(targetRoot, sourceFingerprint)) return result;
    await fs.rm(targetRoot, { recursive: true, force: true });
    await fs.rename(tempRoot, targetRoot);
    return result;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    await releaseLock();
  }
}

export async function removeMaintainerOnlySkillSymlinks(
  skillsHome: string,
  allowedSkillNames: Iterable<string>,
): Promise<string[]> {
  const allowed = new Set(Array.from(allowedSkillNames));
  try {
    const entries = await fs.readdir(skillsHome, { withFileTypes: true });
    const removed: string[] = [];
    for (const entry of entries) {
      if (allowed.has(entry.name)) continue;

      const target = path.join(skillsHome, entry.name);
      const existing = await fs.lstat(target).catch(() => null);
      if (!existing?.isSymbolicLink()) continue;

      const linkedPath = await fs.readlink(target).catch(() => null);
      if (!linkedPath) continue;

      const resolvedLinkedPath = path.isAbsolute(linkedPath)
        ? linkedPath
        : path.resolve(path.dirname(target), linkedPath);
      if (
        !isMaintainerOnlySkillTarget(linkedPath) &&
        !isMaintainerOnlySkillTarget(resolvedLinkedPath)
      ) {
        continue;
      }

      await fs.unlink(target);
      removed.push(entry.name);
    }

    return removed;
  } catch {
    return [];
  }
}
