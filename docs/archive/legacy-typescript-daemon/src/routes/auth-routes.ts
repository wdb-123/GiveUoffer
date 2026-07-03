import type {
  AddTenantMemberRequest,
  ApiEnvelope,
  AuthSession,
  CreateAccountRequest,
  CreateTenantRequest,
  LoginRequest,
  SwitchTenantRequest,
  TenantMembersOverview,
  UpdateTenantMemberRoleRequest,
} from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, readSessionToken, requirePermission } from "./context";

export function registerAuthRoutes(ctx: DaemonRouteContext): void {
  const { app, authStore } = ctx;

  app.post<{
    Body: LoginRequest;
  }>("/api/auth/login", async (request): Promise<ApiEnvelope<AuthSession>> => {
    try {
      return ok(authStore.login(request.body));
    } catch (cause) {
      return error("login_failed", cause instanceof Error ? cause.message : "Login failed");
    }
  });

  app.post<{
    Body: CreateAccountRequest;
  }>("/api/auth/create-account", async (request): Promise<ApiEnvelope<AuthSession>> => {
    try {
      return ok(authStore.createAccount(request.body));
    } catch (cause) {
      return error("create_account_failed", cause instanceof Error ? cause.message : "Create account failed");
    }
  });

  app.get("/api/auth/session", async (request): Promise<ApiEnvelope<AuthSession | null>> => {
    return ok(authStore.getSession(readSessionToken(request)));
  });

  app.post("/api/auth/logout", async (request): Promise<ApiEnvelope<{ loggedOut: boolean }>> => {
    return ok({ loggedOut: authStore.logout(readSessionToken(request)) });
  });

  app.post<{
    Body: CreateTenantRequest;
  }>("/api/tenants", async (request): Promise<ApiEnvelope<AuthSession>> => {
    try {
      return ok(authStore.createTenant(readSessionToken(request), request.body));
    } catch (cause) {
      return error("create_tenant_failed", cause instanceof Error ? cause.message : "Create tenant failed");
    }
  });

  app.post<{
    Body: SwitchTenantRequest;
  }>("/api/auth/switch-tenant", async (request): Promise<ApiEnvelope<AuthSession>> => {
    try {
      return ok(authStore.switchTenant(readSessionToken(request), request.body));
    } catch (cause) {
      return error("switch_tenant_failed", cause instanceof Error ? cause.message : "Switch tenant failed");
    }
  });

  app.get("/api/tenant-members", async (request): Promise<ApiEnvelope<TenantMembersOverview>> => {
    const authError = requirePermission(ctx, request, "users.manage");
    if (authError) return authError;
    try {
      return ok(authStore.listTenantMembers(readSessionToken(request)));
    } catch (cause) {
      return error("tenant_members_failed", cause instanceof Error ? cause.message : "Tenant members failed");
    }
  });

  app.post<{
    Body: AddTenantMemberRequest;
  }>("/api/tenant-members", async (request): Promise<ApiEnvelope<TenantMembersOverview>> => {
    const authError = requirePermission(ctx, request, "users.manage");
    if (authError) return authError;
    try {
      return ok(authStore.addTenantMember(readSessionToken(request), request.body));
    } catch (cause) {
      return error("add_tenant_member_failed", cause instanceof Error ? cause.message : "Add tenant member failed");
    }
  });

  app.patch<{
    Params: { accountId: string };
    Body: UpdateTenantMemberRoleRequest;
  }>("/api/tenant-members/:accountId", async (request): Promise<ApiEnvelope<TenantMembersOverview>> => {
    const authError = requirePermission(ctx, request, "users.manage");
    if (authError) return authError;
    try {
      return ok(authStore.updateTenantMemberRole(readSessionToken(request), request.params.accountId, request.body));
    } catch (cause) {
      return error("update_tenant_member_failed", cause instanceof Error ? cause.message : "Update tenant member failed");
    }
  });

  app.delete<{
    Params: { accountId: string };
  }>("/api/tenant-members/:accountId", async (request): Promise<ApiEnvelope<TenantMembersOverview>> => {
    const authError = requirePermission(ctx, request, "users.manage");
    if (authError) return authError;
    try {
      return ok(authStore.removeTenantMember(readSessionToken(request), request.params.accountId));
    } catch (cause) {
      return error("remove_tenant_member_failed", cause instanceof Error ? cause.message : "Remove tenant member failed");
    }
  });
}
