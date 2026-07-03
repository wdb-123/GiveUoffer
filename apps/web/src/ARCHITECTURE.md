# Web Frontend Architecture

`apps/web/src` is organized by responsibility, not by accidental growth.

## Directories

- `App.tsx`: composition only. It wires `useUcareerData`, `AppLayout` and `ViewRenderer`.
- `api.ts`: typed daemon API client. No React code.
- `hooks/`: stateful app and feature hooks. Hooks may import `api.ts`.
- `hooks/useUcareerData.ts`: facade that composes domain data hooks; domain-specific server state belongs in `useResumeData`, `useMarketData`, `useApplicationsData`, `useExperienceData`, `useEvidenceData` and `useReportsData`.
- `layout/`: app shell, sidebar and view switching. Layout components do not import `api.ts`.
- `layout/pageAgentPrompts.ts`: page-triggered Agent prompts and page contexts. `ViewRenderer` should call these helpers instead of embedding long prompt strings.
- `sections/`: page-level feature components. Sections receive props and callbacks; they do not fetch.
- `sections/agent/AgentComposer.tsx`: Agent input, attachments, provider and permission controls. `AgentSection` owns task state and upload handlers; the composer owns the form UI.
- `sections/agent/AgentThreadStage.tsx`: Agent dialogue, turn jump markers and auto-scroll behavior.
- `sections/agent/AgentApprovalBar.tsx`: Agent approval cards and approval decision controls.
- `sections/agent/useAgentConversationState.ts`: Agent transcript, pending draft, turn grouping and running process derivation.
- `sections/agent/useAgentFilePreview.ts`: Agent file preview open/close/resize state.
- `ui/`: reusable visual primitives shared by two or more sections.
- `views.ts`: stable view registry.

## Import Rules

- `sections/*` may import `ui/*`, shared DTO types and local formatters.
- `sections/*` must not import `api.ts`.
- `layout/*` must not import feature sections except `ViewRenderer`.
- `hooks/*` may import `api.ts` and own side effects.
- `useUcareerData.ts` should compose domain hooks instead of owning all feature state directly.
- `App.tsx` must not contain business logic or direct API calls.
- `ViewRenderer.tsx` must not embed long Agent prompts; put page-triggered prompt/context builders in `layout/pageAgentPrompts.ts`.

## Component Rules

- Page components should be controlled by props.
- Keep local UI-only state inside the nearest component.
- Keep server state and mutations in hooks.
- Extract a `ui/*` component when at least two sections need the same pattern.
- Avoid page-specific theme drift; use the global Ucareer workbench tokens.

## Resolution Framework

- `styles/resolution.css` owns viewport compatibility: sidebar widths, page gutters, content widths and shell breakpoints.
- Shell-level breakpoints live only in `styles/resolution.css`. Do not add new sidebar or app-layout media queries inside feature CSS.
- Feature pages should set `--view-content-width`, `--view-readable-width` and `--view-gutter-inline` on `.view-{id}` when they need a page-specific density.
- Reusable page blocks should use `.uc-content-frame` or `.uc-readable-frame` instead of hard-coded `max-width` values.
- Component-level adaptation should prefer container queries. Viewport media queries are reserved for shell/page layout changes.
- Typography and density must come from `--density-*` tokens: text sizes, icon sizes, control heights and brand marks scale together at `1180px`, `1024px` and `760px`.
- Do not hard-code new component font sizes unless the value is a local semantic alias that points back to a `--density-*` token.

## Agent Console Rules

- The frontend does not own career workflow routing.
- `AgentSection` sends raw user intake text through callbacks.
- `useAgentData` creates agent tasks through daemon APIs and reads the daemon-owned routing result from returned `AgentTask` records.
- The daemon owns `RouteDecision` and agent prompt construction through `workflow/*`.
- Agent workflow progress must come from daemon `WorkflowRunDetail` APIs. The UI may render current step and progress, but must not derive workflow state locally.
- Follow-up UI is selected-task state, not a separate router. The composer may show a follow-up context bar and send `continueTaskId` only when the selected task is continuable.
- When the selected task is queued, running or waiting for approval, the composer must prevent accidental new-task sends and keep approval controls visible above the input.
- Frontend helpers may format transcripts, labels and status text, but must not duplicate backend skill classification rules.
