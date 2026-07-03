from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .db import connect_database
from .providers import list_providers
from .routing import preview_agent_route


@dataclass
class AgentStore:
    db_path: Path
    tenant_id: str
    tenant_workspace_root: Path

    def create_or_continue_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        provider_id = str(payload.get("providerId") or "").strip()
        prompt = str(payload.get("prompt") or "").strip()
        if not provider_id or not prompt:
            raise ValueError("providerId and prompt are required")
        provider = _provider_by_id(provider_id)
        if not provider:
            raise LookupError(f"Provider not found: {provider_id}")

        if payload.get("continueTaskId"):
            return self._continue_task(str(payload["continueTaskId"]), provider, prompt, payload)

        workspace_path = self._resolve_workspace_path(payload.get("workspacePath"))
        route_metadata = _resolve_route_metadata(payload, provider_id, prompt)
        selected_provider_id = str(route_metadata.get("recommendedProviderId") or provider_id)
        selected_provider = _provider_by_id(selected_provider_id) or provider
        created_at = _now_iso()
        workflow_run_id = str(uuid.uuid4()) if route_metadata.get("workflowId") else None
        task_id = str(uuid.uuid4())
        task = _drop_empty({
            "id": task_id,
            "tenantId": self.tenant_id,
            "providerId": selected_provider["id"],
            "workspacePath": str(workspace_path),
            "prompt": _compose_prompt_with_attachments(str(route_metadata.get("agentPrompt") or prompt), payload.get("attachments")),
            "mode": str(payload.get("mode") or "structured"),
            "status": "waiting_approval",
            "skillId": route_metadata.get("skillId"),
            "workflowId": route_metadata.get("workflowId"),
            "workflowRunId": workflow_run_id,
            "inputKind": route_metadata.get("inputKind"),
            "sourceText": route_metadata.get("sourceText") or prompt,
            "routeDecision": route_metadata.get("routeDecision") or route_metadata,
            "createdAt": created_at,
            "updatedAt": created_at,
        })

        with connect_database(self.db_path) as conn:
            self._insert_task(conn, task)
            self._append_event(conn, task_id, {"type": "message", "role": "user", "text": prompt, "createdAt": created_at})
            if workflow_run_id:
                self._insert_workflow_run(conn, task, route_metadata)
            _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "created", task)

            fast_reply = _build_local_fast_reply(route_metadata, prompt)
            if fast_reply:
                replied_at = _now_iso()
                self._append_event(conn, task_id, {"type": "message", "role": "assistant", "text": fast_reply, "createdAt": replied_at})
                task = {**task, "status": "completed", "updatedAt": replied_at}
                self._update_task_status_in_conn(conn, task_id, "completed", replied_at)
                _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "status_updated", task)
                self._sync_workflow_status(conn, task)
                conn.commit()
                return task

            system_at = _now_iso()
            self._append_event(
                conn,
                task_id,
                {
                    "type": "message",
                    "role": "system",
                    "text": f"{selected_provider['label']} 本地会话已创建，等待启动审批。",
                    "createdAt": system_at,
                },
            )
            approval = self._create_agent_approval(conn, task, selected_provider, bool(payload.get("continueTaskId")), payload.get("permissionMode"))
            if approval:
                self._append_event(conn, task_id, {"type": "approval_request", "approval": approval, "createdAt": approval["createdAt"]})
                if workflow_run_id:
                    conn.execute(
                        "UPDATE workflow_step_runs SET approval_id = ?, updated_at = ? WHERE workflow_run_id = ? AND tenant_id = ?",
                        (approval["id"], approval["createdAt"], workflow_run_id, self.tenant_id),
                    )
                conn.commit()
                return {"task": self.get_task(task_id) or task, "approval": approval}

            queued_at = _now_iso()
            task = {**task, "status": "queued", "updatedAt": queued_at}
            self._update_task_status_in_conn(conn, task_id, "queued", queued_at)
            self._sync_workflow_status(conn, task)
            conn.commit()
        return self.get_task(task_id) or task

    def create_local_command(self, payload: dict[str, Any]) -> dict[str, Any]:
        command = str(payload.get("command") or "").strip()
        if not command:
            raise ValueError("command is required")
        args = [str(arg) for arg in payload.get("args", [])] if isinstance(payload.get("args"), list) else []
        cwd = self._resolve_workspace_path(payload.get("cwd"))
        now = _now_iso()
        task = {
            "id": str(uuid.uuid4()),
            "tenantId": self.tenant_id,
            "providerId": "local-shell",
            "workspacePath": str(cwd),
            "prompt": str(payload.get("label") or " ".join([command, *args])),
            "mode": "structured",
            "status": "waiting_approval",
            "createdAt": now,
            "updatedAt": now,
        }
        with connect_database(self.db_path) as conn:
            self._insert_task(conn, task)
            approval = self._insert_approval(conn, {
                "taskId": task["id"],
                "action": "run_shell",
                "risk": "high",
                "summary": f"Run local command: {' '.join([command, *args])}",
                "command": json.dumps({"command": command, "args": args, "cwd": str(cwd)}, ensure_ascii=False),
                "cwd": str(cwd),
                "affectedPaths": [str(cwd)],
            })
            self._append_event(conn, task["id"], {"type": "approval_request", "approval": approval, "createdAt": approval["createdAt"]})
            _write_sync_event(conn, self.tenant_id, "agent_task", task["id"], "created", task)
            conn.commit()
        return {"task": self.get_task(task["id"]) or task, "approval": approval}

    def _continue_task(self, task_id: str, provider: dict[str, Any], prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        now = _now_iso()
        with connect_database(self.db_path) as conn:
            self._append_event(conn, task_id, {"type": "message", "role": "user", "text": prompt, "createdAt": now})
            updated = {**task, "status": "waiting_approval", "updatedAt": now}
            self._update_task_status_in_conn(conn, task_id, "waiting_approval", now)
            self._sync_workflow_status(conn, updated)
            approval = self._create_agent_approval(conn, updated, provider, True, payload.get("permissionMode"))
            if approval:
                self._append_event(conn, task_id, {"type": "approval_request", "approval": approval, "createdAt": approval["createdAt"]})
                _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "continued", updated)
                conn.commit()
                return {"task": self.get_task(task_id) or updated, "approval": approval}
            queued_at = _now_iso()
            self._update_task_status_in_conn(conn, task_id, "queued", queued_at)
            updated = {**updated, "status": "queued", "updatedAt": queued_at}
            self._sync_workflow_status(conn, updated)
            _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "continued", updated)
            conn.commit()
        return self.get_task(task_id) or updated

    def list_tasks(self) -> list[dict[str, Any]]:
        with connect_database(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM agent_tasks
                WHERE tenant_id = ?
                ORDER BY created_at DESC
                """,
                (self.tenant_id,),
            ).fetchall()
            return [task for task in (_task_from_row(row) for row in rows) if self._is_tenant_task(task)]

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with connect_database(self.db_path) as conn:
            row = conn.execute("SELECT * FROM agent_tasks WHERE id = ? AND tenant_id = ?", (task_id, self.tenant_id)).fetchone()
            task = _task_from_row(row) if row else None
            return task if task and self._is_tenant_task(task) else None

    def queue_overview(self, tenant_name: str) -> dict[str, Any]:
        tasks = self.list_tasks()
        running = sum(1 for task in tasks if task.get("status") == "running")
        queued = sum(1 for task in tasks if task.get("status") == "queued")
        waiting_approval = sum(1 for task in tasks if task.get("status") == "waiting_approval")
        max_concurrent = 2
        max_concurrent_per_tenant = 2
        max_queued = 100
        max_queued_per_tenant = 25
        return {
            "maxConcurrent": max_concurrent,
            "maxConcurrentPerTenant": max_concurrent_per_tenant,
            "maxQueued": max_queued,
            "maxQueuedPerTenant": max_queued_per_tenant,
            "running": running,
            "queued": queued + waiting_approval,
            "queuedExclusive": 0,
            "currentTenant": {
                "tenantId": self.tenant_id,
                "tenantName": tenant_name,
                "running": running,
                "queued": queued + waiting_approval,
            },
            "saturated": queued + waiting_approval >= max_queued,
            "tenantSaturated": queued + waiting_approval >= max_queued_per_tenant,
        }

    def delete_task(self, task_id: str) -> dict[str, Any]:
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        if task.get("status") in {"queued", "running", "waiting_approval"}:
            raise PermissionError("Cannot delete a task while it is queued, running, or waiting for approval")
        with connect_database(self.db_path) as conn:
            conn.execute("DELETE FROM agent_events WHERE task_id = ? AND tenant_id = ?", (task_id, self.tenant_id))
            conn.execute("DELETE FROM approval_requests WHERE task_id = ? AND tenant_id = ?", (task_id, self.tenant_id))
            conn.execute("DELETE FROM approval_decisions WHERE task_id = ? AND tenant_id = ?", (task_id, self.tenant_id))
            conn.execute("DELETE FROM agent_tasks WHERE id = ? AND tenant_id = ?", (task_id, self.tenant_id))
            _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "deleted", task)
            conn.commit()
        return task

    def cancel_task(self, task_id: str) -> dict[str, Any]:
        return self.update_task_status(task_id, "cancelled")

    def update_task_status(self, task_id: str, status: str) -> dict[str, Any]:
        task = self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        updated_at = _now_iso()
        with connect_database(self.db_path) as conn:
            conn.execute(
                "UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                (status, updated_at, task_id, self.tenant_id),
            )
            updated = {**task, "status": status, "updatedAt": updated_at}
            event = {"type": "task_status", "taskId": task_id, "status": status, "createdAt": updated_at}
            conn.execute(
                "INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), self.tenant_id, task_id, "task_status", json.dumps(event, ensure_ascii=False), updated_at),
            )
            _write_sync_event(conn, self.tenant_id, "agent_task", task_id, "status_updated", updated)
            self._sync_workflow_status(conn, updated)
            conn.commit()
        return updated

    def list_events(self, task_id: str) -> list[dict[str, Any]]:
        if not self.get_task(task_id):
            raise ValueError(f"Task not found: {task_id}")
        with connect_database(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT payload
                FROM agent_events
                WHERE task_id = ? AND tenant_id = ?
                ORDER BY created_at ASC, rowid ASC
                """,
                (task_id, self.tenant_id),
            ).fetchall()
            return [_sanitize_display_event(_parse_json(row["payload"], {})) for row in rows]

    def list_turns(self, task_id: str) -> list[dict[str, Any]]:
        return _build_agent_task_turns(task_id, self.list_events(task_id))

    def list_approvals(self) -> list[dict[str, Any]]:
        with connect_database(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM approval_requests
                WHERE tenant_id = ?
                ORDER BY created_at DESC
                """,
                (self.tenant_id,),
            ).fetchall()
            return [_approval_from_row(row) for row in rows]

    def decide_approval(self, approval_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        decision = str(payload.get("decision") or "").strip()
        if decision == "allow":
            decision = "allow_once"
        if decision not in {"allow_once", "allow_task", "allow_workspace", "deny"}:
            raise ValueError("Approval decision must be allow_once, allow_task, allow_workspace, or deny")
        with connect_database(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?",
                (approval_id, self.tenant_id),
            ).fetchone()
            if not row:
                raise ValueError(f"Approval not found: {approval_id}")
            approval = _approval_from_row(row)
            decided_at = _now_iso()
            record = {
                "approvalId": approval_id,
                "taskId": approval["taskId"],
                "decision": decision,
                **({"note": str(payload.get("note"))} if payload.get("note") else {}),
                "decidedAt": decided_at,
            }
            conn.execute(
                """
                INSERT OR REPLACE INTO approval_decisions
                  (approval_id, tenant_id, task_id, decision, note, decided_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (approval_id, self.tenant_id, approval["taskId"], decision, record.get("note"), decided_at),
            )
            _write_sync_event(conn, self.tenant_id, "approval_decision", approval_id, decision, record)
            conn.execute("DELETE FROM approval_requests WHERE id = ? AND tenant_id = ?", (approval_id, self.tenant_id))

            if decision == "allow_workspace":
                grant = _parse_start_agent_grant(str(approval.get("command") or ""), approval_id)
                if grant:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO approval_grants
                          (id, tenant_id, action, provider_id, workspace_path, source_approval_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            self.tenant_id,
                            grant["action"],
                            grant["providerId"],
                            grant["workspacePath"],
                            approval_id,
                            decided_at,
                        ),
                    )
                    _write_sync_event(conn, self.tenant_id, "approval_grant", approval_id, "created", grant)

            system_event = {
                "type": "message",
                "role": "system",
                "text": f"Approval {decision}: {approval['summary']}",
                "createdAt": decided_at,
            }
            conn.execute(
                "INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), self.tenant_id, approval["taskId"], "message", json.dumps(system_event, ensure_ascii=False), decided_at),
            )
            conn.commit()

        next_status = "cancelled" if decision == "deny" else "queued"
        self.update_task_status(str(approval["taskId"]), next_status)
        return record

    def list_workflow_runs(self) -> list[dict[str, Any]]:
        with connect_database(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM workflow_runs
                WHERE tenant_id = ?
                ORDER BY updated_at DESC
                """,
                (self.tenant_id,),
            ).fetchall()
            return [_workflow_run_from_row(row) for row in rows]

    def get_workflow_run_detail(self, run_id: str) -> dict[str, Any] | None:
        with connect_database(self.db_path) as conn:
            row = conn.execute("SELECT * FROM workflow_runs WHERE id = ? AND tenant_id = ?", (run_id, self.tenant_id)).fetchone()
            if not row:
                return None
            steps = conn.execute(
                """
                SELECT *
                FROM workflow_step_runs
                WHERE workflow_run_id = ? AND tenant_id = ?
                """,
                (run_id, self.tenant_id),
            ).fetchall()
            return {"run": _workflow_run_from_row(row), "steps": [_workflow_step_from_row(step) for step in steps]}

    def _is_tenant_task(self, task: dict[str, Any]) -> bool:
        workspace_path = str(task.get("workspacePath") or "")
        if not workspace_path:
            return False
        try:
            root = self.tenant_workspace_root.resolve()
            path = Path(workspace_path).resolve()
            return path == root or root in path.parents
        except OSError:
            return False

    def _resolve_workspace_path(self, value: Any) -> Path:
        raw = str(value or ".").strip()
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = self.tenant_workspace_root / raw
        try:
            root = self.tenant_workspace_root.resolve()
            path = candidate.resolve()
        except OSError as cause:
            raise ValueError("workspacePath must stay inside tenant workspace") from cause
        if path != root and root not in path.parents:
            raise ValueError("workspacePath must stay inside tenant workspace")
        return path

    def _insert_task(self, conn: Any, task: dict[str, Any]) -> None:
        conn.execute(
            """
            INSERT INTO agent_tasks
              (id, tenant_id, provider_id, workspace_path, prompt, mode, status, skill_id, workflow_id, workflow_run_id, input_kind, source_text, route_decision, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task["id"],
                self.tenant_id,
                task["providerId"],
                task["workspacePath"],
                task["prompt"],
                task["mode"],
                task["status"],
                task.get("skillId"),
                task.get("workflowId"),
                task.get("workflowRunId"),
                task.get("inputKind"),
                task.get("sourceText"),
                json.dumps(task.get("routeDecision"), ensure_ascii=False) if task.get("routeDecision") else None,
                task["createdAt"],
                task["updatedAt"],
            ),
        )

    def _append_event(self, conn: Any, task_id: str, event: dict[str, Any]) -> None:
        conn.execute(
            "INSERT INTO agent_events (id, tenant_id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                self.tenant_id,
                task_id,
                str(event.get("type") or "message"),
                json.dumps(event, ensure_ascii=False),
                str(event.get("createdAt") or _now_iso()),
            ),
        )

    def _insert_workflow_run(self, conn: Any, task: dict[str, Any], route_metadata: dict[str, Any]) -> None:
        workflow_run_id = task.get("workflowRunId")
        if not workflow_run_id:
            return
        now = task["createdAt"]
        conn.execute(
            """
            INSERT INTO workflow_runs
              (id, tenant_id, workflow_id, skill_id, task_id, current_step_id, status, source_text, route_decision, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workflow_run_id,
                self.tenant_id,
                task.get("workflowId"),
                task.get("skillId"),
                task["id"],
                task.get("skillId"),
                task["status"],
                task.get("sourceText"),
                json.dumps(route_metadata, ensure_ascii=False),
                now,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO workflow_step_runs
              (id, tenant_id, workflow_run_id, step_id, status, task_id, approval_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                self.tenant_id,
                workflow_run_id,
                task.get("skillId") or "route",
                task["status"],
                task["id"],
                None,
                now,
                now,
            ),
        )

    def _create_agent_approval(
        self,
        conn: Any,
        task: dict[str, Any],
        provider: dict[str, Any],
        is_continuation: bool,
        permission_mode: Any,
    ) -> dict[str, Any] | None:
        if str(permission_mode or "") == "full_access":
            return None
        verb = "Continue" if is_continuation else "Start"
        risk = _risk_for_provider(str(provider["id"]))
        return self._insert_approval(conn, {
            "taskId": task["id"],
            "action": "start_agent",
            "risk": risk,
            "summary": f"{verb} {provider['label']} in {task['workspacePath']}",
            "command": json.dumps(
                {
                    "providerId": provider["id"],
                    "providerLabel": provider["label"],
                    "workspacePath": task["workspacePath"],
                    "continuation": is_continuation,
                },
                ensure_ascii=False,
            ),
            "cwd": task["workspacePath"],
            "affectedPaths": [task["workspacePath"]],
        })

    def _insert_approval(self, conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        approval = _drop_empty({
            "id": str(uuid.uuid4()),
            "tenantId": self.tenant_id,
            "taskId": payload["taskId"],
            "action": payload["action"],
            "risk": payload["risk"],
            "summary": payload["summary"],
            "command": payload.get("command"),
            "cwd": payload.get("cwd"),
            "affectedPaths": payload.get("affectedPaths") or [],
            "createdAt": now,
        })
        conn.execute(
            """
            INSERT INTO approval_requests
              (id, tenant_id, task_id, action, risk, summary, command, cwd, affected_paths, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                approval["id"],
                self.tenant_id,
                approval["taskId"],
                approval["action"],
                approval["risk"],
                approval["summary"],
                approval.get("command"),
                approval.get("cwd"),
                json.dumps(approval.get("affectedPaths") or [], ensure_ascii=False),
                approval["createdAt"],
            ),
        )
        _write_sync_event(conn, self.tenant_id, "approval_request", approval["id"], "created", approval)
        return approval

    def _update_task_status_in_conn(self, conn: Any, task_id: str, status: str, updated_at: str) -> None:
        conn.execute(
            "UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
            (status, updated_at, task_id, self.tenant_id),
        )

    def _sync_workflow_status(self, conn: Any, task: dict[str, Any]) -> None:
        workflow_run_id = task.get("workflowRunId")
        skill_id = task.get("skillId") or task.get("currentStepId")
        if not workflow_run_id or not skill_id:
            return
        updated_at = task.get("updatedAt") or _now_iso()
        conn.execute(
            """
            UPDATE workflow_runs
            SET status = ?, current_step_id = ?, updated_at = ?
            WHERE id = ? AND tenant_id = ?
            """,
            (task["status"], skill_id, updated_at, workflow_run_id, self.tenant_id),
        )
        conn.execute(
            """
            UPDATE workflow_step_runs
            SET status = ?, task_id = ?, updated_at = ?
            WHERE workflow_run_id = ? AND tenant_id = ? AND step_id = ?
            """,
            (task["status"], task["id"], updated_at, workflow_run_id, self.tenant_id, skill_id),
        )


