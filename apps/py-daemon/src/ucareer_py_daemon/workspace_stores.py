from __future__ import annotations

import base64
import json
import mimetypes
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .workspace import read_text, resolve_inside, safe_child, workspace_data_path


@dataclass
class ProfileStore:
    workspace_root: Path

    def get_profile_overview(self) -> dict[str, Any]:
        cv = read_text(workspace_data_path(self.workspace_root, "profileCv"))
        profile = read_text(workspace_data_path(self.workspace_root, "profileYaml"))
        overlay = read_text(workspace_data_path(self.workspace_root, "profileOverlay"))
        return {
            "candidate": {
                "fullName": _yaml_scalar(profile, "full_name"),
                "email": _yaml_scalar(profile, "email"),
                "phone": _yaml_scalar(profile, "phone"),
                "location": _yaml_scalar(profile, "location"),
                "github": _yaml_scalar(profile, "github"),
            },
            "headline": _yaml_scalar(profile, "headline"),
            "targetRoles": _primary_roles(profile),
            "cvTitle": _markdown_title(cv),
            "cvMarkdown": cv,
            "profileYaml": profile,
            "profileOverlayMarkdown": overlay,
        }


@dataclass
class ApplicationStore:
    workspace_root: Path

    def list_applications(self) -> dict[str, Any]:
        tracker = read_text(workspace_data_path(self.workspace_root, "applications"))
        events = _read_jsonl(workspace_data_path(self.workspace_root, "applicationEvents"))
        applications = [_parse_application_row(line) for line in tracker.splitlines() if re.match(r"^\|\s*\d+", line)]
        merged = _merge_application_events([item for item in applications if item], events)
        return {"applications": merged, "metrics": _application_metrics(merged)}


@dataclass
class ReportStore:
    workspace_root: Path

    def list_reports(self) -> dict[str, Any]:
        reports_dir = workspace_data_path(self.workspace_root, "reports")
        reports = [_parse_report_summary(file.name, read_text(file)) for file in _markdown_files(reports_dir)]
        return {
            "reports": reports,
            "metrics": {
                "total": len(reports),
                "withScore": len([item for item in reports if item.get("score")]),
                "highLegitimacy": len([item for item in reports if re.match(r"^high\b", item.get("legitimacy", ""), re.I)]),
            },
        }

    def get_report(self, file: str) -> dict[str, Any] | None:
        if not _is_markdown_file(file):
            return None
        reports_dir = workspace_data_path(self.workspace_root, "reports")
        path = safe_child(reports_dir, file)
        if not path.exists() or not path.is_file():
            return None
        markdown = read_text(path)
        return {**_parse_report_summary(file, markdown), "markdown": markdown}


@dataclass
class ResumeStore:
    workspace_root: Path

    def list_resumes(self) -> list[dict[str, Any]]:
        resumes_dir = workspace_data_path(self.workspace_root, "resumeLibrary")
        links = _resume_links(workspace_data_path(self.workspace_root, "resumeJobLinks"))
        output: list[dict[str, Any]] = []
        for file in _markdown_files(resumes_dir):
            if file.name in {"README.md", "ARCHITECTURE.md"}:
                continue
            markdown = read_text(file)
            link = links.get(file.name, {})
            output.append({
                "file": file.name,
                "title": _markdown_title(markdown) or file.stem,
                "targetJobId": link.get("jobId", ""),
                "targetJobTitle": link.get("jobTitle", ""),
                "generatedAt": link.get("generatedAt", ""),
            })
        return output

    def get_resume(self, file: str) -> dict[str, Any] | None:
        if not _is_markdown_file(file) or file in {"README.md", "ARCHITECTURE.md"}:
            return None
        resumes_dir = workspace_data_path(self.workspace_root, "resumeLibrary")
        path = safe_child(resumes_dir, file)
        if not path.exists() or not path.is_file():
            return None
        markdown = read_text(path)
        return {"file": file, "title": _markdown_title(markdown) or Path(file).stem, "markdown": markdown}

    def list_diagnostics(self, resume_file: str = "") -> list[dict[str, Any]]:
        diagnostics_dir = workspace_data_path(self.workspace_root, "resumeDiagnostics")
        reports = [_parse_diagnosis_report(file.name, read_text(file)) for file in _markdown_files(diagnostics_dir)]
        if resume_file:
            reports = [item for item in reports if item.get("resumeFile") == resume_file or item["file"].startswith(Path(resume_file).stem)]
        return sorted(reports, key=lambda item: item.get("updatedAt", ""), reverse=True)


