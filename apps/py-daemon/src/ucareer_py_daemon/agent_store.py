from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .db import connect_database


@dataclass
class AgentStore:
    db_path: Path
    tenant_id: str
    tenant_workspace_root: Path

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
