# Daemon Backend Architecture

The daemon is the local execution boundary. It owns filesystem compatibility, local SQLite task state, approvals and provider execution.

## Current Structure

- `server.ts`: Fastify setup, shared hooks, runtime/store construction and route registration only.
- `routes/*`: HTTP route groups by domain. Routes validate request shape, check permissions, call services/stores and return API envelopes.
- `services/*`: use-case orchestration that is not tied to HTTP. Agent task creation, workflow run binding, continuation, approval execution and artifact export orchestration live here.
- `skills/*`: local skill registry and skill capability contracts.
- `workflow/*`: workflow registry, intake classification and prompt routing. This is the canonical backend entrypoint for future agent routing.
- `memory/*`: memory source registry and retrieval boundary for long-term workspace memory and working task memory.
- `connectors/*`: external and local data-source connector registry. Connectors describe where data comes from or syncs to; they do not execute agent providers.
- `policy/*`: permission, risk and approval policy evaluation. Policy is a generic action layer, not only an agent-start gate.
- `sync/*`: local sync boundary for outbox reads, push-to-cloud and future mobile/cloud relay.
- `providers/*`: provider definitions and local provider adapter wiring.
- `stores/*`: business adapters for local files and SQLite. Stores own local format compatibility and normalization.
- `execution/*`: process execution only. Execution modules do not decide business policy or route intent.
- `path-guards.ts`: required path boundary checks.
- `db/*`: SQLite schema and migrations.

## Entry and Attachment Parsing

- `routes/attachment-routes.ts` is the HTTP entrypoint for user-uploaded context from the composer.
- `services/attachment-parser-service.ts` owns file persistence and parsing. Routes and frontend components must not parse PDF/DOCX/text content themselves.
- Uploaded files are stored under `workspace/ops/imports/agent-attachments/YYYY-MM-DD/{routed-folder}/YYYY-MM-DD-{source-file-name}`, behind path-boundary checks. If a same-day filename already exists, the parser uses a readable `-2`, `-3` suffix instead of a UUID.
- Attachment storage folders are derived by the backend route classifier after parsing: `jobs`, `resumes`, `applications`, `experience`, `images`, `documents` or `general`.
- Text, Markdown, CSV, JSON, PDF and DOCX attachments produce normalized `AgentAttachment` DTOs with extracted text, summary and metadata.
- Image attachments are safely stored and parsed through the same attachment service. Local Tesseract OCR runs during upload when available; the extracted text is stored in `parsed.text` and routed to `image.ocr` for screenshot/text extraction requests. Missing OCR language packs are surfaced in attachment metadata instead of being hidden in route-local logic.
- `RoutePreviewRequest.attachments` and `CreateAgentTaskRequest.attachments` are the portable entry contract for cloud/mobile later. Clients send intent plus parsed attachment references; the daemon owns how those attachments affect routing and agent prompts.
- `services/agent-task-service.ts` must compose uploaded attachment summaries/text into the canonical source text and provider prompt before workflow classification or execution approval.

## Local Backend Shape

```text
server.ts
  -> routes/*
    -> services/*
      -> workflow/* / connectors/* / policy/* / sync/* / stores/* / execution/* / providers/*
        -> SQLite runtime DB + workspace files + local agent CLIs
```

The daemon is the local execution plane. It can be driven by the local web app today and by cloud/mobile control surfaces later through `sync/*`, but cloud and mobile must not directly execute local shell commands.

## Route Rules

- Route handlers validate input, call a store/service and return an API envelope.
- Route handlers should not directly read/write project files.
- Route handlers should not spawn commands.
- Route handlers should not contain workflow classification or provider-specific execution logic.
- Risky actions must create approval requests before execution.
- Agent tasks must pass through `policy/agent-execution-policy.ts` before any provider runner starts. Do not call `runApprovedTask` directly from new routes unless the action has already been approved or the policy explicitly allows auto-start.

## Workflow and Skill Routing

