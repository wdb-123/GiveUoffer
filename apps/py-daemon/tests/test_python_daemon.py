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


if __name__ == "__main__":
    unittest.main()

