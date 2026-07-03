import { randomUUID } from "node:crypto";
import type { AgentEvent, BillingPlan, BillingPlanId, TenantBilling } from "@ucareer/shared";
import { openDaemonDatabase } from "../db/sqlite";

const plans: Record<BillingPlanId, BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyTokenLimit: 200_000,
    monthlyPriceCents: 0,
    currency: "CNY",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyTokenLimit: 2_000_000,
    monthlyPriceCents: 9900,
    currency: "CNY",
  },
  team: {
    id: "team",
    name: "Team",
    monthlyTokenLimit: 10_000_000,
    monthlyPriceCents: 39900,
    currency: "CNY",
  },
};

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface BillingRow {
  plan_id: string;
  monthly_token_limit: number;
  monthly_price_cents: number;
  currency: string;
}

interface UsageRow {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  task_count: number;
  last_used_at: string | null;
}

export interface BillingStore {
  listPlans(): BillingPlan[];
  getTenantBilling(tenantId: string, month?: string): TenantBilling;
  updateTenantPlan(tenantId: string, planId: BillingPlanId): TenantBilling;
  assertTenantCanRunAgent(tenantId: string): void;
  recordUsage(input: {
    tenantId: string;
    taskId: string;
    event: Extract<AgentEvent, { type: "usage" }>;
  }): void;
}

export function createBillingStore(dbPath: string): BillingStore {
  const db = openDaemonDatabase(dbPath);

  return {
    listPlans() {
      return Object.values(plans);
    },

    getTenantBilling(tenantId, month = currentUsageMonth()) {
      const tenant = getTenant(tenantId);
      const plan = getTenantPlan(tenantId);
      const usage = getUsage(tenantId, month);
      return buildTenantBilling(tenant, plan, usage, month);
    },

    updateTenantPlan(tenantId, planId) {
      const plan = plans[planId];
      if (!plan) throw new Error("Unknown billing plan");
      getTenant(tenantId);
      db.prepare(`
        INSERT INTO tenant_billing
          (tenant_id, plan_id, monthly_token_limit, monthly_price_cents, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          plan_id = excluded.plan_id,
          monthly_token_limit = excluded.monthly_token_limit,
          monthly_price_cents = excluded.monthly_price_cents,
          currency = excluded.currency,
          updated_at = excluded.updated_at
      `).run(tenantId, plan.id, plan.monthlyTokenLimit, plan.monthlyPriceCents, plan.currency, new Date().toISOString());
      return this.getTenantBilling(tenantId);
    },

    assertTenantCanRunAgent(tenantId) {
      const overview = this.getTenantBilling(tenantId);
      if (overview.quota.exceeded || overview.quota.remainingTokens <= 0) {
        throw new Error(`Tenant token quota exceeded for ${overview.plan.name}. Upgrade the plan or wait for next month.`);
      }
    },

    recordUsage(input) {
      const event = input.event;
      const inputTokens = normalizeTokens(event.inputTokens);
      const cachedInputTokens = normalizeTokens(event.cachedInputTokens);
      const outputTokens = normalizeTokens(event.outputTokens);
      const totalTokens = normalizeTokens(event.totalTokens || inputTokens + cachedInputTokens + outputTokens);
      if (!totalTokens) return;
      getTenant(input.tenantId);
      const createdAt = event.createdAt || new Date().toISOString();
      const month = usageMonth(createdAt);
      db.transaction(() => {
        db.prepare(`
          INSERT INTO tenant_token_usage_events
            (id, tenant_id, task_id, provider_id, model, input_tokens, cached_input_tokens, output_tokens, total_tokens, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          input.tenantId,
          input.taskId,
          event.providerId ?? null,
          event.model ?? null,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens,
          createdAt,
        );
        db.prepare(`
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
        `).run(input.tenantId, month, inputTokens, cachedInputTokens, outputTokens, totalTokens, createdAt);
      })();
    },
  };

  function getTenant(tenantId: string): TenantRow {
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(String(tenantId || "").trim()) as TenantRow | undefined;
    if (!tenant) throw new Error("Tenant not found");
    return tenant;
  }

  function getTenantPlan(tenantId: string): BillingPlan {
    const row = db.prepare("SELECT * FROM tenant_billing WHERE tenant_id = ?").get(tenantId) as BillingRow | undefined;
    if (!row) return plans.free;
    const basePlan = plans[normalizePlanId(row.plan_id)] || plans.free;
    return {
      ...basePlan,
      monthlyTokenLimit: normalizeTokens(row.monthly_token_limit) || basePlan.monthlyTokenLimit,
      monthlyPriceCents: normalizeTokens(row.monthly_price_cents),
      currency: row.currency || basePlan.currency,
    };
  }

  function getUsage(tenantId: string, month: string): UsageRow {
    return db.prepare(`
      SELECT input_tokens, cached_input_tokens, output_tokens, total_tokens, task_count, last_used_at
      FROM tenant_token_usage_monthly
      WHERE tenant_id = ? AND month = ?
    `).get(tenantId, month) as UsageRow | undefined ?? {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      task_count: 0,
      last_used_at: null,
    };
  }
}

export function currentUsageMonth(): string {
  return usageMonth(new Date().toISOString());
}

function usageMonth(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 7);
  return date.toISOString().slice(0, 7);
}

function buildTenantBilling(tenant: TenantRow, plan: BillingPlan, usage: UsageRow, month: string): TenantBilling {
  const totalTokens = normalizeTokens(usage.total_tokens);
  const limit = normalizeTokens(plan.monthlyTokenLimit);
  const remainingTokens = Math.max(0, limit - totalTokens);
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.created_at,
    },
    plan,
    currentMonth: month,
    usage: {
      inputTokens: normalizeTokens(usage.input_tokens),
      cachedInputTokens: normalizeTokens(usage.cached_input_tokens),
      outputTokens: normalizeTokens(usage.output_tokens),
      totalTokens,
      taskCount: normalizeTokens(usage.task_count),
      ...(usage.last_used_at ? { lastUsedAt: usage.last_used_at } : {}),
    },
    quota: {
      monthlyTokenLimit: limit,
      remainingTokens,
      usedPercent: limit > 0 ? Math.min(100, Math.round((totalTokens / limit) * 100)) : 100,
      exceeded: limit > 0 && totalTokens >= limit,
    },
  };
}

function normalizePlanId(value: unknown): BillingPlanId {
  return value === "pro" || value === "team" ? value : "free";
}

function normalizeTokens(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}
