import type { DaemonRouteContext } from "./context";
import { ok } from "./context";

export function registerMarketRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get("/api/recruitment-market", async () => {
    return ok(await stores.marketStore.getRecruitmentMarket());
  });

  app.post<{ Body: { url?: string; description?: string; source?: string } }>("/api/recruitment-market/import", async (request) => {
    return ok(await stores.marketStore.importJob(request.body || {}));
  });

  app.post<{ Body: { url?: string; rawText?: string; description?: string; source?: string } }>("/api/recruitment-market/manual-jobs", async (request) => {
    const body = request.body || {};
    const input: import("@ucareer/shared").ImportJobRequest = {
      source: body.source || "手工网页读取",
    };
    const description = body.rawText || body.description || "";
    if (body.url) input.url = body.url;
    if (description) input.description = description;
    return ok(await stores.marketStore.importJob(input));
  });
}
