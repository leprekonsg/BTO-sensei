import { type ReactNode, useState } from "react";
import { ApiKeyConfig } from "./ApiKeyConfig";
import { useBTOStore } from "../../lib/store";
import "./Layout.css";

export type ViewTab = "scan" | "logger" | "report";

interface LayoutProps {
  children: (activeTab: ViewTab) => ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("scan");
  const sessionConnected = useBTOStore((s) => s.sessionConnected);
  const sessionError = useBTOStore((s) => s.sessionError);

  const statusLabel = sessionConnected
    ? "Ah Seng Online"
    : sessionError
      ? "Offline"
      : "Connecting...";

  return (
    <div className="layout-root kopi-stain hdb-grid">
      {/* Header */}
      <header className="layout-header">
        <div className="header-brand">
          <span className="header-sector font-mono">SECTOR 7-B</span>
          <div className="header-title-row">
            <img src="/bto_sensei_logo_transparent.png" alt="BTO-Sensei Logo" className="header-logo" />
            <h1 className="header-title">
              BTO-SENSEI <span className="text-primary">V0.1</span>
            </h1>
          </div>
        </div>
        <div
          className={`header-status ${sessionConnected ? "erp-pulse" : ""}`}
          style={!sessionConnected ? { color: "var(--text-dim, #888)" } : undefined}
        >
          <div
            className="status-dot"
            style={!sessionConnected ? { background: "var(--text-dim, #888)", animation: "none" } : undefined}
          />
          <span className="font-mono">{statusLabel}</span>
        </div>
      </header>

      {/* Main content */}
      <main className="layout-main">
        <ApiKeyConfig />
        {children(activeTab)}
      </main>

      {/* Bottom Navigation */}
      <nav className="layout-nav">
        <NavItem
          icon="sensors"
          label="Scan"
          active={activeTab === "scan"}
          onClick={() => setActiveTab("scan")}
        />
        <NavItem
          icon="analytics"
          label="Stats"
          active={false}
          onClick={() => { }}
        />

        {/* Center mic button */}
        <div className="nav-center-wrap">
          <button
            className="nav-mic-btn erp-pulse"
            onClick={() => setActiveTab("scan")}
            aria-label="Microphone"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
              mic
            </span>
          </button>
        </div>

        <NavItem
          icon="assignment_late"
          label="Logger"
          active={activeTab === "logger"}
          onClick={() => setActiveTab("logger")}
        />
        <NavItem
          icon="assignment"
          label="Report"
          active={activeTab === "report"}
          onClick={() => setActiveTab("report")}
        />
      </nav>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "nav-item--active" : ""}`} onClick={onClick}>
      <span
        className="material-symbols-outlined"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span className="nav-item-label font-mono">{label}</span>
    </button>
  );
}
