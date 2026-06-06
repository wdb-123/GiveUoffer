# Web Frontend Architecture

`apps/web/src` is organized by responsibility, not by accidental growth.

## Directories

- `App.tsx`: composition only. It wires `useOfferUData`, `AppLayout` and `ViewRenderer`.
- `api.ts`: typed daemon API client. No React code.
- `hooks/`: stateful app and feature hooks. Hooks may import `api.ts`.
- `layout/`: app shell, sidebar and view switching. Layout components do not import `api.ts`.
- `sections/`: page-level feature components. Sections receive props and callbacks; they do not fetch.
- `ui/`: reusable visual primitives shared by two or more sections.
- `views.ts`: stable view registry.

## Import Rules

- `sections/*` may import `ui/*`, shared DTO types and local formatters.
- `sections/*` must not import `api.ts`.
- `layout/*` must not import feature sections except `ViewRenderer`.
- `hooks/*` may import `api.ts` and own side effects.
- `App.tsx` must not contain business logic or direct API calls.

## Component Rules

- Page components should be controlled by props.
- Keep local UI-only state inside the nearest component.
- Keep server state and mutations in hooks.
- Extract a `ui/*` component when at least two sections need the same pattern.
- Avoid page-specific theme drift; use the global OfferU workbench tokens.
