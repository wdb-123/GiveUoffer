from __future__ import annotations

import json
import re
from dataclasses import dataclass
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
