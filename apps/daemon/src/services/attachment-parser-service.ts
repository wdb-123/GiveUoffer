import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { AgentAttachment, AgentAttachmentKind, ParsedAttachment, UploadAgentAttachmentRequest } from "@ucareer/shared";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { isInsideDir } from "../path-guards";
import { workspaceDataPath } from "../workspace-paths";

const execFileAsync = promisify(execFile);
const maxUploadBytes = 12 * 1024 * 1024;
const maxParsedTextChars = 24_000;
const attachmentInboxFolder = "inbox";
const defaultTesseractDataDir = "/opt/homebrew/share/tessdata";

export function createAttachmentParserService(workspaceRoot: string) {
  const attachmentsDir = workspaceDataPath(workspaceRoot, "agentAttachments");
  mkdirSync(attachmentsDir, { recursive: true });

  return {
    async upload(input: UploadAgentAttachmentRequest): Promise<AgentAttachment> {
      const fileName = sanitizeFileName(input.fileName);
      const buffer = Buffer.from(input.dataBase64, "base64");
      const declaredSize = input.sizeBytes ?? buffer.byteLength;
      if (!fileName) throw new Error("Attachment file name is required");
      if (buffer.byteLength === 0) throw new Error("Attachment is empty");
      if (buffer.byteLength > maxUploadBytes || declaredSize > maxUploadBytes) {
        throw new Error("Attachment is too large");
      }

      const mimeType = input.mimeType || inferMimeType(fileName);
      const kind = inferKind(fileName, mimeType);
      const parsed = await parseAttachment({ buffer, fileName, kind, mimeType });
      const date = formatDate(new Date());
      const dateDir = resolve(attachmentsDir, date);
      const routedDir = resolve(dateDir, attachmentInboxFolder);
      if (!isInsideDir(attachmentsDir, routedDir)) throw new Error("Invalid attachment route path");
      mkdirSync(routedDir, { recursive: true });

      const storedName = uniqueStoredName(routedDir, `${date}-${fileName}`);
      const storedPath = resolve(routedDir, storedName);
      if (!isInsideDir(attachmentsDir, storedPath)) throw new Error("Invalid attachment path");
      writeFileSync(storedPath, buffer);
      const id = `attachment-${storedName.replace(/\.[^.]+$/u, "").replace(/[^\w-]+/g, "-")}`;
      return {
        id,
        fileName,
        mimeType,
        sizeBytes: buffer.byteLength,
        kind,
        storedPath,
        createdAt: new Date().toISOString(),
        parsed: {
          ...parsed,
          metadata: {
            ...parsed.metadata,
            storageFolder: attachmentInboxFolder,
          },
        },
      };
    },
  };
}

async function parseAttachment(input: {
  buffer: Buffer;
  fileName: string;
  kind: AgentAttachmentKind;
  mimeType: string;
}): Promise<ParsedAttachment> {
  if (input.kind === "pdf") {
    const parser = new PDFParse({ data: input.buffer });
    try {
      const parsed = await parser.getText();
      return parsedText(input.kind, parsed.text, {
        pages: parsed.total || 0,
        fileName: input.fileName,
      });
    } finally {
      await parser.destroy();
    }
  }
  if (input.kind === "docx") {
    const parsed = await mammoth.extractRawText({ buffer: input.buffer });
    return parsedText(input.kind, parsed.value, {
      warnings: parsed.messages.length,
      fileName: input.fileName,
    });
  }
  if (input.kind === "text") {
    return parsedText(input.kind, input.buffer.toString("utf8"), { fileName: input.fileName });
  }
  if (input.kind === "image") {
    const ocr = await extractImageText(input);
    return {
      kind: "image",
      text: ocr.text,
      summary: ocr.text
        ? `图片 OCR：${summarizeText(ocr.text)}`
        : `图片附件：${input.fileName}。${ocr.message}`,
      metadata: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
        ocrEngine: "tesseract",
        ocrStatus: ocr.status,
        ocrLanguages: ocr.languages.join("+"),
        ocrMessage: ocr.message,
      },
    };
  }
  return {
    kind: "unknown",
    text: "",
    summary: `暂不支持解析该附件：${input.fileName}`,
    metadata: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    },
  };
}

