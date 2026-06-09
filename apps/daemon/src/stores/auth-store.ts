import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AccountSummary,
  AuthSession,
  CreateAccountRequest,
  LoginRequest,
  TenantMembership,
  TenantPermission,
  TenantRole,
  TenantSummary,
} from "@ucareer/shared";
import { openDaemonDatabase } from "../db/sqlite";

interface AccountRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface MembershipRow extends TenantRow {
  role: string;
}

interface SessionRow extends AccountRow {
  token: string;
  active_tenant_id: string;
  session_created_at: string;
  expires_at: string;
}

export interface AuthStore {
  createAccount(input: CreateAccountRequest): AuthSession;
  login(input: LoginRequest): AuthSession;
  getSession(token: string): AuthSession | null;
  logout(token: string): boolean;
  listMemberships(accountId: string): TenantMembership[];
}

export function createAuthStore(dbPath: string): AuthStore {
  const db = openDaemonDatabase(dbPath);

  return {
    createAccount(input) {
      const email = normalizeEmail(input.email);
      const password = normalizePassword(input.password);
      if (!email) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");
      if (findAccountByEmail(db, email)) throw new Error("Account already exists");

      const now = new Date().toISOString();
      const accountId = createId("acct");
      const tenantId = createId("tenant");
      const tenantName = String(input.tenantName || "Personal Workspace").trim() || "Personal Workspace";
      const { hash, salt } = hashPassword(password);

      db.prepare(`
        INSERT INTO accounts (id, email, display_name, password_hash, password_salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(accountId, email, String(input.displayName || email.split("@")[0] || email).trim(), hash, salt, now);

      db.prepare(`
        INSERT INTO tenants (id, name, slug, created_at)
        VALUES (?, ?, ?, ?)
      `).run(tenantId, tenantName, uniqueTenantSlug(db, tenantName), now);

      db.prepare(`
        INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at)
        VALUES (?, ?, ?, ?)
      `).run(tenantId, accountId, "owner", now);

      return createSession(db, accountId, tenantId, Boolean(input.remember));
    },

    login(input) {
      const email = normalizeEmail(input.email);
      const password = normalizePassword(input.password);
      if (!email) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");

      const account = findAccountByEmail(db, email);
      if (!account || !verifyPassword(password, account.password_hash, account.password_salt)) {
        throw new Error("Invalid email or password");
      }

      const membership = listMembershipRows(db, account.id)[0];
      if (!membership) throw new Error("Account has no tenant membership");
      return createSession(db, account.id, membership.id, Boolean(input.remember));
    },

    getSession(token) {
      const cleanToken = String(token || "").trim();
      if (!cleanToken) return null;
      const session = db.prepare(`
        SELECT
          auth_sessions.token,
          auth_sessions.active_tenant_id,
          auth_sessions.created_at AS session_created_at,
          auth_sessions.expires_at,
          accounts.*
        FROM auth_sessions
        JOIN accounts ON accounts.id = auth_sessions.account_id
        WHERE auth_sessions.token = ?
      `).get(cleanToken) as SessionRow | undefined;
      if (!session) return null;
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(cleanToken);
        return null;
      }
      return hydrateSession(db, session);
    },

    logout(token) {
      const result = db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(String(token || "").trim());
      return result.changes > 0;
    },

    listMemberships(accountId) {
      return listMembershipRows(db, accountId).map(toMembership);
    },
  };
}

function createSession(db: Database.Database, accountId: string, tenantId: string, remember: boolean): AuthSession {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000).toISOString();
  const token = `sess_${randomBytes(32).toString("hex")}`;
  db.prepare(`
    INSERT INTO auth_sessions (token, account_id, active_tenant_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, accountId, tenantId, createdAt, expiresAt);

  const session = db.prepare(`
    SELECT
      auth_sessions.token,
      auth_sessions.active_tenant_id,
      auth_sessions.created_at AS session_created_at,
      auth_sessions.expires_at,
      accounts.*
    FROM auth_sessions
    JOIN accounts ON accounts.id = auth_sessions.account_id
    WHERE auth_sessions.token = ?
  `).get(token) as SessionRow;
  return hydrateSession(db, session);
}

function hydrateSession(db: Database.Database, row: SessionRow): AuthSession {
  const memberships = listMembershipRows(db, row.id).map(toMembership);
  const activeMembership = memberships.find((membership) => membership.tenant.id === row.active_tenant_id) || memberships[0];
  if (!activeMembership) throw new Error("Session has no active tenant");
  return {
    token: row.token,
    account: toAccount(row),
    activeTenant: activeMembership.tenant,
    role: activeMembership.role,
    permissions: activeMembership.permissions,
    memberships,
    createdAt: row.session_created_at,
    expiresAt: row.expires_at,
  };
}

function findAccountByEmail(db: Database.Database, email: string): AccountRow | undefined {
  return db.prepare("SELECT * FROM accounts WHERE email = ?").get(email) as AccountRow | undefined;
}

function listMembershipRows(db: Database.Database, accountId: string): MembershipRow[] {
  return db.prepare(`
    SELECT tenants.*, tenant_memberships.role
    FROM tenant_memberships
    JOIN tenants ON tenants.id = tenant_memberships.tenant_id
    WHERE tenant_memberships.account_id = ?
    ORDER BY tenants.created_at ASC
  `).all(accountId) as MembershipRow[];
}

function toAccount(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function toTenant(row: TenantRow): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
  };
}

function toMembership(row: MembershipRow): TenantMembership {
  const role = normalizeRole(row.role);
  return {
    tenant: toTenant(row),
    role,
    permissions: permissionsForRole(role),
  };
}

function permissionsForRole(role: TenantRole): TenantPermission[] {
  if (role === "owner") {
    return [
      "tenant.manage",
      "users.manage",
      "agent.run",
      "agent.approve",
      "workspace.read",
      "workspace.write",
      "applications.read",
      "applications.write",
      "billing.view",
      "sync.cloud",
    ];
  }
  if (role === "admin") {
    return ["users.manage", "agent.run", "agent.approve", "workspace.read", "workspace.write", "applications.read", "applications.write"];
  }
  if (role === "member") {
    return ["agent.run", "workspace.read", "workspace.write", "applications.read", "applications.write"];
  }
  return ["workspace.read", "applications.read"];
}

function normalizeRole(value: string): TenantRole {
  return value === "owner" || value === "admin" || value === "member" || value === "viewer" ? value : "viewer";
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || "");
}

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function uniqueTenantSlug(db: Database.Database, name: string): string {
  const base = slugify(name) || "workspace";
  for (let index = 0; index < 1000; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slug);
    if (!existing) return slug;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}
