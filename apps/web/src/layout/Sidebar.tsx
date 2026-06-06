import type { AppView, ViewId } from "../views";

interface SidebarProps {
  activeView: ViewId;
  status: string;
  views: AppView[];
  onViewChange(viewId: ViewId): void;
}

export function Sidebar({ activeView, status, views, onViewChange }: SidebarProps) {
  const agentStatus = status.includes("已连接") || status.includes("已连通") ? "已连通" : "未连接";

  return (
    <aside className="app-nav">
      <div className="brand">
        <img className="brand-mark" src="/assets/offeru-wide-brand-mark-clean.png" alt="OfferU" />
        <div>
          <h1>OfferU</h1>
          <p>Your Journey.<span>Your Offer.</span></p>
        </div>
      </div>
      <nav aria-label="主导航">
        {views.map((view) => (
          <button
            className={activeView === view.id ? "nav-item is-active" : "nav-item"}
            key={view.id}
            type="button"
            onClick={() => onViewChange(view.id)}
          >
            <span>{view.label}</span>
            {view.id === "agent" ? <span className="agent-nav-status">{agentStatus}</span> : null}
          </button>
        ))}
      </nav>
    </aside>
  );
}
