from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime
from typing import Any

import uvicorn
from fastapi import FastAPI

from .config import Settings, load_settings
from .envelope import ok


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Ucareer Python Cloud API")

    @app.get("/health")
    async def health() -> dict[str, object]:
        return ok({"service": "ucareer-cloud-api"})

    @app.post("/auth/device-pairing")
    async def device_pairing() -> dict[str, object]:
        return ok({
            "pairingId": str(uuid.uuid4()),
            "code": _create_pairing_code(),
            "expiresInSeconds": 300,
        })

    @app.get("/sync/pull")
    async def sync_pull() -> dict[str, object]:
        return ok({
            "events": [],
            "cursor": _now_iso(),
        })

    @app.post("/sync/push")
    async def sync_push(payload: dict[str, Any] | None = None) -> dict[str, object]:
        payload = payload or {}
        raw_events = payload.get("events")
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        if not isinstance(raw_events, list):
            raw_events = data.get("events") if isinstance(data.get("events"), list) else []
        return ok({
            "accepted": True,
            "acceptedIds": [event.get("id") for event in raw_events if isinstance(event, dict) and event.get("id") is not None],
            "cursor": _now_iso(),
        })

    @app.post("/approvals/{approval_id}/decision")
    async def approval_decision(approval_id: str) -> dict[str, object]:
        return ok({"relayed": True})

    return app


def run() -> None:
    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


def _create_pairing_code() -> str:
    return str(random.randint(100000, 999999))


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
