from __future__ import annotations

import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any


class ChromeBridgeService:
    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._events: dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def run_boss_search(self, payload: dict[str, Any], timeout_seconds: float = 180) -> dict[str, Any]:
        task = self._enqueue("boss_search", payload)
        return self._wait_for_task(
            task,
            timeout_seconds,
            {
                "ok": False,
                "added": 0,
                "stats": {
                    "queries": len(payload.get("queries", [])) if isinstance(payload.get("queries"), list) else 0,
                    "candidatesSeen": 0,
                    "duplicatesSkipped": 0,
                    "failedQueries": len(payload.get("queries", [])) if isinstance(payload.get("queries"), list) else 1,
                },
                "queries": payload.get("queries") if isinstance(payload.get("queries"), list) else [],
                "discovered": [],
                "message": "等待 Ucareer Chrome 扩展执行 Boss 搜索超时。请确认扩展已加载、已连接本地 Ucareer，并保持 Chrome 运行。",
            },
        )

    def run_boss_current_detail(self, payload: dict[str, Any], timeout_seconds: float = 120) -> dict[str, Any]:
        task = self._enqueue("boss_current_detail", payload)
        return self._wait_for_task(
            task,
            timeout_seconds,
            {
                "ok": False,
                "added": 0,
                "stats": {"queries": 0, "candidatesSeen": 0, "duplicatesSkipped": 0, "failedQueries": 1},
                "discovered": [],
                "message": "等待 Ucareer Chrome 扩展读取当前 Boss 选中岗位超时。请确认扩展已加载、已连接本地 Ucareer，并保持 Boss 当前岗位页面打开。",
            },
        )

    def next_task(self) -> dict[str, Any] | None:
        with self._lock:
            self._prune_old_tasks()
            pending = sorted(
                [task for task in self._tasks.values() if task.get("status") == "pending"],
                key=lambda task: str(task.get("createdAt") or ""),
            )
            if not pending:
                return None
            task = pending[0]
            task["status"] = "running"
            task["updatedAt"] = _now_iso()
            self._tasks[task["id"]] = task
            return dict(task)

    def complete_task(self, task_id: str, result: dict[str, Any] | None) -> dict[str, Any]:
        result = result or {"ok": False}
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                raise ValueError(f"Chrome bridge task not found: {task_id}")
            task["status"] = "completed" if bool(result.get("ok")) else "failed"
            task["updatedAt"] = _now_iso()
            task["result"] = result
            self._tasks[task_id] = task
            event = self._events.get(task_id)
            if event:
                event.set()
            return dict(task)

    def _enqueue(self, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        now = _now_iso()
        task = {
            "id": f"chrome_{int(time.time() * 1000):x}_{uuid.uuid4().hex[:6]}",
            "type": task_type,
            "status": "pending",
            "createdAt": now,
            "updatedAt": now,
            "payload": payload,
        }
        with self._lock:
            self._tasks[task["id"]] = task
            self._events[task["id"]] = threading.Event()
            self._prune_old_tasks()
        return task

    def _wait_for_task(self, task: dict[str, Any], timeout_seconds: float, timeout_result: dict[str, Any]) -> dict[str, Any]:
        event = self._events[task["id"]]
        completed = event.wait(timeout_seconds)
        if completed:
            with self._lock:
                stored = self._tasks.get(task["id"]) or task
                return dict(stored.get("result") or {"ok": False})
        self.complete_task(str(task["id"]), timeout_result)
        return timeout_result

    def _prune_old_tasks(self) -> None:
        cutoff = time.time() - 30 * 60
        for task_id, task in list(self._tasks.items()):
            try:
                updated = datetime.fromisoformat(str(task.get("updatedAt") or task.get("createdAt")).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                updated = 0
            if updated < cutoff:
                self._tasks.pop(task_id, None)
                self._events.pop(task_id, None)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
