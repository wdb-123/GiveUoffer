# Ucareer Docs

Documentation is grouped by current product ownership:

```text
docs/
  architecture/  # current architecture and governance rules
  guides/        # operational guides and integration cookbooks
  product/       # product design notes and market/channel decisions
  archive/       # dated migration/design snapshots kept for reference only
```

## Current Docs

| Area | File | Purpose |
| --- | --- | --- |
| Architecture | `architecture/overview.md` | Current local-first architecture and runtime flow |
| Architecture | `architecture/governance.md` | Architecture guardrails and validation rules |
| Guide | `guides/customization.md` | How to customize profile, portals, templates and states |
| Guide | `guides/local-parser-cookbook.md` | Local parser contract for zero-token job scanning |
| Guide | `guides/boss-chrome-import.md` | Boss JD import rules and anti-patterns |
| Product | `product/tracker-product-design.md` | Application tracker product model |
| Product | `product/china-recruitment-channels.md` | China recruiting channel strategy |

## Archive

Files in `docs/archive/` are historical design snapshots. They can explain why a decision was made, but current implementation rules live in `docs/architecture/`, `apps/*/src/ARCHITECTURE.md`, `DATA_CONTRACT.md` and `workspace/README.md`.
