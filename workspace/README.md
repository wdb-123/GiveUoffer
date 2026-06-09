# Ucareer Local Workspace

`workspace/` is the local user asset boundary. Product code does not live here.

## Structure

| Path | Purpose |
|------|---------|
| `profile/` | Personal profile, CV, search configuration, portals, headshots, writing samples and intentions. |
| `resumes/library/` | Canonical markdown resume library used by the app. |
| `resumes/source/` | Source resume files such as DOCX variants. |
| `resumes/rendered/` | Rendered resume exports grouped by generation run. |
| `resumes/quicklook/` | Preview images for rendered resumes. |
| `jobs/` | Job-search work product: JDs, reports, research, interview prep, project notes and examples. |
| `ops/` | Local operational data: app data, templates, imports, exports and batch-processing state. |

## Rules

- Do not put product source code in `workspace/`.
- Prefer `workspace/` for user-owned assets and generated career materials.
- Runtime state belongs in `.ucareer/`.
- Keep the workspace first level small: only `profile/`, `resumes/`, `jobs/` and `ops/`.
- Root-level user/project asset directories are deprecated. Use `workspace/profile`, `workspace/resumes`, `workspace/jobs` and `workspace/ops`.
- Future cloud/mobile sync should treat this directory as user data and synchronize metadata before raw files.
