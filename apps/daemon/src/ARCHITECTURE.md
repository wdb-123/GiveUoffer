# Daemon Backend Architecture

The daemon is the local execution boundary. It owns filesystem compatibility, local SQLite task state, approvals and provider execution.

## Current Structure

- `server.ts`: Fastify setup and route registration.
- `*-store.ts`: business adapters for local files and SQLite.
- `runner.ts`: process execution only.
- `path-guards.ts`: required path boundary checks.
- `db/*`: SQLite schema and migrations.

## Route Rules

- Route handlers validate input, call a store/service and return an API envelope.
- Route handlers should not directly read/write project files.
- Route handlers should not spawn commands.
- Risky actions must create approval requests before execution.

## Store Rules

- Stores own local file formats and migration compatibility.
- Stores normalize local file data into shared DTOs.
- Stores must use `path-guards.ts` for user-controlled paths.

## Next Refactor Boundary

When `server.ts` grows again, move route groups into:

- `routes/agent-routes.ts`
- `routes/profile-routes.ts`
- `routes/resume-routes.ts`
- `routes/report-routes.ts`
- `routes/sync-routes.ts`

Each route module should export `registerXRoutes(app, context)`.
