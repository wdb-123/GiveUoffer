# Backend Python Migration

The requested end state is a Python-maintained backend architecture. The default
local backend is now `apps/py-daemon`, a FastAPI service started by
`npm run daemon` and `npm run dev:ucareer`. The old TypeScript/Fastify daemon in
`apps/daemon` is retained only as `npm run daemon:node` while remaining
Node-specific adapter code is retired. The cloud/API skeleton is now
`apps/py-api`, a FastAPI service started by `npm run api`; the old TypeScript
Fastify API in `apps/api` is retained only as `npm run api:node`.

## Target Shape

```text
apps/py-daemon
  -> main.py FastAPI route composition
    -> auth.py / billing.py / agent_store.py / workspace_stores.py
      -> connectors.py / jobsearch.py / resume_export.py / sync.py
        -> .ucareer/daemon.sqlite + workspace/*

apps/py-api
  -> main.py FastAPI cloud/API skeleton
    -> health / device pairing / sync pull-push / approval relay
```

The Python backend owns API routing, auth, tenants, billing, token usage,
workspace stores, connectors and local agent orchestration. TypeScript remains
for the React frontend and shared UI types.

## Compatibility Rules

- Preserve the API envelope: `{ ok, data }` and `{ ok, error }`.
- Preserve the local SQLite database path: `.ucareer/daemon.sqlite`.
- Preserve workspace isolation under `workspace/tenants/*/workspace/*`.
- Frontend route coverage must be verified against the FastAPI source, not the
  legacy TypeScript route files.
- Do not let Python routes read/write outside the workspace boundary unless the
  equivalent TypeScript route already has that system responsibility.
- Keep any remaining Node route references explicitly named as legacy references.

## Migration Phases

1. Python daemon skeleton: FastAPI app, health check, shared config, DB probe and
   route migration manifest. Done.
2. Auth and tenants: accounts, sessions, roles and tenant switching. Done.
3. Billing and token quotas: plans, tenant usage schema, real provider usage
   aggregation and execution quota gates. Done.
4. Workspace data stores: profile, resumes, reports, applications, experience,
   evidence and market data. Done for the web API surface.
5. Connectors: QQ/Tencent email, attachment import and job-search providers.
   Done for the current local connector surface.
6. Agent execution: task store, SSE events, approvals and workflow runs. Done for
   the current local UI/API surface; local provider runner retirement remains.
7. Frontend cutover: `npm run daemon`, `npm run daemon:api` and `npm run
   dev:ucareer` start Python by default. Done.
8. Cloud/API skeleton cutover: `npm run api` starts Python by default while the
   TypeScript Fastify API is explicit `npm run api:node`. Done.

## Current Status

`apps/py-daemon` is the default local backend, and `apps/py-api` is the default
cloud/API skeleton. `npm run test:all` verifies that all frontend API routes have
FastAPI handlers, and `npm run daemon:python:test` / `npm run api:python:test`
cover the Python backend contracts. The route manifest uses `legacyNodeModule`
for old TypeScript references so the architecture endpoint does not present Node
as the active backend module.

Remaining work is retirement work: move or delete the legacy TypeScript daemon
checks once the last Node-specific local provider/adapters are replaced by
Python equivalents. New backend product work should continue landing in
`apps/py-daemon` first.
