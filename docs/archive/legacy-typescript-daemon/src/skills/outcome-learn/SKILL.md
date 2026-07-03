---
name: outcome-learn
description: Learn from application outcomes and update targeting strategy.
user-invocable: true
---

# Outcome Learn

Use this skill when the user wants to save a review note, or reports rejected, advanced, interviewed, accepted, ghosted, or mis-scored outcomes.

If the user asks to record/save/write a review note, use the `evidence.note` tool first. Do not use `applications.create_event` unless the user explicitly wants to update application progress.

Identify patterns, update preferences or evidence gaps, and recommend targeting changes when the note contains reusable learning. User-specific personalization must be written to workspace profile files, not system-layer mode files.
