import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { WorkspaceFilePreview } from "@ucareer/shared";
import mammoth from "mammoth";
import { isInsideOrSameDir } from "../path-guards";

const execFileAsync = promisify(execFile);
const MAX_PREVIEW_BYTES = 128 * 1024;
const MAX_PDF_PREVIEW_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 12 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".jsonl",
  ".yml",
  ".yaml",
  ".tsv",
  ".csv",
  ".log",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".html",
  ".xml",
  ".sh",
  ".zsh",
  ".py",
  ".rb",
  ".java",
  ".go",
  ".rs",
  ".sql",
]);

export function createWorkspaceFilePreviewService(workspaceRoot: string) {
  return {
    async getFilePreview(inputPath: string): Promise<WorkspaceFilePreview | null> {
      const resolvedPath = resolveWorkspacePath(workspaceRoot, inputPath);
      if (!resolvedPath) return null;

      const stats = statSync(resolvedPath, { throwIfNoEntry: false });
      if (!stats || !stats.isFile()) return null;

      const fileName = basename(resolvedPath);
      const relativePath = relative(workspaceRoot, resolvedPath) || fileName;
      const extension = extname(resolvedPath).toLowerCase();
      const sizeBytes = stats.size;
      const updatedAt = stats.mtime.toISOString();
      const languageHint = extension.replace(/^\./u, "") || "text";

      const imageMimeType = IMAGE_MIME_TYPES.get(extension);
      if (imageMimeType) {
        if (sizeBytes > MAX_IMAGE_PREVIEW_BYTES) {
          return {
            path: resolvedPath,
            relativePath,
            fileName,
            sizeBytes,
            updatedAt,
            content: "图片文件过大，暂不在侧栏内嵌预览。",
            previewType: "unsupported",
            languageHint,
            truncated: false,
            encoding: "binary",
          };
        }
        const contentBuffer = readFileSync(resolvedPath);
        return {
          path: resolvedPath,
          relativePath,
          fileName,
          sizeBytes,
          updatedAt,
          content: "",
          previewType: "image",
          languageHint,
          truncated: false,
          encoding: "binary",
          dataUrl: `data:${imageMimeType};base64,${contentBuffer.toString("base64")}`,
        };
      }

      if (extension === ".pdf") {
        if (sizeBytes > MAX_PDF_PREVIEW_BYTES) {
          return {
            path: resolvedPath,
            relativePath,
            fileName,
            sizeBytes,
            updatedAt,
            content: "PDF 文件过大，暂不在侧栏内嵌预览。",
            previewType: "unsupported",
            languageHint,
            truncated: false,
            encoding: "binary",
          };
        }
        const contentBuffer = readFileSync(resolvedPath);
        return {
          path: resolvedPath,
          relativePath,
          fileName,
          sizeBytes,
          updatedAt,
          content: "",
          previewType: "pdf",
          languageHint,
          truncated: false,
          encoding: "binary",
          dataUrl: `data:application/pdf;base64,${contentBuffer.toString("base64")}`,
        };
      }

      if (extension === ".docx") {
        const pdfPreview = await convertDocxToPdfPreview(resolvedPath);
        if (pdfPreview) {
          return {
            path: resolvedPath,
            relativePath,
            fileName,
            sizeBytes,
            updatedAt,
            content: "",
            previewType: "pdf",
            languageHint,
            truncated: false,
            encoding: "binary",
            dataUrl: pdfPreview,
          };
        }
        return convertDocxToHtmlFallback({
          resolvedPath,
          relativePath,
          fileName,
          sizeBytes,
          updatedAt,
          languageHint,
        });
      }

      if (!TEXT_EXTENSIONS.has(extension)) {
        return {
          path: resolvedPath,
          relativePath,
          fileName,
          sizeBytes,
          updatedAt,
          content: "This file preview is unavailable because the file is not recognized as a text document.",
          previewType: "unsupported",
          languageHint,
          truncated: false,
          encoding: "binary",
        };
      }

      const contentBuffer = readFileSync(resolvedPath);
      const truncated = contentBuffer.byteLength > MAX_PREVIEW_BYTES;
      const previewBuffer = truncated ? contentBuffer.subarray(0, MAX_PREVIEW_BYTES) : contentBuffer;
      return {
        path: resolvedPath,
        relativePath,
        fileName,
        sizeBytes,
        updatedAt,
        content: previewBuffer.toString("utf8"),
        previewType: "text",
        languageHint,
        truncated,
        encoding: "utf8",
      };
    },
  };
}

async function convertDocxToPdfPreview(resolvedPath: string): Promise<string | null> {
  const libreOfficePath = findLibreOfficePath();
  if (!libreOfficePath) return null;

  const outputDir = await mkdtemp(join(tmpdir(), "ucareer-docx-preview-"));
  try {
    await execFileAsync(
      libreOfficePath,
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        outputDir,
        resolvedPath,
      ],
      { timeout: 60_000 },
    );
    const pdfPath = join(outputDir, `${basename(resolvedPath, extname(resolvedPath))}.pdf`);
    const pdfStats = statSync(pdfPath, { throwIfNoEntry: false });
    if (!pdfStats || !pdfStats.isFile() || pdfStats.size > MAX_PDF_PREVIEW_BYTES) return null;
    return `data:application/pdf;base64,${readFileSync(pdfPath).toString("base64")}`;
  } catch {
    return null;
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

function findLibreOfficePath(): string | null {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    "/opt/homebrew/bin/libreoffice",
    "/usr/local/bin/libreoffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "libreoffice",
    "soffice",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => candidate.includes("/") ? existsSync(candidate) : true) || null;
}

async function convertDocxToHtmlFallback({
  resolvedPath,
  relativePath,
  fileName,
  sizeBytes,
  updatedAt,
  languageHint,
}: {
  resolvedPath: string;
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  updatedAt: string;
  languageHint: string;
}): Promise<WorkspaceFilePreview> {
  const contentBuffer = readFileSync(resolvedPath);
  const converted = await mammoth.convertToHtml({ buffer: contentBuffer });
  return {
    path: resolvedPath,
    relativePath,
    fileName,
    sizeBytes,
    updatedAt,
    content: converted.value,
    previewType: "docx",
    languageHint,
    truncated: false,
    encoding: "binary",
  };
}

function resolveWorkspacePath(workspaceRoot: string, inputPath: string): string | null {
  const trimmed = inputPath.trim();
  if (!trimmed) return null;
  const resolvedPath = trimmed.startsWith("/")
    ? resolve(trimmed)
    : resolve(workspaceRoot, trimmed);
  if (!isInsideOrSameDir(workspaceRoot, resolvedPath)) return null;
  return resolvedPath;
}
