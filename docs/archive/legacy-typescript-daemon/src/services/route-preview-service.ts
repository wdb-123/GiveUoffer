import type { RoutePreviewRequest } from "@ucareer/shared";
import { getProvider } from "../index";
import { isPaperclipAdapterProvider } from "../providers/paperclip-adapter-provider";
import { classifyIntake } from "../workflow/classify-intake";
import type { DaemonRuntime } from "../index";
import { runWithAgentExecutionSlot } from "./agent-execution-queue-service";

export function createRoutePreviewService(input: {
  runtime: DaemonRuntime;
  workspaceRoot: string;
}) {
  const { runtime, workspaceRoot } = input;
  return {
    async preview(body: RoutePreviewRequest | undefined) {
      const providerId = body?.preferredProviderId || runtime.providers[0]?.id || "";
      const provider = getProvider(runtime, providerId);
      if (!provider) throw new Error(`Provider not found: ${providerId}`);
      if (!isPaperclipAdapterProvider(provider)) throw new Error(`Provider ${provider.id} does not support agent router execution`);
      return classifyIntake({
        text: composePreviewText(body),
        ...(body?.preferredProviderId ? { preferredProviderId: body.preferredProviderId } : {}),
        routeWithAgent: (prompt) => runWithAgentExecutionSlot(`router:${provider.id}`, () =>
          provider.executeRouterPrompt({ prompt, workspacePath: workspaceRoot })),
      });
    },
  };
}

function composePreviewText(body: RoutePreviewRequest | undefined): string {
  const text = String(body?.text || "");
  const attachmentText = (body?.attachments || [])
    .map((attachment) => `[${attachment.kind}] ${attachment.fileName}: ${attachment.parsed.summary}`)
    .join("\n");
  return [text, attachmentText].filter(Boolean).join("\n\n");
}
