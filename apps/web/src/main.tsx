import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./styles/resolution.css";
import "./auth/login.css";
import "./layout/nav.css";
import "./layout/tenant.css";
import "./sections/agent/agent.css";
import "./sections/agent/mobile-connector.css";
import "./sections/agent/history.css";
import "./sections/agent/conversation.css";
import "./sections/agent/process.css";
import "./sections/agent/markdown.css";
import "./sections/agent/journey-line.css";
import "./sections/agent/brand.css";
import "./sections/agent/composer.css";
import "./sections/agent/mode-picker.css";
import "./sections/admin/admin.css";
import "./sections/applications/applications.css";
import "./sections/evidence/evidence.css";
import "./sections/experience/experience.css";
import "./sections/experience/profile.css";
import "./sections/market/market.css";
import "./sections/reports/reports.css";
import "./sections/resume/resume.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
