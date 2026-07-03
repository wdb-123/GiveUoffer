import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDaemonDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      provider_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      skill_id TEXT,
      workflow_id TEXT,
      workflow_run_id TEXT,
      input_kind TEXT,
      source_text TEXT,
      route_decision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      workflow_id TEXT NOT NULL,
      skill_id TEXT,
      task_id TEXT,
      current_step_id TEXT,
      status TEXT NOT NULL,
      source_text TEXT,
      route_decision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_updated_at
      ON workflow_runs (updated_at);

    CREATE TABLE IF NOT EXISTS workflow_step_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      workflow_run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL,
      task_id TEXT,
      approval_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_workflow_run_id
      ON workflow_step_runs (workflow_run_id);

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_task_id_created_at
      ON agent_events (task_id, created_at);

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      risk TEXT NOT NULL,
      summary TEXT NOT NULL,
      command TEXT,
      cwd TEXT,
      affected_paths TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_decisions (
      approval_id TEXT PRIMARY KEY,
      tenant_id TEXT,
      task_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_grants (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      action TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      source_approval_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, action, provider_id, workspace_path)
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      pushed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_events_pushed_id
      ON sync_events (pushed_at, id);

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

    CREATE INDEX IF NOT EXISTS idx_tenant_memberships_account_id
      ON tenant_memberships (account_id);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      active_tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_account_id
      ON auth_sessions (account_id);

    CREATE TABLE IF NOT EXISTS tenant_billing (
      tenant_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      monthly_token_limit INTEGER NOT NULL,
      monthly_price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_token_usage_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_token_usage_monthly (
      tenant_id TEXT NOT NULL,
      month TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      task_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      PRIMARY KEY (tenant_id, month)
    );

    CREATE TABLE IF NOT EXISTS connector_credentials (
      tenant_id TEXT NOT NULL DEFAULT 'legacy',
      connector_id TEXT NOT NULL,
      account TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      secret_auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT,
      PRIMARY KEY (tenant_id, connector_id)
    );
  `);

  ensureColumn(db, "agent_tasks", "skill_id", "TEXT");
  ensureColumn(db, "agent_tasks", "tenant_id", "TEXT");
  ensureColumn(db, "agent_tasks", "workflow_id", "TEXT");
  ensureColumn(db, "agent_tasks", "workflow_run_id", "TEXT");
  ensureColumn(db, "agent_tasks", "input_kind", "TEXT");
  ensureColumn(db, "agent_tasks", "source_text", "TEXT");
  ensureColumn(db, "agent_tasks", "route_decision", "TEXT");
  ensureColumn(db, "workflow_runs", "tenant_id", "TEXT");
  ensureColumn(db, "workflow_step_runs", "tenant_id", "TEXT");
  ensureColumn(db, "agent_events", "tenant_id", "TEXT");
  ensureColumn(db, "approval_requests", "tenant_id", "TEXT");
  ensureColumn(db, "approval_decisions", "tenant_id", "TEXT");
  ensureColumn(db, "approval_grants", "tenant_id", "TEXT");
  ensureColumn(db, "sync_events", "tenant_id", "TEXT");
  ensureColumn(db, "connector_credentials", "tenant_id", "TEXT NOT NULL DEFAULT 'legacy'");
  migrateConnectorCredentialTenantKey(db);
  migrateApprovalGrantTenantKey(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_updated_at
      ON agent_tasks (tenant_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_updated_at
      ON workflow_runs (tenant_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_created_at
      ON approval_requests (tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_events_tenant_pushed_id
      ON sync_events (tenant_id, pushed_at, id);
    CREATE INDEX IF NOT EXISTS idx_tenant_token_usage_events_tenant_created_at
      ON tenant_token_usage_events (tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tenant_token_usage_events_task_id
      ON tenant_token_usage_events (task_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_credentials_tenant_connector
      ON connector_credentials (tenant_id, connector_id);
  `);
}

export function assignLegacyTenantData(db: Database.Database, tenantId: string): void {
  const tables = [
    "agent_tasks",
    "workflow_runs",
    "workflow_step_runs",
    "agent_events",
    "approval_requests",
    "approval_decisions",
    "approval_grants",
    "sync_events",
  ];
  for (const table of tables) {
    db.prepare(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL`).run(tenantId);
  }
  db.prepare("UPDATE connector_credentials SET tenant_id = ? WHERE tenant_id = 'legacy'").run(tenantId);
}

function migrateConnectorCredentialTenantKey(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(connector_credentials)").all() as Array<{ name: string; pk: number }>;
  const connectorId = columns.find((column) => column.name === "connector_id");
  const tenantId = columns.find((column) => column.name === "tenant_id");
  if (connectorId?.pk !== 1 || tenantId?.pk) return;

  db.exec(`
    ALTER TABLE connector_credentials RENAME TO connector_credentials_legacy;
    CREATE TABLE connector_credentials (
      tenant_id TEXT NOT NULL DEFAULT 'legacy',
      connector_id TEXT NOT NULL,
      account TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      secret_auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT,
      PRIMARY KEY (tenant_id, connector_id)
    );
    INSERT INTO connector_credentials
      (tenant_id, connector_id, account, secret_ciphertext, secret_iv, secret_auth_tag, created_at, updated_at, verified_at)
    SELECT
      COALESCE(tenant_id, 'legacy'), connector_id, account, secret_ciphertext, secret_iv, secret_auth_tag, created_at, updated_at, verified_at
    FROM connector_credentials_legacy;
    DROP TABLE connector_credentials_legacy;
  `);
}

function migrateApprovalGrantTenantKey(db: Database.Database): void {
  const indexes = db.prepare("PRAGMA index_list(approval_grants)").all() as Array<{ name: string; unique: number }>;
  for (const index of indexes) {
    if (!index.unique) continue;
    const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    if (names.join(",") !== "action,provider_id,workspace_path") continue;

    db.exec(`
      ALTER TABLE approval_grants RENAME TO approval_grants_legacy;
      CREATE TABLE approval_grants (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        action TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        source_approval_id TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, action, provider_id, workspace_path)
      );
      INSERT OR IGNORE INTO approval_grants
        (id, tenant_id, action, provider_id, workspace_path, source_approval_id, created_at)
      SELECT
        id, tenant_id, action, provider_id, workspace_path, source_approval_id, created_at
      FROM approval_grants_legacy;
      DROP TABLE approval_grants_legacy;
    `);
    return;
  }
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
