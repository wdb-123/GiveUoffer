# Scripts Architecture

`scripts/` is for project automation. User/job-search files stay under `workspace/`.

## Layout

```text
scripts/
  architecture-guard.mjs   # architecture boundary checks
  cli/                     # stable product commands exposed through npm scripts
  cli/providers/           # scan provider plugins used by scripts/cli/scan.mjs
  dev/                     # local development and UI audit helpers
  research/                # market research and crawler utilities
```

## Boundaries

- `scripts/cli/` owns stable commands such as `scan`, `doctor`, `verify`, `merge`, `pdf`, and `latex`.
- `scripts/cli/providers/` is only for scanner providers loaded by `scripts/cli/scan.mjs`.
- `scripts/dev/` is for local developer helpers. These scripts may assume a running local app.
- `scripts/research/` is for exploratory or market-specific data collection. These scripts may write outputs into `workspace/jobs` or `workspace/ops/data`.
- New root-level scripts should be avoided. Keep `scripts/architecture-guard.mjs` as the only root executable unless there is a strong project-wide reason.
