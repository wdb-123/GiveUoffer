# Ucareer Packages

`packages/` contains reusable TypeScript source shared by local apps. It is system code, not user workspace content.

## Package Map

```text
packages/
  shared/            # DTOs, API envelopes, workflow/event contracts
  agent-core/        # provider-neutral agent interfaces and policy shapes
  provider-codex/    # Codex CLI adapter metadata and command construction
  provider-claude/   # Claude Code adapter metadata and command construction
  provider-gemini/   # Gemini CLI adapter metadata and command construction
```

## Dependency Direction

```text
shared
  -> agent-core
      -> provider-*

apps/* may depend on packages.
packages must not depend on apps/*, workspace/* or local daemon stores/routes.
```

## Rules

- `shared` stays framework-independent and must not import Node runtime APIs or other Ucareer packages.
- `agent-core` may import shared contracts, but must not know any concrete provider.
- `provider-*` packages may import `agent-core`, but must not import daemon routes, stores, workflow registries or workspace files.
- Product workflow routing belongs in `apps/py-daemon/src/ucareer_py_daemon/routing.py`, not in packages.
- User data and generated artifacts belong under `workspace/`, never under `packages/`.
