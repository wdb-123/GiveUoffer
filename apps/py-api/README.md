# Ucareer Python Cloud API

SaaS-ready sync and relay API implemented with FastAPI. This is the default cloud/API backend for `npm run api`.

## Run

```bash
npm run api
```

Default URL:

```text
http://127.0.0.1:4191
```

## Current Endpoints

- `GET /health`
- `POST /auth/device-pairing`
- `GET /sync/pull`
- `POST /sync/push`
- `POST /approvals/{approvalId}/decision`

This service must not execute shell commands or read local source repositories.
