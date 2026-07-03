// @ts-nocheck
export function preferredShellForSandbox(shellCommand: string | null | undefined): "bash" | "sh" {
  return shellCommand === "bash" ? "bash" : "sh";
}
