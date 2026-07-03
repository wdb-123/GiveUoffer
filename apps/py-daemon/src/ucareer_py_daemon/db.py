from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class DatabaseProbe:
    path: str
    exists: bool
    tables: list[str]
    account_count: int | None
    tenant_count: int | None


def probe_database(path: Path) -> DatabaseProbe:
    if not path.exists():
        return DatabaseProbe(str(path), False, [], None, None)

    with sqlite3.connect(path) as conn:
        rows = conn.execute(
            "select name from sqlite_master where type = 'table' order by name"
        ).fetchall()
        tables = [str(row[0]) for row in rows]
        account_count = _count_if_table_exists(conn, tables, "accounts")
        tenant_count = _count_if_table_exists(conn, tables, "tenants")

    return DatabaseProbe(str(path), True, tables, account_count, tenant_count)


@contextmanager
def connect_database(path: Path) -> Iterator[sqlite3.Connection]:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    ensure_core_schema(conn)
    try:
        yield conn
    finally:
        conn.close()


def ensure_core_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
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

        CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_updated_at
          ON agent_tasks (tenant_id, updated_at);

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

        CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_created_at
          ON approval_requests (tenant_id, created_at);

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

        CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_updated_at
          ON workflow_runs (tenant_id, updated_at);

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

        CREATE INDEX IF NOT EXISTS idx_sync_events_tenant_pushed_id
          ON sync_events (tenant_id, pushed_at, id);
        """
    )
    conn.commit()


def _count_if_table_exists(conn: sqlite3.Connection, tables: list[str], table: str) -> int | None:
    if table not in tables:
        return None
    value = conn.execute(f"select count(*) from {table}").fetchone()[0]
    return int(value)
