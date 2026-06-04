# Career-Ops Product Plan

Date: 2026-06-02

## Product Management Baseline

This plan applies Senior Product Manager practices to career-ops as a product, not as a personal job-search configuration.

External references used:

- Atlassian Product Management: https://www.atlassian.com/zh/agile/product-management
- Atlassian Product Manager Role: https://www.atlassian.com/zh/agile/product-management/product-manager/
- Productboard Prioritization Guide: https://www.productboard.com/wp-content/uploads/2020/09/The-Essential-Guide-to-Prioritization.pdf
- ProductPlan Strategic Roadmap Planning Guide: https://assets.productplan.com/content/ProductPlan-Strategic-Roadmap-Planning-Guide.pdf
- Built In Senior Product Manager Overview: https://builtin.com/learn/careers/senior-product-manager

The relevant product-management skills are:

- Product strategy and roadmap ownership
- User discovery and market/customer insight
- Evidence-based prioritization
- PRD clarity and acceptance criteria
- Success metrics and post-launch iteration
- Cross-functional alignment across users, maintainers, contributors and AI-agent workflows

## Product Vision

Career-Ops is the AI job-search operating system for serious candidates who want to make fewer, higher-quality applications with strong evidence, customized resumes and a clear application pipeline.

The product should not become a mass-apply tool. Its core value is disciplined decision support: find good-fit roles, explain fit clearly, produce tailored materials, track outcomes and learn from feedback.

## Target Users

For the user research plan, recruiting channels, interview questions and detailed personas, see `docs/USER_RESEARCH.md`.
For the fresh-graduate segment analysis and Graduate Mode feature decisions, see `docs/GRADUATE_USER_RESEARCH.md`.

### ICP 1: Senior Technical Job Seeker

- Has a strong but non-generic background.
- Needs to evaluate many roles without losing quality.
- Wants tailored resumes, fit reports, interview stories and tracking.
- Values local data control and agent-assisted customization.

### ICP 2: Career Switcher With Technical Proof

- Has projects, articles or domain evidence, but needs better positioning.
- Needs help mapping proof points to target roles.
- Benefits from archetypes, scoring, story bank and personalized CV generation.

### ICP 3: Power User / AI Coding CLI User

- Comfortable with Claude Code, Codex, Gemini, OpenCode or similar tools.
- Wants a local-first system that can be customized through files.
- Will extend scanners, modes, templates and dashboards.

### Secondary Users

- Career coaches who help candidates operate a structured job search.
- Open-source contributors improving scanners, parsers, dashboards and localization.
- Fresh graduates, but only through a separate Graduate Mode after validation. They have different needs: career direction, experience proof, campus-recruiting timeline and guided workflows.

## Core User Problems

1. Job listings are noisy and hard to compare.
2. Candidates waste time applying to low-fit roles.
3. Generic resumes underperform, but manual tailoring is slow.
4. Interview stories and proof points are scattered.
5. Application tracking is fragile across spreadsheets, PDFs, notes and portals.
6. AI tools can help, but without a workflow they produce inconsistent outputs.
7. Fresh graduates struggle earlier in the funnel: they often do not know which roles fit, how to turn coursework/projects into evidence, or how to manage campus-recruiting stages.

## Product Principles

- Quality over volume: discourage low-fit applications.
- Human in the loop: never submit applications automatically.
- Local-first: user data stays in local files unless the user explicitly sends it to an AI provider.
- Evidence-led: scores, resume edits and stories should cite CV, reports, job descriptions and proof points.
- Customizable by agents: users should be able to ask an AI coding agent to change the system safely.
- Operationally verifiable: scanners, liveness checks, trackers and report formats should be testable.

## North Star Metric

High-quality application rate:

> Number of applications submitted to roles scoring >= 4.0/5 with a tailored CV, verified live posting and complete tracker entry.

This measures quality, not raw application volume.

## Supporting Metrics

| Area | Metric | Why it matters |
|------|--------|----------------|
| Discovery | New relevant roles found per scan | Measures scanner usefulness |
| Quality | Percentage of evaluated roles >= 4.0/5 | Measures filtering precision |
| Efficiency | Time from URL to report + PDF + tracker | Measures workflow speed |
| Evidence | Reports with URL, legitimacy, PDF and tracker link | Measures pipeline completeness |
| Personalization | CV sections changed per job with source rationale | Measures tailoring quality |
| Learning | Feedback items added to profile / story bank / digest | Measures system improvement |
| Safety | Applications blocked before final submit | Preserves human-in-loop ethics |

## Product Surface

### Current Product Modules

- Job evaluation modes
- Resume/PDF generation
- Portal scanner
- Pipeline inbox
- Tracker and merge scripts
- Liveness verification
- Batch processing
- Dashboard TUI
- Interview story bank
- Profile and personalization layer

### Product Gaps

- No single product strategy / PRD source of truth
- No user-facing onboarding checklist in the product surface
- Scanner relevance depends heavily on manual portal configuration
- Limited outcome analytics after applications are sent
- Dashboard is useful, but the product workflow still feels file/script-first
- No guided feedback loop for "this score was wrong" or "I would never apply here"
- Product metrics are implied but not measured in one place

## MVP Product Definition

MVP is not "more automation." MVP is a reliable local workflow:

1. User completes setup with CV, profile, portals and tracker.
2. User pastes a job URL.
3. System verifies liveness.
4. System evaluates fit with transparent scoring.
5. System generates tailored resume output.
6. System records tracker entry without duplication.
7. System saves interview prep and story suggestions.
8. User gives feedback.
9. System updates personalization files safely.

## Roadmap

