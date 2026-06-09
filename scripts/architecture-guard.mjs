#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DAEMON = join(ROOT, "apps/daemon/src");
const WEB = join(ROOT, "apps/web/src");

let failures = 0;
const legacyProductName = "off" + "eru";
const legacyProductUpperName = legacyProductName.toUpperCase();

function fail(message) {
  console.log(`FAIL ${message}`);
  failures += 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function exists(path) {
  return existsSync(join(ROOT, path));
}

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function listFiles(dir) {
  const root = join(ROOT, dir);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === "dist") continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|md)$/.test(name)) out.push(relative(ROOT, full));
    }
  };
  walk(root);
  return out;
}

function assertExists(paths, label) {
  const missing = paths.filter((path) => !exists(path));
  if (missing.length) {
    for (const path of missing) fail(`${label} missing: ${path}`);
  } else {
    pass(`${label} present`);
  }
}

function assertAbsent(paths, label) {
  const present = paths.filter((path) => exists(path));
  if (present.length) {
    for (const path of present) fail(`${label} should not exist: ${path}`);
  } else {
    pass(`${label} absent`);
  }
}

function assertNotContains(path, patterns, label) {
  const content = read(path);
  const matches = patterns.filter((pattern) => content.includes(pattern));
  if (matches.length) {
    fail(`${label}: ${path} contains ${matches.join(", ")}`);
  } else {
    pass(`${label}: ${path}`);
  }
}

function assertContains(path, patterns, label) {
  const content = read(path);
  const missing = patterns.filter((pattern) => !content.includes(pattern));
  if (missing.length) {
    fail(`${label}: ${path} missing ${missing.join(", ")}`);
  } else {
    pass(`${label}: ${path}`);
  }
}

function assertFilesDoNotContain(files, patterns, label) {
  const violations = [];
  for (const file of files) {
    const content = read(file);
    for (const pattern of patterns) {
      if (content.includes(pattern)) violations.push(`${file} -> ${pattern}`);
    }
  }
  if (violations.length) {
    for (const violation of violations) fail(`${label}: ${violation}`);
  } else {
    pass(label);
  }
}

function assertWorkspaceBoundary() {
  assertExists([
    "workspace/README.md",
    "workspace/profile",
    "workspace/profile/headshots",
    "workspace/profile/intentions",
    "workspace/profile/writing-samples",
    "workspace/resumes",
    "workspace/resumes/source",
    "workspace/resumes/rendered",
    "workspace/resumes/quicklook",
    "workspace/resumes/library",
    "workspace/resumes/tools",
    "workspace/jobs",
    "workspace/jobs/reports",
    "workspace/jobs/jds",
    "workspace/jobs/interview-prep",
    "workspace/jobs/research",
    "workspace/jobs/examples",
    "workspace/jobs/project-notes",
    "workspace/ops",
    "workspace/ops/data",
    "workspace/ops/templates",
    "workspace/ops/templates/fonts",
    "workspace/ops/imports",
    "workspace/ops/exports",
    "workspace/ops/batch",
    "workspace/ops/batch/tracker-additions",
    "workspace/ops/batch/logs",
  ], "workspace user asset directories");

  assertAbsent([
    "config",
    "data",
    "reports",
    "jds",
    "interview-prep",
    "research",
    "templates",
    "writing-samples",
    "examples",
    "resumes",
    "output",
    "batch",
    "dashboard",
    "fonts",
    "providers",
    "tools",
    `.${legacyProductName}`,
    "cv.md",
    "article-digest.md",
    "portals.yml",
    "modes/_profile.md",
    "workspace/config",
    "workspace/data",
    "workspace/reports",
    "workspace/jds",
    "workspace/interview-prep",
    "workspace/research",
    "workspace/templates",
    "workspace/writing-samples",
    "workspace/examples",
    "workspace/project-notes",
    "workspace/intentions",
    "workspace/imports",
    "workspace/exports",
    "workspace/batch",
    "workspace/headshots",
  ], "root user/project asset directories");

  const root = join(ROOT, "workspace");
  const looseAssets = readdirSync(root).filter((name) => {
    const full = join(root, name);
    if (statSync(full).isDirectory()) return false;
    if (name === "README.md" || name === ".gitkeep" || name === ".DS_Store") return false;
    return /\.(docx|pdf|png|jpe?g|md)$/i.test(name);
  });
  if (looseAssets.length) {
    fail(`workspace root has loose user assets: ${looseAssets.join(", ")}`);
  } else {
    pass("workspace root has no loose user assets");
  }
}

