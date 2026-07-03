import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createAuthStore } from "./auth-store";

function createTempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "ucareer-auth-test-")), "daemon.sqlite");
}

function openDb(path: string): Database.Database {
  return new Database(path);
}

test("createAccount creates an owner session with a tenant", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);

  const session = store.createAccount({
    email: "Owner@Example.com",
    password: "Passw0rd!",
    displayName: "Owner User",
    tenantName: "Acme Workspace",
    remember: true,
  });

  assert.equal(session.account.email, "owner@example.com");
  assert.equal(session.account.displayName, "Owner User");
  assert.equal(session.activeTenant.name, "Acme Workspace");
  assert.equal(session.role, "owner");
  assert.ok(session.permissions.includes("tenant.manage"));
  assert.ok(session.permissions.includes("users.manage"));
  assert.equal(session.memberships.length, 1);
});

test("createAuthStore assigns legacy history rows to the active local tenant", () => {
  const dbPath = createTempDbPath();
  const now = new Date().toISOString();
  const db = openDb(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      tenant_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      active_tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      provider_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO accounts (id, email, display_name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("acct_real", "123", "123", "hash", "salt", now);
  db.prepare("INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run("tenant_real", "Personal Workspace", "personal-workspace", now);
  db.prepare("INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run("tenant_real", "acct_real", "owner", now);
  db.prepare("INSERT INTO auth_sessions (token, account_id, active_tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run("sess_real", "acct_real", "tenant_real", now, "2999-01-01T00:00:00.000Z");
  db.prepare("INSERT INTO agent_tasks (id, provider_id, workspace_path, prompt, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("legacy-task", "codex", "/Users/don/Documents/career-ops", "legacy prompt", "structured", "completed", now, now);
  db.prepare("INSERT INTO agent_events (id, task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("legacy-event", "legacy-task", "message", JSON.stringify({ type: "message", role: "user", text: "legacy prompt", createdAt: now }), now);
  db.close();

  createAuthStore(dbPath);

  const verifyDb = openDb(dbPath);
  const task = verifyDb.prepare("SELECT tenant_id FROM agent_tasks WHERE id = ?").get("legacy-task") as { tenant_id: string };
  const event = verifyDb.prepare("SELECT tenant_id FROM agent_events WHERE id = ?").get("legacy-event") as { tenant_id: string };
  verifyDb.close();
  assert.equal(task.tenant_id, "tenant_real");
  assert.equal(event.tenant_id, "tenant_real");
});

test("createAccount rejects invalid email, weak password, and duplicate email", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);

  assert.throws(
    () => store.createAccount({ email: "not-an-email", password: "Passw0rd!" }),
    /valid email/i,
  );
  assert.throws(
    () => store.createAccount({ email: "weak@example.com", password: "short1" }),
    /at least 8/i,
  );
  assert.throws(
    () => store.createAccount({ email: "letters@example.com", password: "abcdefgh" }),
    /letters and numbers/i,
  );

  store.createAccount({ email: "dupe@example.com", password: "Passw0rd!" });
  assert.throws(
    () => store.createAccount({ email: "DUPE@example.com", password: "Passw0rd!" }),
    /already exists/i,
  );

  const db = openDb(dbPath);
  const accountCount = db.prepare("SELECT COUNT(*) AS count FROM accounts").get() as { count: number };
  const tenantCount = db.prepare("SELECT COUNT(*) AS count FROM tenants").get() as { count: number };
  assert.equal(accountCount.count, 1);
  assert.equal(tenantCount.count, 1);
  db.close();
});

test("login authenticates existing accounts and rejects bad credentials", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);

  store.createAccount({ email: "login@example.com", password: "Passw0rd!" });
  const session = store.login({ email: "LOGIN@example.com", password: "Passw0rd!" });

  assert.equal(session.account.email, "login@example.com");
  assert.throws(
    () => store.login({ email: "login@example.com", password: "wrong-password" }),
    /invalid email or password/i,
  );
  assert.throws(
    () => store.login({ email: "missing@example.com", password: "Passw0rd!" }),
    /invalid email or password/i,
  );
});

test("getSession returns null and deletes expired sessions", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const session = store.createAccount({ email: "expired@example.com", password: "Passw0rd!" });

  const db = openDb(dbPath);
  db.prepare("UPDATE auth_sessions SET expires_at = ? WHERE token = ?")
    .run("2000-01-01T00:00:00.000Z", session.token);
  db.close();

  assert.equal(store.getSession(session.token), null);

  const verifyDb = openDb(dbPath);
  const row = verifyDb.prepare("SELECT token FROM auth_sessions WHERE token = ?").get(session.token);
  verifyDb.close();
  assert.equal(row, undefined);
});

test("logout deletes the session token", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const session = store.createAccount({ email: "logout@example.com", password: "Passw0rd!" });

  assert.equal(store.logout(session.token), true);
  assert.equal(store.getSession(session.token), null);
  assert.equal(store.logout(session.token), false);
});

test("remember controls session lifetime", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const shortSession = store.createAccount({ email: "short@example.com", password: "Passw0rd!", remember: false });
  const longSession = store.createAccount({ email: "long@example.com", password: "Passw0rd!", remember: true });

  const shortLifetimeMs = new Date(shortSession.expiresAt).getTime() - new Date(shortSession.createdAt).getTime();
  const longLifetimeMs = new Date(longSession.expiresAt).getTime() - new Date(longSession.createdAt).getTime();

  assert.equal(Math.round(shortLifetimeMs / (24 * 60 * 60 * 1000)), 1);
  assert.equal(Math.round(longLifetimeMs / (24 * 60 * 60 * 1000)), 30);
});

