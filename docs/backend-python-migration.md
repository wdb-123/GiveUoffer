# Backend Python Migration

The requested end state is a Python-maintained backend architecture. The current
production daemon is `apps/daemon` in TypeScript/Fastify. The migration must keep
the frontend and local user data working during the transition.

## Target Shape

```text
apps/py-daemon
  -> routers/*
    -> services/*
      -> stores/* / connectors/* / execution/*
        -> .ucareer/daemon.sqlite + workspace/*
```

The Python backend owns API routing, auth, tenants, billing, token usage,
workspace stores, connectors and local agent orchestration. TypeScript remains
for the React frontend and shared UI types.

## Compatibility Rules

- Preserve the API envelope: `{ ok, data }` and `{ ok, error }`.
- Preserve the local SQLite database path: `.ucareer/daemon.sqlite`.
- Preserve workspace isolation under `workspace/tenants/*/workspace/*`.
- Port one route group at a time and add parity tests before pointing the
  frontend at Python for that group.
- Do not let Python routes read/write outside the workspace boundary unless the
  equivalent TypeScript route already has that system responsibility.

## Migration Phases

1. Python daemon skeleton: FastAPI app, health check, shared config, DB probe and
   route migration manifest.
2. Auth and tenants: accounts, sessions, roles, tenant switching and email
   verification.
3. Billing and token quotas: plans, usage aggregation and execution quota gates.
4. Workspace data stores: profile, resumes, reports, applications, experience,
   evidence and market data.
5. Connectors: QQ/Tencent email, attachment import and job-search providers.
6. Agent execution: task store, SSE events, approvals, workflow runs and local
   provider runners.
7. Frontend cutover: `VITE_DAEMON_API_URL` points to Python by default after API
   parity and integration tests pass.

## Current Status

`apps/py-daemon` has the first migration slice: it starts a FastAPI daemon,
shares the same workspace and SQLite path, and exposes route group migration
status. The production frontend still points at the existing TypeScript daemon
until route parity is implemented.

