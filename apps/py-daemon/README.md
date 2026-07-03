# Ucareer Python Daemon

This is the default local Ucareer backend. The legacy TypeScript daemon is kept
as `npm run daemon:node` while remaining adapter code is retired.

## Run

```bash
npm run daemon:python
```

Default URL:

```text
http://127.0.0.1:54321
```

Environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `UCAREER_PY_HOST` | `127.0.0.1` | Bind host |
| `UCAREER_PY_PORT` | `54321` | Bind port |
| `UCAREER_WORKSPACE_ROOT` | repo root | Shared workspace root |
| `UCAREER_DAEMON_DB` | `.ucareer/daemon.sqlite` | Shared local daemon SQLite |

## Migration Rule

The Python daemon must preserve the public API envelope:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": { "code": "error_code", "message": "..." } }
```

Route behavior is covered by parity tests in `apps/py-daemon/tests`. New backend
work should land in Python first.
