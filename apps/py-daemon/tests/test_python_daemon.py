from __future__ import annotations

import http.server
import base64
import tempfile
import threading
import unittest
import json
from pathlib import Path

from fastapi.testclient import TestClient

from ucareer_py_daemon.config import Settings
from ucareer_py_daemon.db import connect_database
from ucareer_py_daemon.main import create_app


class PythonDaemonContractTest(unittest.TestCase):
    def test_health_uses_ucareer_envelope(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))

            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["data"]["service"], "ucareer-python-daemon-api")

    def test_architecture_reports_pending_route_groups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))

            response = client.get("/api/backend/architecture")

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["backend"], "python")
        self.assertIn("routeGroups", data)
        self.assertTrue(any(group["domain"] == "auth-tenants" for group in data["routeGroups"]))

    def test_provider_routes_match_frontend_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))

            providers = client.get("/api/providers").json()
            self.assertTrue(providers["ok"])
            self.assertEqual(providers["data"][0]["id"], "codex")
            self.assertEqual(providers["data"][0]["contextWindow"]["tokens"], 400000)
            self.assertTrue(providers["data"][0]["capabilities"]["structuredRunner"])

            missing = client.post("/api/providers/missing-provider/check").json()
            self.assertFalse(missing["ok"])
            self.assertEqual(missing["error"]["code"], "provider_not_found")

    def test_skill_registry_and_route_preview_match_frontend_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))
            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "router@example.com",
                    "password": "Password123",
                    "displayName": "Router",
                    "tenantName": "Router Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            headers = {"x-ucareer-session": created["data"]["token"]}

            skills = client.get("/api/skills").json()
            self.assertTrue(skills["ok"])
            skill_ids = {skill["id"] for skill in skills["data"]["skills"]}
            self.assertIn("application.progress", skill_ids)
            self.assertIn("resume.generate", skill_ids)
            self.assertTrue(any(workflow["id"] == "application.import_progress" for workflow in skills["data"]["workflows"]))

            application_page_skills = client.get("/api/skills/pages/applications").json()
            self.assertTrue(application_page_skills["ok"])
            self.assertIn("application.progress", {skill["id"] for skill in application_page_skills["data"]})

            preview = client.post(
                "/api/agent-route/preview",
                headers=headers,
                json={
                    "text": "帮我看看qq邮箱里的offer情况，命中后更新投递进度。",
                    "preferredProviderId": "codex",
                },
            ).json()
            self.assertTrue(preview["ok"])
            self.assertEqual(preview["data"]["skillId"], "application.progress")
            self.assertEqual(preview["data"]["inputKind"], "application_update")
            self.assertEqual(preview["data"]["workflowId"], "application.import_progress")
            self.assertEqual(preview["data"]["recommendedProviderId"], "codex")
            self.assertEqual(preview["data"]["nextAction"], "create_agent_task")
            self.assertIn("applications.create_event", preview["data"]["agentPrompt"])

            ocr_preview = client.post(
                "/api/agent-route/preview",
                headers=headers,
                json={"text": "请提取这张截图里的文字"},
            ).json()
            self.assertTrue(ocr_preview["ok"])
            self.assertEqual(ocr_preview["data"]["skillId"], "image.ocr")
            self.assertEqual(ocr_preview["data"]["inputKind"], "image_ocr")

            boss_url_preview = client.post(
                "/api/agent-route/preview",
                headers=headers,
                json={"text": "https://www.zhipin.com/web/geek/jobs?query=机器人"},
            ).json()
            self.assertTrue(boss_url_preview["ok"])
            self.assertEqual(boss_url_preview["data"]["skillId"], "job.evaluate")
            self.assertEqual(boss_url_preview["data"]["inputKind"], "job_url")

    def test_memory_sources_report_tenant_workspace_availability(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))
            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "memory@example.com",
                    "password": "Password123",
                    "displayName": "Memory",
                    "tenantName": "Memory Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            tenant_id = created["data"]["activeTenant"]["id"]
            tenant_workspace = Path(tmp) / "workspace" / "tenants" / tenant_id / "workspace"
            self._write_tenant_workspace_fixture(tenant_workspace)

            memory = client.get("/api/memory/sources", headers={"x-ucareer-session": created["data"]["token"]}).json()

        self.assertTrue(memory["ok"])
        self.assertIn("generatedAt", memory["data"])
        items = {item["id"]: item for item in memory["data"]["items"]}
        self.assertEqual(items["profile.cv"]["summary"], "1/1 source path(s) available")
        self.assertTrue(items["profile.cv"]["available"])
        self.assertEqual(items["profile.preferences"]["summary"], "2/2 source path(s) available")
        self.assertEqual(items["applications.history"]["summary"], "2/3 source path(s) available")
        self.assertTrue(items["runtime.workflow_traces"]["available"])

    def test_connector_registry_and_qq_email_credentials_are_tenant_scoped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))

            connectors = client.get("/api/connectors").json()
            self.assertTrue(connectors["ok"])
            self.assertIn("qq-email", {connector["id"] for connector in connectors["data"]["connectors"]})

            qq_email = client.get("/api/connectors/qq-email").json()
            self.assertTrue(qq_email["ok"])
            self.assertEqual(qq_email["data"]["protocol"]["host"], "imap.qq.com")

            missing_connector = client.get("/api/connectors/missing").json()
            self.assertFalse(missing_connector["ok"])
            self.assertEqual(missing_connector["error"]["code"], "connector_not_found")

            tenant_a = client.post(
                "/api/auth/create-account",
                json={"email": "connector-a@example.com", "password": "Password123", "displayName": "A", "tenantName": "A Workspace"},
            ).json()
            tenant_b = client.post(
                "/api/auth/create-account",
                json={"email": "connector-b@example.com", "password": "Password123", "displayName": "B", "tenantName": "B Workspace"},
            ).json()
            self.assertTrue(tenant_a["ok"])
            self.assertTrue(tenant_b["ok"])
            headers_a = {"x-ucareer-session": tenant_a["data"]["token"]}
            headers_b = {"x-ucareer-session": tenant_b["data"]["token"]}

            before_save = client.get("/api/connectors/qq-email/credential", headers=headers_a).json()
            self.assertTrue(before_save["ok"])
            self.assertIsNone(before_save["data"])

            saved = client.post(
                "/api/connectors/qq-email/credential",
                headers=headers_a,
                json={"email": "USER@qq.com", "authorizationCode": " abcd efgh ", "verifiedAt": "2026-07-03T00:00:00Z"},
            ).json()
            self.assertTrue(saved["ok"])
            self.assertEqual(saved["data"]["connectorId"], "qq-email")
            self.assertEqual(saved["data"]["account"], "user@qq.com")
            self.assertTrue(saved["data"]["secretStored"])
            self.assertNotIn("authorizationCode", saved["data"])
            self.assertNotIn("secret", saved["data"])

            summary_a = client.get("/api/connectors/qq-email/credential", headers=headers_a).json()
            self.assertTrue(summary_a["ok"])
            self.assertEqual(summary_a["data"]["account"], "user@qq.com")

            summary_b = client.get("/api/connectors/qq-email/credential", headers=headers_b).json()
            self.assertTrue(summary_b["ok"])
            self.assertIsNone(summary_b["data"])

            missing_messages = client.post(
                "/api/connectors/qq-email/messages",
                headers=headers_b,
                json={"query": "all", "limit": 1},
            ).json()
            self.assertFalse(missing_messages["ok"])
            self.assertEqual(missing_messages["error"]["code"], "qq_email_credential_missing")

            with connect_database(settings.daemon_db_path) as conn:
                row = conn.execute(
                    "SELECT * FROM connector_credentials WHERE tenant_id = ? AND connector_id = ?",
                    (tenant_a["data"]["activeTenant"]["id"], "qq-email"),
                ).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["account"], "user@qq.com")
            self.assertNotEqual(row["secret_ciphertext"], "abcdefgh")
            self.assertTrue((Path(tmp) / "workspace" / "tenants" / tenant_a["data"]["activeTenant"]["id"] / ".ucareer" / "connector.key").exists())

    def test_auth_tenant_and_billing_routes_use_shared_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))

            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "owner@example.com",
                    "password": "Password123",
                    "displayName": "Owner",
                    "tenantName": "Owner Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            token = created["data"]["token"]
            self.assertEqual(created["data"]["role"], "owner")
            self.assertIn("tenant.manage", created["data"]["permissions"])

            session = client.get("/api/auth/session", headers={"x-ucareer-session": token}).json()
            self.assertTrue(session["ok"])
            self.assertEqual(session["data"]["account"]["email"], "owner@example.com")

            logged_in = client.post(
                "/api/auth/login",
                json={"email": "owner@example.com", "password": "Password123"},
            ).json()
            self.assertTrue(logged_in["ok"])

            members = client.get("/api/tenant-members", headers={"x-ucareer-session": token}).json()
            self.assertTrue(members["ok"])
            self.assertEqual(len(members["data"]["members"]), 1)

            plans = client.get("/api/billing/plans").json()
            self.assertTrue(plans["ok"])
            self.assertEqual([plan["id"] for plan in plans["data"]], ["free", "pro", "team"])

            billing = client.get("/api/billing/tenant", headers={"x-ucareer-session": token}).json()
            self.assertTrue(billing["ok"])
            self.assertEqual(billing["data"]["plan"]["id"], "free")

            upgraded = client.patch(
                "/api/billing/tenant/plan",
                headers={"x-ucareer-session": token},
                json={"planId": "pro"},
            ).json()
            self.assertTrue(upgraded["ok"])
            self.assertEqual(upgraded["data"]["plan"]["id"], "pro")

            tenant = client.post(
                "/api/tenants",
                headers={"x-ucareer-session": token},
                json={"name": "Second Workspace"},
            ).json()
            self.assertTrue(tenant["ok"])
            self.assertEqual(tenant["data"]["activeTenant"]["name"], "Second Workspace")

    def test_sync_routes_use_tenant_scoped_outbox(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))
            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "sync@example.com",
                    "password": "Password123",
                    "displayName": "Sync",
                    "tenantName": "Sync Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            token = created["data"]["token"]
            tenant_id = created["data"]["activeTenant"]["id"]
            headers = {"x-ucareer-session": token}
            self._write_sync_fixture(settings.daemon_db_path, tenant_id)

            outbox = client.get("/api/sync/outbox?limit=10", headers=headers).json()
            self.assertTrue(outbox["ok"])
            self.assertEqual([event["id"] for event in outbox["data"]["events"]], [1, 3])
            self.assertEqual(outbox["data"]["events"][0]["payload"]["message"], "tenant-event")

            marked = client.post("/api/sync/mark-pushed", headers=headers, json={"ids": [1, 2]}).json()
            self.assertTrue(marked["ok"])
            self.assertEqual(marked["data"]["marked"], 1)

            with _SyncPushServer([3]) as server:
                pushed = client.post(
                    "/api/sync/push-to-cloud",
                    headers=headers,
                    json={"cloudUrl": server.url, "limit": 10},
                ).json()
            self.assertTrue(pushed["ok"])
            self.assertEqual(pushed["data"]["sent"], 1)
            self.assertEqual(pushed["data"]["acceptedIds"], [3])
            self.assertEqual(pushed["data"]["marked"], 1)

    def test_workspace_read_routes_use_active_tenant_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))
            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "reader@example.com",
                    "password": "Password123",
                    "displayName": "Reader",
                    "tenantName": "Reader Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            token = created["data"]["token"]
            tenant_id = created["data"]["activeTenant"]["id"]
            tenant_workspace = Path(tmp) / "workspace" / "tenants" / tenant_id / "workspace"
            self._write_tenant_workspace_fixture(tenant_workspace)

            headers = {"x-ucareer-session": token}
            profile = client.get("/api/profile-overview", headers=headers).json()
            self.assertTrue(profile["ok"])
            self.assertEqual(profile["data"]["candidate"]["fullName"], "Reader User")
            self.assertEqual(profile["data"]["targetRoles"], ["Robot Engineer"])

            applications = client.get("/api/applications", headers=headers).json()
            self.assertTrue(applications["ok"])
            self.assertEqual(applications["data"]["metrics"]["offer"], 1)
            self.assertEqual(applications["data"]["applications"][0]["status"], "Offer")

            created_event = client.post(
                "/api/application-events",
                headers=headers,
                json={
                    "company": "Demo Corp",
                    "role": "Robot Engineer",
                    "event": "interview",
                    "date": "2026-07-04",
                    "note": "Fourth round scheduled",
                    "email_snapshot": {
                        "uid": "42",
                        "subject": "Interview",
                        "snippet": "Fourth round",
                        "rawText": "Fourth round full email",
                        "attachments": [{"filename": "invite.pdf", "contentType": "application/pdf", "size": 12}],
                    },
                },
            ).json()
            self.assertTrue(created_event["ok"])
            event_id = created_event["data"]["event"]["event_id"]
            self.assertEqual(created_event["data"]["event"]["application_id"], "001")
            self.assertIn("Fourth round full email", (tenant_workspace / "ops" / "data" / "application-email-snapshots.jsonl").read_text(encoding="utf-8"))

            duplicate_event = client.post(
                "/api/application-events",
                headers=headers,
                json={"company": "Demo Corp", "role": "Robot Engineer", "event": "interview", "date": "2026-07-04", "note": "Fourth round scheduled"},
            ).json()
            self.assertTrue(duplicate_event["ok"])
            self.assertEqual(duplicate_event["data"]["event"]["event_id"], event_id)

            updated_event = client.post(
                "/api/application-events/update",
                headers=headers,
                json={"event_id": event_id, "company": "Demo Corp", "role": "Robot Engineer", "event": "offer", "note": "Offer arrived"},
            ).json()
            self.assertTrue(updated_event["ok"])
            self.assertEqual(updated_event["data"]["event"]["event"], "offer")

            deleted_event = client.post(
                "/api/application-events/delete",
                headers=headers,
                json={"event_id": event_id},
            ).json()
            self.assertTrue(deleted_event["ok"])
            self.assertEqual(deleted_event["data"]["deleted"], event_id)

            reports = client.get("/api/reports", headers=headers).json()
            self.assertTrue(reports["ok"])
            self.assertEqual(reports["data"]["metrics"]["total"], 1)

            report = client.get("/api/report?file=001-demo-2026-07-03.md", headers=headers).json()
            self.assertTrue(report["ok"])
            self.assertIn("Demo report body", report["data"]["markdown"])

            preview = client.get("/api/workspace-file?path=workspace/jobs/reports/001-demo-2026-07-03.md", headers=headers).json()
            self.assertTrue(preview["ok"])
            self.assertEqual(preview["data"]["previewType"], "text")
            self.assertEqual(preview["data"]["encoding"], "utf8")
            self.assertEqual(preview["data"]["relativePath"], "workspace/jobs/reports/001-demo-2026-07-03.md")
            self.assertIn("Demo report body", preview["data"]["content"])

            absolute_preview = client.get(
                f"/api/workspace-file?path={tenant_workspace / 'profile' / 'cv.md'}",
                headers=headers,
            ).json()
            self.assertTrue(absolute_preview["ok"])
            self.assertEqual(absolute_preview["data"]["fileName"], "cv.md")

            outside_preview = client.get(f"/api/workspace-file?path={Path(tmp) / 'outside.md'}", headers=headers).json()
            self.assertFalse(outside_preview["ok"])
            self.assertEqual(outside_preview["error"]["code"], "bad_request")

            attachment = client.post(
                "/api/agent-attachments",
                headers=headers,
                json={
                    "fileName": "../offer note.md",
                    "mimeType": "text/markdown",
                    "dataBase64": base64.b64encode("Offer details\nNext step.".encode("utf-8")).decode("ascii"),
                },
            ).json()
            self.assertTrue(attachment["ok"])
            self.assertEqual(attachment["data"]["fileName"], "offer note.md")
            self.assertEqual(attachment["data"]["kind"], "text")
            self.assertIn("Offer details", attachment["data"]["parsed"]["text"])
            stored_path = Path(attachment["data"]["storedPath"])
            self.assertTrue(stored_path.exists())
            self.assertIn(tenant_workspace.resolve(), stored_path.resolve().parents)

            bad_attachment = client.post(
                "/api/agent-attachments",
                headers=headers,
                json={"fileName": "bad.txt", "dataBase64": "not-base64"},
            ).json()
            self.assertFalse(bad_attachment["ok"])
            self.assertEqual(bad_attachment["error"]["code"], "bad_request")

            resumes = client.get("/api/resumes", headers=headers).json()
            self.assertTrue(resumes["ok"])
            self.assertEqual(resumes["data"][0]["targetJobId"], "001")

            resume = client.get("/api/resume?file=robot-resume.md", headers=headers).json()
            self.assertTrue(resume["ok"])
            self.assertEqual(resume["data"]["title"], "Robot Resume")

            saved_generated = client.post(
                "/api/resumes/save-generated",
                headers=headers,
                json={
                    "title": "韦东波 - 机器人软件工程师",
                    "markdown": "## Summary\nRobot resume.",
                    "baseFile": "robot-resume.md",
                    "targetJobId": "MJ-001",
                    "targetJobTitle": "Demo Corp · Robot Engineer",
                },
            ).json()
            self.assertTrue(saved_generated["ok"])
            self.assertTrue(saved_generated["data"]["file"].endswith(".md"))
            self.assertIn("# 韦东波 - 机器人软件工程师", (tenant_workspace / "resumes" / "library" / saved_generated["data"]["file"]).read_text(encoding="utf-8"))

            saved_resume = client.post(
                "/api/resumes/save",
                headers=headers,
                json={
                    "file": "custom-resume.md",
                    "title": "Custom Resume",
                    "markdown": "Custom content.",
                    "targetJobId": "MJ-001",
                    "targetJobTitle": "Demo Corp · Robot Engineer",
                },
            ).json()
            self.assertTrue(saved_resume["ok"])
            self.assertEqual(saved_resume["data"]["file"], "custom-resume.md")
            self.assertIn("# Custom Resume", saved_resume["data"]["markdown"])
            links_text = (tenant_workspace / "ops" / "data" / "resume-job-links.json").read_text(encoding="utf-8")
            self.assertIn("custom-resume.md", links_text)

            diagnostics = client.get("/api/resumes/diagnostics?resumeFile=robot-resume.md", headers=headers).json()
            self.assertTrue(diagnostics["ok"])
            self.assertEqual(diagnostics["data"][0]["resumeFile"], "robot-resume.md")

            experience = client.get("/api/experience-overview", headers=headers).json()
            self.assertTrue(experience["ok"])
            self.assertEqual(len(experience["data"]["files"]), 1)
            self.assertEqual(experience["data"]["experiences"][0]["sourceContent"], "# Robot Project\n\nBuilt a robot demo.")

            saved_experience = client.post(
                "/api/experience-metadata",
                headers=headers,
                json={
                    "metadata": {
                        "experiences": [
                            {
                                "id": "exp-new",
                                "title": "New robot story",
                                "category": "project",
                                "role": "lead",
                                "sourceFile": "workspace/jobs/project-notes/robot-project.md",
                                "summary": "New summary",
                                "tags": "robot, ai",
                                "evidence": ["demo"],
                                "gaps": "",
                                "publicLevel": "internal",
                            },
                            {"title": ""},
                        ],
                    },
                },
            ).json()
            self.assertTrue(saved_experience["ok"])
            self.assertEqual(len(saved_experience["data"]["experiences"]), 1)
            self.assertEqual(saved_experience["data"]["experiences"][0]["tags"], ["robot", "ai"])
            self.assertIn("New robot story", (tenant_workspace / "ops" / "data" / "experience-metadata.json").read_text(encoding="utf-8"))

            market = client.get("/api/recruitment-market", headers=headers).json()
            self.assertTrue(market["ok"])
            self.assertEqual(market["data"]["jobsCount"], 1)
            self.assertEqual(market["data"]["jobs"][0]["id"], "MJ-001")

            imported_job = client.post(
                "/api/recruitment-market/import",
                headers=headers,
                json={
                    "url": "https://example.com/jobs/robot",
                    "description": "职位: 机器人软件工程师\n公司: Future Robot\n薪资: 30-45K\n地点: 深圳\n岗位职责: ROS2 MoveIt 控制算法",
                    "source": "manual-test",
                },
            ).json()
            self.assertTrue(imported_job["ok"])
            self.assertTrue(imported_job["data"]["imported"])
            self.assertEqual(imported_job["data"]["job"]["id"], "MJ-002")
            self.assertEqual(imported_job["data"]["job"]["company"], "Future Robot")
            self.assertTrue((tenant_workspace / "jobs" / "jds").exists())

            duplicate_job = client.post(
                "/api/recruitment-market/import",
                headers=headers,
                json={
                    "url": "https://example.com/jobs/robot",
                    "description": "职位: 机器人软件工程师\n公司: Future Robot\n岗位职责: ROS2",
                    "source": "manual-test",
                },
            ).json()
            self.assertTrue(duplicate_job["ok"])
            self.assertFalse(duplicate_job["data"]["imported"])
            after_import = client.get("/api/recruitment-market", headers=headers).json()
            self.assertEqual(after_import["data"]["jobsCount"], 2)

            deleted_job = client.delete("/api/recruitment-market/MJ-002", headers=headers).json()
            self.assertTrue(deleted_job["ok"])
            self.assertEqual(deleted_job["data"]["deletedJobId"], "MJ-002")
            after_delete = client.get("/api/recruitment-market", headers=headers).json()
            self.assertEqual(after_delete["data"]["jobsCount"], 1)

            evidence = client.get("/api/evidence-requests", headers=headers).json()
            self.assertTrue(evidence["ok"])
            self.assertEqual(evidence["data"]["summary"]["open"], 1)
            self.assertEqual(evidence["data"]["requests"][0]["id"], "ev-1")

            fulfilled = client.post(
                "/api/evidence-requests/fulfill",
                headers=headers,
                json={"requestId": "ev-1", "content": "Added evidence.", "source": "test"},
            ).json()
            self.assertTrue(fulfilled["ok"])
            self.assertEqual(fulfilled["data"]["targetFile"], "workspace/jobs/project-notes/evidence.md")
            self.assertIn("Added evidence.", (tenant_workspace / "jobs" / "project-notes" / "evidence.md").read_text(encoding="utf-8"))

            note = client.post(
                "/api/evidence-notes",
                headers=headers,
                json={"title": "Manual note", "content": "Useful review note."},
            ).json()
            self.assertTrue(note["ok"])
            self.assertEqual(note["data"]["targetFile"], "workspace/jobs/project-notes/evidence.md")
            updated_evidence = client.get("/api/evidence-requests", headers=headers).json()
            self.assertEqual(updated_evidence["data"]["requests"][0]["direction"], "Manual note")

    def test_agent_read_routes_use_tenant_scoped_sqlite_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            settings = Settings(
                host="127.0.0.1",
                port=54322,
                workspace_root=Path(tmp),
                daemon_db_path=Path(tmp) / ".ucareer" / "daemon.sqlite",
            )
            client = TestClient(create_app(settings))
            created = client.post(
                "/api/auth/create-account",
                json={
                    "email": "agent@example.com",
                    "password": "Password123",
                    "displayName": "Agent",
                    "tenantName": "Agent Workspace",
                },
            ).json()
            self.assertTrue(created["ok"])
            token = created["data"]["token"]
            tenant_id = created["data"]["activeTenant"]["id"]
            tenant_workspace = Path(tmp) / "workspace" / "tenants" / tenant_id
            tenant_workspace.mkdir(parents=True)
            self._write_agent_fixture(settings.daemon_db_path, tenant_id, tenant_workspace)

            headers = {"x-ucareer-session": token}
            tasks = client.get("/api/agent-tasks", headers=headers).json()
            self.assertTrue(tasks["ok"])
            self.assertEqual({task["id"] for task in tasks["data"]}, {"task-1", "task-2"})

            queue = client.get("/api/agent-execution-queue", headers=headers).json()
            self.assertTrue(queue["ok"])
            self.assertEqual(queue["data"]["currentTenant"]["tenantId"], tenant_id)
            self.assertEqual(queue["data"]["currentTenant"]["running"], 1)
            self.assertEqual(queue["data"]["currentTenant"]["queued"], 0)

            task = client.get("/api/agent-tasks/task-1", headers=headers).json()
            self.assertTrue(task["ok"])
            self.assertEqual(task["data"]["status"], "running")

            approvals = client.get("/api/approvals", headers=headers).json()
            self.assertTrue(approvals["ok"])
            self.assertEqual(approvals["data"][0]["id"], "approval-1")

            decision = client.post(
                "/api/approvals/approval-1/decision",
                headers=headers,
                json={"decision": "allow_workspace", "note": "Approved for this workspace"},
            ).json()
            self.assertTrue(decision["ok"])
            self.assertEqual(decision["data"]["decision"], "allow_workspace")
            self.assertEqual(decision["data"]["taskId"], "task-1")

            approvals_after_decision = client.get("/api/approvals", headers=headers).json()
            self.assertTrue(approvals_after_decision["ok"])
            self.assertEqual(approvals_after_decision["data"], [])

            task_after_decision = client.get("/api/agent-tasks/task-1", headers=headers).json()
            self.assertTrue(task_after_decision["ok"])
            self.assertEqual(task_after_decision["data"]["status"], "queued")

            busy_delete = client.delete("/api/agent-tasks/task-1", headers=headers).json()
            self.assertFalse(busy_delete["ok"])
            self.assertEqual(busy_delete["error"]["code"], "task_busy")

            cancelled = client.post("/api/agent-tasks/task-1/cancel", headers=headers).json()
            self.assertTrue(cancelled["ok"])
            self.assertEqual(cancelled["data"]["status"], "cancelled")

            events = client.get("/api/agent-tasks/task-1/events", headers=headers).json()
            self.assertTrue(events["ok"])
            self.assertEqual(events["data"][0]["text"], "hello")
            self.assertEqual(events["data"][-1]["status"], "cancelled")

            turns = client.get("/api/agent-tasks/task-1/turns", headers=headers).json()
            self.assertTrue(turns["ok"])
            self.assertEqual(turns["data"][0]["status"], "answered")
            self.assertEqual(turns["data"][0]["answer"]["text"], "world")

            runs = client.get("/api/workflow-runs", headers=headers).json()
            self.assertTrue(runs["ok"])
            self.assertEqual(runs["data"][0]["id"], "run-1")

            detail = client.get("/api/workflow-runs/run-1", headers=headers).json()
            self.assertTrue(detail["ok"])
            self.assertEqual(detail["data"]["steps"][0]["stepId"], "route")

            deleted = client.delete("/api/agent-tasks/task-2", headers=headers).json()
            self.assertTrue(deleted["ok"])
            self.assertEqual(deleted["data"]["id"], "task-2")
            missing = client.get("/api/agent-tasks/task-2", headers=headers).json()
            self.assertFalse(missing["ok"])

            with connect_database(settings.daemon_db_path) as conn:
                sync_rows = conn.execute("SELECT event_type FROM sync_events WHERE tenant_id = ? AND entity_type = 'agent_task' ORDER BY id", (tenant_id,)).fetchall()
                self.assertIn("status_updated", [row["event_type"] for row in sync_rows])
                self.assertIn("deleted", [row["event_type"] for row in sync_rows])
                approval_decision = conn.execute("SELECT * FROM approval_decisions WHERE approval_id = ?", ("approval-1",)).fetchone()
                self.assertEqual(approval_decision["decision"], "allow_workspace")
                approval_grant = conn.execute("SELECT * FROM approval_grants WHERE source_approval_id = ?", ("approval-1",)).fetchone()
                self.assertEqual(approval_grant["provider_id"], "codex-local")

    def _write_tenant_workspace_fixture(self, root: Path) -> None:
        (root / "profile").mkdir(parents=True)
        (root / "ops" / "data").mkdir(parents=True)
        (root / "jobs" / "reports").mkdir(parents=True)
        (root / "jobs" / "project-notes").mkdir(parents=True)
        (root / "profile" / "intentions").mkdir(parents=True)
        (root / "resumes" / "library").mkdir(parents=True)
        (root / "resumes" / "diagnostics").mkdir(parents=True)
        (root / "profile" / "profile.yml").write_text(
            "\n".join([
                "full_name: Reader User",
                "email: reader@example.com",
                "phone: 123",
                "location: Shenzhen",
                "github: github.com/reader",
                "headline: Robot Engineer",
                "target_roles:",
                "  primary:",
                "    - Robot Engineer",
            ]),
            encoding="utf-8",
        )
        (root / "profile" / "cv.md").write_text("# Reader CV\n\nExperience.", encoding="utf-8")
        (root / "profile" / "_profile.md").write_text("# Reader Profile\n", encoding="utf-8")
        (root / "ops" / "data" / "applications.md").write_text(
            "\n".join([
                "# Applications Tracker",
                "",
                "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
                "|---|------|---------|------|-------|--------|-----|--------|-------|",
                "| 1 | 2026-07-03 | Demo Corp | Robot Engineer | 4.5/5 | Interview | OK | [001](../../jobs/reports/001-demo-2026-07-03.md) | Good fit |",
            ]),
            encoding="utf-8",
        )
        (root / "ops" / "data" / "application-events.jsonl").write_text(
            '{"application_id":"1","event":"offer","date":"2026-07-03","note":"Offer received"}\n',
            encoding="utf-8",
        )
        (root / "jobs" / "reports" / "001-demo-2026-07-03.md").write_text(
            "\n".join([
                "# Demo Report",
                "**Date:** 2026-07-03",
                "**URL:** https://example.com/job",
                "**Score:** 4.5/5",
                "**Recommendation:** Apply",
                "**Legitimacy:** high",
                "",
                "Demo report body.",
            ]),
            encoding="utf-8",
        )
        (root / "resumes" / "library" / "robot-resume.md").write_text("# Robot Resume\n\nContent.", encoding="utf-8")
        (root / "ops" / "data" / "resume-job-links.json").write_text(
            '{"links":[{"file":"robot-resume.md","jobId":"001","jobTitle":"Robot Engineer","generatedAt":"2026-07-03"}]}',
            encoding="utf-8",
        )
        (root / "resumes" / "diagnostics" / "robot-resume-diagnosis.md").write_text(
            "\n".join([
                "# Robot Resume Diagnosis",
                "**Resume:** robot-resume.md",
                "**Target Job:** 001",
                "**Generated At:** 2026-07-03T00:00:00Z",
                "",
                "Looks aligned.",
            ]),
            encoding="utf-8",
        )
        (root / "jobs" / "project-notes" / "robot-project.md").write_text("# Robot Project\n\nBuilt a robot demo.", encoding="utf-8")
        (root / "profile" / "intentions" / "targeting.md").write_text("# Targeting\n\nRobot roles.", encoding="utf-8")
        (root / "ops" / "data" / "experience-metadata.json").write_text(
            "\n".join([
                "{",
                '  "updatedAt": "2026-07-03T00:00:00Z",',
                '  "experiences": [',
                "    {",
                '      "id": "exp-robot",',
                '      "title": "Robot demo",',
                '      "category": "project",',
                '      "role": "owner",',
                '      "sourceFile": "workspace/jobs/project-notes/robot-project.md",',
                '      "summary": "Built a robot demo.",',
                '      "tags": ["robot"],',
                '      "evidence": ["demo"],',
                '      "gaps": [],',
                '      "publicLevel": "private"',
                "    }",
                "  ]",
                "}",
            ]),
            encoding="utf-8",
        )
        (root / "ops" / "data" / "recruitment-market.json.jobs.d").mkdir(parents=True)
        (root / "ops" / "data" / "recruitment-market.json").write_text(
            '{"updatedAt":"2026-07-03","jobs":[],"jobs_file":"recruitment-market.json.jobs.d"}',
            encoding="utf-8",
        )
        (root / "ops" / "data" / "recruitment-market.json.jobs.d" / "0000.json").write_text(
            '[{"id":"MJ-001","company":"Demo Corp","role":"Robot Engineer","updatedAt":"2026-07-03"}]',
            encoding="utf-8",
        )
        (root / "ops" / "data" / "evidence-requests.json").write_text(
            "\n".join([
                "{",
                '  "updatedAt": "2026-07-03T00:00:00Z",',
                '  "summary": { "open": 1, "highPriority": 1 },',
                '  "requests": [',
                "    {",
                '      "id": "ev-1",',
                '      "priority": "high",',
                '      "status": "open",',
                '      "direction": "Robot proof",',
                '      "gap": "Need proof",',
                '      "marketSignal": "interview",',
                '      "currentEvidence": "",',
                '      "askHuman": ["Add evidence"],',
                '      "targetFile": "workspace/jobs/project-notes/evidence.md",',
                '      "resumeImpact": "strong"',
                "    }",
                "  ]",
                "}",
            ]),
            encoding="utf-8",
        )

    def _write_agent_fixture(self, db_path: Path, tenant_id: str, tenant_workspace: Path) -> None:
        with connect_database(db_path) as conn:
            conn.execute(
                """
                INSERT INTO agent_tasks
                  (id, tenant_id, provider_id, workspace_path, prompt, mode, status, skill_id, workflow_id, workflow_run_id, input_kind, source_text, route_decision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "task-1",
                    tenant_id,
                    "codex-local",
                    str(tenant_workspace),
                    "hello",
                    "structured",
                    "running",
                    "workspace.help",
                    "wf-1",
                    "run-1",
                    "text",
                    "hello",
                    json.dumps({"skillId": "workspace.help"}),
                    "2026-07-03T00:00:00Z",
                    "2026-07-03T00:00:02Z",
                ),
            )
            conn.execute(
                """
                INSERT INTO agent_tasks
                  (id, tenant_id, provider_id, workspace_path, prompt, mode, status, skill_id, workflow_id, workflow_run_id, input_kind, source_text, route_decision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "task-2",
                    tenant_id,
                    "codex-local",
                    str(tenant_workspace),
                    "done task",
                    "structured",
                    "completed",
                    None,
                    None,
                    None,
                    "text",
                    "done task",
                    None,
                    "2026-07-03T00:00:03Z",
                    "2026-07-03T00:00:04Z",
                ),
            )
            conn.execute(
                "INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("event-1", tenant_id, "task-1", "message", json.dumps({"type": "message", "role": "user", "text": "hello", "createdAt": "2026-07-03T00:00:00Z"}), "2026-07-03T00:00:00Z"),
            )
            conn.execute(
                "INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("event-2", tenant_id, "task-1", "message", json.dumps({"type": "message", "role": "assistant", "text": "world", "createdAt": "2026-07-03T00:00:01Z"}), "2026-07-03T00:00:01Z"),
            )
            conn.execute(
                """
                INSERT INTO approval_requests
                  (id, tenant_id, task_id, action, risk, summary, command, cwd, affected_paths, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "approval-1",
                    tenant_id,
                    "task-1",
                    "run_command",
                    "medium",
                    "Run command",
                    json.dumps({"providerId": "codex-local", "workspacePath": str(tenant_workspace)}),
                    str(tenant_workspace),
                    json.dumps(["package.json"]),
                    "2026-07-03T00:00:01Z",
                ),
            )
            conn.execute(
                """
                INSERT INTO workflow_runs
                  (id, tenant_id, workflow_id, skill_id, task_id, current_step_id, status, source_text, route_decision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "run-1",
                    tenant_id,
                    "wf-1",
                    "workspace.help",
                    "task-1",
                    "route",
                    "running",
                    "hello",
                    json.dumps({"skillId": "workspace.help"}),
                    "2026-07-03T00:00:00Z",
                    "2026-07-03T00:00:02Z",
                ),
            )
            conn.execute(
                """
                INSERT INTO workflow_step_runs
                  (id, tenant_id, workflow_run_id, step_id, status, task_id, approval_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "step-1",
                    tenant_id,
                    "run-1",
                    "route",
                    "done",
                    "task-1",
                    None,
                    "2026-07-03T00:00:00Z",
                    "2026-07-03T00:00:01Z",
                ),
            )
            conn.commit()

    def _write_sync_fixture(self, db_path: Path, tenant_id: str) -> None:
        with connect_database(db_path) as conn:
            conn.execute(
                "INSERT INTO sync_events (id, tenant_id, entity_type, entity_id, event_type, payload, created_at, pushed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (1, tenant_id, "agent_task", "task-1", "created", json.dumps({"message": "tenant-event"}), "2026-07-03T00:00:00Z", None),
            )
            conn.execute(
                "INSERT INTO sync_events (id, tenant_id, entity_type, entity_id, event_type, payload, created_at, pushed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (2, "other-tenant", "agent_task", "task-2", "created", json.dumps({"message": "other-event"}), "2026-07-03T00:00:00Z", None),
            )
            conn.execute(
                "INSERT INTO sync_events (id, tenant_id, entity_type, entity_id, event_type, payload, created_at, pushed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (3, tenant_id, "workflow_run", "run-1", "updated", json.dumps({"message": "second-event"}), "2026-07-03T00:00:01Z", None),
            )
            conn.commit()


class _SyncPushServer:
    def __init__(self, accepted_ids: list[int]) -> None:
        self.accepted_ids = accepted_ids
        self.server: http.server.ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None
        self.url = ""

    def __enter__(self) -> "_SyncPushServer":
        accepted_ids = self.accepted_ids

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                length = int(self.headers.get("content-length") or "0")
                self.rfile.read(length)
                body = json.dumps({"ok": True, "data": {"acceptedIds": accepted_ids, "cursor": "cursor-1"}}).encode("utf-8")
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                return

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        port = self.server.server_address[1]
        self.url = f"http://127.0.0.1:{port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
