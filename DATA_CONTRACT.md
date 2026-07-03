# Data Contract

This document defines which files belong to the **system** (auto-updatable) and which belong to the **user** (never touched by updates).

## User Layer (NEVER auto-updated)

These files contain your personal data, customizations, and work product. Updates will NEVER modify them.

| File | Purpose |
|------|---------|
| `workspace/profile/cv.md` | Your CV in markdown |
| `workspace/profile/profile.yml` | Your identity, targets, comp range |
| `workspace/profile/_profile.md` | Your archetypes, narrative, negotiation scripts |
| `workspace/profile/article-digest.md` | Your proof points from portfolio |
| `workspace/profile/headshots/*` | Your personal headshots and resume avatar crops |
| `workspace/profile/intentions/*` | Your personal search intentions and target notes |
| `workspace/jobs/interview-prep/story-bank.md` | Your accumulated STAR+R stories |
| `workspace/profile/portals.yml` | Your customized company list |
| `workspace/ops/data/*` | Your local operational state: applications, progress, market jobs, evidence, parser output, resume versions and related JSON/Markdown/JSONL files |
| `workspace/ops/batch/*` | Your batch-processing queues, logs and tracker additions |
| `workspace/ops/imports/*` | Your locally imported files and parsed attachment copies |
| `workspace/ops/exports/*` | Your generated exports for local handoff |
| `workspace/resumes/library/*` | Your canonical direction resume library and direction clues |
| `workspace/resumes/source/*` | Your source resume documents, such as DOCX variants |
| `workspace/resumes/rendered/*` | Your rendered resume output files |
| `workspace/resumes/diagnostics/*` | Your generated resume diagnosis reports and improvement plans |
| `workspace/resumes/quicklook/*` | Your local resume preview images |
| `workspace/resumes/tools/*` | Your personal resume document helpers that operate on headshots and source DOCX files |
| `workspace/jobs/research/*` | Your company, market and role research notes |
| `workspace/jobs/project-notes/*` | Your raw project fact cards and project evidence intake notes |
| `workspace/profile/writing-samples/*` | Your personal writing samples for style calibration (except `workspace/profile/writing-samples/README.md`, which is system-owned documentation delivered by updates) |
| `workspace/jobs/reports/*` | Your evaluation reports |
| `workspace/jobs/jds/*` | Your saved job descriptions |
| `workspace/tenants/*/workspace/*` | Tenant-scoped user data for multi-account Web/API sessions, using the same logical workspace layout inside each tenant |

## System Layer (product source)

These files contain product logic, scripts, templates, and instructions.

| File | Purpose |
|------|---------|
| `modes/_shared.md` | Scoring system, global rules, tools |
| `modes/oferta.md` | Evaluation mode instructions |
| `modes/pdf.md` | PDF generation instructions |
| `modes/scan.md` | Portal scanner instructions |
| `modes/apply.md` | Application assistant instructions |
| `modes/auto-pipeline.md` | Auto-pipeline instructions |
| `modes/contacto.md` | LinkedIn outreach instructions |
| `modes/deep.md` | Research prompt instructions |
| `modes/ofertas.md` | Comparison instructions |
| `modes/pipeline.md` | Pipeline processing instructions |
| `modes/project.md` | Project evaluation instructions |
| `modes/tracker.md` | Tracker instructions |
| `modes/training.md` | Training evaluation instructions |
| `modes/patterns.md` | Pattern analysis instructions |
| `modes/followup.md` | Follow-up cadence instructions |
| `modes/de/*` | German language modes |
| `modes/fr/*` | French language modes |
| `modes/ja/*` | Japanese language modes |
| `modes/tr/*` | Turkish language modes |
| `CLAUDE.md` | Agent instructions |
| `AGENTS.md` | Codex instructions |
| `*.mjs` | Utility scripts |
| `workspace/jobs/examples/*` | Versioned sample assets and example documents shipped with the product |
| `workspace/ops/templates/*` | Base templates |
| `workspace/ops/templates/fonts/*` | Self-hosted resume template fonts |
| `workspace/README.md` | Workspace boundary documentation |
| `workspace/profile/profile.example.yml` | Example profile used for onboarding |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `DATA_CONTRACT.md` | This file |
| `workspace/profile/writing-samples/README.md` | System-owned onboarding documentation for the writing-samples directory |

## Workspace Boundary

Only these first-level entries belong under `workspace/`:

- `workspace/profile/`
- `workspace/resumes/`
- `workspace/jobs/`
- `workspace/ops/`
- `workspace/tenants/`
- `workspace/README.md`

Runtime state belongs in `.ucareer/`, not `workspace/`. Tenant-owned career assets belong under `workspace/tenants/{tenantId}/workspace/` when accessed through authenticated multi-tenant Web/API sessions.
Product code belongs outside `workspace/`, except explicitly local personal helpers such as `workspace/resumes/tools/*`.
Generated handoff files belong in `workspace/ops/exports/`; imported source material belongs in `workspace/ops/imports/`.

Run `npm run workspace:audit` after structural changes to catch misplaced files and OS artifacts.

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be changed as part of product development.**
