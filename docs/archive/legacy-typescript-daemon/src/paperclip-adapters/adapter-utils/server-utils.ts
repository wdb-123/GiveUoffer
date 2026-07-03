// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  appendWithCap,
  resumeReadable,
} from "./value-utils.js";
import {
  ensurePathInEnv,
  resolveCommandPath,
  resolveSpawnTarget,
  sanitizeInheritedPaperclipEnv,
} from "./paperclip-runtime-env.js";
import type { SshRemoteExecutionSpec } from "./ssh.js";

export {
  appendWithByteCap,
  appendWithCap,
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  joinPromptSections,
  parseJson,
  parseObject,
  renderTemplate,
  resolvePathValue,
} from "./value-utils.js";
export {
  normalizePaperclipWakePayload,
  readPaperclipIssueWorkModeFromContext,
  renderPaperclipWakePrompt,
  stringifyPaperclipWakePayload,
} from "./paperclip-wake.js";
export {
  applyPaperclipWorkspaceEnv,
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  defaultPathForPlatform,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  redactCommandTextForLogs,
  redactEnvForLogs,
  resolveCommandForLogs,
  sanitizeInheritedPaperclipEnv,
  sanitizeSshRemoteEnv,
  shapePaperclipWorkspaceEnvForExecution,
} from "./paperclip-runtime-env.js";
export {
  buildPersistentSkillSnapshot,
  ensurePaperclipSkillSymlink,
  listPaperclipSkillEntries,
  materializePaperclipSkillCopy,
  readInstalledSkillTargets,
  readPaperclipRuntimeSkillEntries,
  readPaperclipSkillMarkdown,
  readPaperclipSkillSyncPreference,
  removeMaintainerOnlySkillSymlinks,
  resolvePaperclipDesiredSkillNames,
  resolvePaperclipSkillsDir,
  writePaperclipSkillSyncPreference,
  type InstalledSkillTarget,
  type MaterializedPaperclipSkillCopyResult,
  type PaperclipSkillEntry,
} from "./paperclip-skills.js";

export interface RunProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  pid: number | null;
  startedAt: string | null;
}

export interface TerminalResultCleanupOptions {
  hasTerminalResult: (output: { stdout: string; stderr: string }) => boolean;
  graceMs?: number;
}

interface RunningProcess {
  child: ChildProcess;
  graceSec: number;
  processGroupId: number | null;
}

type RemoteExecutionSpec = SshRemoteExecutionSpec;

type ChildProcessWithEvents = ChildProcess & {
  on(event: "error", listener: (err: Error) => void): ChildProcess;
  on(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): ChildProcess;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): ChildProcess;
};

function resolveProcessGroupId(child: ChildProcess) {
  if (process.platform === "win32") return null;
  return typeof child.pid === "number" && child.pid > 0 ? child.pid : null;
}

function signalRunningProcess(
  running: Pick<RunningProcess, "child" | "processGroupId">,
  signal: NodeJS.Signals,
) {
  if (process.platform !== "win32" && running.processGroupId && running.processGroupId > 0) {
    try {
      process.kill(-running.processGroupId, signal);
      return;
    } catch {
      // Fall back to the direct child signal if group signaling fails.
    }
  }
  if (!running.child.killed) {
    running.child.kill(signal);
  }
}

export const runningProcesses = new Map<string, RunningProcess>();
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
export const MAX_EXCERPT_BYTES = 32 * 1024;
const TERMINAL_RESULT_SCAN_OVERLAP_CHARS = 64 * 1024;
export const DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE = [
  "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  "",
  "Execution contract:",
  "- Start actionable work in this heartbeat; do not stop at a plan unless the issue asks for planning.",
  "- Leave durable progress in comments, documents, or work products, then update the issue to a clear final disposition before ending the heartbeat.",
  "- Comments, documents, screenshots, work products, and `Remaining` bullets are evidence, not valid liveness paths by themselves.",
  "- Final disposition checklist: mark `done` when complete; use `in_review` only with a real reviewer, approval, interaction, or monitor path; use `blocked` only with first-class blockers or a named unblock owner/action; create delegated follow-up issues with blockers when another agent owns the next step; keep `in_progress` only when a live continuation path exists.",
  "- Prefer the smallest verification that proves the change; do not default to full workspace typecheck/build/test on every heartbeat unless the task scope warrants it.",
  "- Use child issues for parallel or long delegated work instead of polling agents, sessions, or processes.",
  "- If woken by a human comment on a dependency-blocked issue, respond or triage the comment without treating the blocked deliverable work as unblocked.",
  "- Create child issues directly when you know what needs to be done; use issue-thread interactions when the board/user must choose suggested tasks, answer structured questions, or confirm a proposal.",
  "- To ask for that input, create an interaction on the current issue with POST /api/issues/{issueId}/interactions using kind suggest_tasks, ask_user_questions, or request_confirmation. Use continuationPolicy wake_assignee when you need to resume after a response; for request_confirmation this resumes only after acceptance.",
  "- When you intentionally restart follow-up work on a completed assigned issue, include structured `resume: true` with the POST /api/issues/{issueId}/comments or PATCH /api/issues/{issueId} comment payload. Generic agent comments on closed issues are inert by default.",
  "- For plan approval, update the plan document first, then create request_confirmation targeting the latest plan revision with idempotencyKey confirmation:{issueId}:plan:{revisionId}. Wait for acceptance before creating implementation subtasks, and create a fresh confirmation after superseding board/user comments if approval is still needed.",
  "- If blocked, mark the issue blocked and name the unblock owner and action.",
  "- Respect budget, pause/cancel, approval gates, and company boundaries.",
].join("\n");

