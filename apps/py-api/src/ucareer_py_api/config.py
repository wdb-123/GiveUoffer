from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str
    port: int


def load_settings() -> Settings:
    return Settings(
        host=os.environ.get("UCAREER_API_HOST", os.environ.get("HOST", "127.0.0.1")),
        port=int(os.environ.get("UCAREER_API_PORT", os.environ.get("PORT", "4191"))),
    )
