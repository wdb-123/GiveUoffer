from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .agent_store import AgentStore
from .auth import AuthStore
from .billing import BillingStore
from .config import Settings, load_settings
from .db import probe_database
from .envelope import error, ok
from .route_manifest import ROUTE_GROUPS
from .workspace import tenant_workspace_root
from .workspace_stores import ApplicationStore, EvidenceStore, ExperienceStore, MarketStore, ProfileStore, ReportStore, ResumeStore


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

    @app.get("/api/profile-overview")
    async def profile_overview(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ProfileStore(root).get_profile_overview(),
        )

    @app.get("/api/applications")
    async def applications(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "applications.read",
            lambda root: ApplicationStore(root).list_applications(),
        )

    @app.post("/api/application-events")
    async def create_application_event(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "applications.write",
            lambda root: {"event": ApplicationStore(root).create_application_event(payload)},
        )

    @app.post("/api/application-events/update")
    async def update_application_event(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "applications.write",
            lambda root: {"event": ApplicationStore(root).update_application_event(payload)},
        )

    @app.post("/api/application-events/delete")
    async def delete_application_event(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "applications.write",
            lambda root: {"deleted": ApplicationStore(root).delete_application_event(payload)},
        )

    @app.get("/api/reports")
    async def reports(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ReportStore(root).list_reports(),
        )

    @app.get("/api/report")
    async def report(request: Request, file: str = "") -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: _require_found(ReportStore(root).get_report(file), "Report not found"),
        )

    @app.get("/api/resumes")
    async def resumes(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ResumeStore(root).list_resumes(),
        )

    @app.get("/api/resume")
    async def resume(request: Request, file: str = "") -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: _require_found(ResumeStore(root).get_resume(file), "Resume not found"),
        )

    @app.get("/api/resumes/diagnostics")
    async def resume_diagnostics(request: Request, resumeFile: str = "") -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ResumeStore(root).list_diagnostics(resumeFile),
        )

    @app.get("/api/experience-overview")
    async def experience_overview(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ExperienceStore(root).get_experience_overview(),
        )

    @app.post("/api/experience-metadata")
    async def save_experience_metadata(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: ExperienceStore(root).save_experience_metadata(payload),
        )

    @app.get("/api/recruitment-market")
    async def recruitment_market(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: MarketStore(root).get_recruitment_market(),
        )

    @app.get("/api/evidence-requests")
    async def evidence_requests(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: EvidenceStore(root).list_evidence_requests(),
        )

    @app.post("/api/evidence-requests/fulfill")
    async def fulfill_evidence_request(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: EvidenceStore(root).fulfill_evidence_request(payload),
        )

    @app.post("/api/evidence-notes")
    async def save_evidence_note(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: EvidenceStore(root).save_evidence_note(payload),
        )

    @app.get("/api/agent-tasks")
    async def agent_tasks(request: Request) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_tasks())

    @app.get("/api/agent-tasks/{task_id}")
    async def agent_task(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: _require_found(store.get_task(task_id), "Task not found"))

    @app.get("/api/agent-tasks/{task_id}/events")
    async def agent_task_events(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_events(task_id))

    @app.get("/api/agent-tasks/{task_id}/turns")
    async def agent_task_turns(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_turns(task_id))

    @app.get("/api/approvals")
    async def approvals(request: Request) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.approve", lambda store: store.list_approvals())

    @app.get("/api/workflow-runs")
    async def workflow_runs(request: Request) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_workflow_runs())

    @app.get("/api/workflow-runs/{run_id}")
    async def workflow_run(request: Request, run_id: str) -> dict[str, object]:
        return _handle_agent_store(
            request,
            auth_store,
            settings,
            "agent.run",
            lambda store: _require_found(store.get_workflow_run_detail(run_id), "Workflow run not found"),
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


def _handle_workspace(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_root() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
        return operation(root)

    return _handle(run_with_root)


def _require_found(value: Any, message: str) -> Any:
    if value is None:
        raise ValueError(message)
    return value


def _handle_agent_store(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_store() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
        return operation(AgentStore(settings.daemon_db_path, session["activeTenant"]["id"], root))

    return _handle(run_with_store)
