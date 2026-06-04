import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonFile } from '../data-store.mjs';
import { normalizeRelativePath, resolveWorkspacePath } from './workspace-service.mjs';
import { readJsonBody } from './request-utils.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const experienceMetadataPath = resolve(root, 'data/experience-metadata.json');
const experienceMetadataHistoryPath = resolve(root, 'data/experience-metadata-history.json');

export function registerExperienceMetadataRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/experience-metadata', readExperienceMetadataWithHistory);
  registerJsonRoute('POST', '/api/experience-metadata', saveExperienceMetadata);
}

async function readExperienceMetadataWithHistory() {
  const metadata = await readJsonFile(experienceMetadataPath, { updatedAt: '', experiences: [] });
  const history = await readJsonFile(experienceMetadataHistoryPath, { updatedAt: '', versions: [] });
  return {
    ...metadata,
    experiences: await Promise.all((metadata.experiences || []).map(hydrateExperienceSource)),
    versions: (history.versions || []).slice(-80).reverse(),
  };
}

async function hydrateExperienceSource(item) {
  const sourceFile = normalizeRelativePath(item.sourceFile || '');
  if (!sourceFile) return { ...item, sourceContent: '', sourceError: '' };
  try {
    if (!isSafeExperiencePath(sourceFile)) throw new Error('Invalid source path');
    const sourcePath = resolveWorkspacePath(sourceFile);
    return {
      ...item,
      sourceContent: await readFile(sourcePath, 'utf8'),
      sourceError: '',
    };
  } catch (err) {
    return {
      ...item,
      sourceContent: '',
      sourceError: String(err?.message || err),
    };
  }
}

async function saveExperienceMetadata(req) {
  const body = await readJsonBody(req);
  const next = normalizeExperienceMetadata(body.metadata || {});
  const before = await readJsonFile(experienceMetadataPath, { updatedAt: '', experiences: [] });
  const now = new Date().toISOString();
  next.updatedAt = now;

  const records = buildExperienceVersionRecords(before.experiences || [], next.experiences || [], now);
  await writeJsonFile(experienceMetadataPath, next);

  const history = await readJsonFile(experienceMetadataHistoryPath, { updatedAt: '', versions: [] });
  if (records.length) {
    history.updatedAt = now;
    history.versions = [...(history.versions || []), ...records].slice(-500);
    await writeJsonFile(experienceMetadataHistoryPath, history);
  }

  return {
    ok: true,
    saved: records.length,
    ...next,
    experiences: await Promise.all((next.experiences || []).map(hydrateExperienceSource)),
    versions: (history.versions || []).slice(-80).reverse(),
  };
}

function normalizeExperienceMetadata(input) {
  const experiences = Array.isArray(input.experiences) ? input.experiences : [];
  return {
    updatedAt: String(input.updatedAt || ''),
    experiences: experiences.map((item, index) => ({
      id: String(item.id || `exp-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-') || `exp-${index + 1}`,
      title: String(item.title || '').trim(),
      category: String(item.category || '').trim(),
      role: String(item.role || '').trim(),
      sourceFile: String(item.sourceFile || '').trim(),
      summary: String(item.summary || '').trim(),
      tags: normalizeStringList(item.tags),
      evidence: normalizeStringList(item.evidence),
      gaps: normalizeStringList(item.gaps),
      publicLevel: String(item.publicLevel || '').trim(),
    })).filter((item) => item.title),
  };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function buildExperienceVersionRecords(beforeItems, afterItems, now) {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(afterItems.map((item) => [item.id, item]));
  const records = [];

  for (const item of afterItems) {
    const before = beforeById.get(item.id);
    if (!before) {
      records.push(experienceVersionRecord(item.id, item.title, 'created', '', summarizeExperience(item), now));
      continue;
    }
    const beforeText = summarizeExperience(before);
    const afterText = summarizeExperience(item);
    if (beforeText !== afterText) {
      records.push(experienceVersionRecord(item.id, item.title, 'updated', beforeText, afterText, now));
    }
  }

  for (const item of beforeItems) {
    if (!afterById.has(item.id)) {
      records.push(experienceVersionRecord(item.id, item.title, 'deleted', summarizeExperience(item), '', now));
    }
  }

  return records;
}

function summarizeExperience(item) {
  return [
    `标题：${item.title || ''}`,
    `分类：${item.category || ''}`,
    `角色：${item.role || ''}`,
    `来源：${item.sourceFile || ''}`,
    `摘要：${item.summary || ''}`,
    `标签：${(item.tags || []).join('、')}`,
    `证据：${(item.evidence || []).join('；')}`,
    `缺口：${(item.gaps || []).join('；')}`,
    `公开程度：${item.publicLevel || ''}`,
  ].join('\n');
}

function experienceVersionRecord(itemId, title, action, before, after, changedAt) {
  return {
    id: `EX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    itemId,
    title,
    action,
    before,
    after,
    changedAt,
    source: 'experience-metadata',
  };
}

function isSafeExperiencePath(sourceFile) {
  return existsSync(resolveWorkspacePath(sourceFile));
}
