from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .workspace import resolve_inside


MEMORY_REGISTRY: list[dict[str, Any]] = [
    {
        "id": "profile.cv",
        "kind": "user_profile",
        "scope": "long_term",
        "label": "Canonical CV",
        "description": "User-maintained source CV and career baseline.",
        "owner": "workspace",
        "readPaths": ["workspace/profile/cv.md"],
        "writePaths": ["workspace/profile/cv.md"],
    },
    {
        "id": "profile.preferences",
        "kind": "preference",
        "scope": "long_term",
        "label": "Profile Preferences",
        "description": "Personalized targeting, deal-breakers, scoring preferences and narrative overlays.",
        "owner": "workspace",
        "readPaths": ["workspace/profile/profile.yml", "workspace/profile/_profile.md"],
        "writePaths": ["workspace/profile/profile.yml", "workspace/profile/_profile.md"],
    },
    {
        "id": "profile.evidence_digest",
        "kind": "career_evidence",
        "scope": "long_term",
        "label": "Evidence Digest",
        "description": "Reusable proof points and portfolio/article evidence.",
        "owner": "workspace",
        "readPaths": ["workspace/profile/article-digest.md", "workspace/jobs/project-notes"],
        "writePaths": ["workspace/profile/article-digest.md", "workspace/jobs/project-notes"],
    },
    {
        "id": "applications.history",
        "kind": "application_history",
        "scope": "long_term",
        "label": "Application History",
        "description": "Application tracker and event timeline.",
        "owner": "workspace",
        "readPaths": ["workspace/ops/data/applications.md", "workspace/ops/data/application-events.jsonl", "workspace/ops/data/follow-ups.md"],
        "writePaths": ["workspace/ops/data/applications.md", "workspace/ops/data/application-events.jsonl", "workspace/ops/data/follow-ups.md"],
    },
    {
        "id": "jobs.reports",
        "kind": "job_report",
        "scope": "long_term",
        "label": "Job Reports",
        "description": "Historical job evaluations, risks and fit judgments.",
        "owner": "workspace",
        "readPaths": ["workspace/jobs/reports", "workspace/jobs/jds"],
        "writePaths": ["workspace/jobs/reports", "workspace/jobs/jds"],
    },
    {
        "id": "resumes.library",
        "kind": "resume_version",
        "scope": "long_term",
        "label": "Resume Library",
        "description": "Generated and curated resume versions plus diagnostics.",
        "owner": "workspace",
        "readPaths": ["workspace/resumes/library", "workspace/resumes/diagnostics"],
        "writePaths": ["workspace/resumes/library", "workspace/resumes/diagnostics"],
    },
    {
        "id": "runtime.workflow_traces",
        "kind": "workflow_trace",
        "scope": "working",
        "label": "Workflow Traces",
        "description": "Local task, approval and workflow run state stored in the daemon database.",
        "owner": "sqlite",
        "readPaths": [".ucareer/daemon.sqlite"],
    },
]


def get_memory_snapshot(tenant_root: Path, daemon_db_path: Path) -> dict[str, Any]:
    items = []
    for source in MEMORY_REGISTRY:
        read_paths = source["readPaths"]
        available_count = sum(1 for path in read_paths if _source_path_exists(tenant_root, daemon_db_path, str(path)))
        items.append({
            **source,
            "available": available_count > 0,
            "summary": f"{available_count}/{len(read_paths)} source path(s) available",
        })
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "items": items,
    }


def _source_path_exists(tenant_root: Path, daemon_db_path: Path, relative_path: str) -> bool:
    if relative_path == ".ucareer/daemon.sqlite":
        return daemon_db_path.exists()
    try:
        return resolve_inside(tenant_root, relative_path).exists()
    except ValueError:
        return False
