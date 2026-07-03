from __future__ import annotations

import json
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

DEFAULT_JOB_SEARCH_QUERIES = ["机器人系统工程师", "ROS2 机器人", "机器人软件 SDK", "具身智能 数据", "AI工具链 Agent RAG"]
DEFAULT_JOB_SEARCH_CITY = "深圳"
DEFAULT_MAX = 12
COMMAND_TIMEOUT_SECONDS = 60
CODEX_CHROME_TIMEOUT_SECONDS = 360


@dataclass
class JobSearchService:
    workspace_root: Path

    def list_sources(self) -> list[dict[str, Any]]:
        providers = _provider_definitions()
        concrete = [_provider_to_source(provider) for provider in providers]
        labels = "、".join(provider["label"] for provider in providers if provider["id"] != "portals")
        return [
            *concrete,
            {
                "id": "all",
                "label": "全部可用来源",
                "description": f"依次运行所有当前可用的岗位搜索来源：{labels}。",
                "available": True,
                "requiresAuth": any(provider["requiresAuth"] for provider in providers if provider["id"] != "portals"),
                "defaultCity": DEFAULT_JOB_SEARCH_CITY,
            },
        ]

    def search(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = _normalize_request(payload)
        run_id = f"jobsearch_{int(time.time() * 1000):x}_{uuid.uuid4().hex[:6]}"
        started_at = _now_iso()
        providers = _resolve_providers(request["source"])
        if not providers:
            return _empty_result(run_id, request["source"], started_at, "没有可用的岗位搜索来源。")

        if request["source"] != "all":
            result = _run_provider(self.workspace_root, providers[0], request, run_id, started_at)
            if request["source"] != "codex-chrome" or not _should_fallback_from_codex_chrome(result):
                return result
            fallback_results = [result]
            for provider in _resolve_fallback_providers():
                fallback = _run_provider(self.workspace_root, provider, request, run_id, started_at)
                fallback_results.append(fallback)
                if not _should_fallback_from_codex_chrome(fallback):
                    break
            combined = _combine_results(run_id, started_at, "all", fallback_results)
            combined["message"] = " ".join(
                item for item in ["Codex Chrome 没有读到当前招聘页面里的可导入岗位，已自动切换到备用搜索来源。", combined.get("message", "")] if item
            )
            return combined

        return _combine_results(
            run_id,
            started_at,
            request["source"],
            [_run_provider(self.workspace_root, provider, request, run_id, started_at) for provider in providers],
        )


def _provider_definitions() -> list[dict[str, Any]]:
    return [
        {
            "id": "codex-chrome",
            "label": "Codex Chrome",
            "description": "通过 Ucareer Chrome 扩展 bridge 或本地 Codex Chrome radar 读取已登录招聘网站页面。",
            "requiresAuth": True,
            "defaultCity": DEFAULT_JOB_SEARCH_CITY,
            "available": True,
            "script": "scripts/research/codex-chrome-boss-radar.mjs",
            "timeout": CODEX_CHROME_TIMEOUT_SECONDS,
        },
        {
            "id": "boss-agent",
            "label": "Boss Agent",
            "description": "通过本地 boss-agent-cli 只读搜索 Boss / 智联岗位。",
            "requiresAuth": True,
            "defaultCity": DEFAULT_JOB_SEARCH_CITY,
            "available": shutil.which("boss") is not None,
            "script": "scripts/research/boss-agent-radar.mjs",
            "timeout": COMMAND_TIMEOUT_SECONDS,
        },
        {
            "id": "china-crawler",
            "label": "中国平台爬虫",
            "description": "用 Playwright 只读访问 Boss、智联、猎聘、51Job 等搜索页。",
            "requiresAuth": False,
            "defaultCity": DEFAULT_JOB_SEARCH_CITY,
            "available": True,
            "script": "scripts/research/china-job-crawler.mjs",
            "timeout": COMMAND_TIMEOUT_SECONDS,
        },
        {
            "id": "portals",
            "label": "官网门户扫描",
            "description": "读取 workspace/profile/portals.yml 并扫描公司官网/ATS。",
            "requiresAuth": False,
            "available": False,
        },
    ]


def _provider_to_source(provider: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": provider["id"],
        "label": provider["label"],
        "description": provider["description"],
        "available": bool(provider["available"]),
        "requiresAuth": bool(provider["requiresAuth"]),
        **({"defaultCity": provider["defaultCity"]} if provider.get("defaultCity") else {}),
    }


def _normalize_request(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    try:
        max_jobs = int(payload.get("max") or DEFAULT_MAX)
    except (TypeError, ValueError):
        max_jobs = DEFAULT_MAX
    queries = payload.get("queries")
    if isinstance(queries, list) and queries:
        normalized_queries = [str(query).strip() for query in queries if str(query).strip()]
    else:
        normalized_queries = DEFAULT_JOB_SEARCH_QUERIES
    source = str(payload.get("source") or "all")
    if source not in {"codex-chrome", "boss-agent", "china-crawler", "portals", "all"}:
        source = "all"
    return {
        "source": source,
        "city": str(payload.get("city") or DEFAULT_JOB_SEARCH_CITY).strip() or DEFAULT_JOB_SEARCH_CITY,
        "queries": normalized_queries,
        "max": max(1, min(50, max_jobs)),
        "minMatchScore": _number(payload.get("minMatchScore"), 0),
        "withDetails": payload.get("withDetails") is not False,
        "dryRun": bool(payload.get("dryRun")),
    }


def _resolve_providers(source: str) -> list[dict[str, Any]]:
    providers = _provider_definitions()
    if source != "all":
        return [provider for provider in providers if provider["id"] == source]
    order = ["codex-chrome", "boss-agent", "china-crawler"]
    return [provider for provider_id in order for provider in providers if provider["id"] == provider_id and provider["available"]]


def _resolve_fallback_providers() -> list[dict[str, Any]]:
    providers = _provider_definitions()
    order = ["boss-agent", "china-crawler"]
    return [provider for provider_id in order for provider in providers if provider["id"] == provider_id and provider["available"]]


def _run_provider(workspace_root: Path, provider: dict[str, Any], request: dict[str, Any], run_id: str, started_at: str) -> dict[str, Any]:
    if provider["id"] == "portals":
        return _empty_result(run_id, provider["id"], started_at, "官网门户扫描还没有接入 jobsearch provider，请先使用其他可用来源。")
    if not provider.get("available"):
        return _empty_result(run_id, provider["id"], started_at, f"{provider['label']} 当前不可用。")
    script = _resolve_project_script(workspace_root, str(provider.get("script") or ""))
    if not script.exists():
        return _empty_result(run_id, provider["id"], started_at, f"{provider['label']} 脚本不存在：{provider.get('script')}")
    args = _script_args(script, provider["id"], request)
    output = _run_node(args, workspace_root, int(provider.get("timeout") or COMMAND_TIMEOUT_SECONDS))
    if not output["ok"]:
        return _empty_result(run_id, provider["id"], started_at, f"{provider['label']} 运行失败：{_trim_message(output['stderr'] or output['stdout'])}")
    envelope = _parse_json_envelope(output["stdout"])
    if not envelope:
        return _empty_result(run_id, provider["id"], started_at, f"{provider['label']} 没有返回可解析 JSON。")
    stats = envelope.get("stats") if isinstance(envelope.get("stats"), dict) else {}
    jobs = _normalize_jobs(envelope.get("discovered"))
    return {
        "runId": run_id,
        "source": provider["id"],
        "status": "failed" if envelope.get("ok") is False else "completed",
        "startedAt": started_at,
        "completedAt": _now_iso(),
        "added": _number(envelope.get("added"), len(jobs)),
        "candidatesSeen": _number(stats.get("candidatesSeen"), len(jobs)),
        "duplicatesSkipped": _number(stats.get("duplicatesSkipped"), 0),
        "failedQueries": _number(stats.get("failedQueries"), 1 if envelope.get("ok") is False else 0),
        "jobs": jobs,
        **({"message": _trim_message(envelope.get("reason") or envelope.get("message"))} if envelope.get("reason") or envelope.get("message") else {}),
    }


def _script_args(script: Path, provider_id: str, request: dict[str, Any]) -> list[str]:
    if provider_id == "china-crawler":
        args = [str(script), f"--max={request['max']}", f"--city={request['city']}"]
        if request["withDetails"]:
            args.append("--details")
        if request["dryRun"]:
            args.append("--dry-run")
        args.extend(f"--query={query}" for query in request["queries"])
        return args
    args = [str(script), "--max", str(request["max"]), "--city", str(request["city"])]
    if provider_id == "boss-agent" and request["withDetails"]:
        args.append("--details")
    if request["dryRun"]:
        args.append("--dry-run")
    for query in request["queries"]:
        args.extend(["--query", query])
    return args


def _run_node(args: list[str], cwd: Path, timeout_seconds: int) -> dict[str, Any]:
    node_bin = shutil.which("node") or "node"
    try:
        cwd.mkdir(parents=True, exist_ok=True)
        completed = subprocess.run(
            [node_bin, *args],
            cwd=str(cwd),
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as cause:
        return {"ok": False, "stdout": cause.stdout or "", "stderr": f"{cause.stderr or ''}\njobsearch command timed out".strip()}
    except OSError as cause:
        return {"ok": False, "stdout": "", "stderr": str(cause)}
    return {"ok": completed.returncode == 0, "stdout": completed.stdout, "stderr": completed.stderr}


def _resolve_project_script(workspace_root: Path, relative_path: str) -> Path:
    current = workspace_root.resolve()
    for parent in [current, *current.parents]:
        candidate = parent / relative_path
        if candidate.exists():
            return candidate
    return workspace_root / relative_path


def _parse_json_envelope(text: str) -> dict[str, Any] | None:
    trimmed = text.strip()
    if not trimmed:
        return None
    try:
        parsed = json.loads(trimmed)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        first = trimmed.find("{")
        last = trimmed.rfind("}")
        if first >= 0 and last > first:
            try:
                parsed = json.loads(trimmed[first:last + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def _combine_results(run_id: str, started_at: str, source: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return _empty_result(run_id, source, started_at, "没有可用的岗位搜索来源。")
    failed = [result for result in results if result["status"] == "failed"]
    return {
        "runId": run_id,
        "source": source,
        "status": "failed" if len(failed) == len(results) else "completed",
        "startedAt": started_at,
        "completedAt": _now_iso(),
        "added": sum(int(result.get("added") or 0) for result in results),
        "candidatesSeen": sum(int(result.get("candidatesSeen") or 0) for result in results),
        "duplicatesSkipped": sum(int(result.get("duplicatesSkipped") or 0) for result in results),
        "failedQueries": sum(int(result.get("failedQueries") or 0) for result in results),
        "jobs": [job for result in results for job in result.get("jobs", [])],
        **({"message": "；".join(result["message"] for result in failed if result.get("message"))} if failed else {}),
    }


def _empty_result(run_id: str, source: str, started_at: str, message: str) -> dict[str, Any]:
    return {
        "runId": run_id,
        "source": source,
        "status": "failed",
        "startedAt": started_at,
        "completedAt": _now_iso(),
        "added": 0,
        "candidatesSeen": 0,
        "duplicatesSkipped": 0,
        "failedQueries": 1,
        "jobs": [],
        "message": message,
    }


def _should_fallback_from_codex_chrome(result: dict[str, Any]) -> bool:
    return result["status"] == "failed" or (result["added"] == 0 and result["candidatesSeen"] == 0 and not result["jobs"])


def _normalize_jobs(value: Any) -> list[dict[str, Any]]:
    return [job for job in value if isinstance(job, dict)] if isinstance(value, list) else []


def _number(value: Any, fallback: int | float) -> Any:
    try:
        return type(fallback)(value)
    except (TypeError, ValueError):
        return fallback


def _trim_message(value: Any) -> str:
    return " ".join(str(value or "").split())[:1000]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
