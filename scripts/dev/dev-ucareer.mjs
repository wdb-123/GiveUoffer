import { spawn } from "node:child_process";
import process from "node:process";

const env = {
  ...process.env,
  NO_PROXY: mergeNoProxy(process.env.NO_PROXY || process.env.no_proxy || ""),
  no_proxy: mergeNoProxy(process.env.no_proxy || process.env.NO_PROXY || ""),
};

const commands = [
  {
    name: "web",
    command: "npm",
    args: ["--workspace", "@ucareer/web", "run", "dev"],
  },
  {
    name: "daemon",
    command: "npm",
    args: ["--workspace", "@ucareer/daemon", "run", "dev"],
  },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => writePrefixed(name, chunk));
  child.stderr.on("data", (chunk) => writePrefixed(name, chunk));
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[${name}] exited with ${reason}`);
    stopAll();
  });

  return child;
});

function writePrefixed(name, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) console.log(`[${name}] ${line}`);
  }
}

function mergeNoProxy(value) {
  const required = ["127.0.0.1", "localhost", "::1"];
  const entries = new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  for (const entry of required) entries.add(entry);
  return Array.from(entries).join(",");
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});
