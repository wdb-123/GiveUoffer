# Ucareer Legacy TypeScript Daemon

The default local backend is now the FastAPI service in `apps/py-daemon`.
This TypeScript Fastify daemon is kept as a legacy reference and adapter
boundary while remaining Node-specific runtime code is retired.

Current state:

- `src/server.ts` exposes the TypeScript Fastify API.
- `src/index.ts` owns the daemon runtime.
- `.ucareer/daemon.sqlite` stores local tasks, events, approvals and decisions.
- `sync_events` in SQLite is the local outbox for future cloud sync.
- The daemon keeps source-code access, shell execution and AI CLI sessions local.

Run:

```bash
npm run daemon:node
```

The default `npm run daemon` command starts the Python daemon.
