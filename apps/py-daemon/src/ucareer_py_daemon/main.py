from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .config import Settings, load_settings
from .db import probe_database
from .envelope import ok
from .route_manifest import ROUTE_GROUPS


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Ucareer Python Daemon", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["content-type", "x-ucareer-session"],
    )

    @app.get("/health")
    async def health() -> dict[str, object]:
        return ok({
            "service": "ucareer-python-daemon-api",
            "workspaceRoot": str(settings.workspace_root),
            "daemonDbPath": str(settings.daemon_db_path),
        })

    @app.get("/api/backend/architecture")
    async def backend_architecture() -> dict[str, object]:
        db = probe_database(settings.daemon_db_path)
        return ok({
            "backend": "python",
            "status": "migration_target",
            "compatibility": {
                "apiEnvelope": True,
                "sharedWorkspaceRoot": str(settings.workspace_root),
                "sharedDaemonSqlite": db.path,
                "databaseExists": db.exists,
                "accountCount": db.account_count,
                "tenantCount": db.tenant_count,
            },
            "routeGroups": ROUTE_GROUPS,
        })

    @app.get("/api/python-daemon/routes")
    async def python_daemon_routes() -> dict[str, object]:
        return ok(ROUTE_GROUPS)

    return app


def run() -> None:
    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")

