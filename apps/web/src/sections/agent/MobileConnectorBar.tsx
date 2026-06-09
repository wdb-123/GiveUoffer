import { useEffect, useRef, useState } from "react";

export function MobileConnectorBar({
  connectionState,
  onImportMessages,
}: {
  connectionState: "connected" | "disconnected" | "unknown";
  onImportMessages(): void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const connected = connectionState !== "disconnected";

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  return (
    <div className="agent-mobile-connector" aria-label="邮箱连接器" ref={menuRef}>
      <button
        className="agent-mobile-connector-toggle"
        type="button"
        aria-label={connected ? "QQ邮箱连接器" : "邮箱连接器设置"}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className={connected ? "connector-app-icon connector-qqmail" : "connector-plug-icon"} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="agent-mobile-connector-menu" role="menu" aria-label="邮箱连接器选项">
          <div className="agent-mobile-connector-account">
            <span className="connector-app-icon connector-qqmail" aria-hidden="true" />
            <strong>QQ邮箱</strong>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              void onImportMessages();
            }}
          >
            搜索最近邮件
          </button>
          <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
            连接设置
          </button>
        </div>
      ) : null}
    </div>
  );
}
