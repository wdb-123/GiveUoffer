import type { DaemonRouteContext } from "./context";
import { ok } from "./context";

export function registerMarketRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/recruitment-market", async () => {
    return ok(await stores.marketStore.getRecruitmentMarket());
  });
}