export async function ensureCommandResolvable(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: {
    remoteExecution?: RemoteExecutionSpec | null;
  } = {},
) {
  if (options.remoteExecution) {
    const resolvedSsh = await resolveCommandPath("ssh", process.cwd(), env);
    if (resolvedSsh) return;
    throw new Error('Command not found in PATH: "ssh"');
  }
  const resolved = await resolveCommandPath(command, cwd, env);
  if (resolved) return;
  if (command.includes("/") || command.includes("\\")) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    throw new Error(`Command is not executable: "${command}" (resolved: "${absolute}")`);
  }
  throw new Error(`Command not found in PATH: "${command}"`);
}

export async function runChildProcess(
  runId: string,
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
    onLogError?: (err: unknown, runId: string, message: string) => void;
    onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
    terminalResultCleanup?: TerminalResultCleanupOptions;
    stdin?: string;
    remoteExecution?: RemoteExecutionSpec | null;
  },
): Promise<RunProcessResult> {
  const onLogError = opts.onLogError ?? ((err, id, msg) => console.warn({ err, runId: id }, msg));
  return new Promise<RunProcessResult>((resolve, reject) => {
    const rawMerged: NodeJS.ProcessEnv = {
      ...sanitizeInheritedPaperclipEnv(process.env),
      ...opts.env,
    };

    // Strip Claude Code nesting-guard env vars so spawned `claude` processes
    // don't refuse to start with "cannot be launched inside another session".
    // These vars leak in when the Paperclip server itself is started from
    // within a Claude Code session (e.g. `npx paperclipai run` in a terminal
    // owned by Claude Code) or when cron inherits a contaminated shell env.
    const CLAUDE_CODE_NESTING_VARS = [
      "CLAUDECODE",
      "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_SESSION",
      "CLAUDE_CODE_PARENT_SESSION",
    ] as const;
    for (const key of CLAUDE_CODE_NESTING_VARS) {
      delete rawMerged[key];
    }

    const mergedEnv = ensurePathInEnv(rawMerged);
    void resolveSpawnTarget(command, args, opts.cwd, mergedEnv, {
      remoteExecution: opts.remoteExecution ?? null,
      remoteEnv: opts.remoteExecution ? opts.env : null,
    })
      .then((target) => {
        const child = spawn(target.command, target.args, {
          cwd: target.cwd ?? opts.cwd,
          env: mergedEnv,
          detached: process.platform !== "win32",
          shell: false,
          stdio: [opts.stdin != null ? "pipe" : "ignore", "pipe", "pipe"],
        }) as ChildProcessWithEvents;
        const startedAt = new Date().toISOString();
        const processGroupId = resolveProcessGroupId(child);

        const spawnPersistPromise =
          typeof child.pid === "number" && child.pid > 0 && opts.onSpawn
            ? opts.onSpawn({ pid: child.pid, processGroupId, startedAt }).catch((err) => {
              onLogError(err, runId, "failed to record child process metadata");
            })
            : Promise.resolve();

        runningProcesses.set(runId, { child, graceSec: opts.graceSec, processGroupId });

        let timedOut = false;
        let stdout = "";
        let stderr = "";
        let logChain: Promise<void> = Promise.resolve();
        let terminalResultSeen = false;
        let terminalCleanupStarted = false;
        let terminalCleanupTimer: NodeJS.Timeout | null = null;
        let terminalCleanupKillTimer: NodeJS.Timeout | null = null;
        let terminalResultStdoutScanOffset = 0;
        let terminalResultStderrScanOffset = 0;

        const clearTerminalCleanupTimers = () => {
          if (terminalCleanupTimer) clearTimeout(terminalCleanupTimer);
          if (terminalCleanupKillTimer) clearTimeout(terminalCleanupKillTimer);
          terminalCleanupTimer = null;
          terminalCleanupKillTimer = null;
        };

        const maybeArmTerminalResultCleanup = () => {
          const terminalCleanup = opts.terminalResultCleanup;
          if (!terminalCleanup || terminalCleanupStarted || timedOut) return;
          if (!terminalResultSeen) {
            const stdoutStart = Math.max(0, terminalResultStdoutScanOffset - TERMINAL_RESULT_SCAN_OVERLAP_CHARS);
            const stderrStart = Math.max(0, terminalResultStderrScanOffset - TERMINAL_RESULT_SCAN_OVERLAP_CHARS);
            const scanOutput = {
              stdout: stdout.slice(stdoutStart),
              stderr: stderr.slice(stderrStart),
            };
            terminalResultStdoutScanOffset = stdout.length;
            terminalResultStderrScanOffset = stderr.length;
            if (scanOutput.stdout.length === 0 && scanOutput.stderr.length === 0) return;
            try {
              terminalResultSeen = terminalCleanup.hasTerminalResult(scanOutput);
            } catch (err) {
              onLogError(err, runId, "failed to inspect terminal adapter output");
            }
          }
          if (!terminalResultSeen) return;

          if (terminalCleanupTimer) return;
          const graceMs = Math.max(0, terminalCleanup.graceMs ?? 5_000);
          terminalCleanupTimer = setTimeout(() => {
            terminalCleanupTimer = null;
            if (terminalCleanupStarted || timedOut) return;
            terminalCleanupStarted = true;
            signalRunningProcess({ child, processGroupId }, "SIGTERM");
            terminalCleanupKillTimer = setTimeout(() => {
              terminalCleanupKillTimer = null;
              signalRunningProcess({ child, processGroupId }, "SIGKILL");
            }, Math.max(1, opts.graceSec) * 1000);
          }, graceMs);
        };

        const timeout =
          opts.timeoutSec > 0
            ? setTimeout(() => {
                timedOut = true;
                clearTerminalCleanupTimers();
                signalRunningProcess({ child, processGroupId }, "SIGTERM");
                setTimeout(() => {
                  signalRunningProcess({ child, processGroupId }, "SIGKILL");
                }, Math.max(1, opts.graceSec) * 1000);
              }, opts.timeoutSec * 1000)
            : null;

        child.stdout?.on("data", (chunk: unknown) => {
          const readable = child.stdout;
          if (!readable) return;
          readable.pause();
          const text = String(chunk);
          stdout = appendWithCap(stdout, text);
          maybeArmTerminalResultCleanup();
          logChain = logChain
            .then(() => opts.onLog("stdout", text))
            .catch((err) => onLogError(err, runId, "failed to append stdout log chunk"))
            .finally(() => {
              maybeArmTerminalResultCleanup();
              resumeReadable(readable);
            });
        });

        child.stderr?.on("data", (chunk: unknown) => {
          const readable = child.stderr;
          if (!readable) return;
          readable.pause();
          const text = String(chunk);
          stderr = appendWithCap(stderr, text);
          maybeArmTerminalResultCleanup();
          logChain = logChain
            .then(() => opts.onLog("stderr", text))
            .catch((err) => onLogError(err, runId, "failed to append stderr log chunk"))
            .finally(() => {
              maybeArmTerminalResultCleanup();
              resumeReadable(readable);
            });
        });

        const stdin = child.stdin;
        if (opts.stdin != null && stdin) {
          void spawnPersistPromise.finally(() => {
            if (child.killed || stdin.destroyed) return;
            stdin.write(opts.stdin as string);
            stdin.end();
          });
        }

        child.on("error", (err: Error) => {
          if (timeout) clearTimeout(timeout);
          clearTerminalCleanupTimers();
          runningProcesses.delete(runId);
          void target.cleanup?.();
          const errno = (err as NodeJS.ErrnoException).code;
          const pathValue = mergedEnv.PATH ?? mergedEnv.Path ?? "";
          const msg =
            errno === "ENOENT"
              ? `Failed to start command "${command}" in "${opts.cwd}". Verify adapter command, working directory, and PATH (${pathValue}).`
              : `Failed to start command "${command}" in "${opts.cwd}": ${err.message}`;
          reject(new Error(msg));
        });

        child.on("exit", () => {
          maybeArmTerminalResultCleanup();
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
          if (timeout) clearTimeout(timeout);
          clearTerminalCleanupTimers();
          runningProcesses.delete(runId);
          void logChain.finally(() => {
            void Promise.resolve()
              .then(() => target.cleanup?.())
              .finally(() => {
              resolve({
                exitCode: code,
                signal,
                timedOut,
                stdout,
                stderr,
                pid: child.pid ?? null,
                startedAt,
              });
              });
          });
        });
      })
      .catch(reject);
  });
}