test("stored password material is salted and never plaintext", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  store.createAccount({ email: "secret@example.com", password: "Passw0rd!" });

  const db = openDb(dbPath);
  const row = db.prepare("SELECT password_hash, password_salt FROM accounts WHERE email = ?")
    .get("secret@example.com") as { password_hash: string; password_salt: string };
  db.close();

  assert.notEqual(row.password_hash, "Passw0rd!");
  assert.notEqual(row.password_salt, "Passw0rd!");
  assert.equal(row.password_hash.length, 128);
  assert.equal(row.password_salt.length, 32);
});

test("membership roles hydrate the expected permission matrix", () => {
  const expectations = {
    owner: ["tenant.manage", "users.manage", "agent.run", "agent.approve", "workspace.read", "workspace.write", "applications.read", "applications.write", "billing.view", "sync.cloud"],
    admin: ["users.manage", "agent.run", "agent.approve", "workspace.read", "workspace.write", "applications.read", "applications.write", "billing.view"],
    member: ["agent.run", "workspace.read", "workspace.write", "applications.read", "applications.write"],
    viewer: ["workspace.read", "applications.read"],
  } as const;

  for (const [role, permissions] of Object.entries(expectations)) {
    const dbPath = createTempDbPath();
    const store = createAuthStore(dbPath);
    const session = store.createAccount({ email: `${role}@example.com`, password: "Passw0rd!" });

    const db = openDb(dbPath);
    db.prepare("UPDATE tenant_memberships SET role = ? WHERE account_id = ?")
      .run(role, session.account.id);
    db.close();

    const hydrated = store.getSession(session.token);
    assert.equal(hydrated?.role, role);
    assert.deepEqual(hydrated?.permissions, permissions);
  }
});

test("createTenant switches the active session and keeps memberships", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const first = store.createAccount({ email: "tenant-owner@example.com", password: "Passw0rd!", tenantName: "First" });

  const second = store.createTenant(first.token, { name: "Second Workspace" });

  assert.equal(second.activeTenant.name, "Second Workspace");
  assert.equal(second.role, "owner");
  assert.equal(second.memberships.length, 2);
  assert.deepEqual(second.memberships.map((membership) => membership.tenant.name), ["First", "Second Workspace"]);
});

test("switchTenant only allows tenants where the account is a member", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const owner = store.createAccount({ email: "switch-owner@example.com", password: "Passw0rd!", tenantName: "Owner Tenant" });
  const second = store.createTenant(owner.token, { name: "Second Tenant" });
  const outsider = store.createAccount({ email: "switch-outsider@example.com", password: "Passw0rd!", tenantName: "Outsider Tenant" });
  const ownerTenantId = owner.activeTenant.id;

  const switched = store.switchTenant(second.token, { tenantId: ownerTenantId });
  assert.equal(switched.activeTenant.id, ownerTenantId);
  assert.throws(
    () => store.switchTenant(switched.token, { tenantId: outsider.activeTenant.id }),
    /membership not found/i,
  );
});

test("tenant managers can add, update, and remove existing local accounts", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const owner = store.createAccount({ email: "team-owner@example.com", password: "Passw0rd!", tenantName: "Team" });
  const member = store.createAccount({ email: "team-member@example.com", password: "Passw0rd!", tenantName: "Member Home" });

  const afterAdd = store.addTenantMember(owner.token, { email: "TEAM-MEMBER@example.com", role: "member" });
  assert.equal(afterAdd.members.length, 2);
  assert.equal(afterAdd.members.find((item) => item.account.id === member.account.id)?.role, "member");

  const afterUpdate = store.updateTenantMemberRole(owner.token, member.account.id, { role: "admin" });
  assert.equal(afterUpdate.members.find((item) => item.account.id === member.account.id)?.role, "admin");

  const memberTeamSession = store.switchTenant(member.token, { tenantId: owner.activeTenant.id });
  assert.equal(memberTeamSession.role, "admin");
  assert.ok(memberTeamSession.permissions.includes("agent.approve"));

  const afterRemove = store.removeTenantMember(owner.token, member.account.id);
  assert.equal(afterRemove.members.some((item) => item.account.id === member.account.id), false);
  assert.throws(
    () => store.switchTenant(member.token, { tenantId: owner.activeTenant.id }),
    /valid Ucareer session/i,
  );
});

test("tenant member management protects owners and requires manager permissions", () => {
  const dbPath = createTempDbPath();
  const store = createAuthStore(dbPath);
  const owner = store.createAccount({ email: "protect-owner@example.com", password: "Passw0rd!", tenantName: "Protected" });
  const member = store.createAccount({ email: "protect-member@example.com", password: "Passw0rd!", tenantName: "Member Home" });
  store.addTenantMember(owner.token, { email: member.account.email, role: "member" });
  const memberTeamSession = store.switchTenant(member.token, { tenantId: owner.activeTenant.id });

  assert.throws(
    () => store.addTenantMember(memberTeamSession.token, { email: "nobody@example.com", role: "viewer" }),
    /users.manage/i,
  );
  assert.throws(
    () => store.updateTenantMemberRole(owner.token, owner.account.id, { role: "admin" }),
    /own role/i,
  );
  assert.throws(
    () => store.removeTenantMember(owner.token, owner.account.id),
    /remove yourself/i,
  );
  assert.throws(
    () => store.addTenantMember(owner.token, { email: "missing@example.com", role: "viewer" }),
    /account not found/i,
  );
});
