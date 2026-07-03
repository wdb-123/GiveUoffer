from __future__ import annotations

import base64
import email
import imaplib
import os
import re
import sqlite3
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .db import connect_database
from .workspace import resolve_inside


CONNECTORS: list[dict[str, Any]] = [
    {
        "id": "jobsearch",
        "label": "jobsearch",
        "kind": "job_board",
        "status": "available",
        "description": "Search module entry for readonly job discovery and market import.",
        "capabilities": ["import_jobs"],
        "readScopes": ["workspace.read"],
        "writeScopes": ["workspace.write"],
        "workspacePaths": ["workspace/ops/data/recruitment-market.json", "workspace/profile/portals.yml"],
        "requiresAuth": False,
        "syncable": False,
    },
    {
        "id": "qq-email",
        "label": "QQ邮箱",
        "kind": "mailbox",
        "status": "available",
        "description": "Connects QQ Mail through IMAP readonly access for recruiter replies and application email signals.",
        "capabilities": ["search_messages"],
        "readScopes": ["applications.read"],
        "writeScopes": [],
        "workspacePaths": ["workspace/ops/data"],
        "requiresAuth": True,
        "syncable": False,
        "protocol": {"type": "imap", "host": "imap.qq.com", "port": 993, "secure": True, "mode": "readonly"},
        "authFields": [
            {"id": "email", "label": "QQ邮箱地址", "kind": "email", "required": True, "secret": False},
            {
                "id": "authorizationCode",
                "label": "IMAP授权码",
                "kind": "authorization_code",
                "required": True,
                "secret": True,
                "helpText": "在 QQ 邮箱网页版开启 IMAP/SMTP 后生成的 16 位授权码，不是 QQ 登录密码。",
            },
        ],
    },
]

QQ_EMAIL_CONNECTOR_ID = "qq-email"


def list_connectors() -> dict[str, Any]:
    return {"connectors": CONNECTORS}


def get_connector(connector_id: str) -> dict[str, Any] | None:
    return next((connector for connector in CONNECTORS if connector["id"] == connector_id), None)


