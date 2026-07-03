# Skills Layer

The skills layer is the backend-owned capability library for Ucareer agents.

- `<skill-name>/skill.ts` owns each built-in skill definition, including input kinds, tool exposure and file-management contracts.
- `<skill-name>/SKILL.md` owns the human-readable agent instructions for that skill.
- `definitions.ts` aggregates built-in skill definitions in routing order.
- `registry.ts` is the stable lookup API consumed by workflow routing, prompt building, routes, execution and UI feature binding.
- `index.ts` is the public module boundary for daemon imports.

Every UI-facing skill should define `ui.pages` and `ui.entryActions`. These actions are the contract a frontend can use to render page-level Agent buttons without hard-coding prompts.

Workflow code may consume this library, but skill definitions should not live under `workflow/`.
