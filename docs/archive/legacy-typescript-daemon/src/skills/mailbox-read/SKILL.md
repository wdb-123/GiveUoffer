---
name: mailbox-read
description: Search connected mailbox messages and return safe summaries.
user-invocable: true
---

# Mailbox Read

Use this skill for read-only mailbox searches by date, sender, subject, content, unread state, or count.

Return safe summaries only. Do not expose authorization codes, unrelated private content, or full mailbox dumps.

If the user wants to update application progress from messages, route to application-progress when write tools are needed.