function assertUcareerNamespace() {
  assertContains("package.json", [
    "npm --workspace @ucareer/daemon run dev",
    "npm --workspace @ucareer/web run build",
  ], "root npm scripts use Ucareer workspaces");

  assertContains("package-lock.json", [
    "\"name\": \"@ucareer/daemon\"",
    "\"name\": \"@ucareer/shared\"",
    "\"node_modules/@ucareer/web\"",
  ], "lockfile uses Ucareer workspaces");

  assertContains("apps/daemon/src/server.ts", [
    "const daemonDbPath = resolve(workspaceRoot, \".ucareer/daemon.sqlite\")",
  ], "daemon runtime path uses Ucareer namespace");

  assertContains("apps/daemon/src/policy/agent-execution-policy.ts", [
    "process.env.UCAREER_AGENT_AUTO_START",
  ], "agent execution env uses Ucareer namespace");

  assertContains("apps/daemon/src/routes/sync-routes.ts", [
    "process.env.UCAREER_CLOUD_URL",
  ], "sync env uses Ucareer namespace");

  assertContains("apps/web/src/App.tsx", [
    "useUcareerData",
    "ucareer.session",
  ], "web app uses Ucareer session/data hook");

  assertContains("apps/web/src/sections/EvidenceSection.tsx", [
    "ucareer.reviewTemplates",
  ], "web review templates use Ucareer storage key");

  assertAbsent([
    `docs/${legacyProductUpperName}_ARCHITECTURE_TASKS.md`,
    `docs/${legacyProductUpperName}_ENGINEERING_ARCHITECTURE_GUIDE.md`,
    `docs/${legacyProductUpperName}_TECH_ARCHITECTURE_DESIGN.md`,
    "docs/ARCHITECTURE.md",
    "docs/architecture-governance.md",
    "docs/CUSTOMIZATION.md",
    "docs/TRACKER_PRODUCT_DESIGN.md",
    "docs/UCAREER_ARCHITECTURE_TASKS.md",
    "docs/UCAREER_ENGINEERING_ARCHITECTURE_GUIDE.md",
    "docs/UCAREER_TECH_ARCHITECTURE_DESIGN.md",
    `apps/web/src/hooks/use${legacyProductName.slice(0, 1).toUpperCase()}${legacyProductName.slice(1)}Data.ts`,
  ], "legacy Ucareer predecessor filenames");

  const files = [
    "package.json",
    "package-lock.json",
    ".gitignore",
    ...listFiles("apps"),
    ...listFiles("packages"),
    ...listFiles("scripts"),
    ...listFiles("docs"),
    ...listFiles("workspace"),
  ];
  const legacyPattern = new RegExp([
    `@${legacyProductName}`,
    `${legacyProductName.slice(0, 1).toUpperCase()}${legacyProductName.slice(1)}`,
    legacyProductUpperName,
    "GiveU" + "Offer",
    "giveu" + "offer",
    `\\.${legacyProductName}`,
    legacyProductName,
  ].join("|"));
  const violations = [];
  for (const file of [...new Set(files)]) {
    if (!exists(file)) continue;
    if (file === "scripts/architecture-guard.mjs") continue;
    const lines = read(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!legacyPattern.test(line)) return;
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  if (violations.length) {
    for (const violation of violations) fail(`legacy product namespace found: ${violation}`);
  } else {
    pass("legacy product namespace confined to migration compatibility");
  }
}

assertWorkspaceBoundary();
assertUcareerNamespace();

assertExists([
  "docs/README.md",
  "docs/architecture",
  "docs/architecture/overview.md",
  "docs/architecture/governance.md",
  "docs/guides",
  "docs/guides/customization.md",
  "docs/guides/local-parser-cookbook.md",
  "docs/product",
  "docs/product/tracker-product-design.md",
  "docs/archive",
], "docs architecture directories");

assertExists([
  "modes/README.md",
  "modes/_shared.md",
  "modes/_profile.template.md",
  "modes/de/_shared.md",
  "modes/fr/_shared.md",
  "modes/ja/_shared.md",
  "modes/tr/_shared.md",
], "modes architecture files");

assertAbsent([
  "modes/pt",
  "modes/ru",
  "modes/ua",
], "unmaintained language mode packs");

assertExists([
  "packages/README.md",
  "packages/shared/src/index.ts",
  "packages/agent-core/src/index.ts",
  "packages/provider-codex/src/index.ts",
  "packages/provider-claude/src/index.ts",
  "packages/provider-gemini/src/index.ts",
], "packages architecture files");

assertContains("packages/README.md", [
  "shared",
  "agent-core",
  "provider-*",
  "packages must not depend on apps/*",
], "packages architecture documents dependency direction");

assertFilesDoNotContain([
  "packages/shared/src/index.ts",
], [
  "@ucareer/",
  "node:",
  "apps/",
  "workspace/",
], "shared package remains framework-independent");

assertFilesDoNotContain([
  "packages/agent-core/src/index.ts",
], [
  "@ucareer/provider-",
  "apps/",
  "workspace/",
], "agent-core package stays provider-neutral");

assertFilesDoNotContain([
  "packages/provider-codex/src/index.ts",
  "packages/provider-claude/src/index.ts",
  "packages/provider-gemini/src/index.ts",
], [
  "apps/",
  "workspace/",
  "../",
], "provider packages do not reach into apps or workspace");

assertExists([
  "scripts/README.md",
  "scripts/architecture-guard.mjs",
  "scripts/cli",
  "scripts/dev",
  "scripts/research",
], "scripts architecture directories");

assertExists([
  "scripts/cli/providers/README.md",
  "scripts/cli/providers/_http.mjs",
  "scripts/cli/providers/_types.js",
  "scripts/cli/providers/ashby.mjs",
  "scripts/cli/providers/greenhouse.mjs",
  "scripts/cli/providers/lever.mjs",
  "scripts/cli/providers/local-parser.mjs",
], "scanner provider modules");

assertExists([
  "scripts/dev/dev-ucareer.mjs",
  "scripts/dev/responsive-audit.mjs",
  "scripts/research/analyze-market-clusters.mjs",
  "scripts/research/boss-agent-radar.mjs",
  "scripts/research/china-job-crawler.mjs",
], "scripts dev and research modules");

assertAbsent([
  "scripts/dev-ucareer.mjs",
  "scripts/responsive-audit.mjs",
  "scripts/analyze-market-clusters.mjs",
  "scripts/boss-agent-radar.mjs",
  "scripts/china-job-crawler.mjs",
], "legacy root script locations");

assertContains("package.json", [
  "node scripts/dev/dev-ucareer.mjs",
  "node scripts/dev/responsive-audit.mjs",
  "node scripts/research/china-job-crawler.mjs",
  "node scripts/research/boss-agent-radar.mjs",
  "node scripts/research/analyze-market-clusters.mjs",
], "npm scripts use governed script paths");

assertContains("scripts/cli/scan.mjs", [
  "./providers/_http.mjs",
  "scripts/cli/providers/*.mjs",
  "scripts/cli/providers/local-parser.mjs",
], "scan script owns scanner provider loading");

assertExists([
  "apps/daemon/src/routes",
  "apps/daemon/src/services",
  "apps/daemon/src/workflow",
  "apps/daemon/src/connectors",
  "apps/daemon/src/policy",
  "apps/daemon/src/sync",
  "apps/daemon/src/providers",
  "apps/daemon/src/stores",
  "apps/daemon/src/execution",
  "apps/daemon/src/db",
], "daemon architecture directories");

assertExists([
  "apps/daemon/src/workflow/skill-registry.ts",
  "apps/daemon/src/workflow/workflow-registry.ts",
  "apps/daemon/src/workflow/classify-intake.ts",
  "apps/daemon/src/workflow/prompt-builder.ts",
  "apps/daemon/src/connectors/connector-registry.ts",
  "apps/daemon/src/routes/connector-routes.ts",
  "apps/daemon/src/policy/agent-execution-policy.ts",
  "apps/daemon/src/services/workflow-run-service.ts",
  "apps/daemon/src/sync/sync-service.ts",
  "apps/daemon/src/providers/paperclip-adapter-provider.ts",
  "apps/daemon/src/providers/provider-definitions.ts",
  "apps/daemon/src/execution/runner.ts",
  "apps/daemon/src/stores/workflow-run-store.ts",
  "apps/daemon/src/stores/connector-credential-store.ts",
], "daemon core modules");

assertAbsent([
  "apps/daemon/src/application-store.ts",
  "apps/daemon/src/auth-store.ts",
  "apps/daemon/src/evidence-store.ts",
  "apps/daemon/src/experience-store.ts",
  "apps/daemon/src/market-store.ts",
  "apps/daemon/src/profile-store.ts",
  "apps/daemon/src/report-store.ts",
  "apps/daemon/src/resume-export-store.ts",
  "apps/daemon/src/resume-store.ts",
  "apps/daemon/src/sqlite-task-store.ts",
  "apps/daemon/src/task-store.ts",
  "apps/daemon/src/runner.ts",
  "apps/daemon/src/agent-execution-policy.ts",
  "apps/daemon/src/paperclip-adapter-provider.ts",
], "legacy daemon root modules");

assertNotContains("apps/daemon/src/server.ts", [
  "runApprovedTask",
  "runApprovedLocalCommand",
  "evaluateAgentExecutionPolicy",
  "app.post<{\n  Body: CreateAgentTaskRequest",
  "app.post<{\n  Body: import(\"@ucareer/shared\").SaveGeneratedResumeRequest",
], "server stays as composition root");

const routeFiles = listFiles("apps/daemon/src/routes").filter((file) => file.endsWith(".ts"));
assertFilesDoNotContain(routeFiles, [
  "../execution/",
  "../providers/paperclip-adapter-provider",
  "../policy/agent-execution-policy",
  "child_process",
  "spawn(",
], "routes do not execute providers or processes directly");

const storeFiles = listFiles("apps/daemon/src/stores").filter((file) => file.endsWith(".ts"));
assertFilesDoNotContain(storeFiles, [
  "../routes/",
  "../services/",
  "../execution/",
  "../workflow/",
  "../providers/",
  "../sync/",
  "child_process",
  "spawn(",
], "stores stay below routes/services/execution");

assertContains("apps/daemon/src/routes/workflow-routes.ts", [
  "/api/skills",
  "/api/skills/file-management",
  "workflowRegistry",
  "/api/agent-route/preview",
  "/api/workflow-runs",
  "classifyIntake",
], "workflow routes expose backend routing");

assertContains("apps/daemon/src/server.ts", [
  "registerConnectorRoutes",
], "server wires connector routes");

assertContains("apps/daemon/src/connectors/connector-registry.ts", [
  "qq-email",
  "imap.qq.com",
  "readonly",
  "mailbox",
  "search_messages",
  "requiresAuth",
  "authorizationCode",
], "connector registry owns data-source boundaries");

assertNotContains("apps/daemon/src/connectors/connector-registry.ts", [
  "local-workspace",
  "agent-uploads",
  "ucareer-cloud-sync",
  "mobile-relay",
  "gmail",
  "google-drive",
  "job-board-import",
], "connector registry currently exposes only email");

assertContains("apps/daemon/src/routes/connector-routes.ts", [
  "/api/connectors",
  "/api/connectors/qq-email/test",
  "/api/connectors/qq-email/credential",
  "qq_email_imap_test_failed",
  "connector_not_found",
], "connector routes expose connector registry");

assertContains("apps/daemon/src/connectors/imap-connector.ts", [
  "openImapSession",
  "LOGIN",
  "LOGOUT",
  "authorizationCode",
], "QQ email connector uses IMAP only");

assertContains("apps/daemon/src/stores/connector-credential-store.ts", [
  "connectorCredentials",
  "aes-256-gcm",
  "connector.key",
  "saveQqEmail",
  "secretStored",
], "QQ email credential store encrypts local SQLite secrets");

assertContains("apps/daemon/src/db/sqlite.ts", [
  "CREATE TABLE IF NOT EXISTS connector_credentials",
  "secret_ciphertext",
  "secret_auth_tag",
], "SQLite schema stores connector credentials");

assertContains("apps/daemon/src/workflow/skill-registry.ts", [
  "fileManagement",
  "intakeFolder",
  "acceptedAttachmentKinds",
  "acceptedExtensions",
  "readPaths",
  "writePaths",
  "outputArtifacts",
  "getSkillFileManagement",
], "skill registry owns file-management contracts");

assertContains("apps/daemon/src/workflow/classify-intake.ts", [
  "RouteDecision",
  "findWorkflowForRoute",
  "workflowId",
  "buildAgentPrompt",
  "agentPrompt",
], "backend route decision builds agent prompt");

assertContains("apps/daemon/src/workflow/workflow-registry.ts", [
  "workflowRegistry",
  "WorkflowDefinition",
  "findWorkflowForRoute",
], "workflow registry is centralized");

assertContains("apps/daemon/src/policy/agent-execution-policy.ts", [
  "evaluateActionPolicy",
  "evaluateWorkflowStepPolicy",
  "run_shell",
  "send_application",
  "sync_cloud",
  "evaluateAgentExecutionPolicy",
], "policy layer evaluates generic actions");

assertContains("apps/daemon/src/services/workflow-run-service.ts", [
  "createRunMetadata",
  "attachTask",
  "attachApproval",
  "syncTaskStatus",
  "evaluateWorkflowStepPolicy",
], "workflow run service binds tasks and approvals");

assertContains("apps/daemon/src/services/agent-task-service.ts", [
  "continueTask",
  "workflowRunService?.attachApproval",
  "workflowRunService?.syncTaskStatus",
  "onTaskStatusChange",
], "agent task service keeps continuation workflow state in sync");

assertExists([
  "apps/daemon/src/routes/attachment-routes.ts",
  "apps/daemon/src/services/attachment-parser-service.ts",
], "daemon attachment entry modules");

assertContains("apps/daemon/src/server.ts", [
  "createAttachmentParserService",
  "registerAttachmentRoutes",
  "attachmentParserService",
], "server wires attachment entry layer");

assertContains("apps/daemon/src/routes/attachment-routes.ts", [
  "/api/agent-attachments",
  "requirePermission(ctx, request, \"workspace.write\")",
  "services.attachmentParserService.upload",
], "attachment route delegates parsing to service");

assertContains("apps/daemon/src/services/attachment-parser-service.ts", [
  "workspace/ops/imports/agent-attachments",
  "isInsideDir",
  "formatDate",
  "uniqueStoredName",
  "routeAttachmentStorage",
  "classifyIntake",
  "getSkillFileManagement",
  "storageFolder",
  "PDFParse",
  "mammoth.extractRawText",
  "maxUploadBytes",
  "maxParsedTextChars",
], "attachment parser owns storage and extraction");

assertContains("packages/shared/src/index.ts", [
  "export interface SkillFileManagement",
  "export interface AgentAttachment",
  "export interface UploadAgentAttachmentRequest",
  "export interface ParsedAttachment",
  "attachments?: AgentAttachment[]",
], "shared attachment contracts");

assertContains("apps/daemon/src/routes/workflow-routes.ts", [
  "RoutePreviewRequest",
  "composePreviewText",
  "attachments",
  "classifyIntake",
], "route preview consumes attachment summaries");

assertContains("apps/daemon/src/services/agent-task-service.ts", [
  "composeSourceText",
  "composePromptWithAttachments",
  "User uploaded attachments",
  "attachment.parsed.text",
], "agent task service injects parsed attachments");

assertContains("apps/web/src/api.ts", [
  "uploadAgentAttachment",
  "/api/agent-attachments",
  "UploadAgentAttachmentRequest",
], "web API exposes attachment upload");

assertContains("apps/web/src/sections/AgentSection.tsx", [
  "uploadAgentAttachment",
  "agent-file-input",
  "agent-attachment-strip",
  "fileToBase64",
], "agent composer supports attachments");

assertContains("apps/daemon/src/stores/workflow-run-store.ts", [
  "WorkflowRunStore",
  "createRun",
  "workflowRuns",
  "workflowStepRuns",
  "writeSyncEvent",
], "workflow run store persists syncable runs");

assertContains("apps/daemon/src/db/schema.ts", [
  "workflowRuns",
  "workflowStepRuns",
  "workflowRunId",
], "workflow run schema exists");

assertContains("packages/shared/src/index.ts", [
  "export interface SkillDefinition",
  "fileManagement: SkillFileManagement",
  "export interface WorkflowDefinition",
  "export interface WorkflowRun",
  "export interface WorkflowStepRun",
  "export interface AgentTaskRouteMetadata",
  "export interface RouteDecision",
  "workflowId?: EntityId",
  "workflowRunId?: EntityId",
  "agentPrompt: string",
  "routeMetadata?: AgentTaskRouteMetadata",
  "sourceText?: string",
  "export interface RoutePreviewRequest",
], "shared workflow contracts");

assertFilesDoNotContain([
  "apps/web/src/sections/AgentSection.tsx",
  "apps/web/src/sections/agent/agentConversation.ts",
], [
  "classifyIntake",
  "buildIntakePrompt",
  "intentCatalog",
], "frontend does not own career workflow routing");

assertContains("apps/web/src/api.ts", [
  "previewAgentRoute",
  "getWorkflowRun",
  "getWorkflowRuns",
  "WorkflowRunDetail",
  "RoutePreviewRequest",
  "RouteDecision",
], "web API exposes daemon route preview");

assertContains("apps/web/src/hooks/useAgentData.ts", [
  "createAgentTask",
  "getWorkflowRun",
  "workflowRunDetail",
  "task.routeDecision",
  "effectivePrompt",
], "agent hook relies on daemon-owned routing result");

assertContains("apps/web/src/sections/AgentSection.tsx", [
  "workflowRunDetail",
  "WorkflowRunDetail",
  "AgentTurnView",
  "disabled={agentBusy}",
  "等待当前步骤完成后可追问",
  "继续追问当前 Agent 对话",
], "agent UI displays daemon workflow and follow-up state");

assertFilesDoNotContain([
  "apps/web/src/sections/AgentSection.tsx",
  "apps/web/src/hooks/useAgentData.ts",
], [
  "getWorkflow(",
  "workflowRegistry",
  "classifyIntake",
], "frontend does not derive workflow state locally");

assertContains("apps/web/src/ARCHITECTURE.md", [
  "The frontend does not own career workflow routing",
  "The daemon owns `RouteDecision` and agent prompt construction",
], "web architecture documents routing ownership");

assertContains("apps/daemon/src/ARCHITECTURE.md", [
  "routes/*",
  "services/*",
  "workflow/*",
  "connectors/*",
  "policy/*",
  "workflow registry",
  "connector registry",
  "workflow run",
  "route metadata",
  "generic action",
  "sync/*",
  "providers/*",
  "stores/*",
  "execution/*",
  "cloud and mobile must not directly execute local shell commands",
], "daemon architecture documents local/cloud boundary");

assertContains("workspace/README.md", [
  "local user asset boundary",
  "resumes/source/",
  "Runtime state belongs in `.ucareer/`",
], "workspace boundary is documented");

assertExists([
  "workspace/resumes/tools/README.md",
  "workspace/resumes/tools/add_resume_headshot.py",
  "workspace/resumes/tools/build_optimized_resumes.py",
], "workspace resume tools");

assertFilesDoNotContain([
  "workspace/resumes/tools/add_resume_headshot.py",
  "workspace/resumes/tools/build_optimized_resumes.py",
], [
  "/Users/",
  'ROOT / "workspace" / "headshots"',
  'ROOT / "workspace" / "职业照',
  'OUT_DIR = ROOT / "workspace"\n',
], "workspace resume tools use portable structured directories");

if (failures > 0) {
  console.log(`\nArchitecture guard failed with ${failures} violation(s).`);
  process.exit(1);
}

console.log("\nArchitecture guard passed.");
