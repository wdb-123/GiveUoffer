import { execFile } from 'child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, resolve } from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { readJsonBody } from './request-utils.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const projectNotesDir = join(root, 'mycv/project-notes');
const headshotsDir = join(root, 'mycv/headshots');
const intentionsDir = join(root, 'mycv/intentions');
const importedTemplatesDir = join(root, 'templates/imported');
const execFileAsync = promisify(execFile);

export function registerAssetRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/experience-files', listExperienceFiles);
  registerJsonRoute('POST', '/api/experience-files', importExperienceFile);
  registerJsonRoute('GET', '/api/resume-templates', listImportedResumeTemplates);
  registerJsonRoute('POST', '/api/resume-templates', importResumeTemplate);
}

export async function listExperienceFiles() {
  if (!existsSync(projectNotesDir)) await mkdir(projectNotesDir, { recursive: true });
  if (!existsSync(headshotsDir)) await mkdir(headshotsDir, { recursive: true });
  if (!existsSync(intentionsDir)) await mkdir(intentionsDir, { recursive: true });
  const entries = await Promise.all((await readdir(projectNotesDir)).sort().map(async (name) => {
    const fullPath = join(projectNotesDir, name);
    const info = await stat(fullPath);
    if (!info.isFile() || !/\.(md|docx|txt)$/i.test(name)) return null;
    const relativePath = normalizeRelativePath(`mycv/project-notes/${name}`);
    const content = await readExperienceFileContent(fullPath, name);
    return {
      name,
      path: relativePath,
      title: experienceTitleFromContent(name, content),
      kind: extname(name).replace('.', '').toLowerCase(),
      updatedAt: info.mtime.toISOString(),
      content,
    };
  }));
  return {
    files: entries.filter(Boolean),
    photos: await listHeadshotAssets(),
    intentions: await listIntentionAssets(),
  };
}

export async function listImportedResumeTemplates() {
  if (!existsSync(importedTemplatesDir)) await mkdir(importedTemplatesDir, { recursive: true });
  const templates = await Promise.all((await readdir(importedTemplatesDir)).sort().map(async (name) => {
    const fullPath = join(importedTemplatesDir, name);
    const info = await stat(fullPath);
    if (!info.isFile() || !/\.(html|css|txt|md)$/i.test(name)) return null;
    return {
      name,
      path: normalizeRelativePath(`templates/imported/${name}`),
      kind: extname(name).replace('.', '').toLowerCase(),
      updatedAt: info.mtime.toISOString(),
    };
  }));
  return { templates: templates.filter(Boolean) };
}

export async function importResumeTemplate(req) {
  const body = await readJsonBody(req);
  const originalName = String(body.name || '').trim();
  if (!/\.(html|css|txt|md)$/i.test(originalName)) throw new Error('Only .html, .css, .txt, and .md template files are supported');
  const safeName = sanitizeFileName(originalName);
  const target = join(importedTemplatesDir, safeName);
  if (!target.startsWith(importedTemplatesDir)) throw new Error('Invalid template path');
  await mkdir(importedTemplatesDir, { recursive: true });
  const bytes = Buffer.from(String(body.contentBase64 || ''), 'base64');
  if (!bytes.length) throw new Error('Empty template file');
  await writeFile(target, bytes);
  return { ok: true, path: normalizeRelativePath(`templates/imported/${safeName}`), ...(await listImportedResumeTemplates()) };
}

