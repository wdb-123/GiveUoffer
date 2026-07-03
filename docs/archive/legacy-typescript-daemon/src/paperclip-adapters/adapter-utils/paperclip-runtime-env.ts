// @ts-nocheck
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { sanitizeRemoteExecutionEnv } from "./remote-execution-env.js";
import { buildSshSpawnTarget, type SshRemoteExecutionSpec } from "./ssh.js";
import { redactCommandText } from "./command-redaction.js";

const SENSITIVE_ENV_KEY = /(key|token|secret|password|passwd|authorization|cookie)/i;
const REDACTED_LOG_VALUE = "***REDACTED***";

interface SpawnTarget {
  command: string;
  args: string[];
  cwd?: string;
  cleanup?: () => Promise<void>;
}

type RemoteExecutionSpec = SshRemoteExecutionSpec;

export function redactEnvForLogs(env: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    redacted[key] = SENSITIVE_ENV_KEY.test(key) ? REDACTED_LOG_VALUE : value;
  }
  return redacted;
}

export function redactCommandTextForLogs(command: string): string {
  return redactCommandText(command, REDACTED_LOG_VALUE);
}

export function buildInvocationEnvForLogs(
  env: Record<string, string>,
  options: {
    runtimeEnv?: NodeJS.ProcessEnv | Record<string, string>;
    includeRuntimeKeys?: string[];
    resolvedCommand?: string | null;
    resolvedCommandEnvKey?: string;
  } = {},
): Record<string, string> {
  const merged: Record<string, string> = { ...env };
  const runtimeEnv = options.runtimeEnv ?? {};

  for (const key of options.includeRuntimeKeys ?? []) {
    if (key in merged) continue;
    const value = runtimeEnv[key];
    if (typeof value !== "string" || value.length === 0) continue;
    merged[key] = value;
  }

  const resolvedCommand = options.resolvedCommand?.trim();
  if (resolvedCommand) {
    merged[options.resolvedCommandEnvKey ?? "PAPERCLIP_RESOLVED_COMMAND"] = redactCommandTextForLogs(resolvedCommand);
  }

  return redactEnvForLogs(merged);
}

export function buildPaperclipEnv(agent: { id: string; companyId: string }): Record<string, string> {
  const resolveHostForUrl = (rawHost: string): string => {
    const host = rawHost.trim();
    if (!host || host === "0.0.0.0" || host === "::") return "localhost";
    if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) return `[${host}]`;
    return host;
  };
  const vars: Record<string, string> = {
    PAPERCLIP_AGENT_ID: agent.id,
    PAPERCLIP_COMPANY_ID: agent.companyId,
  };
  const runtimeHost = resolveHostForUrl(
    process.env.PAPERCLIP_LISTEN_HOST ?? process.env.HOST ?? "localhost",
  );
  const runtimePort = process.env.PAPERCLIP_LISTEN_PORT ?? process.env.PORT ?? "3100";
  const apiUrl =
    process.env.PAPERCLIP_RUNTIME_API_URL ??
    process.env.PAPERCLIP_API_URL ??
    `http://${runtimeHost}:${runtimePort}`;
  vars.PAPERCLIP_API_URL = apiUrl;
  return vars;
}

