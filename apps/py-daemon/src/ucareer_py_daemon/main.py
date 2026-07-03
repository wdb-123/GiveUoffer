from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .auth import AuthStore
from .billing import BillingStore
from .config import Settings, load_settings
from .db import probe_database
from .envelope import error, ok
from .route_manifest import ROUTE_GROUPS


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Ucareer Python Daemon", version="0.1.0")
    auth_store = AuthStore(settings.daemon_db_path)
    billing_store = BillingStore(settings.daemon_db_path)

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

    @app.post("/api/auth/create-account")
    async def create_account(payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.create_account(payload))

    @app.post("/api/auth/login")
    async def login(payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.login(payload))

    @app.get("/api/auth/session")
    async def auth_session(request: Request) -> dict[str, object]:
        return _handle(lambda: auth_store.get_session(_session_token(request)))

    @app.post("/api/auth/logout")
    async def logout(request: Request) -> dict[str, object]:
        return _handle(lambda: {"loggedOut": auth_store.logout(_session_token(request))})

    @app.post("/api/tenants")
    async def create_tenant(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.create_tenant(_session_token(request), payload))

    @app.post("/api/auth/switch-tenant")
    async def switch_tenant(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.switch_tenant(_session_token(request), payload))

    @app.get("/api/tenant-members")
    async def tenant_members(request: Request) -> dict[str, object]:
        return _handle(lambda: auth_store.list_tenant_members(_session_token(request)))

    @app.post("/api/tenant-members")
    async def add_tenant_member(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.add_tenant_member(_session_token(request), payload))

    @app.patch("/api/tenant-members/{account_id}")
    async def update_tenant_member(request: Request, account_id: str, payload: dict[str, Any]) -> dict[str, object]:
        return _handle(lambda: auth_store.update_tenant_member_role(_session_token(request), account_id, payload))

    @app.delete("/api/tenant-members/{account_id}")
    async def remove_tenant_member(request: Request, account_id: str) -> dict[str, object]:
        return _handle(lambda: auth_store.remove_tenant_member(_session_token(request), account_id))

    @app.get("/api/billing/plans")
    async def billing_plans() -> dict[str, object]:
        return ok(billing_store.list_plans())

    @app.get("/api/billing/tenant")
    async def tenant_billing(request: Request) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "billing.view",
            lambda session: billing_store.get_tenant_billing(session["activeTenant"]["id"]),
        )

    @app.patch("/api/billing/tenant/plan")
    async def update_tenant_billing_plan(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "tenant.manage",
            lambda session: billing_store.update_tenant_plan(session["activeTenant"]["id"], str(payload.get("planId") or "")),
        )

    return app


def run() -> None:
    settings = load_settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")


def _session_token(request: Request) -> str:
    return str(request.headers.get("x-ucareer-session") or "").strip()


def _handle(operation) -> dict[str, object]:
    try:
        return ok(operation())
    except PermissionError as cause:
        return error("forbidden", str(cause))
    except ValueError as cause:
        return error("bad_request", str(cause))
    except Exception as cause:
        return error("internal_error", str(cause))


def _handle_permission(request: Request, auth_store: AuthStore, permission: str, operation) -> dict[str, object]:
    def run_with_session() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        return operation(session)

    return _handle(run_with_session)
