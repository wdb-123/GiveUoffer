import { existsSync } from 'fs';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonBody } from './request-utils.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

export function registerWorkspaceRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/workspace-resource', readWorkspaceResource);
  registerJsonRoute('POST', '/api/workspace-resource', saveWorkspaceResource);
}

export async function readWorkspaceResource(req, url) {
  if (!url && req && req.url) url = new URL(req.url, 'http://localhost');
  const resourcePath = url.searchParams.get('path') || '';
  if (resourcePath.includes('*')) return listWorkspaceGlob(resourcePath);
  const target = resolveWorkspacePath(resourcePath);
  const info = await stat(target);
  if (info.isDirectory()) {
    const entries = await Promise.all((await readdir(target)).sort().map(async (name) => {
      const childRel = `${resourcePath.replace(/\/$/, '')}/${name}`;
      const child = resolveWorkspacePath(childRel);
      const childInfo = await stat(child);
      return {
        name,
        path: normalizeRelativePath(childRel),
        type: childInfo.isDirectory() ? 'directory' : 'file',
        editable: childInfo.isFile() && isEditablePath(childRel),
      };
    }));
    return { type: 'directory', path: normalizeRelativePath(resourcePath), entries };
  }
  if (!info.isFile()) throw new Error('Unsupported resource type');
  const editable = isEditablePath(resourcePath);
  return {
    type: 'file',
    path: normalizeRelativePath(resourcePath),
    editable,
    content: editable ? await readFile(target, 'utf8') : '',
  };
}

export async function saveWorkspaceResource(req) {
  const body = await readJsonBody(req);
  const resourcePath = normalizeRelativePath(body.path || '');
  if (!isEditablePath(resourcePath)) throw new Error('This file type is not editable here');
  const target = resolveWorkspacePath(resourcePath);
  await writeFile(target, String(body.content ?? ''), 'utf8');
  return { ok: true, path: resourcePath };
}

export function resolveWorkspacePath(resourcePath) {
  const normalized = normalizeRelativePath(resourcePath);
  if (!isAllowedResourcePath(normalized)) throw new Error(`Resource not allowed: ${resourcePath}`);
  const target = resolve(root, normalized);
  if (!target.startsWith(root)) throw new Error('Resource escapes workspace');
  if (!existsSync(target)) throw new Error(`Resource not found: ${normalized}`);
  return target;
}

export function normalizeRelativePath(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function isEditablePath(resourcePath) {
  return /\.(md|json|yml|yaml|txt|tsv|csv)$/i.test(resourcePath);
}

export function isAllowedResourcePath(resourcePath) {
  const p = normalizeRelativePath(resourcePath);
  return p === 'resumes'
    || p === 'data'
    || p === 'output'
    || p === 'reports'
    || p === 'mycv'
    || p === 'mycv/project-notes'
    || p === 'resumes/*.md'
    || p === 'resumes/direction-clues.json'
    || p === 'resumes/targets'
    || p.startsWith('resumes/')
    || p.startsWith('data/')
    || p.startsWith('output/')
    || p.startsWith('reports/')
    || p.startsWith('mycv/project-notes/');
}

async function listWorkspaceGlob(resourcePath) {
  const [dirPart, patternPart] = resourcePath.split(/\/(?=[^/]*\*)/);
  const dir = normalizeRelativePath(dirPart || '.');
  const targetDir = resolveWorkspacePath(dir);
  const regex = new RegExp(`^${patternPart.replaceAll('.', '\\.').replaceAll('*', '.*')}$`);
  const entries = (await readdir(targetDir))
    .filter((name) => regex.test(name))
    .sort()
    .map((name) => ({
      name,
      path: normalizeRelativePath(`${dir}/${name}`),
      type: 'file',
      editable: isEditablePath(`${dir}/${name}`),
    }));
  return { type: 'directory', path: normalizeRelativePath(resourcePath), entries };
}
