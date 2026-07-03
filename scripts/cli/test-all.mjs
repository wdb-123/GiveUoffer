#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for Ucareer
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, web build, data contract, personal data, paths.
 *
 * Usage:
 *   npm run test:all           # Run all tests
 *   npm run test:all --quick   # Skip web build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const CLI_DIR = __dirname;
const QUICK = process.argv.includes('--quick');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 Ucareer test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(CLI_DIR).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run(NODE, ['--check', join(CLI_DIR, f)]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

console.log('\n1b. TypeScript unit tests');
const unitTests = run('npm', ['run', 'test:unit'], { stdio: ['pipe', 'pipe', 'pipe'] });
if (unitTests !== null) {
  pass('TypeScript unit tests pass');
} else {
  fail('TypeScript unit tests failed');
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', args: [], expectExit: 1, allowFail: true }, // can fail without complete user data
  { name: 'verify-pipeline.mjs', args: [], expectExit: 0 },
  { name: 'normalize-statuses.mjs', args: [], expectExit: 0 },
  { name: 'dedup-tracker.mjs', args: [], expectExit: 0 },
  { name: 'merge-tracker.mjs', args: [], expectExit: 0 },
  { name: 'tracker-workflow.mjs', args: ['--summary'], expectExit: 0 },
  { name: 'analyze-patterns.mjs', args: ['--self-test'], expectExit: 0 },
];

for (const { name, args, allowFail } of scripts) {
  const result = run(NODE, [join(CLI_DIR, name), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(CLI_DIR, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }

  const closedMycareersfuture = classifyLiveness({
    finalUrl: 'https://www.mycareersfuture.gov.sg/job/engineering/senior-staff-embedded-software-engineer',
    bodyText: [
      'Senior Staff Embedded Software Engineer',
      'MaxLinear Asia Singapore Private Limited',
      '9 applications    Posted 27 Oct 2025    Closed on 26 Nov 2025',
      'Applications have closed for this job',
      'Log in to Apply',
      "You'll need to log in with Singpass to verify your identity.",
      'Roles & Responsibilities: design, develop and maintain embedded firmware for broadband communications ICs.',
    ].join('\n'),
    applyControls: ['Log in to Apply'],
  });
  if (closedMycareersfuture.result === 'expired') {
    pass('Closed postings with "Applications have closed" banner are detected');
  } else {
    fail(`Closed mycareersfuture posting misclassified as ${closedMycareersfuture.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 4. WEB BUILD ────────────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Web build');
  const webBuild = run('npm', ['run', 'web:build'], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (webBuild !== null) {
    pass('Web app compiles');
  } else {
    fail('Web build failed');
  }
} else {
  console.log('\n4. Web build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'workspace/ops/templates/states.yml', 'workspace/ops/templates/cv-template.html',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Check user files are NOT tracked (gitignored)
const userFiles = [
  'workspace/profile/profile.yml', 'workspace/profile/_profile.md', 'workspace/profile/portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

const workspaceAudit = run('npm', ['run', 'workspace:audit'], { stdio: ['pipe', 'pipe', 'pipe'] });
if (workspaceAudit !== null) {
  pass('workspace boundary audit passes');
} else {
  fail('workspace boundary audit failed');
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santifer iRepair', 'Zinkee', 'ALMAS', '688921377', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  'README.md', 'LICENSE', 'package.json', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs | grep -v scripts/architecture-guard.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references workspace/profile/_profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('workspace/profile/_profile.md')) {
  pass('_shared.md references workspace/profile/_profile.md');
} else {
  fail('_shared.md does NOT reference workspace/profile/_profile.md');
}

// ── 9. LOCAL PARSER CONTRACT ────────────────────────────────────

console.log('\n9. Local parser contract');

const scanScript = readFile('scripts/cli/scan.mjs');
if (
  scanScript.includes('typeof company.name !== \'string\'') &&
  scanScript.includes('company.name.trim()') &&
  scanScript.includes('company.name.toLowerCase()')
) {
  pass('scan.mjs guards company names before filtering');
} else {
  fail('scan.mjs does not guard company names before filtering');
}

if (
  scanScript.includes("skipIds: ['local-parser']") &&
  scanScript.includes('local parser failed, used API fallback') &&
  scanScript.includes('resolveProvider(company, providers')
) {
  pass('scan.mjs falls back to ATS API when local parser fails');
} else {
  fail('scan.mjs does not fall back to ATS API when local parser fails');
}

if (fileExists('scripts/cli/providers/local-parser.mjs')) {
  pass('local-parser provider module exists');
} else {
  fail('local-parser provider module is missing');
}

const scanMode = fileExists('modes/scan.md') ? readFile('modes/scan.md') : '';
if (
  scanMode.includes('local_parser_ok') &&
  scanMode.includes('no repetir scraping caro') &&
  scanMode.includes('nombre no listado en `local_parser_ok`')
) {
  pass('scan.md skips expensive levels after successful local parser');
} else {
  fail('scan.md missing local_parser_ok skip rules for agent scan');
}

if (!fileExists('scripts/parsers/cohere_jobs.py')) {
  pass('Cohere parser example is not bundled as a runtime script');
} else {
  fail('Cohere parser example is still bundled as a runtime script');
}

const portalExample = readFile('workspace/ops/templates/portals.example.yml');
if (
  !portalExample.includes('cohere_jobs.py') &&
  portalExample.includes('scripts/parsers/example-js-company-jobs.js') &&
  portalExample.includes('scripts/parsers/example_python_company_jobs.py') &&
  portalExample.includes('already know their target careers URL')
) {
  pass('portals example documents a generic local parser contract');
} else {
  fail('portals example still points at a bundled Cohere parser');
}

// ── 10. AGENTS.md INTEGRITY ─────────────────────────────────────

console.log('\n10. AGENTS.md integrity');

const agents = readFile('AGENTS.md');
const requiredSections = [
  'Data Contract', 'Project Context', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (agents.includes(section)) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
  }
}

// ── 11. LOCATION FILTER — always_allow tier ───────────────────────

console.log('\n11. Location filter — always_allow tier');

try {
  const { buildLocationFilter } = await import(pathToFileURL(join(CLI_DIR, 'scan.mjs')).href);

  const filter = buildLocationFilter({
    always_allow: ['belgium', 'brussels'],
    allow: ['europe', 'emea', 'remote'],
    block: ['france', 'germany', 'united states'],
  });

  // Case 1: home-region passes regardless of other text
  if (filter('Brussels, Belgium') === true) pass('Brussels, Belgium passes (always_allow hit)');
  else fail('Brussels, Belgium should pass');

  // Case 2: always_allow wins over block (THE motivating case for this tier)
  if (filter('Remote, Belgium or France') === true) pass('Remote, Belgium or France passes (always_allow beats block)');
  else fail('Remote, Belgium or France should pass — always_allow must win over block');

  // Case 3: no always_allow hit, block still rejects
  if (filter('Paris, France') === false) pass('Paris, France is rejected (block still applies)');
  else fail('Paris, France should be rejected');

  // Case 4: empty location → pass (existing semantics, unchanged)
  if (filter('') === true) pass('empty location passes (unchanged semantics)');
  else fail('empty location should pass');

  // Case 5: case-insensitivity
  if (filter('BRUSSELS, BELGIUM') === true) pass('case-insensitive match works');
  else fail('case-insensitive match failed');

  // Case 6: backward compatibility — no always_allow key behaves like stock allow/block
  const stockFilter = buildLocationFilter({
    allow: ['europe', 'remote'],
    block: ['france'],
  });
  if (stockFilter('Remote, Belgium or France') === false) pass('without always_allow, block still wins (backward compatible)');
  else fail('without always_allow, behaviour must match stock allow/block (block wins)');

  // Case 7: null/missing locationFilter → pass-all filter (early-return path)
  const nullFilter = buildLocationFilter(null);
  if (nullFilter('Anywhere on Earth') === true && nullFilter('') === true) {
    pass('null locationFilter returns a pass-all filter (early-return path)');
  } else {
    fail('null locationFilter should return a pass-all filter');
  }

  // Case 8: string-instead-of-array → wrapped to a 1-item list
  const stringFilter = buildLocationFilter({ always_allow: 'belgium', block: ['france'] });
  if (stringFilter('Remote, Belgium or France') === true) {
    pass('always_allow as a bare string is wrapped to a single-item list');
  } else {
    fail('always_allow as a bare string should still work');
  }

  // Case 9: null/non-string items are filtered out (no crash, no false matches)
  const messyFilter = buildLocationFilter({
    always_allow: [null, 'belgium', 42, undefined],
    block: ['france', null, 7],
  });
  if (messyFilter('Brussels, Belgium') === true && messyFilter('Paris, France') === false) {
    pass('non-string entries (null, numbers, undefined) are filtered out without crashing');
  } else {
    fail('mixed-type keyword lists should not crash and should still match string entries');
  }

  // Case 10: all-null/non-string list → empty after normalization (no false rejects)
  const allBadFilter = buildLocationFilter({ block: [null, 42, undefined], allow: ['remote'] });
  if (allBadFilter('Remote') === true) {
    pass('a block list with only non-string entries normalizes to [] (no false rejects)');
  } else {
    fail('non-string-only block list should not cause rejection');
  }

  // Case 11: empty / whitespace-only entries are dropped (would otherwise pass-all via includes(''))
  const emptyKeywordFilter = buildLocationFilter({
    always_allow: ['', '  '],
    allow: ['remote'],
    block: ['france'],
  });
  if (emptyKeywordFilter('Paris, France') === false) {
    pass('empty/whitespace always_allow entries are dropped (no pass-all via includes(""))');
  } else {
    fail('empty always_allow entries should NOT bypass block — would have made the filter pass-all');
  }

  // Case 12: surrounding whitespace is trimmed so the keyword still matches
  const whitespaceFilter = buildLocationFilter({
    always_allow: ['  Belgium  ', '\tBrussels\n'],
    block: ['france'],
  });
  if (whitespaceFilter('Remote, Belgium or France') === true) {
    pass('whitespace-padded keywords still match after trim');
  } else {
    fail('"  Belgium  " should be trimmed and still match "Remote, Belgium or France"');
  }

  // Case 13: whitespace-only location is treated as missing (pass-all-tiers)
  if (filter('   \t  ') === true) pass('whitespace-only location passes (treated as missing)');
  else fail('whitespace-only location should pass');

  // Case 14: non-string location (number/object/null) → pass without throwing
  let crashed = false;
  try {
    const r1 = filter(42);
    const r2 = filter({ city: 'Brussels' });
    const r3 = filter(null);
    const r4 = filter(undefined);
    if (r1 === true && r2 === true && r3 === true && r4 === true) {
      pass('non-string location values (number, object, null, undefined) pass without throwing');
    } else {
      fail(`non-string location results: number=${r1}, object=${r2}, null=${r3}, undefined=${r4}`);
    }
  } catch (e) {
    crashed = true;
    fail(`non-string location crashed: ${e.message}`);
  }

  // Case 15: a malformed location (e.g. legacy object) does NOT bypass block when interpreted naively —
  // the guard returns true (pass) BEFORE block/allow even run, which is correct: scoring/eval happens
  // downstream from the scan filter, so malformed locations should fall through to the manual evaluation
  // step rather than being silently dropped here.
  if (filter(42) === true) pass('non-string locations are passed through to downstream evaluation, not silently dropped');
  else fail('non-string locations should pass through');

} catch (e) {
  fail(`always_allow tests crashed: ${e.message}`);
}

// ── 12. DB / API CONTRACT ALIGNMENT ────────────────────────────

console.log('\n12. DB/API contract alignment');

try {
  const webApi = readFile('apps/web/src/api.ts');
  const frontendRoutes = [...webApi.matchAll(/[`"](\/api\/[^`"]+)/g)]
    .map((match) => normalizeFrontendRoute(match[1]))
    .filter(Boolean);
  const uniqueFrontendRoutes = [...new Set(frontendRoutes)].sort();
  const daemonRouteFiles = ['apps/py-daemon/src/ucareer_py_daemon/main.py'];
  const backendRoutes = [];
  for (const file of daemonRouteFiles) {
    const content = readFile(file);
    for (const match of content.matchAll(/@app\.(get|post|delete|patch|options)\(\s*([`"])([^`"]+)\2/g)) {
      backendRoutes.push({ method: match[1].toUpperCase(), path: match[3], file });
    }
  }
  const missingRoutes = uniqueFrontendRoutes.filter((route) => !backendRoutes.some((backendRoute) => routeMatches(backendRoute.path, route)));
  if (missingRoutes.length === 0) {
    pass(`all ${uniqueFrontendRoutes.length} frontend API routes have Python daemon handlers`);
  } else {
    fail(`frontend API routes missing Python daemon handlers: ${missingRoutes.join(', ')}`);
  }
} catch (e) {
  fail(`API route contract check crashed: ${e.message}`);
}

try {
  const pythonDb = readFile('apps/py-daemon/src/ucareer_py_daemon/db.py');
  const pythonMain = readFile('apps/py-daemon/src/ucareer_py_daemon/main.py');
  const sharedTypes = readFile('packages/shared/src/index.ts');
  const adminSection = readFile('apps/web/src/sections/AdminSection.tsx');
  const checks = [
    {
      label: 'Python daemon CORS allows every frontend mutation method',
      ok: pythonMain.includes('allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"]'),
    },
    {
      label: 'tenant membership primary key is owned by Python SQLite schema',
      ok: pythonDb.includes('PRIMARY KEY (tenant_id, account_id)'),
    },
    {
      label: 'connector credential tenant key is owned by Python SQLite schema',
      ok: pythonDb.includes('PRIMARY KEY (tenant_id, connector_id)'),
    },
    {
      label: 'tenant member API contract reaches admin UI',
      ok: sharedTypes.includes('export interface TenantMembersOverview') &&
        webApiHas('getTenantMembers') &&
        adminSection.includes('getTenantMembers') &&
        adminSection.includes('updateTenantMemberRole'),
    },
    {
      label: 'admin monitoring UI is wired to provider and queue contracts',
      ok: sharedTypes.includes('export interface AgentExecutionQueueOverview') &&
        sharedTypes.includes('export interface ProviderSummary') &&
        adminSection.includes('executionQueue') &&
        adminSection.includes('providers'),
    },
    {
      label: 'tenant account menu CSS is isolated from the global stylesheet',
      ok: readFile('apps/web/src/main.tsx').includes('import "./layout/tenant.css"') &&
        !readFile('apps/web/src/styles.css').includes('.tenant-switcher') &&
        readFile('apps/web/src/layout/tenant.css').includes('.tenant-switcher'),
    },
  ];
  for (const check of checks) {
    if (check.ok) pass(check.label);
    else fail(check.label);
  }
} catch (e) {
  fail(`DB/shared/web contract check crashed: ${e.message}`);
}

function normalizeFrontendRoute(route) {
  return route
    .replace(/\$\{[^}]+\}/g, (match, offset, input) => input[offset - 1] === '/' ? ':param' : '')
    .replace(/\?.*$/, '')
    .replace(/:param$/, '/:param')
    .replace(/\/+/g, '/');
}

function routeMatches(backendRoute, frontendRoute) {
  const normalizedBackendRoute = backendRoute.replace(/\{[^/}]+\}/g, ':param');
  const escaped = normalizedBackendRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\\:[^/]+/g, '[^/]+').replace(/\\\*/g, '.*')}$`);
  return regex.test(frontendRoute);
}

function webApiHas(symbol) {
  return readFile('apps/web/src/api.ts').includes(`function ${symbol}`) ||
    readFile('apps/web/src/api.ts').includes(`async function ${symbol}`);
}

// ── 13. ARCHITECTURE GOVERNANCE ────────────────────────────────

console.log('\n13. Architecture governance');

const architectureGuard = run(NODE, ['scripts/architecture-guard.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
if (architectureGuard !== null) {
  pass('Python daemon architecture guard passes');
} else {
  fail('Python daemon architecture guard failed');
}

if (fileExists('apps/py-daemon/src/ucareer_py_daemon/agent_store.py')) {
  pass('Python daemon has a dedicated agent execution store module');
} else {
  fail('Python daemon is missing agent_store.py');
}

const pythonDaemonMain = readFile('apps/py-daemon/src/ucareer_py_daemon/main.py');
if (
  pythonDaemonMain.includes('def create_app(settings: Settings | None = None) -> FastAPI:') &&
  pythonDaemonMain.includes('@app.post("/api/agent-tasks")') &&
  pythonDaemonMain.includes('@app.get("/api/workflow-runs")') &&
  !pythonDaemonMain.includes('subprocess.Popen')
) {
  pass('Python daemon main stays as FastAPI composition root');
} else {
  fail('Python daemon main architecture boundary regressed');
}

const pythonDaemonReadme = readFile('apps/py-daemon/README.md');
if (
  pythonDaemonReadme.includes('default local backend') &&
  pythonDaemonReadme.includes('FastAPI') &&
  pythonDaemonReadme.includes('migration reference') &&
  pythonDaemonReadme.includes('UCAREER_PY_PORT')
) {
  pass('Python daemon README documents default backend ownership');
} else {
  fail('Python daemon README is missing default backend ownership notes');
}

const pythonApiMain = readFile('apps/py-api/src/ucareer_py_api/main.py');
if (
  pythonApiMain.includes('def create_app(settings: Settings | None = None) -> FastAPI:') &&
  pythonApiMain.includes('@app.post("/sync/push")') &&
  pythonApiMain.includes('@app.post("/approvals/{approval_id}/decision")') &&
  !pythonApiMain.includes('subprocess')
) {
  pass('Python cloud API main stays as FastAPI composition root');
} else {
  fail('Python cloud API architecture boundary regressed');
}

const pythonApiTests = run('python3', ['-m', 'unittest', 'discover', 'apps/py-api/tests'], {
  env: { ...process.env, PYTHONPATH: 'apps/py-api/src' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
if (pythonApiTests !== null) {
  pass('Python cloud API contract tests pass');
} else {
  fail('Python cloud API contract tests failed');
}

const adapterReadme = readFile('docs/archive/legacy-typescript-daemon/src/paperclip-adapters/README.md');
if (
  adapterReadme.includes('Treat this directory as vendored runtime code') &&
  adapterReadme.includes('dangerously*') &&
  adapterReadme.includes('approval-gated')
) {
  pass('legacy embedded adapter governance is documented');
} else {
  fail('legacy embedded adapter governance documentation is incomplete');
}

const agentSection = readFile('apps/web/src/sections/AgentSection.tsx');
if (
  fileExists('apps/web/src/sections/agent/AgentMarkdown.tsx') &&
  fileExists('apps/web/src/sections/agent/agentConversation.ts') &&
	  agentSection.includes('AgentApprovalBar') &&
	  agentSection.split('\n').length <= 864
) {
  pass('AgentSection is split and keeps the approval decision path visible');
} else {
  fail('AgentSection governance boundary regressed');
}

const resumeSection = readFile('apps/web/src/sections/ResumeSection.tsx');
if (
  fileExists('apps/web/src/sections/resume/ResumePreview.tsx') &&
  fileExists('apps/web/src/sections/resume/ResumeSidebar.tsx') &&
  fileExists('apps/web/src/sections/resume/resumeMarkdown.ts') &&
  resumeSection.includes('paginateMarkdown') &&
  resumeSection.includes('ResumeFileList') &&
  resumeSection.split('\n').length <= 550
) {
  pass('ResumeSection is split into preview, sidebar, and markdown modules');
} else {
  fail('ResumeSection governance boundary regressed');
}

const webMain = readFile('apps/web/src/main.tsx');
const globalWebCss = readFile('apps/web/src/styles.css');
const hasStandaloneGlobalRule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm').test(globalWebCss);
const agentCss = fileExists('apps/web/src/sections/agent/agent.css')
  ? readFile('apps/web/src/sections/agent/agent.css')
  : '';
const agentConversationCss = fileExists('apps/web/src/sections/agent/conversation.css')
  ? readFile('apps/web/src/sections/agent/conversation.css')
  : '';
const agentMarkdownCss = fileExists('apps/web/src/sections/agent/markdown.css')
  ? readFile('apps/web/src/sections/agent/markdown.css')
  : '';
const agentMobileConnectorCss = fileExists('apps/web/src/sections/agent/mobile-connector.css')
  ? readFile('apps/web/src/sections/agent/mobile-connector.css')
  : '';
const agentProcessCss = fileExists('apps/web/src/sections/agent/process.css')
  ? readFile('apps/web/src/sections/agent/process.css')
  : '';
if (
  webMain.includes('./sections/agent/agent.css') &&
  webMain.includes('./sections/agent/mobile-connector.css') &&
  webMain.includes('./sections/agent/process.css') &&
  webMain.includes('./sections/agent/markdown.css') &&
  agentCss.includes('.agent-console') &&
  agentMobileConnectorCss.includes('.agent-mobile-connector') &&
  agentMobileConnectorCss.includes('.connector-qqmail') &&
  !agentMobileConnectorCss.includes('connector-wechat') &&
  !agentMobileConnectorCss.includes('connector-miniapp') &&
  agentProcessCss.includes('.agent-process-stream') &&
  agentMarkdownCss.includes('.agent-markdown') &&
  !hasStandaloneGlobalRule('.agent-console') &&
  !hasStandaloneGlobalRule('.agent-markdown')
) {
  pass('Agent console CSS is isolated from the global web stylesheet');
} else {
  fail('Agent console CSS leaked back into the global web stylesheet');
}

const resumeCss = fileExists('apps/web/src/sections/resume/resume.css')
  ? readFile('apps/web/src/sections/resume/resume.css')
  : '';
if (
  webMain.includes('./sections/resume/resume.css') &&
  resumeCss.includes('.resume-classic-workspace') &&
  resumeCss.includes('.resume-page-v2') &&
  !hasStandaloneGlobalRule('.resume-classic-workspace') &&
  !hasStandaloneGlobalRule('.resume-page-v2')
) {
  pass('Resume workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Resume workspace CSS leaked back into the global web stylesheet');
}

const evidenceCss = fileExists('apps/web/src/sections/evidence/evidence.css')
  ? readFile('apps/web/src/sections/evidence/evidence.css')
  : '';
if (
  webMain.includes('./sections/evidence/evidence.css') &&
  evidenceCss.includes('.evidence-command-panel') &&
  evidenceCss.includes('.evidence-template-trigger') &&
  evidenceCss.includes('.view-evidence') &&
  !hasStandaloneGlobalRule('.evidence-command-panel') &&
  !hasStandaloneGlobalRule('.evidence-template-trigger') &&
  !hasStandaloneGlobalRule('.view-evidence')
) {
  pass('Evidence workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Evidence workspace CSS leaked back into the global web stylesheet');
}

const experienceCss = fileExists('apps/web/src/sections/experience/experience.css')
  ? readFile('apps/web/src/sections/experience/experience.css')
  : '';
const experienceProfileCss = fileExists('apps/web/src/sections/experience/profile.css')
  ? readFile('apps/web/src/sections/experience/profile.css')
  : '';
if (
  webMain.includes('./sections/experience/experience.css') &&
  webMain.includes('./sections/experience/profile.css') &&
  experienceCss.includes('.experience-classic-workspace') &&
  experienceCss.includes('.experience-markdown-paper-v2') &&
  experienceProfileCss.includes('.profile-summary') &&
  !hasStandaloneGlobalRule('.experience-classic-workspace') &&
  !hasStandaloneGlobalRule('.experience-markdown-paper-v2') &&
  !hasStandaloneGlobalRule('.profile-summary')
) {
  pass('Experience workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Experience workspace CSS leaked back into the global web stylesheet');
}

const marketCss = fileExists('apps/web/src/sections/market/market.css')
  ? readFile('apps/web/src/sections/market/market.css')
  : '';
if (
  webMain.includes('./sections/market/market.css') &&
  marketCss.includes('.market-legacy-workspace') &&
  marketCss.includes('.market-table-panel') &&
  marketCss.includes('.jobs-table') &&
  !hasStandaloneGlobalRule('.market-legacy-workspace') &&
  !hasStandaloneGlobalRule('.market-table-panel') &&
  !hasStandaloneGlobalRule('.jobs-table')
) {
  pass('Market workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Market workspace CSS leaked back into the global web stylesheet');
}

const applicationsCss = fileExists('apps/web/src/sections/applications/applications.css')
  ? readFile('apps/web/src/sections/applications/applications.css')
  : '';
if (
  webMain.includes('./sections/applications/applications.css') &&
  applicationsCss.includes('.applications-import-workspace') &&
  applicationsCss.includes('.applications-result-box') &&
  applicationsCss.includes('.application-row') &&
  !hasStandaloneGlobalRule('.applications-import-workspace') &&
  !hasStandaloneGlobalRule('.applications-result-box') &&
  !hasStandaloneGlobalRule('.application-row')
) {
  pass('Applications workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Applications workspace CSS leaked back into the global web stylesheet');
}

const reportsCss = fileExists('apps/web/src/sections/reports/reports.css')
  ? readFile('apps/web/src/sections/reports/reports.css')
  : '';
if (
  webMain.includes('./sections/reports/reports.css') &&
  reportsCss.includes('.reports-workspace') &&
  reportsCss.includes('.report-preview') &&
  reportsCss.includes('.report-list') &&
  !hasStandaloneGlobalRule('.reports-workspace') &&
  !hasStandaloneGlobalRule('.report-preview') &&
  !hasStandaloneGlobalRule('.report-list')
) {
  pass('Reports workspace CSS is isolated from the global web stylesheet');
} else {
  fail('Reports workspace CSS leaked back into the global web stylesheet');
}

const sourceLineCaps = [
  ['apps/web/src/styles.css', 2150],
  ['apps/web/src/sections/AgentSection.tsx', 864],
  ['apps/web/src/sections/agent/agent.css', 680],
  ['apps/web/src/sections/agent/mobile-connector.css', 663],
  ['apps/web/src/sections/agent/history.css', 220],
  ['apps/web/src/sections/agent/conversation.css', 460],
  ['apps/web/src/sections/agent/process.css', 320],
  ['apps/web/src/sections/agent/markdown.css', 800],
  ['apps/web/src/sections/agent/brand.css', 240],
  ['apps/web/src/sections/agent/composer.css', 700],
  ['apps/web/src/sections/agent/journey-line.css', 140],
  ['apps/web/src/sections/agent/mode-picker.css', 170],
  ['apps/web/src/sections/ResumeSection.tsx', 550],
  ['apps/web/src/sections/applications/applications.css', 1000],
  ['apps/web/src/sections/evidence/evidence.css', 1400],
  ['apps/web/src/sections/experience/experience.css', 900],
  ['apps/web/src/sections/experience/profile.css', 360],
  ['apps/web/src/sections/market/market.css', 860],
  ['apps/web/src/sections/reports/reports.css', 140],
];
for (const [file, cap] of sourceLineCaps) {
  const lineCount = readFile(file).split('\n').length;
  if (lineCount <= cap) {
    pass(`${file} stays under ${cap} lines`);
  } else {
    fail(`${file} has ${lineCount} lines, above governance cap ${cap}`);
  }
}

const largeTrackedFiles = run(
  `git ls-files -z | xargs -0 -I{} sh -c '[ -f "$1" ] || exit 0; bytes=$(wc -c < "$1"); if [ "$bytes" -gt 1048576 ]; then printf "%s\\t%s\\n" "$bytes" "$1"; fi' sh {}`
);
const allowedLargeTracked = new Set([
  'docs/demo.gif',
  'docs/vision-banner.jpg',
  'docs/roadmap-phases.jpg',
  'docs/og-image.jpg',
  'apps/web/public/assets/ucareer-brand-journey-hero.png',
  'apps/web/public/assets/ucareer-mountain-journey-bg-right-crop.png',
]);
const unexpectedLargeTracked = (largeTrackedFiles || '')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t')[1])
  .filter((file) => !allowedLargeTracked.has(file));
if (unexpectedLargeTracked.length === 0) {
  pass('Tracked files over 1 MiB are limited to documented marketing assets');
} else {
  for (const file of unexpectedLargeTracked) fail(`Unexpected tracked file over 1 MiB: ${file}`);
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
