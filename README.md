# Ucareer

Ucareer is a local AI career workspace for managing job discovery, resume assets, application progress, interview prep and agent-assisted workflows.

The product keeps user-owned career material inside `workspace/` and keeps source code, scripts and runtime infrastructure outside that boundary.

## Workspace Layout

```text
workspace/
  profile/   # CV, profile.yml, portals.yml, headshots, writing samples, intentions
  resumes/   # resume library, source files, rendered files and quicklook previews
  jobs/      # JDs, evaluation reports, research, interview prep, project notes, examples
  ops/       # app data, templates, imports, exports and batch-processing state
```

Root-level folders such as `apps/`, `packages/`, `scripts/`, `tools/`, `docs/` and `modes/` are project implementation files. Job-search content should go under `workspace/`.

## Run Locally

```bash
npm install
npm run dev:ucareer
```

Open the web app at:

```text
http://127.0.0.1:12345/
```

Useful checks:

```bash
npm run typecheck
npm run web:build
node scripts/architecture-guard.mjs
npm run verify
npm run doctor
```

## Architecture Guard

The workspace boundary is enforced by `scripts/architecture-guard.mjs`.

It verifies:

- user career assets stay under `workspace/profile`, `workspace/resumes`, `workspace/jobs` and `workspace/ops`
- old root asset folders and legacy runtime directories do not return
- backend routing, workflow execution, attachment parsing and skill file-management contracts remain centralized

## Attribution

Ucareer started from ideas and workflows explored in the open-source [career-ops](https://github.com/santifer/career-ops) project by Santiago Fernandez de Valderrama.

Thanks to the career-ops project for the original job-search operating-system concept, scoring workflow inspiration, resume pipeline ideas and local-first automation patterns. Ucareer has since been reorganized around its own workspace boundary, backend agent routing, workflow execution layer and Ucareer product architecture.

The original career-ops project is MIT licensed; the license notice is retained in this repository.
