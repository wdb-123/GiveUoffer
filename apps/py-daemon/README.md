# Ucareer Python Daemon

This is the migration target for the local Ucareer backend. The existing
TypeScript daemon remains the production service while domains are moved over
incrementally.

## Run

```bash
npm run daemon:python
```

Default URL:

```text
http://127.0.0.1:54322
```

Environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `UCAREER_PY_HOST` | `127.0.0.1` | Bind host |
| `UCAREER_PY_PORT` | `54322` | Bind port |
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

Route behavior should be migrated domain by domain. The frontend should only be
pointed at the Python daemon after that route group has parity tests.

