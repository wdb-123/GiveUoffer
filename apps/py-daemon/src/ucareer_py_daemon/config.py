from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    workspace_root: Path
    daemon_db_path: Path


def load_settings() -> Settings:
    workspace_root = Path(os.environ.get("UCAREER_WORKSPACE_ROOT", _repo_root())).resolve()
    daemon_db_path = Path(os.environ.get("UCAREER_DAEMON_DB", workspace_root / ".ucareer" / "daemon.sqlite")).resolve()
    return Settings(
        host=os.environ.get("UCAREER_PY_HOST", "127.0.0.1"),
        port=int(os.environ.get("UCAREER_PY_PORT", "54322")),
        workspace_root=workspace_root,
        daemon_db_path=daemon_db_path,
    )