@dataclass
class ExperienceStore:
    workspace_root: Path

    def get_experience_overview(self) -> dict[str, Any]:
        metadata = _read_json(workspace_data_path(self.workspace_root, "experienceMetadata"), {"updatedAt": "", "experiences": []})
        experiences = [_hydrate_experience(self.workspace_root, item) for item in _normalize_experiences(metadata.get("experiences"))]
        return {
            "updatedAt": str(metadata.get("updatedAt") or ""),
            "files": _list_experience_files(workspace_data_path(self.workspace_root, "projectNotes")),
            "photos": _list_headshot_assets(
                resolve_inside(self.workspace_root, "workspace"),
                workspace_data_path(self.workspace_root, "headshots"),
            ),
            "intentions": _list_intention_assets(
                resolve_inside(self.workspace_root, "workspace"),
                workspace_data_path(self.workspace_root, "intentions"),
            ),
            "experiences": experiences,
        }


@dataclass
class MarketStore:
    workspace_root: Path

    def get_recruitment_market(self) -> dict[str, Any]:
        market_path = workspace_data_path(self.workspace_root, "recruitmentMarket")
        base = _read_json(market_path, {"updatedAt": "", "jobs": []})
        if not isinstance(base, dict):
            base = {"updatedAt": "", "jobs": []}
        chunk_jobs = _read_chunk_jobs(_resolve_jobs_dir(self.workspace_root, market_path, base.get("jobs_file")))
        legacy_jobs = base.get("jobs") if isinstance(base.get("jobs"), list) else []
        jobs = legacy_jobs if legacy_jobs else chunk_jobs
        return {**base, "jobs": jobs, "jobsCount": len(jobs)}


