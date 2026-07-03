import type { CSSProperties, PointerEvent } from "react";
import { useMemo, useState } from "react";
import type { WorkspaceFilePreview } from "@ucareer/shared";
import { getWorkspaceFilePreview } from "../../api";

export function useAgentFilePreview() {
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null);
  const [loadingPath, setLoadingPath] = useState("");
  const [error, setError] = useState("");
  const [width, setWidth] = useState(460);
  const [resizing, setResizing] = useState(false);
  const hasPreview = Boolean(preview || loadingPath || error);
  const consoleStyle = useMemo(
    () => hasPreview ? ({ "--agent-preview-width": `${width}px` } as CSSProperties) : undefined,
    [hasPreview, width],
  );

  async function open(path: string) {
    setPreview(null);
    setError("");
    setLoadingPath(path);
    try {
      setPreview(await getWorkspaceFilePreview(path));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "文件预览失败");
    } finally {
      setLoadingPath("");
    }
  }

  function close() {
    setPreview(null);
    setError("");
    setLoadingPath("");
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const consoleElement = event.currentTarget.closest(".agent-console");
    const consoleRect = consoleElement?.getBoundingClientRect();
    if (!consoleRect) return;

    const minPreviewWidth = 320;
    const maxPreviewWidth = Math.max(minPreviewWidth, Math.min(760, consoleRect.width - 560));
    const clampPreviewWidth = (clientX: number) => {
      const requestedWidth = consoleRect.right - clientX;
      return Math.min(Math.max(requestedWidth, minPreviewWidth), maxPreviewWidth);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setWidth(clampPreviewWidth(event.clientX));
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      setWidth(clampPreviewWidth(moveEvent.clientX));
    }
    function stopResize() {
      setResizing(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  return {
    close,
    consoleStyle,
    error,
    hasPreview,
    loadingPath,
    open,
    preview,
    resizing,
    startResize,
  };
}
