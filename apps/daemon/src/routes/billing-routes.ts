import type { ApiEnvelope, BillingPlan, TenantBilling, UpdateTenantBillingPlanRequest } from "@ucareer/shared";
import { createBillingStore } from "../stores/billing-store";
import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";
import { getTenantRouteScope, isScopeError } from "./tenant-scope";

export function registerBillingRoutes(ctx: DaemonRouteContext): void {
  const { app } = ctx;

  app.get("/api/billing/plans", async (): Promise<ApiEnvelope<BillingPlan[]>> => {
    return ok(createBillingStore(ctx.daemonDbPath).listPlans());
  });

  app.get("/api/billing/tenant", async (request): Promise<ApiEnvelope<TenantBilling>> => {
    const authError = requirePermission(ctx, request, "billing.view");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    try {
      return ok(createBillingStore(ctx.daemonDbPath).getTenantBilling(scope.session.activeTenant.id));
    } catch (cause) {
      return error("billing_overview_failed", cause instanceof Error ? cause.message : "Billing overview failed");
    }
  });

  app.patch<{
    Body: UpdateTenantBillingPlanRequest;
  }>("/api/billing/tenant/plan", async (request): Promise<ApiEnvelope<TenantBilling>> => {
    const authError = requirePermission(ctx, request, "tenant.manage");
    if (authError) return authError;
    const scope = getTenantRouteScope(ctx, request);
    if (isScopeError(scope)) return scope;
    try {
      return ok(createBillingStore(ctx.daemonDbPath).updateTenantPlan(scope.session.activeTenant.id, request.body.planId));
    } catch (cause) {
      return error("billing_plan_update_failed", cause instanceof Error ? cause.message : "Billing plan update failed");
    }
  });
}