@dataclass
class EvidenceStore:
    workspace_root: Path

    def list_evidence_requests(self) -> dict[str, Any]:
        return _read_json(workspace_data_path(self.workspace_root, "evidenceRequests"), _empty_evidence_overview())

    def fulfill_evidence_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        request_id = str(payload.get("requestId") or "").strip()
        content = str(payload.get("content") or "").strip()
        if not request_id:
            raise ValueError("Evidence request id is required")
        if not content:
            raise ValueError("Evidence content is required")
        overview = self.list_evidence_requests()
        request = next((item for item in overview.get("requests", []) if item.get("id") == request_id), None)
        if not request:
            raise ValueError(f"Evidence request not found: {request_id}")
        target_file = str(request.get("targetFile") or "")
        if not re.match(r"^workspace/jobs/project-notes/[^/]+\.(md|txt)$", target_file, re.I):
            raise ValueError("Invalid evidence target file")
        target_path = resolve_inside(self.workspace_root, target_file)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        appended_at = _now_iso()
        markdown = "\n\n".join([
            "",
            f"## 证据补充 {request_id} - {appended_at}",
            f"来源：{str(payload.get('source') or 'Ucareer 复盘中心').strip()}",
            content,
            "",
        ])
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(markdown)
        return {"requestId": request_id, "targetFile": target_file, "appended": True, "appendedAt": appended_at}

    def save_evidence_note(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = str(payload.get("content") or "").strip()
        if not content:
            raise ValueError("Evidence note content is required")
        overview = self.list_evidence_requests()
        appended_at = _now_iso()
        note_id = f"note-{int(datetime.now(UTC).timestamp() * 1000):x}"
        title = (str(payload.get("title") or "") or _first_meaningful_line(content) or "复盘笔记").strip()[:80]
        target_file = "workspace/jobs/project-notes/evidence.md"
        target_path = resolve_inside(self.workspace_root, target_file)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        markdown = "\n\n".join(["", f"## {title} - {appended_at}", "来源：Ucareer 复盘中心", content, ""])
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(markdown)
        request = {
            "id": note_id,
            "priority": "low",
            "status": "fulfilled",
            "direction": title,
            "gap": content[:240],
            "marketSignal": "manual_review_note",
            "currentEvidence": content,
            "askHuman": [],
            "targetFile": target_file,
            "resumeImpact": "",
        }
        requests = [request, *[item for item in overview.get("requests", []) if isinstance(item, dict)]]
        _write_evidence_requests(workspace_data_path(self.workspace_root, "evidenceRequests"), {**overview, "requests": requests})
        return {"noteId": note_id, "targetFile": target_file, "appended": True, "appendedAt": appended_at}


def _yaml_scalar(text: str, key: str) -> str:
    match = re.search(rf"^\s*{re.escape(key)}:\s*(.+?)\s*$", text, re.M)
    if not match:
        return ""
    return match.group(1).strip().strip("\"'")


def _primary_roles(text: str) -> list[str]:
    match = re.search(r"^\s*primary:\s*\n([\s\S]*?)(?=^\s*[A-Za-z_]+:|\n\n|\Z)", text, re.M)
    if not match:
        return []
    roles = []
    for line in match.group(1).splitlines():
        item = re.match(r"^\s*-\s*(.+?)\s*$", line)
        if item:
            roles.append(item.group(1).strip().strip("\"'"))
    return [role for role in roles if role]


def _markdown_title(text: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.M)
    return match.group(1).strip() if match else ""


def _parse_application_row(line: str) -> dict[str, Any] | None:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    if len(cells) < 9:
        return None
    app_id = cells[0].lstrip("#").zfill(3)
    if not re.match(r"^\d{3,}$", app_id):
        return None
    report = cells[7]
    status = cells[5]
    return {
        "id": app_id,
        "date": cells[1],
        "company": cells[2],
        "role": cells[3],
        "score": _score(cells[4]),
        "scoreRaw": cells[4] or "-",
        "status": status,
        "statusKey": _status_key(status),
        "pdf": cells[6],
        "reportLabel": _link_label(report),
        "reportPath": _link_href(report),
        "notes": cells[8],
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for index, line in enumerate(read_text(path).splitlines()):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                value.setdefault("event_id", f"evt_{index}")
                rows.append(value)
        except json.JSONDecodeError:
            continue
    return rows


def _read_json(path: Path, fallback: Any) -> Any:
    try:
        text = read_text(path).strip()
        return json.loads(text) if text else fallback
    except json.JSONDecodeError:
        return fallback


def _write_evidence_requests(path: Path, overview: dict[str, Any]) -> None:
    requests = [item for item in overview.get("requests", []) if isinstance(item, dict)]
    next_overview = {
        **overview,
        "updatedAt": _now_iso(),
        "summary": {
            **(overview.get("summary") if isinstance(overview.get("summary"), dict) else {}),
            "open": len([item for item in requests if item.get("status") == "open"]),
            "highPriority": len([item for item in requests if item.get("priority") == "high"]),
        },
        "requests": requests,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(next_overview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _empty_evidence_overview() -> dict[str, Any]:
    return {"updatedAt": "", "summary": {"open": 0, "highPriority": 0}, "requests": []}


def _merge_application_events(applications: list[dict[str, Any]], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {item["id"]: dict(item) for item in applications}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        app_id = _normalize_progress_id(event.get("application_id"))
        if app_id:
            grouped.setdefault(app_id, []).append(event)
    for app_id, app_events in grouped.items():
        app_events.sort(key=lambda item: str(item.get("created_at") or item.get("date") or ""))
        latest = app_events[-1]
        existing = by_id.get(app_id, {})
        status_key = _event_status_key(str(latest.get("event") or "")) or existing.get("statusKey", "note")
        by_id[app_id] = {
            "id": app_id,
            "date": existing.get("date") or latest.get("date", ""),
            "company": existing.get("company") or latest.get("company", ""),
            "role": existing.get("role") or latest.get("role", ""),
            "score": existing.get("score", 0),
            "scoreRaw": existing.get("scoreRaw", "-"),
            "status": _event_status_label(status_key),
            "statusKey": status_key,
            "pdf": existing.get("pdf", "-"),
            "reportLabel": existing.get("reportLabel", ""),
            "reportPath": existing.get("reportPath", ""),
            "notes": latest.get("next_action") or latest.get("note") or existing.get("notes", ""),
            "eventCount": len(app_events),
            "latestEvent": latest,
            "events": app_events,
        }
    return sorted(by_id.values(), key=lambda item: item["id"])


def _application_metrics(applications: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "total": len(applications),
        "active": len([item for item in applications if item.get("statusKey") in {"applied", "responded", "interview", "offer"}]),
        "evaluated": _count_status(applications, "evaluated"),
        "applied": _count_status(applications, "applied"),
        "responded": _count_status(applications, "responded"),
        "interview": _count_status(applications, "interview"),
        "offer": _count_status(applications, "offer"),
        "rejected": _count_status(applications, "rejected"),
    }


def _parse_report_summary(file: str, markdown: str) -> dict[str, Any]:
    return {
        "file": file,
        "title": _markdown_title(markdown) or file.removesuffix(".md"),
        "date": _header(markdown, "Date"),
        "url": _header(markdown, "URL"),
        "score": _header(markdown, "Score") or _header(markdown, "评分"),
        "recommendation": _header(markdown, "Recommendation") or _header(markdown, "建议"),
        "legitimacy": _header(markdown, "Legitimacy"),
        "excerpt": _excerpt(markdown),
    }


def _parse_diagnosis_report(file: str, markdown: str) -> dict[str, Any]:
    return {
        "file": file,
        "title": _markdown_title(markdown) or file.removesuffix(".md"),
        "path": f"workspace/resumes/diagnostics/{file}",
        "resumeFile": _header(markdown, "Resume"),
        "targetJobId": _header(markdown, "Target Job"),
        "updatedAt": _header(markdown, "Generated At"),
        "excerpt": _excerpt(markdown),
        "markdown": markdown,
    }


def _resume_links(path: Path) -> dict[str, dict[str, Any]]:
    try:
        data = json.loads(read_text(path) or "{}")
    except json.JSONDecodeError:
        return {}
    links = data.get("links", []) if isinstance(data, dict) else []
    return {item.get("file"): item for item in links if isinstance(item, dict) and item.get("file")}


def _markdown_files(directory: Path) -> list[Path]:
    if not directory.exists() or not directory.is_dir():
        return []
    return sorted([item for item in directory.iterdir() if item.is_file() and _is_markdown_file(item.name)], key=lambda item: item.name)


def _text_files(directory: Path, rel: str, include_name=None) -> list[dict[str, Any]]:
    if not directory.exists() or not directory.is_dir():
        return []
    output: list[dict[str, Any]] = []
    for file in sorted(directory.iterdir(), key=lambda item: item.name):
        if not file.is_file() or not re.search(r"\.(md|txt)$", file.name, re.I):
            continue
        if include_name and not include_name(file.name):
            continue
        content = read_text(file)
        output.append({
            "name": file.name,
            "path": _normalize_relative_path(f"{rel}/{file.name}"),
            "title": _markdown_title(content) or re.sub(r"\.(md|txt)$", "", file.name, flags=re.I),
            "kind": file.suffix.replace(".", "").lower(),
            "updatedAt": _mtime_iso(file),
            "content": content,
        })
    return output


def _list_experience_files(project_notes_dir: Path) -> list[dict[str, Any]]:
    return _text_files(project_notes_dir, "workspace/jobs/project-notes")


def _list_intention_assets(workspace_assets_dir: Path, intentions_dir: Path) -> list[dict[str, Any]]:
    explicit = _text_files(intentions_dir, "workspace/profile/intentions")
    root_candidates = _text_files(workspace_assets_dir, "workspace", lambda name: bool(re.search(r"投递|偏好|意向|提示词|记忆导出", name, re.I)))
    return _dedupe_by_path([*explicit, *root_candidates])


def _list_headshot_assets(workspace_assets_dir: Path, headshots_dir: Path) -> list[dict[str, Any]]:
    photos: list[dict[str, Any]] = []
    for directory, rel in [(workspace_assets_dir, "workspace"), (headshots_dir, "workspace/profile/headshots")]:
        if not directory.exists() or not directory.is_dir():
            continue
        for file in sorted(directory.iterdir(), key=lambda item: item.name):
            if not file.is_file() or not re.search(r"\.(png|jpe?g|webp)$", file.name, re.I):
                continue
            kind = file.suffix.replace(".", "").lower()
            mime = mimetypes.types_map.get(file.suffix.lower()) or "image/png"
            photos.append({
                "name": file.name,
                "path": _normalize_relative_path(f"{rel}/{file.name}"),
                "title": re.sub(r"\.(png|jpe?g|webp)$", "", file.name, flags=re.I),
                "kind": kind,
                "updatedAt": _mtime_iso(file),
                "content": "",
                "dataUrl": f"data:{mime};base64,{base64.b64encode(file.read_bytes()).decode('ascii')}",
            })
    return _dedupe_by_path(photos)


def _normalize_experiences(value: Any) -> list[dict[str, Any]]:
    rows = value if isinstance(value, list) else []
    output: list[dict[str, Any]] = []
    for index, item in enumerate(rows):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        output.append({
            "id": re.sub(r"[^a-zA-Z0-9_-]", "-", str(item.get("id") or f"exp-{index + 1}")).strip("-") or f"exp-{index + 1}",
            "title": title,
            "category": str(item.get("category") or "").strip(),
            "role": str(item.get("role") or "").strip(),
            "sourceFile": _normalize_relative_path(str(item.get("sourceFile") or "")),
            "summary": str(item.get("summary") or "").strip(),
            "tags": _string_list(item.get("tags")),
            "evidence": _string_list(item.get("evidence")),
            "gaps": _string_list(item.get("gaps")),
            "publicLevel": str(item.get("publicLevel") or "").strip(),
        })
    return output


def _hydrate_experience(workspace_root: Path, item: dict[str, Any]) -> dict[str, Any]:
    source_file = str(item.get("sourceFile") or "")
    if not source_file:
        return {**item, "sourceContent": "", "sourceError": ""}
    try:
        if not re.match(r"^workspace/jobs/project-notes/[^/]+\.(md|txt)$", source_file, re.I):
            raise ValueError("Invalid source path")
        return {**item, "sourceContent": read_text(resolve_inside(workspace_root, source_file)), "sourceError": ""}
    except Exception as cause:
        return {**item, "sourceContent": "", "sourceError": str(cause)}


def _resolve_jobs_dir(workspace_root: Path, market_path: Path, jobs_file: Any) -> Path:
    candidate = ""
    if jobs_file:
        candidate = str(jobs_file)
        path = Path(candidate)
        if path.is_absolute():
            resolved = path.resolve()
            root = workspace_root.resolve()
            if resolved == root or root in resolved.parents:
                return resolved
        else:
            resolved = (market_path.parent / candidate).resolve()
            root = workspace_root.resolve()
            if resolved == root or root in resolved.parents:
                return resolved
    return Path(f"{market_path}.jobs.d")


def _read_chunk_jobs(jobs_dir: Path) -> list[dict[str, Any]]:
    if not jobs_dir.exists() or not jobs_dir.is_dir():
        return []
    jobs: list[dict[str, Any]] = []
    for file in sorted(jobs_dir.iterdir(), key=lambda item: item.name):
        if not file.is_file() or not re.match(r"^\d{4}\.json$", file.name):
            continue
        chunk = _read_json(file, [])
        if isinstance(chunk, list):
            jobs.extend([item for item in chunk if isinstance(item, dict)])
    return jobs


def _dedupe_by_path(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        path = str(item.get("path") or "")
        if path in seen:
            continue
        seen.add(path)
        output.append(item)
    return output


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or "").replace("\n", ",").split(",") if item.strip()]


def _normalize_relative_path(value: str) -> str:
    return re.sub(r"/+$", "", re.sub(r"/+", "/", str(value or "").replace("\\", "/").lstrip("/")))


def _mtime_iso(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, UTC).isoformat().replace("+00:00", "Z")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _first_meaningful_line(content: str) -> str:
    return next((line.strip() for line in content.splitlines() if line.strip()), "")


def _is_markdown_file(file: str) -> bool:
    return bool(re.match(r"^[^/\\]+\.md$", file)) and not file.startswith(".")


def _score(value: str) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)", value)
    return float(match.group(1)) if match else 0


def _status_key(status: str) -> str:
    return re.sub(r"\s+", "_", status.strip().lower())


def _event_status_key(event: str) -> str:
    mapping = {"applied": "applied", "responded": "responded", "interview": "interview", "offer": "offer", "rejected": "rejected"}
    return mapping.get(event.strip().lower(), "note")


def _event_status_label(key: str) -> str:
    labels = {"evaluated": "Evaluated", "applied": "Applied", "responded": "Responded", "interview": "Interview", "offer": "Offer", "rejected": "Rejected", "note": "Note"}
    return labels.get(key, key)


def _normalize_progress_id(value: Any) -> str:
    match = re.search(r"\d+", str(value or ""))
    return match.group(0).zfill(3) if match else ""


def _count_status(applications: list[dict[str, Any]], status: str) -> int:
    return len([item for item in applications if item.get("statusKey") == status])


def _link_label(value: str) -> str:
    match = re.search(r"\[([^\]]+)\]", value)
    return match.group(1) if match else ""


def _link_href(value: str) -> str:
    match = re.search(r"\]\(([^)]+)\)", value)
    return match.group(1) if match else ""


def _header(markdown: str, label: str) -> str:
    match = re.search(rf"^\*\*{re.escape(label)}:\*\*\s*(.+?)\s*$", markdown, re.I | re.M)
    return match.group(1).strip() if match else ""


def _excerpt(markdown: str) -> str:
    text = re.sub(r"^#.+$", "", markdown, flags=re.M)
    text = re.sub(r"^\*\*.+?\*\*.*$", "", text, flags=re.M)
    text = re.sub(r"^#+\s+", "", text, flags=re.M)
    return " ".join(line.strip() for line in text.splitlines() if line.strip())[:260]
