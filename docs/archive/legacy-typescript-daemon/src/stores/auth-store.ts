import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AccountSummary,
  AddTenantMemberRequest,
  AuthSession,
  CreateTenantRequest,
  CreateAccountRequest,
  LoginRequest,
  SwitchTenantRequest,
  TenantMember,
  TenantMembersOverview,
  TenantMembership,
  TenantPermission,
  TenantRole,
  TenantSummary,
  UpdateTenantMemberRoleRequest,
} from "@ucareer/shared";
import { assignLegacyTenantData, openDaemonDatabase } from "../db/sqlite";

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
  account_id?: string;
  email?: string;
  display_name?: string;
  account_created_at?: string;
  membership_created_at?: string;
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
  createTenant(token: string, input: CreateTenantRequest): AuthSession;
  switchTenant(token: string, input: SwitchTenantRequest): AuthSession;
  listTenantMembers(token: string): TenantMembersOverview;
  addTenantMember(token: string, input: AddTenantMemberRequest): TenantMembersOverview;
  updateTenantMemberRole(token: string, accountId: string, input: UpdateTenantMemberRoleRequest): TenantMembersOverview;
  removeTenantMember(token: string, accountId: string): TenantMembersOverview;
}

export function createAuthStore(dbPath: string): AuthStore {
  const db = openDaemonDatabase(dbPath);
  assignLegacyTenantDataToLocalOwner(db);

  return {
    createAccount(input) {
      deleteExpiredSessions(db);
      const email = normalizeEmail(input.email);
      const password = normalizePassword(input.password);
      if (!email) throw new Error("Email is required");
      if (!isValidEmail(email)) throw new Error("A valid email is required");
      validateNewPassword(password);

      try {
        return db.transaction(() => {
          if (findAccountByEmail(db, email)) throw new Error("Account already exists");

          const now = new Date().toISOString();
          const accountId = createId("acct");
          const tenantId = createId("tenant");
          const tenantName = String(input.tenantName || "Personal Workspace").trim() || "Personal Workspace";
          const displayName = String(input.displayName || email.split("@")[0] || email).trim();
          const { hash, salt } = hashPassword(password);

          db.prepare(`
            INSERT INTO accounts (id, email, display_name, password_hash, password_salt, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(accountId, email, displayName, hash, salt, now);

          db.prepare(`
            INSERT INTO tenants (id, name, slug, created_at)
            VALUES (?, ?, ?, ?)
          `).run(tenantId, tenantName, uniqueTenantSlug(db, tenantName), now);

          db.prepare(`
            INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at)
            VALUES (?, ?, ?, ?)
          `).run(tenantId, accountId, "owner", now);

          const tenantCount = db.prepare("SELECT COUNT(*) AS count FROM tenants").get() as { count: number };
          if (tenantCount.count === 1) assignLegacyTenantData(db, tenantId);

          return createSession(db, accountId, tenantId, Boolean(input.remember));
        })();
      } catch (cause) {
        if (isUniqueConstraintError(cause)) throw new Error("Account already exists");
        throw cause;
      }
    },

    login(input) {
      deleteExpiredSessions(db);
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

    createTenant(token, input) {
      const session = requireSession(db, token);
      const name = String(input.name || "").trim();
      if (!name) throw new Error("Tenant name is required");
      const now = new Date().toISOString();
      const tenantId = createId("tenant");
      db.transaction(() => {
        db.prepare(`
          INSERT INTO tenants (id, name, slug, created_at)
          VALUES (?, ?, ?, ?)
        `).run(tenantId, name, uniqueTenantSlug(db, name), now);
        db.prepare(`
          INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at)
          VALUES (?, ?, ?, ?)
        `).run(tenantId, session.account.id, "owner", now);
        db.prepare("UPDATE auth_sessions SET active_tenant_id = ? WHERE token = ?")
          .run(tenantId, session.token);
      })();
      return requireSession(db, token);
    },

    switchTenant(token, input) {
      const session = requireSession(db, token);
      const tenantId = String(input.tenantId || "").trim();
      if (!tenantId) throw new Error("Tenant is required");
      const membership = listMembershipRows(db, session.account.id).find((item) => item.id === tenantId);
      if (!membership) throw new Error("Tenant membership not found");
      db.prepare("UPDATE auth_sessions SET active_tenant_id = ? WHERE token = ?").run(tenantId, session.token);
      return requireSession(db, token);
    },

    listTenantMembers(token) {
      const session = requireSession(db, token);
      return listTenantMembersOverview(db, session.activeTenant.id);
    },

    addTenantMember(token, input) {
      const session = requireSession(db, token);
      requireTenantManager(session);
      const email = normalizeEmail(input.email);
      if (!email) throw new Error("Member email is required");
      const role = normalizeAssignableRole(input.role);
      const account = findAccountByEmail(db, email);
      if (!account) throw new Error("Account not found. Ask the user to create a local account first.");
      if (account.id === session.account.id) throw new Error("You are already a member of this tenant");
      try {
        db.prepare(`
          INSERT INTO tenant_memberships (tenant_id, account_id, role, created_at)
          VALUES (?, ?, ?, ?)
        `).run(session.activeTenant.id, account.id, role, new Date().toISOString());
      } catch (cause) {
        if (isUniqueConstraintError(cause)) throw new Error("Account is already a tenant member");
        throw cause;
      }
      return listTenantMembersOverview(db, session.activeTenant.id);
    },

    updateTenantMemberRole(token, accountId, input) {
      const session = requireSession(db, token);
      requireTenantManager(session);
      const targetAccountId = String(accountId || "").trim();
      if (!targetAccountId) throw new Error("Account is required");
      if (targetAccountId === session.account.id) throw new Error("You cannot change your own role");
      const role = normalizeAssignableRole(input.role);
      const target = findTenantMemberRow(db, session.activeTenant.id, targetAccountId);
      if (!target) throw new Error("Tenant member not found");
      if (normalizeRole(target.role) === "owner") throw new Error("Owner role cannot be changed");
      db.prepare(`
        UPDATE tenant_memberships
        SET role = ?
        WHERE tenant_id = ? AND account_id = ?
      `).run(role, session.activeTenant.id, targetAccountId);
      return listTenantMembersOverview(db, session.activeTenant.id);
    },

    removeTenantMember(token, accountId) {
      const session = requireSession(db, token);
      requireTenantManager(session);
      const targetAccountId = String(accountId || "").trim();
      if (!targetAccountId) throw new Error("Account is required");
      if (targetAccountId === session.account.id) throw new Error("You cannot remove yourself from this tenant");
      const target = findTenantMemberRow(db, session.activeTenant.id, targetAccountId);
      if (!target) throw new Error("Tenant member not found");
      if (normalizeRole(target.role) === "owner") throw new Error("Owner cannot be removed");
      db.prepare(`
        DELETE FROM tenant_memberships
        WHERE tenant_id = ? AND account_id = ?
      `).run(session.activeTenant.id, targetAccountId);
      db.prepare("DELETE FROM auth_sessions WHERE account_id = ? AND active_tenant_id = ?")
        .run(targetAccountId, session.activeTenant.id);
      return listTenantMembersOverview(db, session.activeTenant.id);
    },
  };
}

function assignLegacyTenantDataToLocalOwner(db: Database.Database): void {
  const tenant = db.prepare(`
    SELECT tenants.id
    FROM auth_sessions
    JOIN tenants ON tenants.id = auth_sessions.active_tenant_id
    JOIN accounts ON accounts.id = auth_sessions.account_id
    WHERE auth_sessions.expires_at > ?
      AND accounts.email NOT LIKE '%@local.test'
    ORDER BY auth_sessions.created_at DESC
    LIMIT 1
  `).get(new Date().toISOString()) as { id: string } | undefined;
  const fallbackTenant = tenant || db.prepare(`
    SELECT tenants.id
    FROM tenants
    JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
    JOIN accounts ON accounts.id = tenant_memberships.account_id
    WHERE accounts.email NOT LIKE '%@local.test'
    ORDER BY tenants.created_at ASC
    LIMIT 1
  `).get() as { id: string } | undefined;
  const firstTenant = fallbackTenant || db.prepare(`
    SELECT id
    FROM tenants
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id: string } | undefined;
  if (firstTenant?.id) assignLegacyTenantData(db, firstTenant.id);
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

function listTenantMembersOverview(db: Database.Database, tenantId: string): TenantMembersOverview {
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as TenantRow | undefined;
  if (!tenant) throw new Error("Tenant not found");
  const members = db.prepare(`
    SELECT
      tenant_memberships.account_id,
      tenant_memberships.role,
      tenant_memberships.created_at AS membership_created_at,
      accounts.email,
      accounts.display_name,
      accounts.created_at AS account_created_at
    FROM tenant_memberships
    JOIN accounts ON accounts.id = tenant_memberships.account_id
    WHERE tenant_memberships.tenant_id = ?
    ORDER BY
      CASE tenant_memberships.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'member' THEN 2
        ELSE 3
      END,
      accounts.email ASC
  `).all(tenantId) as MembershipRow[];
  return {
    tenant: toTenant(tenant),
    members: members.map(toTenantMember),
  };
}

function findTenantMemberRow(db: Database.Database, tenantId: string, accountId: string): MembershipRow | undefined {
  return db.prepare(`
    SELECT tenants.*, tenant_memberships.role
    FROM tenant_memberships
    JOIN tenants ON tenants.id = tenant_memberships.tenant_id
    WHERE tenant_memberships.tenant_id = ? AND tenant_memberships.account_id = ?
  `).get(tenantId, accountId) as MembershipRow | undefined;
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

function toTenantMember(row: MembershipRow): TenantMember {
  const role = normalizeRole(row.role);
  return {
    account: {
      id: row.account_id || "",
      email: row.email || "",
      displayName: row.display_name || row.email || "",
      createdAt: row.account_created_at || row.membership_created_at || "",
    },
    role,
    permissions: permissionsForRole(role),
    createdAt: row.membership_created_at || "",
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
    return ["users.manage", "agent.run", "agent.approve", "workspace.read", "workspace.write", "applications.read", "applications.write", "billing.view"];
  }
  if (role === "member") {
    return ["agent.run", "workspace.read", "workspace.write", "applications.read", "applications.write"];
  }
  return ["workspace.read", "applications.read"];
}

function normalizeRole(value: string): TenantRole {
  return value === "owner" || value === "admin" || value === "member" || value === "viewer" ? value : "viewer";
}

function normalizeAssignableRole(value: unknown): Exclude<TenantRole, "owner"> {
  if (value === "admin" || value === "member" || value === "viewer") return value;
  throw new Error("Assignable role must be admin, member, or viewer");
}

function requireTenantManager(session: AuthSession): void {
  if (!session.permissions.includes("users.manage")) throw new Error("Permission required: users.manage");
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || "");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateNewPassword(password: string): void {
  if (!password) throw new Error("Password is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must include letters and numbers");
  }
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

function deleteExpiredSessions(db: Database.Database): void {
  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(new Date().toISOString());
}

function requireSession(db: Database.Database, token: string): AuthSession {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) throw new Error("A valid Ucareer session is required");
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
  if (!session) throw new Error("A valid Ucareer session is required");
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(cleanToken);
    throw new Error("A valid Ucareer session is required");
  }
  return hydrateSession(db, session);
}

function isUniqueConstraintError(cause: unknown): boolean {
  return cause instanceof Error && /UNIQUE constraint failed/i.test(cause.message);
}
