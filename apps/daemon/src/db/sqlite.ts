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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
  `);
}
