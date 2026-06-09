import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  AgentCapabilities,
  AgentExecutionCommand,
  AgentProvider,
  AgentSessionHandle,
  AgentSessionInput,
  InstallStatus,
} from "@ucareer/agent-core";

const execFileAsync = promisify(execFile);

export const codexCapabilities: AgentCapabilities = {
  structuredRunner: true,
  ptyRunner: true,
  resumeSession: false,
  approvals: true,
  mcp: false,
};

export class CodexProvider implements AgentProvider {
  id = "codex";
  label = "Codex CLI";
  capabilities = codexCapabilities;

  async checkInstalled(): Promise<InstallStatus> {
    try {
      const result = await execFileAsync("codex", ["--version"], { timeout: 5000 });
      const version = normalizeVersionOutput(result.stdout || result.stderr);
      return {
        installed: true,
        ...(version ? { version } : {}),
      };
    } catch (error) {
      return {
        installed: false,
        message: error instanceof Error ? error.message : "Codex CLI is not available",
      };
    }
  }

  createStructuredCommand(input: AgentSessionInput): AgentExecutionCommand {
    return {
      command: "codex",
      args: ["exec", input.prompt || ""],
      cwd: input.workspacePath,
    };
  }

  async startSession(input: AgentSessionInput): Promise<AgentSessionHandle> {
    return {
      id: randomUUID(),
      providerId: this.id,
      status: input.prompt ? "queued" : "waiting_approval",
    };
  }

  async sendMessage(_sessionId: string, _message: string): Promise<void> {
    throw new Error("CodexProvider.sendMessage is not implemented yet");
  }

  async stopSession(_sessionId: string): Promise<void> {
    return;
  }
}

export function createCodexProvider(): CodexProvider {
  return new CodexProvider();
}

function normalizeVersionOutput(output: string): string | undefined {
  const version = output.trim();
  return version.length > 0 ? version : undefined;
}
