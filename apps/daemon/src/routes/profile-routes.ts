import type { DaemonRouteContext } from "./context";
import { ok } from "./context";

export function registerProfileRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/profile-overview", async () => {
    return ok(await stores.profileStore.getProfileOverview());
  });
}
