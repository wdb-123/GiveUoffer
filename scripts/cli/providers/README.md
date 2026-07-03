# Scanner Providers

This directory contains scanner provider plugins used only by `scripts/cli/scan.mjs`.

These are ATS/job-board parsers, not agent runtime providers. Agent providers live in:

- `packages/provider-codex`
- `packages/provider-claude`
- `packages/provider-gemini`
- `docs/archive/legacy-typescript-daemon/src/providers` for historical TypeScript adapter reference

## Contract

Each non-underscore `.mjs` file exports a default provider object:

```js
export default {
  id: "provider-id",
  detect(entry) {
    return { url: "https://..." };
  },
  async fetch(entry, ctx) {
    return [{ title, url, company, location }];
  },
};
```

Files prefixed with `_` are shared helpers and are not loaded as providers.

## Boundary

- Providers read a `tracked_companies` entry from `workspace/profile/portals.yml`.
- Providers return normalized job listings only.
- Providers must not write workspace files directly.
- Local executable parsing belongs in `local-parser.mjs`.
