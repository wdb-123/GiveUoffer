# OfferU Engineering Architecture Guide

Date: 2026-06-06

This guide defines the engineering boundaries for the TS/Node migration. The goal is to keep the product maintainable while it grows from a personal job-search system into a SaaS-ready platform.

## Core Rules

1. Keep business logic out of React components.
2. Keep file-system logic out of route handlers.
3. Keep provider-specific CLI behavior behind provider adapters.
4. Keep shared DTOs in `packages/shared`; do not duplicate ad hoc response shapes.
5. Keep cloud sync metadata-oriented by default; do not upload source repositories or raw shell context without explicit user approval.
6. Keep legacy `visualizer/` working until a migrated module has a tested replacement.

## Frontend Architecture

```text
apps/web/src/
  App.tsx                 # app composition only
  api.ts                  # typed daemon API client only
  views.ts                # stable route/view registry
  hooks/
    useOfferUData.ts      # data loading and user actions
  layout/
    AppLayout.tsx         # shell layout
    Sidebar.tsx           # navigation and brand
    ViewRenderer.tsx      # active view switch
  sections/
    *.tsx                 # page-level feature panels
  ui/
    Button.tsx            # shared reusable UI controls
    Panel.tsx
```

Local frontend rules also live in `apps/web/src/ARCHITECTURE.md`.

### Frontend Rules

- `App.tsx` must not grow business handlers. Move action logic into hooks.
- `sections/*` receive data and callbacks as props. They should not import `api.ts`.
- `layout/*` must not know business data except active view, status and view registry.
- Shared controls go in `ui/*` once used by two or more sections.
- Do not add nested cards inside cards. Use page bands, panels and repeated item rows.
- Do not introduce new visual themes per page. Use the OfferU workbench tokens in `styles.css`.
- No mobile implementation in this batch. Responsive web layout is allowed.

## Backend Architecture

```text
apps/daemon/src/
  server.ts               # app creation, route registration, process startup
  routes/
    agent-routes.ts
    profile-routes.ts
    resume-routes.ts
    report-routes.ts
    sync-routes.ts
  *-store.ts              # local file/SQLite business adapters
  runner.ts               # process execution only
  path-guards.ts          # filesystem boundary utilities
```

Local daemon rules also live in `apps/daemon/src/ARCHITECTURE.md`.

### Backend Rules

- Route handlers should validate request shape, call a store/service, and return an API envelope.
- Stores own local file compatibility and normalization.
- Runner owns process execution. Stores and route handlers must not spawn processes.
- Every filesystem path that includes user or file input must use `path-guards.ts`.
- Every API response must use `{ ok, data }` or `{ ok, error }`.
- Long-running or risky actions must create approval requests before execution.
- Keep cloud API separate from daemon execution; cloud cannot directly run local shell commands.

## Shared Contracts

- Add request/response interfaces to `packages/shared/src/index.ts` before using them in web or daemon.
- Prefer explicit DTO names such as `ExportResumeRequest` and `PushSyncResult`.
- Avoid `unknown` in UI props. Use `unknown` only at external boundaries and narrow quickly.
- Add new provider-neutral task events before adding provider-specific UI behavior.

## Testing Standard

Every migration block must pass:

```text
npm run typecheck
npm run web:build
targeted daemon API smoke
Playwright page smoke for changed views
```

Write-smoke tests must restore user data or write only to ignored runtime paths such as `.offeru/` and `output/exports/`.

## Current Deferred Scope

- Mobile app implementation.
- Team billing.
- Full multi-tenant Postgres migration.
- Uploading source repositories.
- Automatic job application submission.
