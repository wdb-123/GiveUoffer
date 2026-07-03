from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


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


def _count_if_table_exists(conn: sqlite3.Connection, tables: list[str], table: str) -> int | None:
    if table not in tables:
        return None
    value = conn.execute(f"select count(*) from {table}").fetchone()[0]
    return int(value)

