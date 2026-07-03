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


if __name__ == "__main__":
    unittest.main()