- `skills/*/skill.ts` defines the backend-owned product skill library, with companion `SKILL.md` files for agent-readable instructions. `skills/definitions.ts` aggregates built-ins, and `skills/registry.ts` is the stable lookup API. `workflow/skill-registry.ts` is a compatibility re-export.
- Each skill owns a `fileManagement` contract: intake folder, accepted attachment kinds/extensions, readable workspace paths, writable artifact paths and output artifact types.
- `workflow/workflow-registry.ts` defines the workflow registry for multi-step career operations. Workflow definitions are shared contracts and can be executed locally now or mirrored through sync later.
- `workflow/classify-intake.ts` returns a `RouteDecision` for user input.
- `GET /api/skills` exposes registered skills to the UI.
- `GET /api/skills/file-management` exposes the skill file-management matrix for UI, local audits and future cloud/mobile clients.
- `POST /api/agent-route/preview` lets clients preview how input will route before creating an agent task.
- `services/workflow-run-service.ts` turns route metadata into a durable workflow run, then binds the agent task and any approval request to the active step.
- `stores/workflow-run-store.ts` persists `workflow_runs` and `workflow_step_runs` and emits sync outbox events for every run/step change.
- `GET /api/workflow-runs` and `GET /api/workflow-runs/:runId` expose syncable local workflow state for UI, cloud relay and future mobile clients.
- The frontend may suggest or display a route, but the daemon owns the canonical route decision.
- The Agent UI may display workflow progress, but it must read `WorkflowRunDetail` from daemon APIs. It must not derive workflow status from frontend registries or duplicated routing logic.
- Agent tasks must preserve route metadata: `skillId`, `workflowId`, `workflowRunId`, `inputKind`, `sourceText` and the full `routeDecision`. This gives local history, future cloud sync and mobile clients the same routing evidence.
- The frontend must send raw user intent plus daemon-generated route metadata. It must not rebuild career prompts or silently choose a different workflow.
- Attachment storage must use the selected skill's `fileManagement.intakeFolder`; new skill-specific storage rules should be added to the registry, not hard-coded in parser routes.

## Connector Boundary

- `connectors/connector-registry.ts` owns the local connector matrix.
- `GET /api/connectors` exposes available and planned connectors to the UI, local audits and future cloud/mobile clients.
- Connectors are external data/source boundaries. The current product registry only exposes the QQ email IMAP connector.
- Providers are execution boundaries: Codex, Claude, Gemini, OpenCode or gateway-backed agent runtimes.
- The QQ email connector imports recruiter/application messages over IMAP readonly access, but it must not spawn agent processes directly.
- `POST /api/connectors/qq-email/test` validates a QQ email address plus IMAP authorization code without storing the secret.
- `POST /api/connectors/qq-email/credential` stores the QQ IMAP authorization code encrypted in the local daemon SQLite database. The secret must never be returned by API responses.
- New external services should start as connector definitions with explicit capabilities, scopes, workspace paths, auth requirements and sync behavior before adding OAuth or background jobs.

## Sync Boundary

- `sync/sync-service.ts` wraps `sync_events` access and cloud push behavior.
- `sync_events` is the local outbox for future cloud/mobile integration.
- Future mobile approval should flow through sync/relay APIs into the same approval store; mobile must not bypass daemon policy.
- Workflow runs, workflow step runs and task route metadata are the portable synchronization model. Cloud/mobile can display and coordinate workflow state, but execution authority remains in the daemon until a separate cloud execution plane is explicitly introduced.

## Agent Execution Governance

- Default behavior: every local or gateway agent start creates a `start_agent` approval and leaves the task in `waiting_approval`.
- `policy/agent-execution-policy.ts` exposes `evaluateActionPolicy` for all risky actions: `run_shell`, file writes/deletes, package installs, network access, git operations, application sending and cloud sync.
- Agent start is implemented as a specialization of the generic action policy. New features should add action policy inputs instead of creating route-local approval rules.
- Workflow steps with `requiredPermission` must be evaluated through `evaluateWorkflowStepPolicy` before the step runs or records an approval dependency.
- Task status changes must be reflected into the attached workflow run and step run. Runner callbacks and route/service cancellation paths should call `workflowRunService.syncTaskStatus`.
- Continuations are workflow activity too. When a completed/failed/cancelled agent task is continued, the approval and later runner state changes must be attached back to the same workflow run instead of creating a disconnected execution path.
- Local development escape hatch: set `UCAREER_AGENT_AUTO_START=1` to bypass the approval gate. This must not be used in shared demos, packaged builds, or unattended user environments.
- `openclaw` is treated as `critical` because it can cross the local boundary through a gateway. `claude` and `opencode` are `high` because their embedded adapter defaults may bypass interactive CLI permission prompts. Other local providers are at least `medium`.
- Continuations are new execution attempts and must be approved the same way as fresh tasks.
- Approval UI must remain reachable from the Agent console whenever `approvals.length > 0`; backend approval gates are not acceptable without a user-facing decision path.

## Store Rules

- Stores own local file formats and migration compatibility.
- Stores normalize local file data into shared DTOs.
- Stores must use `path-guards.ts` for user-controlled paths.
- Stores must not spawn processes or import `execution/*`; use a service plus an execution module for export/render work.

## Next Refactor Boundary

- Promote the current workflow registry from route preview into actual workflow execution once frontend routing has been switched to the backend preview API.
