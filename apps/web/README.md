# Ucareer Web

This is the React/Vite web console.

Current state:

- The app renders the migrated product screens from the daemon API.
- The app shell covers the job-search product, local agent layer and cloud sync layer.

Run after installing web dependencies:

```bash
npm run web
```

The web client defaults to the daemon on the same host as the page, port `54321`.
To override it explicitly, set:

```bash
VITE_DAEMON_API_URL=http://127.0.0.1:54321
```
