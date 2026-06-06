import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "paper" | "workbench";
}

export function Panel({ children, className = "", variant = "default" }: PanelProps) {
  return <section className={["panel", variant !== "default" ? `panel-${variant}` : "", className].filter(Boolean).join(" ")}>{children}</section>;
}
