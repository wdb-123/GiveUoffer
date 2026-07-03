from __future__ import annotations

import base64
import json
import mimetypes
import random
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

from .workspace import read_text, resolve_inside, safe_child, workspace_data_path

MAX_PREVIEW_BYTES = 128 * 1024
MAX_PDF_PREVIEW_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PREVIEW_BYTES = 12 * 1024 * 1024
IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
TEXT_EXTENSIONS = {
    ".md",
    ".txt",
    ".json",
    ".jsonl",
    ".yml",
    ".yaml",
    ".tsv",
    ".csv",
    ".log",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".css",
    ".html",
    ".xml",
    ".sh",
    ".zsh",
    ".py",
    ".rb",
    ".java",
    ".go",
    ".rs",
    ".sql",
}


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
class WorkspaceFileStore:
    workspace_root: Path

    def get_file_preview(self, input_path: str) -> dict[str, Any] | None:
        resolved = _resolve_workspace_preview_path(self.workspace_root, input_path)
        if not resolved or not resolved.is_file():
            return None

        size_bytes = resolved.stat().st_size
        extension = resolved.suffix.lower()
        relative_path = str(resolved.resolve().relative_to(self.workspace_root.resolve()))
        base = {
            "path": str(resolved.resolve()),
            "relativePath": relative_path,
            "fileName": resolved.name,
            "sizeBytes": size_bytes,
            "updatedAt": datetime.fromtimestamp(resolved.stat().st_mtime, tz=UTC).isoformat().replace("+00:00", "Z"),
            "languageHint": extension.lstrip(".") or "text",
        }

        image_mime_type = IMAGE_MIME_TYPES.get(extension)
        if image_mime_type:
            if size_bytes > MAX_IMAGE_PREVIEW_BYTES:
                return {
                    **base,
                    "content": "图片文件过大，暂不在侧栏内嵌预览。",
                    "previewType": "unsupported",
                    "truncated": False,
                    "encoding": "binary",
                }
            return {
                **base,
                "content": "",
                "previewType": "image",
                "truncated": False,
                "encoding": "binary",
                "dataUrl": f"data:{image_mime_type};base64,{base64.b64encode(resolved.read_bytes()).decode('ascii')}",
            }

        if extension == ".pdf":
            if size_bytes > MAX_PDF_PREVIEW_BYTES:
                return {
                    **base,
                    "content": "PDF 文件过大，暂不在侧栏内嵌预览。",
                    "previewType": "unsupported",
                    "truncated": False,
                    "encoding": "binary",
                }
            return {
                **base,
                "content": "",
                "previewType": "pdf",
                "truncated": False,
                "encoding": "binary",
                "dataUrl": f"data:application/pdf;base64,{base64.b64encode(resolved.read_bytes()).decode('ascii')}",
            }

        if extension == ".docx":
            return {
                **base,
                "content": "DOCX 预览暂未在 Python 后端启用，请导出为 PDF 后预览。",
                "previewType": "unsupported",
                "truncated": False,
                "encoding": "binary",
            }

        if extension not in TEXT_EXTENSIONS:
            return {
                **base,
                "content": "This file preview is unavailable because the file is not recognized as a text document.",
                "previewType": "unsupported",
                "truncated": False,
                "encoding": "binary",
            }

        content = resolved.read_bytes()
        truncated = len(content) > MAX_PREVIEW_BYTES
        return {
            **base,
            "content": content[:MAX_PREVIEW_BYTES].decode("utf-8", errors="replace"),
            "previewType": "text",
            "truncated": truncated,
            "encoding": "utf8",
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

    def create_application_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        tracker = read_text(workspace_data_path(self.workspace_root, "applications"))
        applications = [item for item in (_parse_application_row(line) for line in tracker.splitlines() if re.match(r"^\|\s*\d+", line)) if item]
        events_path = workspace_data_path(self.workspace_root, "applicationEvents")
        existing_events = _read_jsonl(events_path)
        event = _normalize_application_event(payload, existing_events, applications)
        duplicate = _find_duplicate_application_event(event, existing_events)
        if duplicate:
            return duplicate
        _write_application_email_snapshot(workspace_data_path(self.workspace_root, "applicationEmailSnapshots"), event)
        events_path.parent.mkdir(parents=True, exist_ok=True)
        with events_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
        return event

    def update_application_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        event_id = str(payload.get("event_id") or payload.get("eventId") or "").strip()
        if not event_id:
            raise ValueError("Missing event_id")
        events_path = workspace_data_path(self.workspace_root, "applicationEvents")
        events = _read_jsonl(events_path)
        index = next((idx for idx, event in enumerate(events) if event.get("event_id") == event_id), -1)
        if index < 0:
            raise ValueError("Application event not found")
        updated = _normalize_updated_application_event(events[index], payload)
        if payload.get("email_snapshot") or payload.get("emailSnapshot"):
            _write_application_email_snapshot(workspace_data_path(self.workspace_root, "applicationEmailSnapshots"), updated)
        events[index] = updated
        _write_application_events(events_path, events)
        return updated

    def delete_application_event(self, payload: dict[str, Any]) -> str:
        event_id = str(payload.get("event_id") or payload.get("eventId") or "").strip()
        if not event_id:
            raise ValueError("Missing event_id")
        events_path = workspace_data_path(self.workspace_root, "applicationEvents")
        events = _read_jsonl(events_path)
        filtered = [event for event in events if event.get("event_id") != event_id]
        if len(filtered) == len(events):
            raise ValueError("Application event not found")
        _write_application_events(events_path, filtered)
        return event_id


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

    def generate_preview(self, payload: dict[str, Any], jobs: list[dict[str, Any]]) -> dict[str, Any]:
        requested_base = str(payload.get("baseFile") or "").strip()
        base_file = requested_base if _is_resume_markdown_file(requested_base) else (self.list_resumes()[0]["file"] if self.list_resumes() else "")
        if not base_file:
            raise ValueError("No base resume found")
        base = self.get_resume(base_file)
        if not base:
            raise ValueError(f"Base resume not found: {base_file}")
        target_job_id = str(payload.get("targetJobId") or "").strip()
        target_job = next((job for job in jobs if str(job.get("id") or "") == target_job_id), None) if target_job_id else None
        if target_job is None and jobs:
            target_job = jobs[0]
        title = _generated_resume_title(str(base.get("title") or ""), target_job)
        target_job_title = " · ".join([str(target_job.get("company") or ""), str(target_job.get("role") or "")]).strip(" ·") if target_job else ""
        return {
            "title": title,
            "markdown": _build_resume_preview_markdown(title, str(base.get("markdown") or ""), target_job),
            "baseFile": base_file,
            "targetJobId": str(target_job.get("id") or "") if target_job else "",
            "targetJobTitle": target_job_title,
            "engine": "local-preview",
        }

    def save_generated_resume(self, payload: dict[str, Any]) -> dict[str, Any]:
        title = str(payload.get("title") or "").strip() or _markdown_title(str(payload.get("markdown") or "")) or "generated-resume"
        markdown = _normalize_resume_markdown(title, str(payload.get("markdown") or ""))
        resumes_dir = workspace_data_path(self.workspace_root, "resumeLibrary")
        resumes_dir.mkdir(parents=True, exist_ok=True)
        existing = [item["file"] for item in self.list_resumes()]
        target_job_title = str(payload.get("targetJobTitle") or "").strip()
        file = _next_readable_resume_file(title, target_job_title, existing)
        (resumes_dir / file).write_text(markdown, encoding="utf-8")
        generated_at = _now_iso()
        company, role = _split_target_job_title(target_job_title)
        _upsert_resume_job_link(workspace_data_path(self.workspace_root, "resumeJobLinks"), {
            "file": file,
            "title": title,
            "baseFile": str(payload.get("baseFile") or ""),
            "jobId": str(payload.get("targetJobId") or ""),
            "jobTitle": target_job_title,
            "company": company,
            "role": role,
            "generatedAt": generated_at,
            "engine": "local-preview",
        })
        return {
            "file": file,
            "title": title,
            "baseFile": str(payload.get("baseFile") or ""),
            "targetJobId": str(payload.get("targetJobId") or ""),
            "targetJobTitle": target_job_title,
            "generatedAt": generated_at,
        }

    def save_resume(self, payload: dict[str, Any]) -> dict[str, Any]:
        title = str(payload.get("title") or "").strip() or _markdown_title(str(payload.get("markdown") or "")) or "generated-resume"
        markdown = _normalize_resume_markdown(title, str(payload.get("markdown") or ""))
        resumes_dir = workspace_data_path(self.workspace_root, "resumeLibrary")
        existing = [item["file"] for item in self.list_resumes()]
        target_job_title = str(payload.get("targetJobTitle") or "").strip()
        requested_file = str(payload.get("file") or "").strip()
        file = requested_file if _is_resume_markdown_file(requested_file) else _next_readable_resume_file(title, target_job_title, existing)
        path = safe_child(resumes_dir, file)
        resumes_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(markdown, encoding="utf-8")
        if payload.get("targetJobId") or target_job_title or payload.get("baseFile"):
            company, role = _split_target_job_title(target_job_title)
            _upsert_resume_job_link(workspace_data_path(self.workspace_root, "resumeJobLinks"), {
                "file": file,
                "title": title,
                "baseFile": str(payload.get("baseFile") or ""),
                "jobId": str(payload.get("targetJobId") or ""),
                "jobTitle": target_job_title,
                "company": company,
                "role": role,
                "generatedAt": _now_iso(),
                "engine": "agent-tool",
            })
        return {"file": file, "title": title, "markdown": markdown}

    def save_diagnosis(self, payload: dict[str, Any]) -> dict[str, Any]:
        title = str(payload.get("title") or "").strip() or "简历诊断报告"
        markdown = _normalize_diagnosis_markdown(
            title,
            str(payload.get("markdown") or ""),
            str(payload.get("resumeFile") or ""),
            str(payload.get("targetJobId") or ""),
        )
        requested_file = str(payload.get("file") or "").strip()
        file = requested_file if _is_diagnosis_markdown_file(requested_file) else _diagnosis_file_name(title, str(payload.get("resumeFile") or ""))
        diagnostics_dir = workspace_data_path(self.workspace_root, "resumeDiagnostics")
        path = safe_child(diagnostics_dir, file)
        diagnostics_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(markdown, encoding="utf-8")
        return {
            "file": file,
            "title": title,
            "path": f"workspace/resumes/diagnostics/{file}",
            "resumeFile": str(payload.get("resumeFile") or ""),
            "targetJobId": str(payload.get("targetJobId") or ""),
            "updatedAt": _now_iso(),
        }

    def delete_resume(self, file: str) -> str:
        if not _is_resume_markdown_file(file):
            raise ValueError("Invalid resume file")
        resumes_dir = workspace_data_path(self.workspace_root, "resumeLibrary")
        path = safe_child(resumes_dir, file)
        if not path.exists() or not path.is_file():
            raise ValueError(f"Resume not found: {file}")
        path.unlink()
        _remove_resume_job_link(workspace_data_path(self.workspace_root, "resumeJobLinks"), file)
        return file


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

    def save_experience_metadata(self, payload: dict[str, Any]) -> dict[str, Any]:
        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        next_metadata = {
            "updatedAt": _now_iso(),
            "experiences": _normalize_experiences(metadata.get("experiences") if isinstance(metadata, dict) else []),
        }
        path = workspace_data_path(self.workspace_root, "experienceMetadata")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(next_metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return self.get_experience_overview()

    def delete_experience(self, experience_id: str) -> str:
        clean = str(experience_id or "").strip()
        if not clean:
            raise ValueError("Missing experience id")
        overview = self.get_experience_overview()
        existing = [_without_experience_content(item) for item in overview.get("experiences", []) if isinstance(item, dict)]
        next_items = [item for item in existing if item.get("id") != clean]
        if len(next_items) == len(existing):
            raise ValueError(f"Experience not found: {clean}")
        self.save_experience_metadata({"metadata": {"experiences": next_items}})
        return clean


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

    def record_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = str(payload.get("url") or "").strip()
        if not url:
            raise ValueError("请提供要记录的链接")
        normalized_url = _normalize_url(url)
        if not normalized_url:
            raise ValueError("链接格式不正确")
        pipeline_path = resolve_inside(self.workspace_root, "workspace/ops/data/pipeline.md")
        current = read_text(pipeline_path)
        existing_urls = [_normalize_url(item) for item in re.findall(r"https?://[^\s|)>\]]+", current)]
        if normalized_url in existing_urls:
            return {
                "url": url,
                "recorded": False,
                "pipelinePath": "workspace/ops/data/pipeline.md",
                "message": "链接已存在于待处理列表，没有重复记录。",
            }
        source = _sanitize_pipeline_field(str(payload.get("source") or "agent_link"))
        note = _sanitize_pipeline_field(str(payload.get("note") or "用户粘贴链接，仅记录，等待后续处理"))
        _write_pipeline_pending_line(pipeline_path, current, f"- [ ] {url} | {source} | {note}")
        return {
            "url": url,
            "recorded": True,
            "pipelinePath": "workspace/ops/data/pipeline.md",
            "message": "已记录到待处理链接列表。",
        }

    def import_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = str(payload.get("url") or "").strip()
        description = str(payload.get("description") or payload.get("rawText") or "").strip()
        if not url and not description:
            raise ValueError("请粘贴岗位链接或岗位描述")
        if _is_boss_list_summary(description, url):
            raise ValueError("当前内容是 Boss 列表/首页摘要。请打开具体岗位详情页后再导入。")
        if url and not description:
            raise ValueError("没有读取到岗位页面正文，已停止导入以避免生成待解析占位岗位。请打开可见岗位详情页后重试，或粘贴完整 JD 文本。")

        market_path = workspace_data_path(self.workspace_root, "recruitmentMarket")
        market = self.get_recruitment_market()
        jobs = [job for job in market.get("jobs", []) if isinstance(job, dict)]
        now = _local_date()
        normalized_url = _normalize_url(url)
        existing_index = next((index for index, job in enumerate(jobs) if normalized_url and _normalize_url(str(job.get("url") or "")) == normalized_url), -1)
        if existing_index >= 0:
            current = jobs[existing_index]
            parsed = _parse_job_text(description, url) if description else {}
            jd_path = current.get("jdPath")
            if description and not jd_path:
                jd_path = _write_job_description_file(self.workspace_root, {
                    "description": description,
                    "id": str(current.get("id") or "MJ-001"),
                    "source": str(current.get("source") or payload.get("source") or "手工导入"),
                    "url": str(current.get("url") or url),
                    "company": str(current.get("company") or parsed.get("company") or ""),
                    "role": str(current.get("role") or parsed.get("role") or ""),
                    "salary": str(current.get("salary") or parsed.get("salary") or ""),
                })
            updated = {
                **current,
                "source": str(current.get("source") or payload.get("source") or "手工导入"),
                "importedAt": str(current.get("importedAt") or now),
                "updatedAt": now,
            }
            if jd_path:
                updated["jdPath"] = jd_path
            jobs[existing_index] = updated
            updated_market = _write_recruitment_market(market_path, {**market, "jobs": jobs, "updatedAt": now})
            return {"job": updated, "imported": False, "marketUpdatedAt": updated_market["updatedAt"]}

        parsed = _parse_job_text(description, url)
        job_id = _next_market_job_id(jobs)
        jd_path = _write_job_description_file(self.workspace_root, {
            "description": description,
            "id": job_id,
            "source": str(payload.get("source") or "手工导入"),
            "url": url,
            "company": str(parsed.get("company") or ""),
            "role": str(parsed.get("role") or ""),
            "salary": str(parsed.get("salary") or ""),
        }) if description else ""
        job = {
            "id": job_id,
            "role": str(parsed.get("role") or "待解析岗位"),
            "salary": str(parsed.get("salary") or "待复核"),
            "source": str(payload.get("source") or "手工导入"),
            "direction": str(parsed.get("direction") or "待复核"),
            "keywords": parsed.get("keywords") or [],
            "fitReason": str(parsed.get("fitReason") or ("手工粘贴链接导入，等待解析 JD。" if url else "手工粘贴岗位描述导入，等待解析 JD。")),
            "evidenceGap": str(parsed.get("evidenceGap") or "需要复核职责、薪资、年限和真实匹配度。"),
            "importedAt": now,
            "updatedAt": now,
        }
        for key in ["company", "location", "platform"]:
            if parsed.get(key):
                job[key] = parsed[key]
        if url:
            job["url"] = url
        if jd_path:
            job["jdPath"] = jd_path
        jobs.insert(0, job)
        updated_market = _write_recruitment_market(market_path, {**market, "jobs": jobs, "updatedAt": now})
        return {"job": job, "imported": True, "marketUpdatedAt": updated_market["updatedAt"]}

    def delete_job(self, job_id: str) -> str:
        clean = str(job_id or "").strip()
        if not clean:
            raise ValueError("Missing job id")
        market_path = workspace_data_path(self.workspace_root, "recruitmentMarket")
        market = self.get_recruitment_market()
        jobs = [job for job in market.get("jobs", []) if isinstance(job, dict)]
        next_jobs = [job for job in jobs if job.get("id") != clean]
        if len(next_jobs) == len(jobs):
            raise ValueError(f"Job not found: {clean}")
        _write_recruitment_market(market_path, {**market, "jobs": next_jobs, "updatedAt": _local_date()})
        return clean

    def update_job(self, job_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        clean = str(job_id or "").strip()
        if not clean:
            raise ValueError("Missing job id")
        market_path = workspace_data_path(self.workspace_root, "recruitmentMarket")
        market = self.get_recruitment_market()
        jobs = [job for job in market.get("jobs", []) if isinstance(job, dict)]
        index = next((idx for idx, job in enumerate(jobs) if job.get("id") == clean), -1)
        if index < 0:
            raise ValueError(f"Job not found: {clean}")
        updated = _normalize_market_job_patch(jobs[index], patch, _local_date())
        jobs[index] = updated
        _write_recruitment_market(market_path, {**market, "jobs": jobs, "updatedAt": updated["updatedAt"]})
        return updated


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

    def upsert_evidence_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        overview = self.list_evidence_requests()
        request = _normalize_evidence_request(payload)
        requests = [item for item in overview.get("requests", []) if isinstance(item, dict) and item.get("id") != request["id"]]
        requests.append(request)
        _write_evidence_requests(workspace_data_path(self.workspace_root, "evidenceRequests"), {**overview, "requests": requests})
        return request

    def delete_evidence_request(self, request_id: str) -> str:
        clean = str(request_id or "").strip()
        if not clean:
            raise ValueError("Missing evidence request id")
        overview = self.list_evidence_requests()
        requests = [item for item in overview.get("requests", []) if isinstance(item, dict) and item.get("id") != clean]
        if len(requests) == len([item for item in overview.get("requests", []) if isinstance(item, dict)]):
            raise ValueError(f"Evidence request not found: {clean}")
        _write_evidence_requests(workspace_data_path(self.workspace_root, "evidenceRequests"), {**overview, "requests": requests})
        return clean


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


def _write_application_events(path: Path, events: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(json.dumps(event, ensure_ascii=False, separators=(",", ":")) for event in events)
    path.write_text(f"{content}\n" if content else "", encoding="utf-8")


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


def _normalize_application_event(payload: dict[str, Any], existing_events: list[dict[str, Any]], applications: list[dict[str, Any]]) -> dict[str, Any]:
    event = str(payload.get("event") or "").strip().lower()
    if event not in _allowed_application_events():
        raise ValueError("Invalid application event")
    due = str(payload.get("due") or "").strip()
    if due and not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
        raise ValueError("Invalid due date")
    groups = _group_events(existing_events)
    company_input = str(payload.get("company") or payload.get("companyHint") or "").strip()
    role_input = str(payload.get("role") or payload.get("roleHint") or "").strip()
    matched_application_id = _find_existing_application_id(company_input, role_input, existing_events, applications)
    application_id = matched_application_id or _normalize_progress_id(payload.get("application_id") or payload.get("applicationId")) or _next_progress_id(groups, applications)
    latest_existing = groups.get(application_id, [])[-1] if groups.get(application_id) else {}
    company = str(company_input or latest_existing.get("company") or "").strip()
    role = str(role_input or latest_existing.get("role") or "").strip()
    if not company or not role:
        raise ValueError("Missing company or role")
    now = _now_iso()
    result = {
        "event_id": f"evt_{int(datetime.now(UTC).timestamp() * 1000):x}_{random.randint(0, 36**6 - 1):06x}",
        "date": str(payload.get("date") or _today_china()).strip(),
        "application_id": application_id,
        "company": company,
        "role": role,
        "event": event,
        "source": str(payload.get("source") or "manual_import").strip(),
        "next_action": str(payload.get("next_action") or payload.get("nextAction") or "").strip(),
        "due": due,
        "note": str(payload.get("note") or "").strip()[:500],
        "evidence": str(payload.get("evidence") or "").strip()[:500],
        "created_at": now,
    }
    snapshot = payload.get("email_snapshot") or payload.get("emailSnapshot")
    if snapshot:
        result["email_snapshot"] = _normalize_application_email_snapshot(snapshot)
    return result


def _normalize_updated_application_event(current: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    event = str(payload.get("event", current.get("event") or "")).strip().lower()
    if event not in _allowed_application_events():
        raise ValueError("Invalid application event")
    due = str(payload.get("due", current.get("due") or "")).strip()
    if due and not re.match(r"^\d{4}-\d{2}-\d{2}$", due):
        raise ValueError("Invalid due date")
    company = str(payload.get("company", current.get("company") or "")).strip()
    role = str(payload.get("role", current.get("role") or "")).strip()
    if not company or not role:
        raise ValueError("Missing company or role")
    updated = {
        **current,
        "company": company,
        "role": role,
        "event": event,
        "source": str(payload.get("source", current.get("source") or "manual_import")).strip(),
        "next_action": str(payload.get("next_action") or payload.get("nextAction") or current.get("next_action") or "").strip(),
        "due": due,
        "note": str(payload.get("note", current.get("note") or "")).strip()[:500],
        "evidence": str(payload.get("evidence", current.get("evidence") or "")).strip()[:500],
        "updated_at": _now_iso(),
    }
    snapshot = payload.get("email_snapshot") or payload.get("emailSnapshot")
    if snapshot:
        updated["email_snapshot"] = _normalize_application_email_snapshot(snapshot)
    return updated


def _normalize_application_email_snapshot(value: Any) -> dict[str, Any]:
    snapshot = value if isinstance(value, dict) else {}
    attachments = snapshot.get("attachments") if isinstance(snapshot.get("attachments"), list) else []
    return {
        "uid": str(snapshot.get("uid") or "").strip(),
        "mailbox": str(snapshot.get("mailbox") or "").strip(),
        "account": str(snapshot.get("account") or "").strip(),
        "from": str(snapshot.get("from") or "").strip(),
        "subject": str(snapshot.get("subject") or "").strip(),
        "date": str(snapshot.get("date") or "").strip(),
        "snippet": str(snapshot.get("snippet") or "").strip()[:4000],
        "rawText": str(snapshot.get("rawText") or "").strip()[:12000],
        "attachments": [
            {
                "filename": str(item.get("filename") or "").strip(),
                "contentType": str(item.get("contentType") or "").strip(),
                "size": int(float(item.get("size") or 0)) if str(item.get("size") or "").replace(".", "", 1).isdigit() else 0,
                "path": str(item.get("path") or "").strip(),
            }
            for item in attachments
            if isinstance(item, dict) and str(item.get("filename") or "").strip()
        ],
    }


def _write_application_email_snapshot(path: Path, event: dict[str, Any]) -> None:
    snapshot = event.get("email_snapshot")
    if not isinstance(snapshot, dict):
        return
    raw_text = snapshot.get("rawText") or ""
    snippet = snapshot.get("snippet") or ""
    compact = {key: value for key, value in snapshot.items() if key not in {"rawText", "snippet"}}
    record = {
        "snapshot_id": f"mail_{event['event_id']}",
        "event_id": event["event_id"],
        "application_id": event["application_id"],
        "company": event["company"],
        "role": event["role"],
        "event": event["event"],
        "captured_at": event["created_at"],
        **compact,
        "snippet": snippet,
        "rawText": raw_text,
    }
    event["email_snapshot"] = {
        **compact,
        "snippet": snippet[:500] if snippet else "",
        "rawText": raw_text or snippet or f"workspace/ops/data/application-email-snapshots.jsonl#mail_{event['event_id']}",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def _find_duplicate_application_event(event: dict[str, Any], existing_events: list[dict[str, Any]]) -> dict[str, Any] | None:
    company_key = _match_key(str(event.get("company") or ""))
    role_key = _match_key(str(event.get("role") or ""))
    evidence_key = _event_evidence_key(str(event.get("evidence") or event.get("note") or event.get("next_action") or ""))
    for existing in existing_events:
        if (
            _normalize_progress_id(existing.get("application_id")) == _normalize_progress_id(event.get("application_id"))
            and _match_key(str(existing.get("company") or "")) == company_key
            and _match_key(str(existing.get("role") or "")) == role_key
            and existing.get("event") == event.get("event")
            and existing.get("date") == event.get("date")
            and _event_evidence_key(str(existing.get("evidence") or existing.get("note") or existing.get("next_action") or "")) == evidence_key
        ):
            return existing
    return None


def _find_existing_application_id(company: str, role: str, events: list[dict[str, Any]], applications: list[dict[str, Any]]) -> str:
    company_key = _match_key(company)
    role_key = _match_key(role)
    if not company_key or not role_key:
        return ""
    for event in reversed(events):
        if _match_key(str(event.get("company") or "")) == company_key and _match_key(str(event.get("role") or "")) == role_key:
            return _normalize_progress_id(event.get("application_id"))
    for app in applications:
        if _match_key(str(app.get("company") or "")) == company_key and _match_key(str(app.get("role") or "")) == role_key:
            return str(app.get("id") or "")
    return ""


def _group_events(events: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        app_id = _normalize_progress_id(event.get("application_id"))
        if app_id:
            groups.setdefault(app_id, []).append(event)
    return groups


def _next_progress_id(groups: dict[str, list[dict[str, Any]]], applications: list[dict[str, Any]]) -> str:
    used = [int(key) for key in groups.keys() if key.isdigit()]
    used.extend(int(str(app.get("id"))) for app in applications if str(app.get("id") or "").isdigit())
    return str(max(used) + 1 if used else 1).zfill(3)


def _allowed_application_events() -> set[str]:
    return {
        "evaluated", "applied", "application_received", "responded", "assessment", "interview",
        "offer", "rejected", "discarded", "skip", "followup_sent", "note",
    }


def _event_evidence_key(value: str) -> str:
    return re.sub(r"\s+", "", value.lower())[:180]


def _match_key(value: str) -> str:
    text = re.sub(r"[（）()【】\[\]·,，。.\s_-]+", "", value.lower())
    return re.sub(r"有限公司|有限责任公司|科技|招聘|hr|recruiting|talent", "", text).strip()


def _today_china() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")


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


def _generated_resume_title(base_title: str, target_job: dict[str, Any] | None) -> str:
    role = str((target_job or {}).get("role") or "").strip()
    if not role:
        role = (base_title.split("-")[-1] if base_title else "目标岗位").strip()
    return f"韦东波 - {role or '目标岗位'}"


def _build_resume_preview_markdown(title: str, base_markdown: str, target_job: dict[str, Any] | None) -> str:
    contact_match = re.search(r"^#.+\n([\s\S]*?)(?=\n##\s+)", base_markdown)
    contact = contact_match.group(1).strip() if contact_match else ""
    keywords = [str(item) for item in ((target_job or {}).get("keywords") or []) if item]
    direction = str((target_job or {}).get("direction") or "").strip()
    if direction:
        keywords.append(direction)
    base_sections = re.sub(r"^#.+$", "", base_markdown, count=1, flags=re.M).strip()[:9000]
    if target_job:
        job_block = "\n".join([
            f"- 公司：{target_job.get('company') or '待确认'}",
            f"- 岗位：{target_job.get('role') or '待确认'}",
            f"- 地点：{target_job.get('location') or '待确认'}",
            f"- 匹配分：{_format_match_score(target_job.get('matchScore'))}",
            f"- 证据缺口：{target_job.get('evidenceGap') or '待补充'}",
        ])
        summary_target = f"{target_job.get('company') or '目标公司'} / {target_job.get('role') or '目标岗位'}"
    else:
        job_block = "- 暂无目标岗位，使用基础简历生成预览。"
        summary_target = "目标岗位"
    return f"""# {title}
{f"{contact}\n" if contact else ""}
## 个人摘要

面向{summary_target}生成的本地规则预览版简历。重点对齐岗位信号：{"、".join(keywords[:10]) or "待补充"}。

## 岗位匹配重点

{job_block}

## 原始简历内容

{base_sections}

## 待人工确认

- 核对所有量化指标，避免写入未确认事实。
- 根据目标 JD 调整项目排序和关键词密度。
- 保存前建议补充证据请求中的缺口材料。
""".strip() + "\n"


def _format_match_score(value: Any) -> str:
    try:
        return f"{float(value):.1f}"
    except (TypeError, ValueError):
        return "待评估"


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


def _write_recruitment_market(market_path: Path, market: dict[str, Any]) -> dict[str, Any]:
    jobs = market.get("jobs") if isinstance(market.get("jobs"), list) else []
    jobs_dir = Path(f"{market_path}.jobs.d")
    jobs_dir.mkdir(parents=True, exist_ok=True)
    for file in jobs_dir.iterdir() if jobs_dir.exists() else []:
        if file.is_file() and re.match(r"^\d{4}\.json$", file.name):
            file.unlink()
    for index in range(0, len(jobs), 25):
        chunk = jobs[index:index + 25]
        (jobs_dir / f"{index // 25:04d}.json").write_text(json.dumps(chunk, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    payload = {
        **market,
        "jobs": [],
        "jobs_file": str(jobs_dir),
        "jobsCount": len(jobs),
        "lastUpdatedFromShardsAt": _now_iso(),
    }
    market_path.parent.mkdir(parents=True, exist_ok=True)
    market_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def _parse_job_text(description: str, url: str) -> dict[str, Any]:
    lines = _normalize_text_lines(description)
    lower = f"{url}\n{description}".lower()
    company = _first_explicit_value(lines, "公司")
    role = _first_explicit_value(lines, "职位") or _infer_role(lines)
    salary = _first_explicit_value(lines, "薪资") or _infer_salary(lines)
    location = _first_explicit_value(lines, "地点") or _infer_location(lines)
    keywords = _infer_keywords(lines)
    parsed: dict[str, Any] = {
        "keywords": keywords,
        "direction": _infer_direction(" ".join([*keywords, role, description])),
        "fitReason": "已读取网页可见 JD 文本，等待生成评估报告。" if description else "",
        "evidenceGap": "需要复核岗位真实性、薪资口径、年限要求和项目证据匹配。",
    }
    if company:
        parsed["company"] = company
    if role:
        parsed["role"] = role
    if salary:
        parsed["salary"] = salary
    if location:
        parsed["location"] = location
    if re.search(r"zhipin\.com|boss直聘|boss", lower):
        parsed["platform"] = "Boss直聘"
    return parsed


def _write_job_description_file(workspace_root: Path, input: dict[str, str]) -> str:
    jds_dir = workspace_data_path(workspace_root, "jobDescriptions")
    jds_dir.mkdir(parents=True, exist_ok=True)
    title = "-".join(part for part in [input.get("company", ""), input.get("role", "")] if part)
    filename = f"{input['id']}-{_slugify_filename(title or input.get('role') or 'job-description')}.md"
    relative_path = f"workspace/jobs/jds/{filename}"
    lines = [
        f"# {input.get('role') or '待解析岗位'}",
        "",
        f"- ID: {input['id']}",
        f"- 公司: {input['company']}" if input.get("company") else "",
        f"- 薪资: {input['salary']}" if input.get("salary") else "",
        f"- URL: {input['url']}" if input.get("url") else "",
        f"- 来源: {input.get('source') or '手工导入'}",
        f"- 入库时间: {_now_iso()}",
        "",
        "## JD 原文",
        "",
        input.get("description", "").strip(),
        "",
    ]
    (jds_dir / filename).write_text("\n".join(line for line in lines if line != ""), encoding="utf-8")
    return relative_path


def _next_market_job_id(jobs: list[dict[str, Any]]) -> str:
    values = []
    for job in jobs:
        match = re.match(r"^MJ-(\d+)$", str(job.get("id") or ""))
        if match:
            values.append(int(match.group(1)))
    return f"MJ-{(max(values) + 1 if values else 1):03d}"


def _normalize_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(r"/$", "", re.sub(r"#.*$", "", text))


def _is_boss_list_summary(description: str, url: str) -> bool:
    text = f"{url}\n{description}"
    if not re.search(r"zhipin\.com|boss直聘", text, re.I):
        return False
    if "BOSS直聘岗位列表（仅列表摘要" in description:
        return True
    head = " ".join(_normalize_text_lines(description)[:80])
    return bool(re.search(r"职位类型.*地图.*搜索", head) and re.search(r"精选职位|最新职位|热招职位|根据求职期望匹配", head) and not re.search(r"职位描述|岗位职责|职位详情|任职要求|岗位要求|工作职责", description))


def _normalize_text_lines(text: str) -> list[str]:
    output = []
    previous = ""
    for line in str(text or "").replace("\u00a0", " ").splitlines():
        clean = re.sub(r"[ \t]+", " ", line).strip()
        if clean and clean != previous:
            output.append(clean)
            previous = clean
        if len(output) >= 500:
            break
    return output


def _first_explicit_value(lines: list[str], label: str) -> str:
    for line in lines:
        match = re.match(rf"^{re.escape(label)}[：:]\s*(.+)$", line)
        if match:
            return match.group(1).strip()
    return ""


def _infer_role(lines: list[str]) -> str:
    return next((line for line in lines if _is_role_like_line(line)), "")


def _is_role_like_line(line: str) -> bool:
    if len(line) < 3 or len(line) > 60:
        return False
    if re.search(r"首页|职位|公司|校园|APP|消息|简历|推荐|搜索|地图|薪资|经验|学历|热门", line):
        return False
    return bool(re.search(r"工程师|开发|算法|机器人|软件|硬件|后端|前端|架构|测试|产品|经理|运维|数据|AI|C\+\+|Python|Java|Linux|ROS", line, re.I))


def _infer_salary(lines: list[str]) -> str:
    return next((line for line in lines if re.search(r"[Kk]|薪|万|千|面议", line) and len(line) <= 40), "")


def _infer_location(lines: list[str]) -> str:
    return next((line for line in lines if re.search(r"深圳|北京|上海|广州|杭州|成都|武汉|南京|苏州|远程", line) and len(line) <= 80), "")


def _infer_keywords(lines: list[str]) -> list[str]:
    known = ["Python", "Java", "C++", "Linux", "ROS", "ROS2", "MoveIt", "URDF", "EtherCAT", "CANopen", "PyTorch", "TensorFlow", "Docker", "K8s", "RAG", "Agent", "机器人", "自动化", "嵌入式", "控制", "算法", "分布式"]
    text = "\n".join(lines).lower()
    return [keyword for keyword in known if keyword.lower() in text][:16]


def _infer_direction(text: str) -> str:
    lower = text.lower()
    if re.search(r"机器人|ros|moveit|urdf|ethercat|canopen", lower):
        return "机器人/智能硬件生态业务"
    if re.search(r"rag|agent|llm|openai|gpt|ai", lower):
        return "企业级 AI / RAG / Agent"
    if re.search(r"数据|pipeline|标注|清洗|质检", lower):
        return "具身智能数据基建"
    return "待复核"


def _slugify_filename(value: str) -> str:
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", value.lower()).strip("-")
    return (slug[:80] or "job-description")


def _local_date() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")


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


def _resolve_workspace_preview_path(workspace_root: Path, input_path: str) -> Path | None:
    trimmed = str(input_path or "").strip()
    if not trimmed:
        return None
    base = workspace_root.resolve()
    candidate = Path(trimmed).resolve() if Path(trimmed).is_absolute() else (base / trimmed).resolve()
    if candidate == base or base not in candidate.parents:
        return None
    return candidate


def _is_resume_markdown_file(file: str) -> bool:
    return _is_markdown_file(file) and file not in {"README.md", "ARCHITECTURE.md"}


def _normalize_resume_markdown(title: str, markdown: str) -> str:
    text = str(markdown or "").strip()
    if not text:
        raise ValueError("Generated resume markdown is required")
    normalized = text if text.startswith("# ") else f"# {title}\n\n{text}"
    return f"{normalized.strip()}\n"


def _next_readable_resume_file(title: str, target_job_title: str, existing_files: list[str]) -> str:
    base = _readable_resume_name(title, target_job_title)
    used = set(existing_files)
    candidate = f"{base}.md"
    index = 2
    while candidate in used:
        candidate = f"{base}-{index}.md"
        index += 1
    return candidate


def _readable_resume_name(title: str, target_job_title: str) -> str:
    cleaned_title = _strip_person_name(title)
    company, role = _split_target_job_title(target_job_title)
    target_role = _resume_name_part(role or cleaned_title or "机器人系统工程师")
    suffix = _resume_name_part(company) if company else "通用"
    return _slugify_filename(f"简历-{target_role}-{suffix}")


def _strip_person_name(title: str) -> str:
    return re.sub(r"^[\u4e00-\u9fa5]{2,4}\s*[-—–]\s*", "", str(title or "")).strip()


def _resume_name_part(value: str) -> str:
    cleaned = re.sub(r"[\\/|:*?\"<>]", "-", re.sub(r"\s+", "", re.sub(r"[【】\[\]（）()]", " ", str(value or ""))))
    return re.sub(r"-+", "-", cleaned).strip("-")[:32] or "通用"


def _split_target_job_title(value: str) -> tuple[str, str]:
    parts = [part.strip() for part in re.split(r"\s*[·|-]\s*", str(value or ""), maxsplit=1) if part.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return "", parts[0] if parts else ""


def _upsert_resume_job_link(path: Path, link: dict[str, Any]) -> None:
    store = _read_json(path, {"links": []})
    links = store.get("links") if isinstance(store, dict) and isinstance(store.get("links"), list) else []
    next_links = [item for item in links if isinstance(item, dict) and item.get("file") != link.get("file")]
    next_links.append(link)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"updatedAt": _now_iso(), "links": next_links}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _remove_resume_job_link(path: Path, file: str) -> None:
    store = _read_json(path, {"links": []})
    links = store.get("links") if isinstance(store, dict) and isinstance(store.get("links"), list) else []
    next_links = [item for item in links if isinstance(item, dict) and item.get("file") != file]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"updatedAt": _now_iso(), "links": next_links}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _is_diagnosis_markdown_file(file: str) -> bool:
    return _is_markdown_file(file) and file not in {"README.md", "ARCHITECTURE.md"}


def _normalize_diagnosis_markdown(title: str, markdown: str, resume_file: str, target_job_id: str) -> str:
    text = str(markdown or "").strip()
    if not text:
        raise ValueError("Resume diagnosis markdown is required")
    body = text if text.startswith("# ") else f"# {title}\n\n{text}"
    metadata = "\n".join([
        f"**Resume:** {resume_file or '待补充'}",
        f"**Target Job:** {target_job_id or '未绑定'}",
        f"**Generated At:** {_now_iso()}",
    ])
    return f"{body.strip()}\n\n---\n\n{metadata}\n"


def _diagnosis_file_name(title: str, resume_file: str) -> str:
    date = _today_china()
    base = re.sub(r"\.md$", "", resume_file) if resume_file else title
    return f"{_slugify_filename(base)}-diagnosis-{date}.md"


def _without_experience_content(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if key != "sourceContent"}


def _sanitize_pipeline_field(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("|", "/").replace("\n", " ")).strip()[:240]


def _normalize_pipeline_document(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "# URL Pipeline\n\n## Pending\n\n## Processed\n"
    if not re.search(r"^#\s+", text, re.M):
        return f"# URL Pipeline\n\n## Pending\n{text}\n\n## Processed\n"
    if not re.search(r"^## Pending\s*$", text, re.M):
        return f"{text}\n\n## Pending\n\n## Processed\n"
    if not re.search(r"^## Processed\s*$", text, re.M):
        return f"{text}\n\n## Processed\n"
    return f"{text}\n"


def _write_pipeline_pending_line(path: Path, current: str, line: str) -> None:
    normalized = _normalize_pipeline_document(current)
    match = re.search(r"^## Processed\s*$", normalized, re.M)
    if match:
        next_text = f"{normalized[:match.start()].rstrip()}\n{line}\n\n{normalized[match.start():]}"
    else:
        next_text = f"{normalized.rstrip()}\n{line}\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(next_text, encoding="utf-8")


def _normalize_market_job_patch(current: dict[str, Any], patch: dict[str, Any], updated_at: str) -> dict[str, Any]:
    next_job = {**current, "updatedAt": updated_at}
    for key in ["company", "role", "location", "salary", "source", "url", "direction", "fitReason", "evidenceGap", "platform", "importedAt", "discoveredAt", "createdAt"]:
        if key in patch:
            next_job[key] = str(patch.get(key) or "").strip()
    if "matchScore" in patch:
        try:
            next_job["matchScore"] = max(0, min(5, float(patch.get("matchScore"))))
        except (TypeError, ValueError):
            pass
    if "keywords" in patch:
        value = patch.get("keywords")
        if isinstance(value, list):
            next_job["keywords"] = [str(item).strip() for item in value if str(item).strip()][:30]
        else:
            next_job["keywords"] = []
    return next_job


def _normalize_evidence_request(payload: dict[str, Any]) -> dict[str, Any]:
    direction = str(payload.get("direction") or "").strip()
    gap = str(payload.get("gap") or "").strip()
    if not direction:
        raise ValueError("Evidence direction is required")
    if not gap:
        raise ValueError("Evidence gap is required")
    request_id = str(payload.get("id") or f"ev-{int(datetime.now(UTC).timestamp() * 1000):x}").strip()
    ask_human = payload.get("askHuman")
    if isinstance(ask_human, list):
        ask_human_items = [str(item).strip() for item in ask_human if str(item).strip()]
    else:
        ask_human_items = [item.strip() for item in re.split(r"\r?\n|,", str(ask_human or "")) if item.strip()]
    return {
        "id": request_id,
        "priority": str(payload.get("priority") or "medium").strip(),
        "status": str(payload.get("status") or "open").strip(),
        "direction": direction,
        "gap": gap,
        "marketSignal": str(payload.get("marketSignal") or "").strip(),
        "currentEvidence": str(payload.get("currentEvidence") or "").strip(),
        "askHuman": ask_human_items,
        "targetFile": str(payload.get("targetFile") or "workspace/jobs/project-notes/evidence.md").strip(),
        "resumeImpact": str(payload.get("resumeImpact") or "").strip(),
    }


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
