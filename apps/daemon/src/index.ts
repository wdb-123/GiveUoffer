import type { AgentProvider } from "@offeru/agent-core";

export interface DaemonRuntime {
  providers: AgentProvider[];
  workspaceRoot: string;
}

export function createDaemonRuntime(input: DaemonRuntime): DaemonRuntime {
  return input;
}

export function getProvider(runtime: DaemonRuntime, providerId: string): AgentProvider | undefined {
  return runtime.providers.find((provider) => provider.id === providerId);
}
