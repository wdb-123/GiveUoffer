from __future__ import annotations

from typing import Any


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}


def error(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}

