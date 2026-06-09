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
| `workspace/jobs/interview-prep/story-bank.md` | Your accumulated STAR+R stories |
| `workspace/profile/portals.yml` | Your customized company list |
| `workspace/ops/data/applications.md` | Your application tracker |
| `workspace/ops/data/application-progress.md` | Your applied jobs and application progress board |
| `workspace/ops/data/pipeline.md` | Your URL inbox |
| `workspace/ops/data/scan-history.tsv` | Your scan history |
| `workspace/ops/data/follow-ups.md` | Your follow-up history |
| `workspace/ops/imports/*` | Your locally imported files and parsed attachment copies |
| `workspace/ops/exports/*` | Your generated exports for local handoff |
| `workspace/resumes/*` | Your resume library, source files and rendered resume variants |
| `workspace/jobs/research/*` | Your company, market and role research notes |
| `workspace/jobs/examples/*` | Your local examples and project-specific sample assets |
| `workspace/profile/writing-samples/*` | Your personal writing samples for style calibration (except `workspace/profile/writing-samples/README.md`, which is system-owned documentation delivered by updates) |
| `workspace/jobs/reports/*` | Your evaluation reports |
| `workspace/jobs/jds/*` | Your saved job descriptions |

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
| `workspace/ops/templates/*` | Base templates |
| `workspace/ops/templates/fonts/*` | Self-hosted resume template fonts |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `DATA_CONTRACT.md` | This file |
| `workspace/profile/writing-samples/README.md` | System-owned onboarding documentation for the writing-samples directory |

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be changed as part of product development.**
