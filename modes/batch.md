# Mode: batch — Batch Workflow Coordination

Batch processing no longer uses a root-level `batch/` runner. The current product keeps batch state under `workspace/ops/batch/` and lets the backend workflow layer coordinate execution.

## Current Boundaries

```text
workspace/ops/batch/
  tracker-additions/   # TSV tracker additions waiting for merge
  logs/                # workflow/task logs
```

## Flow

1. Collect URLs or JDs into `workspace/ops/data/pipeline.md`.
2. Route each item through the daemon workflow layer.
3. Write reports to `workspace/jobs/reports/`.
4. Write new tracker TSV rows to `workspace/ops/batch/tracker-additions/`.
5. Run `npm run merge` to merge additions into `workspace/ops/data/applications.md`.
6. Run `npm run verify` to validate status values, links and duplicates.

## Rule

Do not recreate root-level `batch/`. Batch execution belongs to the backend workflow layer; batch files under `workspace/ops/batch/` are user/workflow state, not product source.
