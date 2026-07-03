from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from ucareer_py_api.main import create_app


class PythonCloudApiTest(unittest.TestCase):
    def test_cloud_api_contract(self) -> None:
        client = TestClient(create_app())

        health = client.get("/health").json()
        self.assertTrue(health["ok"])
        self.assertEqual(health["data"]["service"], "ucareer-cloud-api")

        pairing = client.post("/auth/device-pairing").json()
        self.assertTrue(pairing["ok"])
        self.assertEqual(len(pairing["data"]["code"]), 6)
        self.assertEqual(pairing["data"]["expiresInSeconds"], 300)

        pull = client.get("/sync/pull").json()
        self.assertTrue(pull["ok"])
        self.assertEqual(pull["data"]["events"], [])
        self.assertIn("cursor", pull["data"])

        push = client.post("/sync/push", json={"events": [{"id": 7}, {"id": 8}]}).json()
        self.assertTrue(push["ok"])
        self.assertTrue(push["data"]["accepted"])
        self.assertEqual(push["data"]["acceptedIds"], [7, 8])

        wrapped_push = client.post("/sync/push", json={"ok": True, "data": {"events": [{"id": 9}]}}).json()
        self.assertTrue(wrapped_push["ok"])
        self.assertEqual(wrapped_push["data"]["acceptedIds"], [9])

        approval = client.post("/approvals/approval-1/decision", json={"decision": "allow_once"}).json()
        self.assertTrue(approval["ok"])
        self.assertTrue(approval["data"]["relayed"])


if __name__ == "__main__":
    unittest.main()
