import type { ApiEnvelope, AuthSession, CreateAccountRequest, LoginRequest } from "@ucareer/shared";
import type { DaemonRouteContext } from "./context";
import { error, ok, readSessionToken } from "./context";

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
}
