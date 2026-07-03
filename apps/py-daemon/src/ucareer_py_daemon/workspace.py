from __future__ import annotations

from pathlib import Path

DATA_PATHS: dict[str, str] = {
    "applications": "workspace/ops/data/applications.md",
    "applicationEvents": "workspace/ops/data/application-events.jsonl",
    "applicationEmailSnapshots": "workspace/ops/data/application-email-snapshots.jsonl",
    "evidenceRequests": "workspace/ops/data/evidence-requests.json",
    "experienceMetadata": "workspace/ops/data/experience-metadata.json",
    "headshots": "workspace/profile/headshots",
    "intentions": "workspace/profile/intentions",
    "jobDescriptions": "workspace/jobs/jds",
    "profileCv": "workspace/profile/cv.md",
    "profileOverlay": "workspace/profile/_profile.md",
    "profileYaml": "workspace/profile/profile.yml",
    "projectNotes": "workspace/jobs/project-notes",
    "recruitmentMarket": "workspace/ops/data/recruitment-market.json",
    "reports": "workspace/jobs/reports",
    "resumeDiagnostics": "workspace/resumes/diagnostics",
    "resumeJobLinks": "workspace/ops/data/resume-job-links.json",
    "resumeLibrary": "workspace/resumes/library",
}


def tenant_workspace_root(project_root: Path, tenant_id: str) -> Path:
    clean = str(tenant_id or "").strip()
    if not clean.replace("_", "").replace("-", "").isalnum():
        raise ValueError("Invalid tenant id")
    return resolve_inside(project_root, f"workspace/tenants/{clean}")


def workspace_data_path(root: Path, key: str) -> Path:
    relative = DATA_PATHS[key]
    return resolve_inside(root, relative)


def resolve_inside(root: Path, relative: str) -> Path:
    base = root.resolve()
    target = (base / relative).resolve()
    if target != base and base not in target.parents:
        raise ValueError(f"Invalid workspace path: {relative}")
    return target


def safe_child(root: Path, name: str) -> Path:
    if "/" in name or "\\" in name or name.startswith("."):
        raise ValueError("Invalid file name")
    return resolve_inside(root, name)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