export function applyPaperclipWorkspaceEnv(
  env: Record<string, string>,
  input: {
    workspaceCwd?: string | null;
    workspaceSource?: string | null;
    workspaceStrategy?: string | null;
    workspaceId?: string | null;
    workspaceRepoUrl?: string | null;
    workspaceRepoRef?: string | null;
    workspaceBranch?: string | null;
    workspaceWorktreePath?: string | null;
    agentHome?: string | null;
  },
): Record<string, string> {
  const mappings = [
    ["PAPERCLIP_WORKSPACE_CWD", input.workspaceCwd],
    ["PAPERCLIP_WORKSPACE_SOURCE", input.workspaceSource],
    ["PAPERCLIP_WORKSPACE_STRATEGY", input.workspaceStrategy],
    ["PAPERCLIP_WORKSPACE_ID", input.workspaceId],
    ["PAPERCLIP_WORKSPACE_REPO_URL", input.workspaceRepoUrl],
    ["PAPERCLIP_WORKSPACE_REPO_REF", input.workspaceRepoRef],
    ["PAPERCLIP_WORKSPACE_BRANCH", input.workspaceBranch],
    ["PAPERCLIP_WORKSPACE_WORKTREE_PATH", input.workspaceWorktreePath],
    ["AGENT_HOME", input.agentHome],
  ] as const;

  for (const [key, value] of mappings) {
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  return env;
}

export function shapePaperclipWorkspaceEnvForExecution(input: {
  workspaceCwd?: string | null;
  workspaceWorktreePath?: string | null;
  workspaceHints?: Array<Record<string, unknown>>;
  executionTargetIsRemote?: boolean;
  executionCwd?: string | null;
}): {
  workspaceCwd: string | null;
  workspaceWorktreePath: string | null;
  workspaceHints: Array<Record<string, unknown>>;
} {
  const workspaceCwd =
    typeof input.workspaceCwd === "string" && input.workspaceCwd.trim().length > 0
      ? input.workspaceCwd.trim()
      : null;
  const workspaceWorktreePath =
    typeof input.workspaceWorktreePath === "string" && input.workspaceWorktreePath.trim().length > 0
      ? input.workspaceWorktreePath.trim()
      : null;
  const workspaceHints = Array.isArray(input.workspaceHints) ? input.workspaceHints : [];

  if (!input.executionTargetIsRemote) {
    return {
      workspaceCwd,
      workspaceWorktreePath,
      workspaceHints,
    };
  }

  const executionCwd =
    typeof input.executionCwd === "string" && input.executionCwd.trim().length > 0
      ? input.executionCwd.trim()
      : null;
  // On a remote target we must never fall back to the local workspaceCwd —
  // doing so leaks host paths into the remote env (the exact failure mode
  // this helper exists to prevent). Callers are expected to resolve
  // executionCwd via adapterExecutionTargetRemoteCwd before calling this
  // helper, which always returns a non-empty string. Surface a warning so
  // future callers don't silently regress to the leak.
  if (executionCwd === null) {
    // eslint-disable-next-line no-console
    console.warn(
      "[paperclip] shapePaperclipWorkspaceEnvForExecution called with executionCwd=null on a remote target; " +
        "stripping workspaceCwd to avoid leaking local paths into the remote environment.",
    );
  }
  const realizedWorkspaceCwd = executionCwd;
  const localWorkspaceCwd = workspaceCwd ? path.resolve(workspaceCwd) : null;
  const shapedWorkspaceHints = workspaceHints.map((hint) => {
    const nextHint = { ...hint };
    const hintCwd = typeof nextHint.cwd === "string" ? nextHint.cwd.trim() : "";
    if (!hintCwd) return nextHint;

    if (localWorkspaceCwd && path.resolve(hintCwd) === localWorkspaceCwd) {
      if (realizedWorkspaceCwd) {
        nextHint.cwd = realizedWorkspaceCwd;
      } else {
        delete nextHint.cwd;
      }
      return nextHint;
    }

    delete nextHint.cwd;
    return nextHint;
  });

  return {
    workspaceCwd: realizedWorkspaceCwd,
    workspaceWorktreePath: null,
    workspaceHints: shapedWorkspaceHints,
  };
}

export function sanitizeInheritedPaperclipEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (!key.startsWith("PAPERCLIP_")) continue;
    if (key === "PAPERCLIP_RUNTIME_API_URL") continue;
    if (key === "PAPERCLIP_LISTEN_HOST") continue;
    if (key === "PAPERCLIP_LISTEN_PORT") continue;
    delete env[key];
  }
  return env;
}

export function defaultPathForPlatform() {
  if (process.platform === "win32") {
    return "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem";
  }
  return "/usr/local/bin:/opt/homebrew/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin";
}

function windowsPathExts(env: NodeJS.ProcessEnv): string[] {
  return (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean);
}

