# OfferU Architecture Task Split

Date: 2026-06-05

This document turns the target architecture into concrete workstreams. The first implementation keeps the current `visualizer/` usable while introducing `apps/` and `packages/`.

## Workstreams

| Workstream | Owner role | Scope | First deliverable |
| --- | --- | --- | --- |
| Web console | Frontend agent | React/Vite screens, typed API client, visualizer migration | `apps/web` shell and first dashboard route |
| Local daemon | Backend agent | Local HTTP/WebSocket server, current service migration, health checks | `apps/daemon` legacy server plus TypeScript Fastify API |
| Shared contracts | Platform agent | Shared types, event model, API envelopes, permission model | `packages/shared` and `packages/agent-core` |
| Provider adapters | Agent platform agent | Codex/Claude/Gemini adapters behind one interface | `packages/provider-codex` install check |
| Data migration | Data agent | Local file compatibility, SQLite session/event storage | Mapping from current files to SaaS-ready entities |
| Cloud sync | SaaS agent | Device pairing, sync protocol, task relay, approvals | Cloud API schema draft |
| Mobile console | Deferred | Approval inbox, task stream, notifications | Explicitly excluded from the current migration batch |

## Immediate Engineering Order

1. Keep `resume-visualizer.mjs` working as the legacy route.
2. Add `apps/daemon` as the new local execution boundary.
3. Add `packages/shared` and `packages/agent-core` for contracts.
4. Add `apps/web` as the future React/Vite surface.
5. Move visualizer modules into `apps/web` and `apps/daemon` incrementally.
6. Add provider adapters only after the daemon contract is stable.
7. Connect `apps/daemon/src/server.ts` to provider install checks and future task/session APIs.

## Current Implementation Status

| Area | Status | Notes |
| --- | --- | --- |
| Legacy visualizer | Kept | `npm run daemon` starts the existing visualizer-compatible server |
| Daemon API | Started | `npm run daemon:api` starts a Fastify TS API with `/health` and provider endpoints |
| Web app | Started | `npm run web` starts the React/Vite shell |
| Web architecture hygiene | Started | layout, sidebar, view registry, data hook and shared UI primitives are separated |
| Shared contracts | Started | `packages/shared` defines envelopes, jobs, approvals and agent events |
| Agent core | Started | `packages/agent-core` defines the provider interface |
| Codex provider | Started | `packages/provider-codex` checks whether `codex` is installed |
| Claude provider | Started | `packages/provider-claude` checks whether `claude` is installed |
| Gemini provider | Started | `packages/provider-gemini` checks whether `gemini` is installed |
| Task queue | Started | daemon stores tasks, events and approvals in local SQLite |
| Structured runner | Started | approval allow triggers provider CLI execution with `spawn`, no shell interpolation |
| Local command sessions | Started | daemon creates approval-gated local shell tasks; approved commands stream stdout/stderr into task events |
| Web approval UI | Started | web console can create tasks and allow/deny approvals |
| Task event timeline | Started | web console can select a task and inspect provider-neutral events |
| Career profile migration | Started | daemon TS API reads `cv.md`, `config/profile.yml` and `modes/_profile.md`; web console shows profile overview |
| Resume module migration | Started | daemon TS API lists/reads resumes; web console shows resume library |
| Resume generation migration | Started | daemon TS API generates deterministic local previews and saves explicit generated Markdown resumes; web console can preview/save variants |
| Resume/job link migration | Started | generated resumes are linked to target market jobs through `data/resume-job-links.json` and hydrated in the resume list |
| Resume export migration | Started | daemon TS API exports resumes as Markdown, HTML, PDF and DOCX; web console can trigger exports |
| Recruitment market migration | Started | daemon TS API reads sharded market jobs; web console shows job list |
| Evaluation reports migration | Started | daemon TS API lists/reads Markdown reports; web console shows report metrics and report preview |
| Applications migration | Started | daemon TS API parses tracker markdown; web console shows application status |
| Experience assets migration | Started | daemon TS API reads project notes and metadata; web console shows experience cards |
| Evidence center migration | Started | daemon TS API reads evidence requests; web console shows evidence cards |
| Evidence fulfillment writes | Started | daemon TS API appends evidence to target project notes; web console can submit evidence |
| Experience metadata writes | Started | daemon TS API saves structured experience metadata; web console can edit summary/evidence |
| Web section refactor | Completed | `App.tsx` now owns data/navigation; business panels live in `apps/web/src/sections` |
| Application event writes | Started | daemon TS API appends application events; web console can save progress events |
| Application event CRUD | Started | daemon TS API updates/deletes events; web console can edit/delete latest event |
| Cloud API | Started | `apps/api` exposes health, pairing and sync placeholder endpoints |
| Sync outbox | Started | daemon writes local changes to SQLite `sync_events` and exposes outbox APIs |
| Cloud push bridge | Started | daemon pushes local outbox events to `apps/api` and marks accepted events as pushed |
| Desktop shell | Planned | `apps/desktop` package boundary exists |
| Mobile console | Deferred | mobile is intentionally not implemented in this migration batch |

## Guardrails

- Do not upload source repositories to cloud sync.
- Do not submit job applications automatically.
- Do not rewrite current `visualizer/` in one pass.
- Keep current data files readable during every migration step.
- High-risk local actions must be represented as approval requests.
