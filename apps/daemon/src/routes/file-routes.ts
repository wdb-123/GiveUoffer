import type { DaemonRouteContext } from "./context";
import { error, ok, requirePermission } from "./context";

export function registerFileRoutes(ctx: DaemonRouteContext): void {
  const { app, stores } = ctx;

  app.get<{
    Querystring: { path?: string };
  }>("/api/workspace-file", async (request) => {
    const authError = requirePermission(ctx, request, "workspace.read");
    if (authError) return authError;
    const path = request.query.path || "";
    const preview = await stores.workspaceFileStore.getFilePreview(path);
    if (!preview) return error("workspace_file_not_found", `File not found or not readable: ${path}`);
    return ok(preview);
  });
}
