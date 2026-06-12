import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { AgentAttachment, AgentAttachmentKind, ParsedAttachment, UploadAgentAttachmentRequest } from "@ucareer/shared";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { isInsideDir } from "../path-guards";

const maxUploadBytes = 12 * 1024 * 1024;
const maxParsedTextChars = 24_000;
const attachmentInboxFolder = "inbox";

export function createAttachmentParserService(workspaceRoot: string) {
  const attachmentsDir = resolve(workspaceRoot, "workspace/ops/imports/agent-attachments");
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
    return {
      kind: "image",
      text: "",
      summary: `图片附件：${input.fileName}。当前入口层已安全保存图片；OCR/视觉理解将在后续视觉解析器中接入。`,
      metadata: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
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
