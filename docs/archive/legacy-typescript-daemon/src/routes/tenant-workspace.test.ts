import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApplicationStore } from "../stores/application-store";
import { createReportStore } from "../stores/report-store";
import { createResumeStore } from "../stores/resume-store";
import { ensureTenantWorkspaceInitialized, tenantWorkspaceRoot, workspaceDataPath } from "../workspace-paths";

function createTempProjectRoot(): string {
  return mkdtempSync(join(tmpdir(), "ucareer-tenant-test-"));
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

test("tenantWorkspaceRoot creates isolated roots and rejects unsafe ids", () => {
  const projectRoot = createTempProjectRoot();
  const tenantA = tenantWorkspaceRoot(projectRoot, "tenant_a");
  const tenantB = tenantWorkspaceRoot(projectRoot, "tenant_b");

  assert.notEqual(tenantA, tenantB);
  assert.match(workspaceDataPath(tenantA, "profileCv"), /workspace\/tenants\/tenant_a\/workspace\/profile\/cv\.md$/);
  assert.match(workspaceDataPath(tenantB, "profileCv"), /workspace\/tenants\/tenant_b\/workspace\/profile\/cv\.md$/);
  assert.throws(() => tenantWorkspaceRoot(projectRoot, "../tenant_b"), /invalid tenant id/i);
});

test("application events are isolated by tenant workspace root", async () => {
  const projectRoot = createTempProjectRoot();
  const tenantAStore = createApplicationStore(tenantWorkspaceRoot(projectRoot, "tenant_a"));
  const tenantBStore = createApplicationStore(tenantWorkspaceRoot(projectRoot, "tenant_b"));

  await tenantAStore.createApplicationEvent({
    company: "Acme",
    role: "Backend Engineer",
    event: "applied",
    date: "2026-07-01",
  });

  const tenantA = await tenantAStore.listApplications();
  const tenantB = await tenantBStore.listApplications();

  assert.equal(tenantA.applications.length, 1);
  assert.equal(tenantA.applications[0]?.company, "Acme");
  assert.equal(tenantB.applications.length, 0);
});

test("resumes are isolated by tenant workspace root", async () => {
  const projectRoot = createTempProjectRoot();
  const tenantARoot = tenantWorkspaceRoot(projectRoot, "tenant_a");
  const tenantBRoot = tenantWorkspaceRoot(projectRoot, "tenant_b");
  const tenantAStore = createResumeStore(tenantARoot);
  const tenantBStore = createResumeStore(tenantBRoot);

  writeText(workspaceDataPath(tenantARoot, "resumeLibrary") + "/main.md", "# Tenant A Resume\n");

  assert.equal((await tenantAStore.listResumes()).length, 1);
  assert.equal((await tenantBStore.listResumes()).length, 0);
  assert.equal((await tenantBStore.getResume("main.md")), undefined);
});

test("tenant workspace initialization seeds local profile and resumes without overwriting tenant data", async () => {
  const projectRoot = createTempProjectRoot();
  writeText(join(projectRoot, "workspace/README.md"), "# Workspace\n");
  writeText(join(projectRoot, "workspace/jobs/jds/sample.md"), "# JD\n");
  writeText(join(projectRoot, "workspace/ops/data/applications.md"), "# Applications\n");
  writeText(join(projectRoot, "workspace/tenants/other/workspace/profile/cv.md"), "# Other Tenant CV\n");
  writeText(workspaceDataPath(projectRoot, "profileCv"), "# Root CV\n");
  writeText(workspaceDataPath(projectRoot, "resumeLibrary") + "/root-resume.md", "# Root Resume\n");
  writeText(workspaceDataPath(projectRoot, "resumeJobLinks"), JSON.stringify({ links: [] }));
  const tenantRoot = tenantWorkspaceRoot(projectRoot, "tenant_seeded");

  ensureTenantWorkspaceInitialized(projectRoot, tenantRoot);

  assert.equal(existsSync(workspaceDataPath(tenantRoot, "profileCv")), true);
  assert.equal(existsSync(join(tenantRoot, "workspace/README.md")), true);
  assert.equal(existsSync(join(tenantRoot, "workspace/jobs/jds/sample.md")), true);
  assert.equal(existsSync(join(tenantRoot, "workspace/ops/data/applications.md")), true);
  assert.equal(existsSync(join(tenantRoot, "workspace/tenants/other/workspace/profile/cv.md")), false);
  assert.equal((await createResumeStore(tenantRoot).listResumes()).length, 1);

  writeText(workspaceDataPath(tenantRoot, "profileCv"), "# Tenant CV\n");
  ensureTenantWorkspaceInitialized(projectRoot, tenantRoot);

  assert.equal((await createResumeStore(tenantRoot).getResume("root-resume.md"))?.title, "Root Resume");
});

test("reports return empty for new tenants and stay isolated", async () => {
  const projectRoot = createTempProjectRoot();
  const tenantARoot = tenantWorkspaceRoot(projectRoot, "tenant_a");
  const tenantBRoot = tenantWorkspaceRoot(projectRoot, "tenant_b");
  const tenantAStore = createReportStore(tenantARoot);
  const tenantBStore = createReportStore(tenantBRoot);

  writeText(workspaceDataPath(tenantARoot, "reports") + "/001-acme-2026-07-01.md", [
    "# Acme Backend Engineer",
    "**Date:** 2026-07-01",
    "**Score:** 4.5/5",
    "**URL:** https://example.com/job",
    "",
    "Good fit.",
    "",
  ].join("\n"));

  assert.equal((await tenantAStore.listReports()).reports.length, 1);
  assert.equal((await tenantBStore.listReports()).reports.length, 0);
  assert.equal(await tenantBStore.getReport("001-acme-2026-07-01.md"), undefined);
});
