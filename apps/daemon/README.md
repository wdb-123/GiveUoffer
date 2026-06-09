# Ucareer Daemon

The daemon is the new local execution boundary for Ucareer.

Current state:

- `src/server.ts` exposes the TypeScript Fastify API.
- `src/index.ts` owns the daemon runtime.
- `.ucareer/daemon.sqlite` stores local tasks, events, approvals and decisions.
- `sync_events` in SQLite is the local outbox for future cloud sync.
- The daemon keeps source-code access, shell execution and AI CLI sessions local.

Run:

```bash
npm run daemon
```

The daemon API starts on `http://127.0.0.1:54321` by default.
