import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDaemonDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
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
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_task_id_created_at
      ON agent_events (task_id, created_at);

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
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
      task_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_grants (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      source_approval_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(action, provider_id, workspace_path)
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE TABLE IF NOT EXISTS connector_credentials (
      connector_id TEXT PRIMARY KEY,
      account TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      secret_auth_tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT
    );
  `);

  ensureColumn(db, "agent_tasks", "skill_id", "TEXT");
  ensureColumn(db, "agent_tasks", "workflow_id", "TEXT");
  ensureColumn(db, "agent_tasks", "workflow_run_id", "TEXT");
  ensureColumn(db, "agent_tasks", "input_kind", "TEXT");
  ensureColumn(db, "agent_tasks", "source_text", "TEXT");
  ensureColumn(db, "agent_tasks", "route_decision", "TEXT");
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
