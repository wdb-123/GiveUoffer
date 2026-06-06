# OfferU Daemon

The daemon is the new local execution boundary for OfferU.

Current state:

- `src/legacy-visualizer.mjs` reuses the existing `visualizer/services/*.mjs` modules.
- `src/index.ts` is the future TypeScript runtime entry.
- `src/server.ts` exposes the TypeScript Fastify API.
- `.offeru/daemon.sqlite` stores local tasks, events, approvals and decisions.
- `sync_events` in SQLite is the local outbox for future cloud sync.
- The daemon keeps source-code access, shell execution and AI CLI sessions local.

Run:

```bash
npm run daemon
```

The legacy-compatible server exposes the current visualizer at `http://localhost:4173`.