class ConnectorCredentialStore:
    def __init__(self, db_path: Path, tenant_root: Path, tenant_id: str) -> None:
        self.db_path = db_path
        self.tenant_root = tenant_root
        self.tenant_id = tenant_id
        self.key = _read_or_create_key(resolve_inside(tenant_root, ".ucareer/connector.key"))

    def save_qq_email(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = _now()
        account = _normalize_email(payload.get("email"))
        secret = _normalize_authorization_code(payload.get("authorizationCode"))
        if not account:
            raise ValueError("QQ 邮箱地址不能为空")
        if not secret:
            raise ValueError("QQ 邮箱 IMAP 授权码不能为空")
        encrypted = _encrypt_secret(secret, self.key)
        with connect_database(self.db_path) as conn:
            existing = conn.execute(
                "SELECT created_at FROM connector_credentials WHERE tenant_id = ? AND connector_id = ?",
                (self.tenant_id, QQ_EMAIL_CONNECTOR_ID),
            ).fetchone()
            row = {
                "tenant_id": self.tenant_id,
                "connector_id": QQ_EMAIL_CONNECTOR_ID,
                "account": account,
                "secret_ciphertext": encrypted["ciphertext"],
                "secret_iv": encrypted["iv"],
                "secret_auth_tag": encrypted["authTag"],
                "created_at": existing["created_at"] if existing else now,
                "updated_at": now,
                "verified_at": str(payload.get("verifiedAt") or now),
            }
            conn.execute(
                """
                INSERT INTO connector_credentials
                  (tenant_id, connector_id, account, secret_ciphertext, secret_iv, secret_auth_tag, created_at, updated_at, verified_at)
                VALUES
                  (:tenant_id, :connector_id, :account, :secret_ciphertext, :secret_iv, :secret_auth_tag, :created_at, :updated_at, :verified_at)
                ON CONFLICT(tenant_id, connector_id) DO UPDATE SET
                  account = excluded.account,
                  secret_ciphertext = excluded.secret_ciphertext,
                  secret_iv = excluded.secret_iv,
                  secret_auth_tag = excluded.secret_auth_tag,
                  updated_at = excluded.updated_at,
                  verified_at = excluded.verified_at
                """,
                row,
            )
            conn.commit()
        return _summary(row)

    def get_summary(self, connector_id: str = QQ_EMAIL_CONNECTOR_ID) -> dict[str, Any] | None:
        row = self._get_row(connector_id)
        return _summary(row) if row else None

    def get_secret(self, connector_id: str = QQ_EMAIL_CONNECTOR_ID) -> dict[str, Any] | None:
        row = self._get_row(connector_id)
        if not row:
            return None
        data = dict(row)
        data["secret"] = _decrypt_secret(data, self.key)
        return {**_summary(data), "secret": data["secret"]}

    def _get_row(self, connector_id: str) -> sqlite3.Row | None:
        with connect_database(self.db_path) as conn:
            return conn.execute(
                "SELECT * FROM connector_credentials WHERE tenant_id = ? AND connector_id = ?",
                (self.tenant_id, connector_id),
            ).fetchone()


def test_qq_email_connection(payload: dict[str, Any]) -> dict[str, Any]:
    account = _normalize_email(payload.get("email"))
    secret = _normalize_authorization_code(payload.get("authorizationCode"))
    protocol = _qq_email_protocol()
    if not account or not secret:
        raise ValueError("QQ 邮箱地址和 IMAP 授权码不能为空")
    with _open_qq_imap(account, secret) as session:
        return {
            "connectorId": QQ_EMAIL_CONNECTOR_ID,
            "email": account,
            "connected": True,
            "checkedAt": _now(),
            "protocol": protocol,
            "serverGreeting": getattr(session, "welcome", b"").decode("utf-8", errors="replace"),
        }


def import_qq_email_messages(credential: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    account = str(credential["account"])
    with _open_qq_imap(account, str(credential["secret"])) as session:
        mailbox = str(payload.get("mailbox") or "INBOX")
        session.select(mailbox, readonly=True)
        status, data = session.search(None, "UNSEEN" if payload.get("query") == "unseen" else "ALL")
        if status != "OK":
            raise ValueError("QQ 邮箱搜索失败")
        uids = list(reversed((data[0] or b"").split()))
        offset = max(0, _int(payload.get("offset"), 0))
        limit = min(max(1, _int(payload.get("limit"), 20)), 100)
        messages: list[dict[str, Any]] = []
        for uid in uids[offset:]:
            if len(messages) >= limit:
                break
            status, fetched = session.fetch(uid, "(RFC822)")
            if status != "OK" or not fetched:
                continue
            raw = _first_message_bytes(fetched)
            if raw is None:
                continue
            parsed = email.message_from_bytes(raw)
            summary = _message_summary(parsed, uid.decode("ascii", errors="ignore"), mailbox, _int(payload.get("snippetBytes"), 1200))
            if _matches_filters(summary, parsed, payload):
                messages.append(summary)
        return {
            "connectorId": QQ_EMAIL_CONNECTOR_ID,
            "account": account,
            "mailbox": mailbox,
            "importedAt": _now(),
            "messages": messages,
        }


def import_qq_email_attachments(credential: dict[str, Any], payload: dict[str, Any], tenant_root: Path) -> dict[str, Any]:
    uid = str(payload.get("uid") or "").strip()
    if not uid:
        raise ValueError("邮件 UID 不能为空")
    mailbox = str(payload.get("mailbox") or "INBOX")
    application_id = str(payload.get("application_id") or payload.get("applicationId") or "mail")
    output_dir = resolve_inside(tenant_root, f"workspace/ops/data/email-attachments/{_safe_name(f'{application_id}-{uid}')}")
    output_dir.mkdir(parents=True, exist_ok=True)
    attachments: list[dict[str, Any]] = []
    with _open_qq_imap(str(credential["account"]), str(credential["secret"])) as session:
        session.select(mailbox, readonly=True)
        status, fetched = session.fetch(uid.encode("ascii"), "(RFC822)")
        if status != "OK":
            raise ValueError("QQ 邮箱附件读取失败")
        raw = _first_message_bytes(fetched)
        if raw is None:
            return {"attachments": []}
        parsed = email.message_from_bytes(raw)
        for part in parsed.walk():
            filename = part.get_filename()
            if not filename:
                continue
            decoded_name = _decode_header(filename) or "attachment"
            content = part.get_payload(decode=True) or b""
            target = output_dir / _safe_name(decoded_name)
            target.write_bytes(content)
            attachments.append({
                "filename": decoded_name,
                "contentType": part.get_content_type(),
                "size": len(content),
                "path": str(target),
            })
    return {"attachments": attachments}


def _open_qq_imap(account: str, secret: str) -> imaplib.IMAP4_SSL:
    protocol = _qq_email_protocol()
    session = imaplib.IMAP4_SSL(str(protocol["host"]), int(protocol["port"]))
    session.login(account, secret)
    return session


def _message_summary(message: Message, uid: str, mailbox: str, snippet_bytes: int) -> dict[str, Any]:
    text = _message_text(message)
    return {
        "uid": uid,
        "mailbox": mailbox,
        "from": _decode_header(message.get("from", "")),
        "subject": _decode_header(message.get("subject", "")),
        "date": _decode_header(message.get("date", "")),
        "snippet": text[: max(200, min(snippet_bytes, 12000))],
        "attachments": _attachment_summaries(message),
    }


def _matches_filters(summary: dict[str, Any], message: Message, payload: dict[str, Any]) -> bool:
    text = _message_text(message).lower()
    for key, field in [("from", "from"), ("subject", "subject")]:
        needle = str(payload.get(key) or "").strip().lower()
        if needle and needle not in str(summary.get(field) or "").lower():
            return False
    content = str(payload.get("content") or "").strip().lower()
    if content and content not in text:
        return False
    return True


def _message_text(message: Message) -> str:
    parts: list[str] = []
    for part in message.walk():
        if part.get_content_maintype() == "multipart" or part.get_filename():
            continue
        if part.get_content_type() not in {"text/plain", "text/html"}:
            continue
        payload = part.get_payload(decode=True)
        if payload:
            charset = part.get_content_charset() or "utf-8"
            parts.append(payload.decode(charset, errors="replace"))
    if not parts:
        payload = message.get_payload(decode=True)
        if isinstance(payload, bytes):
            parts.append(payload.decode(message.get_content_charset() or "utf-8", errors="replace"))
    return re.sub(r"<[^>]+>", " ", "\n".join(parts)).strip()


def _attachment_summaries(message: Message) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for part in message.walk():
        filename = part.get_filename()
        if not filename:
            continue
        content = part.get_payload(decode=True) or b""
        result.append({"filename": _decode_header(filename), "contentType": part.get_content_type(), "size": len(content)})
    return result


def _first_message_bytes(fetched: list[Any]) -> bytes | None:
    for item in fetched:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
            return item[1]
    return None


def _read_or_create_key(path: Path) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return base64.b64decode(path.read_text(encoding="utf-8").strip())
    key = os.urandom(32)
    path.write_text(base64.b64encode(key).decode("ascii"), encoding="utf-8")
    path.chmod(0o600)
    return key


def _encrypt_secret(secret: str, key: bytes) -> dict[str, str]:
    iv = os.urandom(12)
    encrypted = AESGCM(key).encrypt(iv, secret.encode("utf-8"), None)
    return {
        "ciphertext": base64.b64encode(encrypted[:-16]).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "authTag": base64.b64encode(encrypted[-16:]).decode("ascii"),
    }


def _decrypt_secret(row: dict[str, Any], key: bytes) -> str:
    iv = base64.b64decode(row["secret_iv"])
    ciphertext = base64.b64decode(row["secret_ciphertext"])
    tag = base64.b64decode(row["secret_auth_tag"])
    return AESGCM(key).decrypt(iv, ciphertext + tag, None).decode("utf-8")


def _summary(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    return {
        "connectorId": row["connector_id"],
        "account": row["account"],
        "secretStored": True,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        **({"verifiedAt": row["verified_at"]} if row["verified_at"] else {}),
    }


def _qq_email_protocol() -> dict[str, Any]:
    connector = get_connector(QQ_EMAIL_CONNECTOR_ID) or {}
    return dict(connector.get("protocol") or {})


def _decode_header(value: str) -> str:
    decoded = email.header.decode_header(value or "")
    return "".join(
        chunk.decode(charset or "utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
        for chunk, charset in decoded
    ).strip()


def _normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalize_authorization_code(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", value or "mail")[:80] or "mail"


def _int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
