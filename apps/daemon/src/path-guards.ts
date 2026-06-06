import { relative, resolve } from "node:path";

export function isInsideDir(baseDir: string, targetPath: string): boolean {
  const relativePath = relative(resolve(baseDir), resolve(targetPath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

export function isInsideOrSameDir(baseDir: string, targetPath: string): boolean {
  const relativePath = relative(resolve(baseDir), resolve(targetPath));
  return !relativePath.startsWith("..") && !relativePath.startsWith("/");
}
