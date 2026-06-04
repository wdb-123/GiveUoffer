import { appendFile, mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

const toFallback = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

export async function readJsonFile(filePath, fallback = null) {
  try {
    const content = await readFile(filePath, 'utf8');
    const text = String(content || '').trim();
    if (!text) return toFallback(fallback);
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return toFallback(fallback);
    throw err;
  }
}

export async function readJsonLines(filePath, { maxLines = Infinity } = {}) {
  try {
    const content = await readFile(filePath, 'utf8');
    const result = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        result.push(JSON.parse(trimmed));
      } catch {
        continue;
      }
      if (result.length >= maxLines) break;
    }
    return result;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function writeJsonFile(filePath, value) {
  const dir = dirname(filePath);
  if (dir) await mkdir(dir, { recursive: true });
  const normalized = JSON.stringify(value, null, 2) + '\n';
  const tmpPath = `${filePath}.tmp.${Date.now().toString(36)}.${randomBytes(4).toString('hex')}`;
  await writeFile(tmpPath, normalized, 'utf8');
  await rename(tmpPath, filePath);
}

export async function appendJsonLine(filePath, value) {
  const dir = dirname(filePath);
  if (dir) await mkdir(dir, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}
