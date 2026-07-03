from __future__ import annotations

import base64
import mimetypes
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .workspace import resolve_inside, workspace_data_path

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_PARSED_TEXT_CHARS = 24_000
ATTACHMENT_INBOX_FOLDER = "inbox"


@dataclass
class AttachmentStore:
    workspace_root: Path

    def upload(self, payload: dict[str, Any]) -> dict[str, Any]:
        file_name = _sanitize_file_name(str(payload.get("fileName") or ""))
        if not file_name:
            raise ValueError("Attachment file name is required")

        try:
            content = base64.b64decode(str(payload.get("dataBase64") or ""), validate=True)
        except ValueError as cause:
            raise ValueError("Attachment dataBase64 is invalid") from cause

        declared_size = int(payload.get("sizeBytes") or len(content))
        if not content:
            raise ValueError("Attachment is empty")
        if len(content) > MAX_UPLOAD_BYTES or declared_size > MAX_UPLOAD_BYTES:
            raise ValueError("Attachment is too large")

        mime_type = str(payload.get("mimeType") or "") or _infer_mime_type(file_name)
        kind = _infer_kind(file_name, mime_type)
        parsed = _parse_attachment(content, file_name, kind, mime_type)

        attachments_dir = workspace_data_path(self.workspace_root, "agentAttachments")
        date = datetime.now().strftime("%Y-%m-%d")
        routed_dir = resolve_inside(attachments_dir, f"{date}/{ATTACHMENT_INBOX_FOLDER}")
        routed_dir.mkdir(parents=True, exist_ok=True)
        stored_name = _unique_stored_name(routed_dir, f"{date}-{file_name}")
        stored_path = resolve_inside(routed_dir, stored_name)
        stored_path.write_bytes(content)

        safe_id_part = re.sub(r"[^\w-]+", "-", Path(stored_name).stem).strip("-")
        attachment_id = f"attachment-{safe_id_part}"
        return {
            "id": attachment_id,
            "fileName": file_name,
            "mimeType": mime_type,
            "sizeBytes": len(content),
            "kind": kind,
            "storedPath": str(stored_path),
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "parsed": {
                **parsed,
                "metadata": {
                    **parsed.get("metadata", {}),
                    "storageFolder": ATTACHMENT_INBOX_FOLDER,
                },
            },
        }


def _parse_attachment(content: bytes, file_name: str, kind: str, mime_type: str) -> dict[str, Any]:
    if kind == "text":
        text = content.decode("utf-8", errors="replace")
        return _parsed_text(kind, text, {"fileName": file_name})
    if kind == "pdf":
        return {
            "kind": "pdf",
            "text": "",
            "summary": f"PDF 附件已保存：{file_name}。Python 后端暂未启用 PDF 文本抽取。",
            "metadata": {"fileName": file_name, "mimeType": mime_type, "sizeBytes": len(content)},
        }
    if kind == "docx":
        return {
            "kind": "docx",
            "text": "",
            "summary": f"DOCX 附件已保存：{file_name}。Python 后端暂未启用 DOCX 文本抽取。",
            "metadata": {"fileName": file_name, "mimeType": mime_type, "sizeBytes": len(content)},
        }
    if kind == "image":
        return {
            "kind": "image",
            "text": "",
            "summary": f"图片附件已保存：{file_name}。Python 后端暂未启用 OCR。",
            "metadata": {"fileName": file_name, "mimeType": mime_type, "sizeBytes": len(content), "ocrStatus": "unavailable"},
        }
    return {
        "kind": "unknown",
        "text": "",
        "summary": f"暂不支持解析该附件：{file_name}",
        "metadata": {"fileName": file_name, "mimeType": mime_type, "sizeBytes": len(content)},
    }


def _parsed_text(kind: str, raw_text: str, metadata: dict[str, Any]) -> dict[str, Any]:
    text = re.sub(r"[ \t]+\n", "\n", raw_text.replace("\x00", "")).strip()[:MAX_PARSED_TEXT_CHARS]
    return {
        "kind": kind,
        "text": text,
        "summary": _summarize_text(text) if text else "未解析出可用文本。",
        "metadata": {
            **metadata,
            "characters": len(text),
            "truncated": len(raw_text) > MAX_PARSED_TEXT_CHARS,
        },
    }


def _summarize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:360]


def _sanitize_file_name(file_name: str) -> str:
    name = Path(file_name).name.replace("/", "-").replace("\\", "-")
    return re.sub(r"[^\w.\-\u4e00-\u9fa5 ]", "_", name).strip()[:120]


def _infer_kind(file_name: str, mime_type: str) -> str:
    extension = Path(file_name).suffix.lower()
    if mime_type == "application/pdf" or extension == ".pdf":
        return "pdf"
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or extension == ".docx":
        return "docx"
    if mime_type.startswith("image/") or extension in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"
    if mime_type.startswith("text/") or extension in {".txt", ".md", ".csv", ".json", ".tsv"}:
        return "text"
    return "unknown"


def _infer_mime_type(file_name: str) -> str:
    extension = Path(file_name).suffix.lower()
    if extension == ".md":
        return "text/markdown"
    guessed, _ = mimetypes.guess_type(file_name)
    return guessed or "application/octet-stream"


def _unique_stored_name(directory: Path, preferred_name: str) -> str:
    path = Path(preferred_name)
    stem = path.stem
    suffix = path.suffix
    candidate = preferred_name
    index = 2
    while (directory / candidate).exists():
        candidate = f"{stem}-{index}{suffix}"
        index += 1
    return candidate
