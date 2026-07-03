#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRoot = join(projectRoot, "workspace");

const allowedTopLevel = new Set(["README.md", "profile", "resumes", "jobs", "ops", "tenants"]);
const osArtifacts = new Set([".DS_Store", "Thumbs.db"]);

const systemOwned = [
  "workspace/README.md",
  "workspace/jobs/examples/**",
  "workspace/ops/templates/**",
  "workspace/profile/profile.example.yml",
  "workspace/profile/writing-samples/README.md",
];

const userOwned = [
  "workspace/profile/**",
  "workspace/resumes/**",
  "workspace/jobs/interview-prep/**",
  "workspace/jobs/jds/**",
  "workspace/jobs/project-notes/**",
  "workspace/jobs/reports/**",
  "workspace/jobs/research/**",
  "workspace/ops/batch/**",
  "workspace/ops/data/**",
  "workspace/ops/exports/**",
  "workspace/ops/imports/**",
  "workspace/tenants/**",
];

const requiredDirs = [
  "workspace/profile",
  "workspace/resumes",
  "workspace/jobs",
  "workspace/ops",
  "workspace/ops/data",
  "workspace/ops/templates",
];

const requiredUserFiles = [
  "workspace/profile/cv.md",
  "workspace/profile/profile.yml",
  "workspace/profile/_profile.md",
  "workspace/profile/portals.yml",
];

const errors = [];
const warnings = [];
const files = listFiles(workspaceRoot).map((file) => normalizePath(relative(projectRoot, file)));
const trackedFiles = new Set(listTrackedFiles());

if (!existsSync(workspaceRoot)) {
  errors.push("workspace/ is missing");
} else {
  for (const entry of readdirSync(workspaceRoot)) {
    if (!allowedTopLevel.has(entry)) {
      errors.push(`Unexpected top-level workspace entry: workspace/${entry}`);
    }
  }
}

for (const dir of requiredDirs) {
  if (!existsSync(join(projectRoot, dir))) errors.push(`Required directory missing: ${dir}`);
}

for (const file of requiredUserFiles) {
  if (!existsSync(join(projectRoot, file))) warnings.push(`Onboarding file missing: ${file}`);
}

for (const file of files) {
  const basename = file.split("/").at(-1) || "";
  if (osArtifacts.has(basename)) {
    errors.push(`OS artifact inside workspace: ${file}`);
    continue;
  }

  const classified = matchesAny(file, systemOwned) || matchesAny(file, userOwned);
  if (!classified) warnings.push(`Workspace file is not covered by DATA_CONTRACT patterns: ${file}`);

  if (
    trackedFiles.has(file)
    && matchesAny(file, userOwned)
    && !matchesAny(file, systemOwned)
    && !isAllowedTrackedUserPlaceholder(file)
  ) {
    errors.push(`User-layer file is tracked by git: ${file}`);
  }
}

console.log("Workspace boundary audit");
console.log("========================");
console.log(`Files scanned: ${files.length}`);
console.log(`System-owned patterns: ${systemOwned.length}`);
console.log(`User-owned patterns: ${userOwned.length}`);

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length) {
  console.log("\nErrors:");
  for (const error of errors) console.log(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("\nResult: workspace boundary is clean.");
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return listFiles(path);
    if (stat.isFile()) return [path];
    return [];
  });
  return entries;
}

function normalizePath(path) {
  return path.split("\\").join("/");
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

function matchesPattern(path, pattern) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function listTrackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "workspace"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalizePath);
  } catch {
    return [];
  }
}

function isAllowedTrackedUserPlaceholder(path) {
  return path.endsWith("/.gitkeep");
}
