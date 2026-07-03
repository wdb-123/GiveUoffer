from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .workspace import read_text, safe_child, workspace_data_path


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