export async function importExperienceFile(req) {
  const body = await readJsonBody(req);
  const originalName = String(body.name || '').trim();
  const bytes = Buffer.from(String(body.contentBase64 || ''), 'base64');
  if (!bytes.length) throw new Error('Empty file');
  if (/\.(png|jpe?g|webp)$/i.test(originalName)) {
    const safeName = sanitizeFileName(originalName);
    const target = join(headshotsDir, safeName);
    if (!target.startsWith(headshotsDir)) throw new Error('Invalid target path');
    await mkdir(headshotsDir, { recursive: true });
    await writeFile(target, bytes);
    return { ok: true, type: 'photo', path: normalizeRelativePath(`mycv/headshots/${safeName}`), ...(await listExperienceFiles()) };
  }
  if (body.assetType === 'intention') {
    if (!/\.(md|docx|txt)$/i.test(originalName)) throw new Error('Only .md, .docx, and .txt intention files are supported');
    const safeName = sanitizeFileName(originalName);
    const target = join(intentionsDir, safeName);
    if (!target.startsWith(intentionsDir)) throw new Error('Invalid intention path');
    await mkdir(intentionsDir, { recursive: true });
    await writeFile(target, bytes);
    return { ok: true, type: 'intention', path: normalizeRelativePath(`mycv/intentions/${safeName}`), ...(await listExperienceFiles()) };
  }
  if (!/\.(md|docx|txt)$/i.test(originalName)) throw new Error('Only .md, .docx, .txt, .png, .jpg, .jpeg, and .webp files are supported');
  const safeName = sanitizeFileName(originalName);
  const target = join(projectNotesDir, safeName);
  if (!target.startsWith(projectNotesDir)) throw new Error('Invalid target path');
  await mkdir(projectNotesDir, { recursive: true });
  await writeFile(target, bytes);
  return { ok: true, type: 'file', path: normalizeRelativePath(`mycv/project-notes/${safeName}`), ...(await listExperienceFiles()) };
}

async function listIntentionAssets() {
  if (!existsSync(intentionsDir)) return [];
  const entries = await Promise.all((await readdir(intentionsDir)).sort().map(async (name) => {
    const fullPath = join(intentionsDir, name);
    const info = await stat(fullPath);
    if (!info.isFile() || !/\.(md|docx|txt)$/i.test(name)) return null;
    const content = await readExperienceFileContent(fullPath, name);
    return {
      name,
      path: normalizeRelativePath(`mycv/intentions/${name}`),
      title: experienceTitleFromContent(name, content),
      kind: extname(name).replace('.', '').toLowerCase(),
      updatedAt: info.mtime.toISOString(),
      content,
    };
  }));
  return entries.filter(Boolean);
}

async function listHeadshotAssets() {
  const sources = [
    { dir: join(root, 'mycv'), rel: 'mycv' },
    { dir: headshotsDir, rel: 'mycv/headshots' },
  ];
  const photos = [];
  for (const source of sources) {
    if (!existsSync(source.dir)) continue;
    const names = await readdir(source.dir);
    for (const name of names.sort()) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      const fullPath = join(source.dir, name);
      const info = await stat(fullPath);
      if (!info.isFile()) continue;
      const kind = extname(name).replace('.', '').toLowerCase();
      const mimeType = imageMimeType(kind);
      const data = await readFile(fullPath);
      photos.push({
        name,
        path: normalizeRelativePath(`${source.rel}/${name}`),
        title: name.replace(/\.(png|jpe?g|webp)$/i, ''),
        kind,
        updatedAt: info.mtime.toISOString(),
        dataUrl: `data:${mimeType};base64,${data.toString('base64')}`,
      });
    }
  }
  const seen = new Set();
  return photos.filter((photo) => {
    if (seen.has(photo.path)) return false;
    seen.add(photo.path);
    return true;
  });
}

function imageMimeType(kind) {
  if (kind === 'jpg' || kind === 'jpeg') return 'image/jpeg';
  if (kind === 'webp') return 'image/webp';
  return 'image/png';
}

async function readExperienceFileContent(fullPath, name) {
  if (/\.docx$/i.test(name)) return readDocxText(fullPath);
  return readFile(fullPath, 'utf8');
}

async function readDocxText(fullPath) {
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', fullPath, 'word/document.xml'], { maxBuffer: 10 * 1024 * 1024 });
    return docxXmlToMarkdown(stdout);
  } catch (err) {
    return `# ${fullPath.split('/').pop()}\n\nDOCX 预览失败：${String(err?.message || err)}`;
  }
}

function docxXmlToMarkdown(xml) {
  return String(xml)
    .replace(/<w:p[\s\S]*?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

function experienceTitleFromContent(name, content) {
  return String(content || '').match(/^#\s+(.+)$/m)?.[1]
    || name.replace(/\.(md|docx|txt)$/i, '');
}

export function sanitizeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function normalizeRelativePath(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}
