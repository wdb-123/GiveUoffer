from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .db import connect_database


@dataclass
class SyncStore:
    db_path: Path
    tenant_id: str

    def list_outbox(self, limit: int = 100) -> dict[str, Any]:
        return {"events": self._list_events(limit)}

    def mark_pushed(self, ids: list[int]) -> dict[str, Any]:
        clean_ids = [int(item) for item in ids if isinstance(item, int) or str(item).isdigit()]
        if not clean_ids:
            return {"marked": 0}
        placeholders = ",".join("?" for _ in clean_ids)
        pushed_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        with connect_database(self.db_path) as conn:
            result = conn.execute(
                f"""
                UPDATE sync_events
                SET pushed_at = ?
                WHERE id IN ({placeholders}) AND tenant_id = ?
                """,
                [pushed_at, *clean_ids, self.tenant_id],
            )
            conn.commit()
            return {"marked": result.rowcount}

    def push_to_cloud(self, payload: dict[str, Any]) -> dict[str, Any]:
        cloud_url = str(payload.get("cloudUrl") or os.environ.get("UCAREER_CLOUD_URL") or "http://127.0.0.1:4191").rstrip("/")
        limit = _safe_limit(payload.get("limit"), 100)
        events = self._list_events(limit)
        request = urllib.request.Request(
            f"{cloud_url}/sync/push",
            data=json.dumps({"events": events}, ensure_ascii=False).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                envelope = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as cause:
            raise ValueError(f"Cloud sync push failed: {cause}") from cause
        except json.JSONDecodeError as cause:
            raise ValueError("Cloud sync push failed: invalid JSON response") from cause

        if not isinstance(envelope, dict) or not envelope.get("ok"):
            message = ""
            if isinstance(envelope, dict) and isinstance(envelope.get("error"), dict):
                message = str(envelope["error"].get("message") or "")
            raise ValueError(message or "Cloud sync push failed")

        data = envelope.get("data") if isinstance(envelope.get("data"), dict) else {}
        accepted_ids = [int(item) for item in data.get("acceptedIds", []) if isinstance(item, int) or str(item).isdigit()]
        marked = self.mark_pushed(accepted_ids)["marked"]
        return {
            "cloudUrl": cloud_url,
            "sent": len(events),
            "acceptedIds": accepted_ids,
            "marked": marked,
            "cursor": str(data.get("cursor") or ""),
        }

    def _list_events(self, limit: int) -> list[dict[str, Any]]:
        with connect_database(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT id, tenant_id, entity_type, entity_id, event_type, payload, created_at
                FROM sync_events
                WHERE pushed_at IS NULL AND tenant_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (self.tenant_id, _safe_limit(limit, 100)),
            ).fetchall()
            return [_event_from_row(row) for row in rows]


def _event_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        **({"tenantId": row["tenant_id"]} if row["tenant_id"] else {}),
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "eventType": row["event_type"],
        "payload": _parse_json(row["payload"], {}),
        "createdAt": row["created_at"],
    }


def _parse_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _safe_limit(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(1, min(parsed, 1000))
