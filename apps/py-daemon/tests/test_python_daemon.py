from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from ucareer_py_daemon.config import Settings
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

            reports = client.get("/api/reports", headers=headers).json()
            self.assertTrue(reports["ok"])
            self.assertEqual(reports["data"]["metrics"]["total"], 1)

            report = client.get("/api/report?file=001-demo-2026-07-03.md", headers=headers).json()
            self.assertTrue(report["ok"])
            self.assertIn("Demo report body", report["data"]["markdown"])

            resumes = client.get("/api/resumes", headers=headers).json()
            self.assertTrue(resumes["ok"])
            self.assertEqual(resumes["data"][0]["targetJobId"], "001")

            resume = client.get("/api/resume?file=robot-resume.md", headers=headers).json()
            self.assertTrue(resume["ok"])
            self.assertEqual(resume["data"]["title"], "Robot Resume")

            diagnostics = client.get("/api/resumes/diagnostics?resumeFile=robot-resume.md", headers=headers).json()
            self.assertTrue(diagnostics["ok"])
            self.assertEqual(diagnostics["data"][0]["resumeFile"], "robot-resume.md")

    def _write_tenant_workspace_fixture(self, root: Path) -> None:
        (root / "profile").mkdir(parents=True)
        (root / "ops" / "data").mkdir(parents=True)
        (root / "jobs" / "reports").mkdir(parents=True)
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


if __name__ == "__main__":
    unittest.main()
