from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import uvicorn

from .agent_store import AgentStore
from .attachments import AttachmentStore
from .auth import AuthStore
from .billing import BillingStore
from .chrome_bridge import ChromeBridgeService
from .config import Settings, load_settings
from .connectors import ConnectorCredentialStore, get_connector, import_qq_email_attachments, import_qq_email_messages, list_connectors, test_qq_email_connection
from .db import probe_database
from .envelope import error, ok
from .jobsearch import JobSearchService
from .memory import get_memory_snapshot
from .providers import check_provider, list_providers
from .resume_export import export_content_type, export_resume, exported_resume_file
from .route_manifest import ROUTE_GROUPS
from .routing import list_skills, list_workflows, preview_agent_route
from .sync import SyncStore
from .workspace import tenant_workspace_root
from .workspace_stores import ApplicationStore, EvidenceStore, ExperienceStore, MarketStore, ProfileStore, ReportStore, ResumeStore, WorkspaceFileStore


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Ucareer Python Daemon", version="0.1.0")
    auth_store = AuthStore(settings.daemon_db_path)
    billing_store = BillingStore(settings.daemon_db_path)
    chrome_bridge_service = ChromeBridgeService()

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

    @app.get("/api/providers")
    async def providers() -> dict[str, object]:
        return ok(list_providers())

    @app.post("/api/providers/{provider_id}/check")
    async def provider_check(provider_id: str) -> dict[str, object]:
        status = check_provider(provider_id)
        if not status:
            return error("provider_not_found", f"Provider not found: {provider_id}")
        return ok(status)

    @app.get("/api/connectors")
    async def connectors() -> dict[str, object]:
        return ok(list_connectors())

    @app.get("/api/connectors/{connector_id}")
    async def connector(connector_id: str) -> dict[str, object]:
        value = get_connector(connector_id)
        if not value:
            return error("connector_not_found", f"Connector not found: {connector_id}")
        return ok(value)

    @app.post("/api/connectors/qq-email/test")
    async def qq_email_test(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "applications.read",
            lambda _session: test_qq_email_connection(payload),
        )

    @app.get("/api/connectors/qq-email/credential")
    async def qq_email_credential(request: Request) -> dict[str, object]:
        return _handle_connector_store(
            request,
            auth_store,
            settings,
            "applications.read",
            lambda store, _root: store.get_summary("qq-email"),
        )

    @app.post("/api/connectors/qq-email/credential")
    async def save_qq_email_credential(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_connector_store(
            request,
            auth_store,
            settings,
            "applications.write",
            lambda store, _root: store.save_qq_email(payload),
        )

    @app.post("/api/connectors/qq-email/messages")
    async def qq_email_messages(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        def run(store: ConnectorCredentialStore, _root) -> Any:
            credential = store.get_secret("qq-email")
            if not credential:
                raise LookupError("请先连接并保存 QQ 邮箱 IMAP 授权码")
            return import_qq_email_messages(credential, payload)

        result = _handle_connector_store(request, auth_store, settings, "applications.read", run)
        if not result.get("ok") and result.get("error", {}).get("code") == "not_found":
            return error("qq_email_credential_missing", str(result.get("error", {}).get("message", "")))
        return result

    @app.post("/api/connectors/qq-email/attachments")
    async def qq_email_attachments(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        def run(store: ConnectorCredentialStore, root) -> Any:
            credential = store.get_secret("qq-email")
            if not credential:
                raise LookupError("请先连接并保存 QQ 邮箱 IMAP 授权码")
            return import_qq_email_attachments(credential, payload, root)

        result = _handle_connector_store(request, auth_store, settings, "applications.write", run)
        if not result.get("ok") and result.get("error", {}).get("code") == "not_found":
            return error("qq_email_credential_missing", str(result.get("error", {}).get("message", "")))
        return result

    @app.get("/api/sync/outbox")
    async def sync_outbox(request: Request, limit: int = 100) -> dict[str, object]:
        return _handle_sync_store(
            request,
            auth_store,
            settings,
            "sync.cloud",
            lambda store: store.list_outbox(limit),
        )

    @app.post("/api/sync/mark-pushed")
    async def sync_mark_pushed(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_sync_store(
            request,
            auth_store,
            settings,
            "sync.cloud",
            lambda store: store.mark_pushed(payload.get("ids") if isinstance(payload.get("ids"), list) else []),
        )

    @app.post("/api/sync/push-to-cloud")
    async def sync_push_to_cloud(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_sync_store(
            request,
            auth_store,
            settings,
            "sync.cloud",
            lambda store: store.push_to_cloud(payload),
        )

    @app.post("/api/agent-attachments")
    async def agent_attachments(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: AttachmentStore(root).upload(payload),
        )

    @app.get("/api/skills")
    async def skills() -> dict[str, object]:
        return ok({"skills": list_skills(), "workflows": list_workflows()})

    @app.get("/api/skills/file-management")
    async def skills_file_management() -> dict[str, object]:
        return ok([
            {
                "skillId": skill["id"],
                "label": skill["label"],
                "domain": skill["domain"],
                "fileManagement": skill["fileManagement"],
            }
            for skill in list_skills()
        ])

    @app.get("/api/skills/ui-contracts")
    async def skills_ui_contracts() -> dict[str, object]:
        return ok([
            {
                "skillId": skill["id"],
                "label": skill["label"],
                "domain": skill["domain"],
                "risk": skill["risk"],
                "ui": skill["ui"],
            }
            for skill in list_skills()
            if skill.get("ui")
        ])

    @app.get("/api/skills/pages/{page_id}")
    async def skills_for_page(page_id: str) -> dict[str, object]:
        return ok([
            skill
            for skill in list_skills()
            if page_id in skill.get("ui", {}).get("pages", [])
        ])

    @app.post("/api/agent-route/preview")
    async def agent_route_preview(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "workspace.read",
            lambda _session: preview_agent_route(payload),
        )

    @app.get("/api/memory/sources")
    async def memory_sources(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: get_memory_snapshot(root, settings.daemon_db_path),
        )

    @app.get("/api/search/jobsearch/sources")
    async def jobsearch_sources(request: Request) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: JobSearchService(root).list_sources(),
        )

    @app.post("/api/search/jobsearch")
    async def jobsearch(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: JobSearchService(root, chrome_bridge_service).search(payload),
        )

    @app.get("/api/chrome-bridge/tasks/next")
    async def chrome_bridge_next_task(request: Request) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "workspace.write",
            lambda _session: chrome_bridge_service.next_task(),
        )

    @app.post("/api/chrome-bridge/tasks/{task_id}/result")
    async def chrome_bridge_task_result(request: Request, task_id: str, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_permission(
            request,
            auth_store,
            "workspace.write",
            lambda _session: chrome_bridge_service.complete_task(task_id, payload or {"ok": False}),
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

    @app.get("/api/workspace-file")
    async def workspace_file(request: Request, path: str = "") -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: _require_found(
                WorkspaceFileStore(root).get_file_preview(path),
                f"File not found or not readable: {path}",
            ),
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

    @app.post("/api/resumes/generate-preview")
    async def generate_resume_preview(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: ResumeStore(root).generate_preview(payload, MarketStore(root).get_recruitment_market().get("jobs", [])),
        )

    @app.post("/api/resumes/save-generated")
    async def save_generated_resume(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: ResumeStore(root).save_generated_resume(payload),
        )

    @app.post("/api/resumes/save")
    async def save_resume(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: ResumeStore(root).save_resume(payload),
        )

    @app.post("/api/resumes/export")
    async def export_resume_route(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: export_resume(root, payload),
        )

    @app.get("/api/resumes/export-file")
    async def export_resume_file_route(request: Request, file: str = ""):
        handled = _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.read",
            lambda root: exported_resume_file(root, file),
        )
        if not handled.get("ok"):
            return handled
        path = handled.get("data")
        if not path:
            return error("export_file_not_found", f"Export file not found: {file}")
        return FileResponse(
            path,
            media_type=export_content_type(file),
            filename=file,
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

    @app.post("/api/recruitment-market/import")
    async def import_recruitment_market_job(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: MarketStore(root).import_job(payload),
        )

    @app.post("/api/recruitment-market/manual-jobs")
    async def import_manual_recruitment_market_job(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: MarketStore(root).import_job({
                "source": payload.get("source") or "手工网页读取",
                "url": payload.get("url") or "",
                "description": payload.get("rawText") or payload.get("description") or "",
            }),
        )

    @app.delete("/api/recruitment-market/{job_id}")
    async def delete_recruitment_market_job(request: Request, job_id: str) -> dict[str, object]:
        return _handle_workspace(
            request,
            auth_store,
            settings,
            "workspace.write",
            lambda root: {"deletedJobId": MarketStore(root).delete_job(job_id)},
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

    @app.post("/api/agent-tasks")
    async def create_agent_task(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_agent_store_with_session(
            request,
            auth_store,
            settings,
            "agent.run",
            lambda store, session: _create_agent_task_with_quota(billing_store, session["activeTenant"]["id"], store, payload),
        )

    @app.post("/api/local-commands")
    async def create_local_command(request: Request, payload: dict[str, Any]) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.create_local_command(payload))

    @app.get("/api/agent-execution-queue")
    async def agent_execution_queue(request: Request) -> dict[str, object]:
        return _handle_agent_store_with_session(
            request,
            auth_store,
            settings,
            "agent.run",
            lambda store, session: store.queue_overview(session["activeTenant"]["name"]),
        )

    @app.get("/api/agent-tasks/{task_id}")
    async def agent_task(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: _require_found(store.get_task(task_id), "Task not found"))

    @app.delete("/api/agent-tasks/{task_id}")
    async def delete_agent_task(request: Request, task_id: str) -> dict[str, object]:
        result = _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.delete_task(task_id))
        if not result.get("ok") and result.get("error", {}).get("code") == "forbidden" and "Cannot delete" in str(result.get("error", {}).get("message", "")):
            return error("task_busy", "Cannot delete a task while it is queued, running, or waiting for approval")
        return result

    @app.post("/api/agent-tasks/{task_id}/cancel")
    async def cancel_agent_task(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.cancel_task(task_id))

    @app.get("/api/agent-tasks/{task_id}/events")
    async def agent_task_events(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_events(task_id))

    @app.get("/api/agent-tasks/{task_id}/turns")
    async def agent_task_turns(request: Request, task_id: str) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.run", lambda store: store.list_turns(task_id))

    @app.get("/api/agent-tasks/{task_id}/events/stream")
    async def agent_task_event_stream(request: Request, task_id: str, once: int = 0):
        try:
            session = auth_store.require_session(_session_token(request))
            if "agent.run" not in session.get("permissions", []):
                raise PermissionError("Permission required: agent.run")
            root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
            store = AgentStore(settings.daemon_db_path, session["activeTenant"]["id"], root)
            if not store.get_task(task_id):
                return error("task_not_found", f"Task not found: {task_id}")
        except LookupError as cause:
            return error("not_found", str(cause))
        except PermissionError as cause:
            return error("forbidden", str(cause))
        except ValueError as cause:
            return error("bad_request", str(cause))

        async def stream():
            last_payload = ""
            while True:
                if await request.is_disconnected():
                    break
                try:
                    next_task = store.get_task(task_id)
                    if not next_task:
                        break
                    events = store.list_events(task_id)
                    payload = json.dumps(
                        {
                            "task": next_task,
                            "events": events,
                            "turns": store.list_turns(task_id),
                            "approvals": [approval for approval in store.list_approvals() if approval.get("taskId") == task_id],
                        },
                        ensure_ascii=False,
                    )
                    if payload != last_payload:
                        last_payload = payload
                        yield f"event: agent_snapshot\ndata: {payload}\n\n"
                        if once:
                            break
                except Exception as cause:
                    payload = json.dumps({"error": str(cause)}, ensure_ascii=False)
                    yield f"event: agent_error\ndata: {payload}\n\n"
                    break
                await asyncio.sleep(0.5)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "cache-control": "no-cache, no-transform",
                "connection": "keep-alive",
                "x-accel-buffering": "no",
            },
        )

    @app.get("/api/approvals")
    async def approvals(request: Request) -> dict[str, object]:
        return _handle_agent_store(request, auth_store, settings, "agent.approve", lambda store: store.list_approvals())

    @app.post("/api/approvals/{approval_id}/decision")
    async def approval_decision(request: Request, approval_id: str, payload: dict[str, Any], background_tasks: BackgroundTasks) -> dict[str, object]:
        def decide(store: AgentStore) -> dict[str, Any]:
            record, followup = store.decide_approval_with_followup(approval_id, payload)
            if followup:
                background_tasks.add_task(store.run_approved_followup, followup)
            return record

        return _handle_agent_store(request, auth_store, settings, "agent.approve", decide)

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
    except LookupError as cause:
        return error("not_found", str(cause))
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


def _create_agent_task_with_quota(billing_store: BillingStore, tenant_id: str, store: AgentStore, payload: dict[str, Any]) -> Any:
    billing = billing_store.get_tenant_billing(tenant_id)
    if billing.get("quota", {}).get("exceeded"):
        raise PermissionError("Tenant token quota exceeded")
    return store.create_or_continue_task(payload)


def _handle_agent_store(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_store() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
        return operation(AgentStore(settings.daemon_db_path, session["activeTenant"]["id"], root))

    return _handle(run_with_store)


def _handle_agent_store_with_session(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_store() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
        return operation(AgentStore(settings.daemon_db_path, session["activeTenant"]["id"], root), session)

    return _handle(run_with_store)


def _handle_connector_store(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_store() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        root = tenant_workspace_root(settings.workspace_root, session["activeTenant"]["id"])
        return operation(ConnectorCredentialStore(settings.daemon_db_path, root, session["activeTenant"]["id"]), root)

    return _handle(run_with_store)


def _handle_sync_store(request: Request, auth_store: AuthStore, settings: Settings, permission: str, operation) -> dict[str, object]:
    def run_with_store() -> Any:
        session = auth_store.require_session(_session_token(request))
        if permission not in session.get("permissions", []):
            raise PermissionError(f"Permission required: {permission}")
        return operation(SyncStore(settings.daemon_db_path, session["activeTenant"]["id"]))

    return _handle(run_with_store)
