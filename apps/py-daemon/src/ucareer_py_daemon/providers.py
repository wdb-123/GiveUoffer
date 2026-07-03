from __future__ import annotations

import os
import shutil
from datetime import UTC, datetime
from typing import Any


def list_providers() -> list[dict[str, Any]]:
    return [_provider_summary(provider) for provider in _provider_definitions()]


def check_provider(provider_id: str) -> dict[str, Any] | None:
    provider = next((item for item in _provider_definitions() if item["id"] == provider_id), None)
    if not provider:
        return None
    command = str(provider.get("command") or provider["id"])
    resolved = shutil.which(command)
    return {
        "providerId": provider["id"],
        "installed": bool(resolved),
        **({"path": resolved} if resolved else {}),
        **({} if resolved else {"message": f"{command} is not available on PATH"}),
        "checkedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }


def _provider_summary(provider: dict[str, Any]) -> dict[str, Any]:
    summary = {
        "id": provider["id"],
        "label": provider["label"],
        "capabilities": provider["capabilities"],
    }
    if provider.get("contextWindow"):
        summary["contextWindow"] = provider["contextWindow"]
    return summary


def _provider_definitions() -> list[dict[str, Any]]:
    return [
        {
            "id": "codex",
            "label": "Codex CLI",
            "command": os.environ.get("CODEX_BIN") or "codex",
            "contextWindow": {
                "tokens": 400_000,
                "model": "gpt-5.5",
                "source": "model_default",
                "note": "Codex local adapter primary model context window.",
            },
            "capabilities": {"structuredRunner": True, "ptyRunner": True, "resumeSession": True, "approvals": True, "mcp": True},
        },
        {
            "id": "claude",
            "label": "Claude Code / CCB",
            "command": os.environ.get("CLAUDE_BIN") or "ccb",
            "contextWindow": {
                "tokens": 200_000,
                "source": "provider_default",
                "note": "Claude Code model family default context window.",
            },
            "capabilities": {"structuredRunner": True, "ptyRunner": True, "resumeSession": True, "approvals": True, "mcp": True},
        },
        {
            "id": "gemini",
            "label": "Gemini CLI",
            "command": os.environ.get("GEMINI_BIN") or "gemini",
            "contextWindow": {
                "tokens": 1_000_000,
                "model": "auto",
                "source": "provider_default",
                "note": "Gemini CLI auto lane context window.",
            },
            "capabilities": {"structuredRunner": True, "ptyRunner": True, "resumeSession": False, "approvals": True, "mcp": False},
        },
        {
            "id": "opencode",
            "label": "OpenCode",
            "command": os.environ.get("OPENCODE_BIN") or "opencode",
            "contextWindow": {
                "tokens": 400_000,
                "model": "openai/gpt-5.2-codex",
                "source": "model_default",
                "note": "OpenCode default OpenAI Codex lane context window.",
            },
            "capabilities": {"structuredRunner": True, "ptyRunner": True, "resumeSession": True, "approvals": True, "mcp": False},
        },
        {
            "id": "openclaw",
            "label": "OpenClaw",
            "command": os.environ.get("OPENCLAW_BIN") or "openclaw",
            "capabilities": {"structuredRunner": True, "ptyRunner": False, "resumeSession": True, "approvals": True, "mcp": False},
        },
    ]
