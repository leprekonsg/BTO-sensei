import { type ReactNode, useState } from "react";
import "./Layout.css";

export type ViewTab = "scan" | "logger" | "report";

interface LayoutProps {
  children: (activeTab: ViewTab) => ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("scan");

  return (
    <div className="layout-root kopi-stain hdb-grid">
      {/* Header */}
      <header className="layout-header">
        <div className="header-brand">
          <span className="header-sector font-mono">SECTOR 7-B</span>
          <h1 className="header-title">
            BTO-SENSEI <span className="text-primary">V2.1</span>
          </h1>
        </div>
        <div className="header-status erp-pulse">
          <div className="status-dot" />
          <span className="font-mono">Ah Seng Online</span>
        </div>
      </header>

      {/* Main content */}
      <main className="layout-main">{children(activeTab)}</main>

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
          onClick={() => {}}
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
