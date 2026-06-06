import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import type { AppView, ViewId } from "../views";

interface AppLayoutProps {
  activeView: ViewId;
  children: ReactNode;
  status: string;
  views: AppView[];
  onViewChange(viewId: ViewId): void;
}

export function AppLayout({ activeView, children, status, views, onViewChange }: AppLayoutProps) {
  return (
    <main className="shell app-layout">
      <Sidebar activeView={activeView} status={status} views={views} onViewChange={onViewChange} />
      <section className={`view-shell view-${activeView}`}>{children}</section>
    </main>
  );
}