async function pathExists(candidate: string) {
  try {
    await fs.access(candidate, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveCommandPath(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  if (hasPathSeparator) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    return (await pathExists(absolute)) ? absolute : null;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const dirs = pathValue.split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? windowsPathExts(env) : [""];
  const hasExtension = process.platform === "win32" && path.extname(command).length > 0;

  for (const dir of dirs) {
    const candidates =
      process.platform === "win32"
        ? hasExtension
          ? [path.join(dir, command)]
          : exts.map((ext) => path.join(dir, `${command}${ext}`))
        : [path.join(dir, command)];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return candidate;
    }
  }

  return null;
}

export async function resolveCommandForLogs(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: {
    remoteExecution?: RemoteExecutionSpec | null;
  } = {},
): Promise<string> {
  const remote = options.remoteExecution ?? null;
  if (remote) {
    return `ssh://${remote.username}@${remote.host}:${remote.port}/${remote.remoteCwd} :: ${command}`;
  }
  return (await resolveCommandPath(command, cwd, env)) ?? command;
}

function quoteForCmd(arg: string) {
  if (!arg.length) return '""';
  const escaped = arg.replace(/"/g, '""');
  return /[\s"&<>|^()]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function sanitizeSshRemoteEnv(
  env: Record<string, string>,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return sanitizeRemoteExecutionEnv(env, inheritedEnv);
}

function resolveWindowsCmdShell(env: NodeJS.ProcessEnv): string {
  const fallbackRoot = env.SystemRoot || process.env.SystemRoot || "C:\\Windows";
  return path.join(fallbackRoot, "System32", "cmd.exe");
}

export async function resolveSpawnTarget(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: {
    remoteExecution?: RemoteExecutionSpec | null;
    remoteEnv?: Record<string, string> | null;
  } = {},
): Promise<SpawnTarget> {
  const remote = options.remoteExecution ?? null;
  if (remote) {
    const sshResolved = await resolveCommandPath("ssh", process.cwd(), env);
    if (!sshResolved) {
      throw new Error('Command not found in PATH: "ssh"');
    }
    const spawnTarget = await buildSshSpawnTarget({
      spec: remote,
      command,
      args,
      env: Object.fromEntries(
        Object.entries(options.remoteEnv ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    });
    return {
      command: sshResolved,
      args: spawnTarget.args,
      cwd: process.cwd(),
      cleanup: spawnTarget.cleanup,
    };
  }

  const resolved = await resolveCommandPath(command, cwd, env);
  const executable = resolved ?? command;

  if (process.platform !== "win32") {
    return { command: executable, args };
  }

  if (/\.(cmd|bat)$/i.test(executable)) {
    // Always use cmd.exe for .cmd/.bat wrappers. Some environments override
    // ComSpec to PowerShell, which breaks cmd-specific flags like /d /s /c.
    const shell = resolveWindowsCmdShell(env);
    const commandLine = [quoteForCmd(executable), ...args.map(quoteForCmd)].join(" ");
    return {
      command: shell,
      args: ["/d", "/s", "/c", commandLine],
    };
  }

  return { command: executable, args };
}

export function ensurePathInEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (typeof env.PATH === "string" && env.PATH.length > 0) return env;
  if (typeof env.Path === "string" && env.Path.length > 0) return env;
  return { ...env, PATH: defaultPathForPlatform() };
}

export async function ensureAbsoluteDirectory(
  cwd: string,
  opts: { createIfMissing?: boolean } = {},
) {
  if (!path.isAbsolute(cwd)) {
    throw new Error(`Working directory must be an absolute path: "${cwd}"`);
  }

  const assertDirectory = async () => {
    const stats = await fs.stat(cwd);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: "${cwd}"`);
    }
  };

  try {
    await assertDirectory();
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!opts.createIfMissing || code !== "ENOENT") {
      if (code === "ENOENT") {
        throw new Error(`Working directory does not exist: "${cwd}"`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    await fs.mkdir(cwd, { recursive: true });
    await assertDirectory();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not create working directory "${cwd}": ${reason}`);
  }
}
