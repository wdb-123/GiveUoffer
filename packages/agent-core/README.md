# OfferU Agent Core

Core abstractions for provider-neutral AI agent execution.

This package defines:

- Provider capability metadata
- Session input and handles
- Approval policy shape
- Agent provider interface
- Event sink interface

Provider packages such as `provider-codex` and `provider-claude` should implement these interfaces.
