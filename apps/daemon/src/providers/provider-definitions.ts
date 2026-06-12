import process from "node:process";
import type { PaperclipAdapterDefinition } from "./paperclip-adapter-provider";

export function createProviderDefinitions(): PaperclipAdapterDefinition[] {
  return [
    {
      id: "codex",
      label: "Codex CLI",
      adapterType: "codex_local",
      packageDir: "codex-local",
      command: process.env.CODEX_BIN || "codex",
      contextWindow: {
        tokens: 400_000,
        model: "gpt-5.5",
        source: "model_default",
        note: "Codex local adapter primary model context window.",
      },
      capabilities: { structuredRunner: true, ptyRunner: true, resumeSession: true, approvals: true, mcp: true },
    },
    {
      id: "claude",
      label: "Claude Code / CCB",
      adapterType: "claude_local",
      packageDir: "claude-local",
      command: process.env.CLAUDE_BIN || "ccb",
      contextWindow: {
        tokens: 200_000,
        source: "provider_default",
        note: "Claude Code model family default context window.",
      },
      capabilities: { structuredRunner: true, ptyRunner: true, resumeSession: true, approvals: true, mcp: true },
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      adapterType: "gemini_local",
      packageDir: "gemini-local",
      command: process.env.GEMINI_BIN || "gemini",
      contextWindow: {
        tokens: 1_000_000,
        model: "auto",
        source: "provider_default",
        note: "Gemini CLI auto lane context window.",
      },
      capabilities: { structuredRunner: true, ptyRunner: true, resumeSession: false, approvals: true, mcp: false },
    },
    {
      id: "opencode",
      label: "OpenCode",
      adapterType: "opencode_local",
      packageDir: "opencode-local",
      command: process.env.OPENCODE_BIN || "opencode",
      contextWindow: {
        tokens: 400_000,
        model: "openai/gpt-5.2-codex",
        source: "model_default",
        note: "OpenCode default OpenAI Codex lane context window.",
      },
      capabilities: { structuredRunner: true, ptyRunner: true, resumeSession: true, approvals: true, mcp: false },
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      adapterType: "openclaw_gateway",
      packageDir: "openclaw-gateway",
      command: process.env.OPENCLAW_BIN || "openclaw",
      capabilities: { structuredRunner: true, ptyRunner: false, resumeSession: true, approvals: true, mcp: false },
    },
  ];
}
