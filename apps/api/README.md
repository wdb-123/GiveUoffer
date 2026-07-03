# Ucareer Legacy TypeScript Cloud API

The default cloud/API backend is now the FastAPI service in `apps/py-api`.
This TypeScript Fastify API is kept only as a legacy reference while remaining
Node backend surfaces are retired.

Current state:

- Health endpoint
- Device pairing placeholder
- Sync pull/push placeholders
- `/sync/push` accepts daemon outbox events and returns accepted IDs
- Approval relay placeholder

This service must not execute shell commands or read local source repositories.

Run the legacy implementation explicitly with:

```bash
npm run api:node
```