def _provider_by_id(provider_id: str) -> dict[str, Any] | None:
    return next((provider for provider in list_providers() if provider["id"] == provider_id), None)


def _resolve_route_metadata(payload: dict[str, Any], provider_id: str, prompt: str) -> dict[str, Any]:
    supplied = payload.get("routeMetadata")
    if isinstance(supplied, dict) and supplied.get("skillId"):
        return {
            **supplied,
            "sourceText": supplied.get("sourceText") or prompt,
            "recommendedProviderId": provider_id,
            "agentPrompt": str(supplied.get("agentPrompt") or prompt),
        }
    preview = preview_agent_route({
        "text": prompt,
        "attachments": payload.get("attachments") if isinstance(payload.get("attachments"), list) else [],
        "preferredProviderId": provider_id,
        **({"pageContext": payload.get("pageContext")} if isinstance(payload.get("pageContext"), dict) else {}),
    })
    return {
        "skillId": preview.get("skillId"),
        "workflowId": preview.get("workflowId"),
        "inputKind": preview.get("inputKind"),
        "sourceText": prompt,
        "routeDecision": preview,
        "recommendedProviderId": preview.get("recommendedProviderId") or provider_id,
        "agentPrompt": preview.get("agentPrompt") or prompt,
    }


def _compose_prompt_with_attachments(prompt: str, attachments: Any) -> str:
    if not isinstance(attachments, list) or not attachments:
        return prompt
    lines = [prompt, "", "附件上下文："]
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        file_name = attachment.get("fileName") or attachment.get("name") or "attachment"
        kind = attachment.get("kind") or attachment.get("mimeType") or "unknown"
        parsed = attachment.get("parsed") if isinstance(attachment.get("parsed"), dict) else {}
        summary = parsed.get("summary") or parsed.get("text") or ""
        lines.append(f"- {file_name} ({kind}) {str(summary)[:1200]}")
    return "\n".join(lines).strip()


