Embedded Paperclip adapters
===========================

This directory vendors the local agent adapter layer from Paperclip.

Source: https://github.com/paperclipai/paperclip
License: MIT
Imported packages:
- packages/adapter-utils/src
- packages/adapters/codex-local/src
- packages/adapters/claude-local/src
- packages/adapters/gemini-local/src
- packages/adapters/opencode-local/src
- packages/adapters/openclaw-gateway/src

Ucareer uses these adapters as its native local-agent runtime layer. Do not
replace this with dynamic imports from a sibling Paperclip checkout; the goal is
for this project to run with the embedded adapter code.

Governance rules:
- Treat this directory as vendored runtime code. Keep product-specific wiring in
  `apps/daemon/src/providers/paperclip-adapter-provider.ts` and
  `apps/daemon/src/policy/agent-execution-policy.ts` unless a vendor fix is required.
- Any sync from upstream Paperclip must record the source commit or release in
  this file and pass `npm run typecheck`, `npm run web:build`, and
  `npm run test:all`.
- Do not enable adapter options with names such as `dangerously*`, `yolo`, or
  remote/gateway execution defaults without updating the daemon approval policy.
- Do not log raw adapter config, environment variables, authorization headers,
  tokens, cookies, or command lines containing secrets. Use the existing
  redaction helpers when adding logs.
- Remote execution, SSH, gateway pairing, cloud sync, package installation, file
  deletion, and external application submission are always approval-gated at the
  Ucareer daemon boundary.