async function extractImageText(input: { buffer: Buffer; fileName: string }): Promise<{
  text: string;
  status: "ok" | "empty" | "unavailable" | "failed";
  message: string;
  languages: string[];
}> {
  const tesseractPath = findTesseractPath();
  if (!tesseractPath) {
    return {
      text: "",
      status: "unavailable",
      message: "本机未找到 tesseract，暂不能自动 OCR。可安装 tesseract 后重试。",
      languages: [],
    };
  }

  const workDir = await mkdtemp(join(tmpdir(), "ucareer-ocr-"));
  const imagePath = join(workDir, sanitizeFileName(input.fileName) || "image.png");
  const languages = resolveTesseractLanguages();
  try {
    await writeFile(imagePath, input.buffer);
    const { stdout } = await execFileAsync(
      tesseractPath,
      [imagePath, "stdout", "-l", languages.join("+"), "--psm", "6"],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const text = normalizeOcrText(stdout).slice(0, maxParsedTextChars);
    if (!text) {
      return {
        text: "",
        status: "empty",
        message: languages.some((language) => language.startsWith("chi_"))
          ? "OCR 未识别出文字。请确认截图清晰度、字体大小和对比度。"
          : "OCR 未识别出文字。当前仅启用 eng/snum 语言包；中文截图需要安装 chi_sim/chi_tra 语言包后重试。",
        languages,
      };
    }
    return {
      text,
      status: "ok",
      message: "OCR 已完成。",
      languages,
    };
  } catch (error) {
    return {
      text: "",
      status: "failed",
      message: error instanceof Error ? `OCR 失败：${error.message}` : "OCR 失败。",
      languages,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function normalizeOcrText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function findTesseractPath(): string | null {
  const candidates = [
    process.env.TESSERACT_PATH,
    "/opt/homebrew/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/usr/bin/tesseract",
    "tesseract",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => candidate.includes("/") ? existsSync(candidate) : true) || null;
}

function resolveTesseractLanguages(): string[] {
  const dataDir = process.env.TESSDATA_PREFIX || defaultTesseractDataDir;
  const candidates = ["chi_sim", "chi_tra", "eng", "snum"];
  const available = candidates.filter((language) => existsSync(resolve(dataDir, `${language}.traineddata`)));
  return available.length ? available : ["eng"];
}

function parsedText(kind: AgentAttachmentKind, rawText: string, metadata: ParsedAttachment["metadata"]): ParsedAttachment {
  const text = rawText.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, maxParsedTextChars);
  return {
    kind,
    text,
    summary: text ? summarizeText(text) : "未解析出可用文本。",
    metadata: {
      ...metadata,
      characters: text.length,
      truncated: rawText.length > maxParsedTextChars,
    },
  };
}

function summarizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 360);
}

function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[/\\]/g, "-").replace(/[^\w.\-\u4e00-\u9fa5 ]/g, "_").trim().slice(0, 120);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uniqueStoredName(dir: string, preferredName: string): string {
  const ext = extname(preferredName);
  const base = ext ? preferredName.slice(0, -ext.length) : preferredName;
  let candidate = preferredName;
  let index = 2;
  while (existsSync(resolve(dir, candidate))) {
    candidate = `${base}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function inferKind(fileName: string, mimeType: string): AgentAttachmentKind {
  const ext = extname(fileName).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || ext === ".docx"
  ) return "docx";
  if (mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if (mimeType.startsWith("text/") || [".txt", ".md", ".csv", ".json", ".tsv"].includes(ext)) return "text";
  return "unknown";
}

function inferMimeType(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".md") return "text/markdown";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}
