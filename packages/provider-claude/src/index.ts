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
} from "@offeru/agent-core";

const execFileAsync = promisify(execFile);

export const claudeCapabilities: AgentCapabilities = {
  structuredRunner: true,
  ptyRunner: true,
  resumeSession: true,
  approvals: true,
  mcp: true,
};

export class ClaudeProvider implements AgentProvider {
  id = "claude";
  label = "Claude Code";
  capabilities = claudeCapabilities;

  async checkInstalled(): Promise<InstallStatus> {
    try {
      const result = await execFileAsync("claude", ["--version"], { timeout: 5000 });
      const version = normalizeVersionOutput(result.stdout || result.stderr);
      return {
        installed: true,
        ...(version ? { version } : {}),
      };
    } catch (error) {
      return {
        installed: false,
        message: error instanceof Error ? error.message : "Claude Code CLI is not available",
      };
    }
  }

  createStructuredCommand(input: AgentSessionInput): AgentExecutionCommand {
    return {
      command: "claude",
      args: ["-p", input.prompt || ""],
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
    throw new Error("ClaudeProvider.sendMessage is not implemented yet");
  }

  async stopSession(_sessionId: string): Promise<void> {
    return;
  }
}

export function createClaudeProvider(): ClaudeProvider {
  return new ClaudeProvider();
}

function normalizeVersionOutput(output: string): string | undefined {
  const version = output.trim();
  return version.length > 0 ? version : undefined;
}