def _build_local_fast_reply(route_metadata: dict[str, Any], prompt: str) -> str | None:
    if route_metadata.get("skillId") != "agent.general":
        return None
    if not re.match(r"^(你好|你好啊|您好|您好啊|嗨|哈喽|hello|hi|hey|在吗|在不在|早上好|中午好|下午好|晚上好|谢谢|感谢|thanks|thank you)[！!。.?？~～\s]*$", prompt.strip(), re.I):
        return None
    return "你好！你可以直接发岗位、简历、截图或问题。"


def _risk_for_provider(provider_id: str) -> str:
    if provider_id == "openclaw":
        return "critical"
    if provider_id in {"opencode", "claude"}:
        return "high"
    return "medium"


def _task_from_row(row: Any) -> dict[str, Any]:
    route_decision = _parse_json(row["route_decision"], None) if row["route_decision"] else None
    task = {
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "providerId": row["provider_id"],
        "workspacePath": row["workspace_path"],
        "prompt": row["prompt"],
        "mode": row["mode"],
        "status": row["status"],
        "skillId": row["skill_id"],
        "workflowId": row["workflow_id"],
        "workflowRunId": row["workflow_run_id"],
        "inputKind": row["input_kind"],
        "sourceText": row["source_text"],
        "routeDecision": route_decision,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    return _drop_empty(task)


def _approval_from_row(row: Any) -> dict[str, Any]:
    return _drop_empty({
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "taskId": row["task_id"],
        "action": row["action"],
        "risk": row["risk"],
        "summary": row["summary"],
        "command": row["command"],
        "cwd": row["cwd"],
        "affectedPaths": _parse_json(row["affected_paths"], None) if row["affected_paths"] else None,
        "createdAt": row["created_at"],
    })


def _workflow_run_from_row(row: Any) -> dict[str, Any]:
    return _drop_empty({
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "workflowId": row["workflow_id"],
        "skillId": row["skill_id"],
        "taskId": row["task_id"],
        "currentStepId": row["current_step_id"],
        "status": row["status"],
        "sourceText": row["source_text"],
        "routeDecision": _parse_json(row["route_decision"], None) if row["route_decision"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    })


def _workflow_step_from_row(row: Any) -> dict[str, Any]:
    return _drop_empty({
        "id": row["id"],
        "tenantId": row["tenant_id"],
        "workflowRunId": row["workflow_run_id"],
        "stepId": row["step_id"],
        "status": row["status"],
        "taskId": row["task_id"],
        "approvalId": row["approval_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    })


def _parse_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _write_sync_event(conn: Any, tenant_id: str, entity_type: str, entity_id: str, event_type: str, payload: Any) -> None:
    conn.execute(
        """
        INSERT INTO sync_events (tenant_id, entity_type, entity_id, event_type, payload, created_at, pushed_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        """,
        (tenant_id, entity_type, entity_id, event_type, json.dumps(payload, ensure_ascii=False), _now_iso()),
    )


def _parse_start_agent_grant(command: str, source_approval_id: str) -> dict[str, str] | None:
    if not command:
        return None
    try:
        parsed = json.loads(command)
    except json.JSONDecodeError:
        return None
    provider_id = parsed.get("providerId") if isinstance(parsed, dict) else None
    workspace_path = parsed.get("workspacePath") if isinstance(parsed, dict) else None
    if not isinstance(provider_id, str) or not isinstance(workspace_path, str):
        return None
    return {
        "action": "start_agent",
        "providerId": provider_id,
        "workspacePath": workspace_path,
        "sourceApprovalId": source_approval_id,
    }


def _drop_empty(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None and item != ""}


def _sanitize_display_event(event: dict[str, Any]) -> dict[str, Any]:
    if event.get("type") != "message" or event.get("role") != "user":
        return event
    return {**event, "text": _strip_leaked_page_context(str(event.get("text") or ""))}


def _strip_leaked_page_context(text: str) -> str:
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized.startswith("page: "):
        return normalized
    lines = normalized.split("\n")
    for index, line in enumerate(lines):
        if line.strip().startswith("write paths:"):
            return "\n".join(lines[index + 1:]).strip()
    return re.sub(r"^page:\s+[\s\S]*?(?:write paths:\s*[^\n]*(?:\n|$))", "", normalized).strip()


def _build_agent_task_turns(task_id: str, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    turns: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    leading_events: list[dict[str, Any]] = []

    for event in events:
        if event.get("type") == "message" and event.get("role") == "user":
            if current:
                turns.append(_finalize_turn(current))
            current = _create_turn(task_id, len(turns), event)
            if leading_events:
                current["events"] = [*leading_events, *current["events"]]
                current["processEvents"] = [*leading_events, *current["processEvents"]]
                current["startedAt"] = leading_events[0].get("createdAt") or current["startedAt"]
                leading_events = []
            continue

        if not current:
            leading_events.append(event)
            continue
        current["events"].append(event)
        current["updatedAt"] = event.get("createdAt") or current["updatedAt"]
        if event.get("type") == "message" and event.get("role") == "assistant" and not _is_assistant_execution_log(str(event.get("text") or "")):
            if current.get("answer"):
                current["processEvents"].append(current["answer"])
            current["answer"] = event
        else:
            current["processEvents"].append(event)

    if current:
        turns.append(_finalize_turn(current))
    elif leading_events:
        system_turn = _create_turn(task_id, len(turns), None)
        system_turn["events"].extend(leading_events)
        system_turn["processEvents"].extend(leading_events)
        system_turn["startedAt"] = leading_events[0].get("createdAt") or system_turn["startedAt"]
        system_turn["updatedAt"] = leading_events[-1].get("createdAt") or system_turn["updatedAt"]
        turns.append(_finalize_turn(system_turn))

    return [turn for turn in turns if turn.get("question") or turn.get("answer") or turn.get("processEvents")]


def _create_turn(task_id: str, index: int, question: dict[str, Any] | None) -> dict[str, Any]:
    now = (question or {}).get("createdAt") or ""
    return {
        "id": f"{task_id}-turn-{index}",
        "taskId": task_id,
        "index": index,
        "question": question,
        "answer": None,
        "processEvents": [],
        "events": [question] if question else [],
        "startedAt": now,
        "updatedAt": now,
        "status": "pending",
    }


def _finalize_turn(turn: dict[str, Any]) -> dict[str, Any]:
    if any(event.get("type") == "error" for event in turn.get("events", [])):
        status = "failed"
    elif turn.get("answer"):
        status = "answered"
    elif turn.get("question"):
        status = "running"
    else:
        status = "system"
    return {**turn, "status": status}


def _is_assistant_execution_log(text: str) -> bool:
    return re.sub(r"\s+", " ", text).strip().startswith("command:")
