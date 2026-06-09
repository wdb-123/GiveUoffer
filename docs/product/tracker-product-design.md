# Application Tracker Product Design

Date: 2026-06-03

## Product Judgment

Application Tracker should be a decision and follow-up system, not just a table.

Email integration is useful, but it should not be required in the MVP. Requiring mailbox access too early creates three problems:

- Trust barrier: users may not want to connect a private mailbox to an early product.
- Setup barrier: OAuth / IMAP setup increases first-use friction.
- Data noise: inboxes include recruiter spam, newsletters, platform alerts and unrelated messages.

Recommended path:

1. MVP: manual and report-generated tracker.
2. v1.1: semi-automatic email import, where the user pastes or forwards selected messages.
3. v1.2+: optional Gmail / Outlook integration with explicit user approval.

## What The Tracker Must Do

The tracker must answer six questions:

1. What have I evaluated?
2. What have I actually applied to?
3. What needs action next?
4. Which companies replied?
5. Which role types are working?
6. Which directions should I stop applying to?

## Current Tracker

Current file:

`workspace/ops/data/applications.md`

Current columns:

| Field | Current use |
|-------|-------------|
| # | Sequential application/report number |
| Date | Evaluation or application date |
| Company | Company name |
| Role | Role title |
| Score | Fit score |
| Status | Canonical status |
| PDF | Whether tailored PDF exists |
| Report | Link to report |
| Notes | Free-form summary |

This is good as a human-readable index, but it is not enough for workflow management.

## Recommended Tracker Layers

### Layer 1: Human-Readable Tracker

Keep `workspace/ops/data/applications.md` as the main user-facing table.

Recommended columns:

| Column | Why |
|--------|-----|
| # | Stable ID |
| Date | Created/evaluated date |
| Company | Company |
| Role | Role |
| Score | Fit quality |
| Status | Current canonical state |
| Next Action | What the user should do next |
| Due | Deadline or follow-up date |
| PDF | Tailored resume generated |
| Report | Evaluation report |
| Source | URL, referral, email, campus, recruiter |
| Notes | Short context |

### Layer 2: Structured Event Log

Add a machine-readable event log later:

`data/application-events.jsonl`

Each line represents one event:

```json
{"date":"2026-06-03","application_id":"012","company":"Example","role":"Robotics Engineer","event":"applied","source":"manual","note":"Submitted via company site"}
```

Why this matters:

- You can reconstruct timeline.
- Email events can be appended without rewriting the table.
- Dashboard analytics become easier.
- Mistakes can be corrected without destroying history.

### Layer 3: Email Evidence Store

Add only when email import exists:

`data/email-evidence/`

Store sanitized snippets, not full mailbox dumps.

Example:

```markdown
# Email Evidence - 012-example-robotics

- Date: 2026-06-05
- From: recruiting@example.com
- Subject: Interview invitation
- Parsed status: Interview
- Confidence: high
- User approved: yes
```

## Status Model

Keep canonical states from `templates/states.yml`:

- `Evaluated`
- `Applied`
- `Responded`
- `Interview`
- `Offer`
- `Rejected`
- `Discarded`
- `SKIP`

Add "Next Action" instead of creating too many statuses.

Examples:

| Status | Next Action |
|--------|-------------|
| Evaluated | Decide apply/skip |
| Applied | Follow up after 7 days |
| Responded | Reply to recruiter |
| Interview | Prepare technical stories |
| Offer | Compare compensation |
| Rejected | Extract learning |
| Discarded | No action |
| SKIP | No action |

This keeps analytics clean.

## Email Integration Design

### Why Email Matters

Most application status changes arrive through email:

- Application received
- Assessment invitation
- Recruiter reply
- Interview scheduling
- Rejection
- Offer discussion
- Follow-up reminders

Without email, the user must manually update status. That is acceptable for MVP, but not enough for a polished product.

### What Email Should Extract

Email parser should extract:

| Field | Example |
|-------|---------|
| Company | OpenAI |
| Role | Robotics Software Engineer |
| Event type | application_received / interview_invite / rejection / offer / assessment |
| Date | 2026-06-03 |
| Sender | recruiting@company.com |
| Subject | Interview invitation |
| Deadline | Complete assessment by June 10 |
| Next action | Reply / schedule / prepare / archive |
| Confidence | high / medium / low |

### Important Rule

Email should never silently mutate the tracker.

Correct flow:

1. Parse email.
2. Propose tracker update.
3. Show evidence.
4. Ask user to confirm.
5. Then write to tracker/event log.

This avoids false positives.

## Three Implementation Levels

### Level 1: No Email, Manual Tracker

Best for MVP.

User actions:

- After evaluation, system writes tracker addition.
- User manually marks `Applied`, `Interview`, `Rejected`, etc.
- Follow-up script calculates overdue actions.

What to build:

- Add `Next Action` and `Due` fields.
- Add follow-up recommendations.
- Add weekly summary.

### Level 2: Paste / Forward Email

Best for early validation.

User actions:

- User pastes recruiter email.
- System extracts company, role, event and next action.
- System proposes tracker update.

Why this is good:

- No OAuth.
- Low privacy risk.
- Easy to test parser quality.
- Works with Gmail, Outlook, school email and job-board messages.

### Level 3: Optional Mailbox Integration

Best after product trust is established.

Possible sources:

- Gmail API
- Outlook / Microsoft Graph
- IMAP

Required safeguards:

- User explicitly connects mailbox.
- Default search scope is narrow.
- Only recruiting-related messages are read.
- User approves updates before writing.
- Store minimal evidence, not full email bodies.

Suggested Gmail search queries:

```text
(subject:application OR subject:interview OR subject:assessment OR subject:offer OR subject:rejection)
(from:recruiting OR from:talent OR from:jobs OR from:careers)
newer_than:90d
```

Chinese-market examples:

```text
面试 OR 笔试 OR 测评 OR 投递 OR 录用 OR offer OR 不合适 OR 感谢投递
```

## Tracker Analytics

The tracker should support these reports:

### Weekly Review

- Evaluated this week
- Applied this week
- Replies received
- Interviews scheduled
- Rejections received
- Overdue follow-ups
- Best role categories
- Worst role categories

### Funnel

| Stage | Count | Conversion |
|-------|-------|------------|
| Evaluated | 40 | - |
| Applied | 18 | 45% |
| Responded | 6 | 33% |
| Interview | 3 | 50% |
| Offer | 1 | 33% |

### Role-Type Learning

Answer:

- Which archetypes get replies?
- Which companies never respond?
- Which salary bands are realistic?
- Which job sources produce interviews?
- Which scores were too optimistic?

## MVP Feature Decision

For current product development, prioritize:

### P0

- Add `Next Action` and `Due` concept.
- Keep canonical statuses simple.
- Generate tracker entry automatically after evaluation.
- Add follow-up cadence calculation.
- Add weekly review summary.

### P1

- Paste-email parser.
- Application event log.
- Dashboard filter by next action and due date.

### P2

- Gmail / Outlook integration.
- Automatic email monitoring.
- Calendar sync for interview events.

## Why Not Start With Email

Email integration sounds like the obvious solution, but it is not the first feature to build.

Reasons:

- Many users will not grant email access to an unproven product.
- Job-board emails are inconsistent and noisy.
- Recruiter conversations often happen on LinkedIn, Boss, Maimai, WeChat or phone, not only email.
- The hard product problem is not ingestion; it is deciding what action the user should take next.

Therefore:

> Build the tracker decision model first. Add email as an input source later.

## Recommended Next Build

Smallest useful tracker improvement:

1. Keep `workspace/ops/data/applications.md` compatible and layer `Next Action` / `Due` through `data/application-events.jsonl`.
2. Add `tracker-workflow.mjs` to summarize workflow state.
3. Add a command/script that prints:
   - overdue follow-ups
   - applications waiting for decision
   - interviews needing prep
   - role categories with poor response
4. Add paste-email parsing as an experimental command.

This creates value before requiring mailbox access.
