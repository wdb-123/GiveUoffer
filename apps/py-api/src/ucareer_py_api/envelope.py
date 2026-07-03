from __future__ import annotations

from typing import Any


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}