For the release schedule, phase gates and testing plan, see `docs/PRODUCT_TIMELINE.md`.

### Phase 1: Product Foundation

Goal: make career-ops understandable, measurable and safer to operate.

- Add this product plan as source of truth.
- Add explicit success metrics to documentation.
- Add onboarding checklist to setup docs.
- Define product-quality acceptance criteria for evaluation reports.
- Add "feedback-to-profile" workflow documentation.

### Phase 2: Guided Workflow

Goal: reduce friction for non-expert users while keeping local-first control.

- Add CLI command or script that runs setup validation and shows next actions.
- Add guided evaluation summary after each job: apply, skip, watch, or ask for more research.
- Add a feedback command: "score too high", "score too low", "missed my experience", "bad company signal".
- Add structured feedback output into `modes/_profile.md`, `config/profile.yml` or `article-digest.md`.
- Improve report readability with consistent decision blocks.

### Phase 3: Outcome Analytics

Goal: make the product learn from real outcomes.

- Define the tracker model before adding email integration. See `docs/TRACKER_PRODUCT_DESIGN.md`.
- Track application outcomes by company, role archetype, source and score.
- Add rejection / response / interview conversion dashboard.
- Add follow-up ROI and cadence analytics.
- Add scanner precision metrics: found, evaluated, skipped, applied.
- Add periodic recommendation report: target roles to increase/decrease.

### Phase 4: Productized Dashboard

Goal: move from script-first to product-first usage.

- Build a dashboard flow for inbox, evaluation status, CV/PDF assets and next actions.
- Add filters for score, legitimacy, location, compensation and archetype.
- Add "why this role" evidence view.
- Add "what changed in the tailored CV" view.
- Add exportable weekly job-search brief.

### Phase 5: Ecosystem And Extensibility

Goal: make career-ops easier to extend without breaking personal data.

- Add provider/plugin contracts for scanners.
- Add templates for new language modes.
- Add mode compatibility tests.
- Add marketplace-style examples for archetypes and scoring overlays.
- Add contributor-facing product backlog and issue templates.

## RICE Prioritization

Scoring: Reach 1-5, Impact 1-5, Confidence 1-5, Effort 1-5. Priority = Reach * Impact * Confidence / Effort.

| Feature | Reach | Impact | Confidence | Effort | Priority | Rationale |
|---------|-------|--------|------------|--------|----------|-----------|
| Product plan source of truth | 5 | 4 | 5 | 1 | 100 | Aligns development immediately |
| Setup/onboarding checklist | 5 | 5 | 5 | 2 | 62.5 | Reduces first-use failure |
| Feedback-to-profile workflow | 4 | 5 | 4 | 2 | 40 | Makes product learn from use |
| Evaluation decision block | 4 | 4 | 4 | 2 | 32 | Makes reports easier to act on |
| Outcome analytics dashboard | 3 | 5 | 3 | 4 | 11.25 | Valuable but heavier |
| Productized dashboard flow | 3 | 5 | 3 | 5 | 9 | High value, high effort |
| Scanner plugin contract | 2 | 4 | 3 | 4 | 6 | Important for contributors |

## Acceptance Criteria

### Evaluation Report

- Includes role, company, date, URL, score, legitimacy and recommendation.
- Clearly says apply / skip / watch / research more.
- Explains top fit signals and top risks.
- References candidate proof points without inventing metrics.
- Produces tracker addition through the TSV workflow.

### Tailored CV

- Uses `cv.md` as source of truth.
- Adds job-relevant keywords without fabricating experience.
- Preserves measurable claims from CV or article digest only.
- Produces PDF or HTML output in `output/`.

### Scanner

- Applies positive and negative title filters.
- Deduplicates against scan history.
- Does not mark stale roles as active without liveness verification.
- Produces actionable pipeline entries.

### Feedback Loop

- Captures user correction.
- Classifies it as preference, proof point, scoring rule or company signal.
- Writes personalization to user-layer files only.
- Never edits system-layer defaults for user-specific preference.

## Development Backlog

### Immediate

- Add setup checklist to `docs/SETUP.md`.
- Add report decision block template to `modes/oferta.md`.
- Add feedback capture instructions to `modes/tracker.md` or a new mode.
- Add product metric definitions to `docs/SCRIPTS.md` or dashboard docs.

### Next

- Add `node product-health.mjs` to summarize setup, pipeline, reports, tracker and metrics.
- Add dashboard filters for recommendation and legitimacy.
- Add scanner precision report.
- Add weekly job-search brief generator.

### Later

- Add guided onboarding UI in dashboard.
- Add provider contract tests for scanner integrations.
- Add sample product configurations for different career archetypes.
- Add structured event log for evaluations and outcomes.
- Validate a separate Graduate Mode with fresh-graduate scoring, experience asset extraction and campus-recruiting tracker.

## Open Questions

- Should the primary user experience remain CLI-agent-first, or should the dashboard become the main entry point?
- Should product metrics live in Markdown reports, TSV tracker, JSON events or all three?
- Should feedback be a new mode, or embedded after every evaluation?
- What is the smallest dashboard improvement that materially changes daily usage?
- Should scanner quality optimize for precision first, or broad discovery first?

## Release Loop

Each product iteration should follow this loop:

1. Discovery: identify a repeated user pain or workflow failure.
2. Requirement: write the user story, acceptance criteria and affected files.
3. Prioritization: score with RICE or a simpler impact/effort matrix.
4. Build: implement the smallest useful version.
5. Verify: run relevant scripts/tests and inspect generated artifacts.
6. Measure: record before/after effect on setup success, evaluation quality or time saved.
7. Learn: update docs, profile rules or backlog based on evidence.
