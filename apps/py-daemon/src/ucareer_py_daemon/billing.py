from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .db import connect_database

PLANS: dict[str, dict[str, Any]] = {
    "free": {"id": "free", "name": "Free", "monthlyTokenLimit": 200_000, "monthlyPriceCents": 0, "currency": "CNY"},
    "pro": {"id": "pro", "name": "Pro", "monthlyTokenLimit": 2_000_000, "monthlyPriceCents": 9900, "currency": "CNY"},
    "team": {"id": "team", "name": "Team", "monthlyTokenLimit": 10_000_000, "monthlyPriceCents": 39900, "currency": "CNY"},
}


@dataclass
class BillingStore:
    db_path: Path

    def list_plans(self) -> list[dict[str, Any]]:
        return list(PLANS.values())

    def get_tenant_billing(self, tenant_id: str, month: str | None = None) -> dict[str, Any]:
        month = month or datetime.now(UTC).strftime("%Y-%m")
        with connect_database(self.db_path) as conn:
            tenant = self._tenant(conn, tenant_id)
            plan = self._tenant_plan(conn, tenant_id)
            usage = self._usage(conn, tenant_id, month)
            return self._build(tenant, plan, usage, month)

    def update_tenant_plan(self, tenant_id: str, plan_id: str) -> dict[str, Any]:
        if plan_id not in PLANS:
            raise ValueError("Unknown billing plan")
        plan = PLANS[plan_id]
        with connect_database(self.db_path) as conn:
            self._tenant(conn, tenant_id)
            conn.execute(
                """
                INSERT INTO tenant_billing
                  (tenant_id, plan_id, monthly_token_limit, monthly_price_cents, currency, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id) DO UPDATE SET
                  plan_id = excluded.plan_id,
                  monthly_token_limit = excluded.monthly_token_limit,
                  monthly_price_cents = excluded.monthly_price_cents,
                  currency = excluded.currency,
                  updated_at = excluded.updated_at
                """,
                (
                    tenant_id,
                    plan["id"],
                    plan["monthlyTokenLimit"],
                    plan["monthlyPriceCents"],
                    plan["currency"],
                    datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                ),
            )
            conn.commit()
        return self.get_tenant_billing(tenant_id)

    def assert_tenant_can_run_agent(self, tenant_id: str) -> None:
        billing = self.get_tenant_billing(tenant_id)
        if billing.get("quota", {}).get("exceeded"):
            raise PermissionError("Tenant token quota exceeded")

    def _tenant(self, conn: sqlite3.Connection, tenant_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
        if not row:
            raise ValueError("Tenant not found")
        return row

    def _tenant_plan(self, conn: sqlite3.Connection, tenant_id: str) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM tenant_billing WHERE tenant_id = ?", (tenant_id,)).fetchone()
        if not row:
            return PLANS["free"]
        base = PLANS.get(row["plan_id"], PLANS["free"])
        return {
            **base,
            "monthlyTokenLimit": _positive_int(row["monthly_token_limit"]) or base["monthlyTokenLimit"],
            "monthlyPriceCents": _positive_int(row["monthly_price_cents"]),
            "currency": row["currency"] or base["currency"],
        }

    def _usage(self, conn: sqlite3.Connection, tenant_id: str, month: str) -> dict[str, Any]:
        row = conn.execute(
            """
            SELECT input_tokens, cached_input_tokens, output_tokens, total_tokens, task_count, last_used_at
            FROM tenant_token_usage_monthly
            WHERE tenant_id = ? AND month = ?
            """,
            (tenant_id, month),
        ).fetchone()
        if not row:
            return {
                "input_tokens": 0,
                "cached_input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "task_count": 0,
                "last_used_at": None,
            }
        return dict(row)

    def _build(self, tenant: sqlite3.Row, plan: dict[str, Any], usage: dict[str, Any], month: str) -> dict[str, Any]:
        total = _positive_int(usage["total_tokens"])
        limit = _positive_int(plan["monthlyTokenLimit"])
        remaining = max(0, limit - total)
        return {
            "tenant": {"id": tenant["id"], "name": tenant["name"], "slug": tenant["slug"], "createdAt": tenant["created_at"]},
            "plan": plan,
            "currentMonth": month,
            "usage": {
                "inputTokens": _positive_int(usage["input_tokens"]),
                "cachedInputTokens": _positive_int(usage["cached_input_tokens"]),
                "outputTokens": _positive_int(usage["output_tokens"]),
                "totalTokens": total,
                "taskCount": _positive_int(usage["task_count"]),
                **({"lastUsedAt": usage["last_used_at"]} if usage.get("last_used_at") else {}),
            },
            "quota": {
                "monthlyTokenLimit": limit,
                "remainingTokens": remaining,
                "usedPercent": min(100, round((total / limit) * 100)) if limit > 0 else 100,
                "exceeded": limit > 0 and total >= limit,
            },
        }


def _positive_int(value: Any) -> int:
    try:
        numeric = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return numeric if numeric > 0 else 0


def record_token_usage_event(conn: sqlite3.Connection, tenant_id: str, task_id: str | None, event: dict[str, Any]) -> None:
    input_tokens = _positive_int(event.get("inputTokens"))
    cached_input_tokens = _positive_int(event.get("cachedInputTokens"))
    output_tokens = _positive_int(event.get("outputTokens"))
    total_tokens = _positive_int(event.get("totalTokens")) or input_tokens + cached_input_tokens + output_tokens
    if total_tokens <= 0:
        return
    created_at = str(event.get("createdAt") or datetime.now(UTC).isoformat().replace("+00:00", "Z"))
    month = created_at[:7] if len(created_at) >= 7 else datetime.now(UTC).strftime("%Y-%m")
    provider_id = str(event.get("providerId") or "") or None
    model = str(event.get("model") or "") or None
    conn.execute(
        """
        INSERT INTO tenant_token_usage_events
          (id, tenant_id, task_id, provider_id, model, input_tokens, cached_input_tokens, output_tokens, total_tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            tenant_id,
            task_id,
            provider_id,
            model,
            input_tokens,
            cached_input_tokens,
            output_tokens,
            total_tokens,
            created_at,
        ),
    )
    conn.execute(
        """
        INSERT INTO tenant_token_usage_monthly
          (tenant_id, month, input_tokens, cached_input_tokens, output_tokens, total_tokens, task_count, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(tenant_id, month) DO UPDATE SET
          input_tokens = input_tokens + excluded.input_tokens,
          cached_input_tokens = cached_input_tokens + excluded.cached_input_tokens,
          output_tokens = output_tokens + excluded.output_tokens,
          total_tokens = total_tokens + excluded.total_tokens,
          task_count = task_count + 1,
          last_used_at = excluded.last_used_at
        """,
        (tenant_id, month, input_tokens, cached_input_tokens, output_tokens, total_tokens, created_at),
    )
