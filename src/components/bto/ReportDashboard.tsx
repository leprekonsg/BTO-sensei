import { useBTOStore } from "../../lib/store";
import { FloorPlanSVG } from "./FloorPlanSVG";
import "./ReportDashboard.css";

export function ReportDashboard() {
  const report = useBTOStore((s) => s.report);
  const coords = useBTOStore((s) => s.blueprintCoords);
  const defects = useBTOStore((s) => s.defects);
  const requestReport = useBTOStore((s) => s.requestReport);
  const inspectorMessage = useBTOStore((s) => s.inspectorMessage);

  // Loading state
  if (report.loading) {
    return (
      <div className="report-section">
        <div className="report-loading">
          <div className="report-loading-bar">
            <div className="report-loading-fill" />
          </div>
          <p className="font-mono text-acid phosphor-glow">GENERATING REPORT...</p>
        </div>
      </div>
    );
  }

  // No report yet
  if (!report.data) {
    return (
      <div className="report-section">
        <div className="report-header-section">
          <div className="report-header-meta">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>shield_person</span>
            <div>
              <h2 className="report-title">NANO BANANA REPORT</h2>
              <p className="report-subtitle font-mono">Heartlands Edition // v4.2</p>
            </div>
          </div>
          <span className="report-badge font-mono">Official Doc</span>
        </div>
        <div className="report-empty">
          <p>Log defects first, then generate a report.</p>
          <p className="font-mono text-dim">Defects logged: {defects.length}</p>
          <button
            className="report-generate-btn"
            onClick={() => requestReport("HB-402-A")}
            disabled={defects.length === 0}
            data-testid="generate-report"
          >
            <span className="material-symbols-outlined">assignment</span>
            Generate Report
          </button>
        </div>
      </div>
    );
  }

  const data = report.data;
  const score = data.overall_health_score;
  const circumference = 2 * Math.PI * 70;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="report-section" data-testid="report-dashboard">
      {/* Header */}
      <div className="report-header-section">
        <div className="report-header-meta">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>shield_person</span>
          <div>
            <h2 className="report-title">NANO BANANA REPORT</h2>
            <p className="report-subtitle font-mono">Heartlands Edition // v4.2</p>
          </div>
        </div>
        <span className="report-badge font-mono">Official Doc</span>
      </div>

      {/* Case ID + Stamp */}
      <div className="report-case-row">
        <div>
          <p className="report-case-id font-mono">CASE ID: {data.flat_id}</p>
          <h3 className="report-case-title">Heartlands Edition</h3>
        </div>
        <div className="report-stamp stamp-effect">
          <div className="report-stamp-label">Verified By</div>
          <div className="report-stamp-value">{score >= 70 ? "Passed" : "Needs Work"}</div>
          <div className="report-stamp-sub">Housing Authority Specs</div>
        </div>
      </div>

      {/* Health score gauge */}
      <div className="report-gauge-card">
        <p className="report-gauge-label font-mono">Structural Integrity Index</p>
        <div className="report-gauge">
          <svg className="report-gauge-svg" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="transparent" stroke="var(--navy-900)" strokeWidth="12" />
            <circle
              cx="80" cy="80" r="70"
              fill="transparent"
              stroke="var(--primary)"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="round"
            />
          </svg>
          <div className="report-gauge-text">
            <span className="report-gauge-number" data-testid="overall-health">{score}</span>
            <span className="report-gauge-grade text-primary">
              {score >= 85 ? "Excellent" : score >= 70 ? "Good" : "Needs Work"}
            </span>
          </div>
        </div>
      </div>

      {/* Blueprint */}
      <div className="report-blueprint-section">
        <div className="report-blueprint-header">
          <h4 className="report-blueprint-title">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>architecture</span>
            Blueprint Ref: {data.flat_id}
          </h4>
          <span className="font-mono text-dim" style={{ fontSize: 10 }}>SCALE 1:50</span>
        </div>
        <div className="report-blueprint-container blueprint-grid">
          <FloorPlanSVG coords={coords.data ?? []} />
          <div className="report-blueprint-status font-mono">
            Live Sensor Data Feed: Connected
          </div>
        </div>
      </div>

      {/* Room distribution */}
      <div className="report-dist-grid">
        {data.room_scores.slice(0, 3).map((room) => (
          <div key={room.room} className="report-dist-card">
            <p className="report-dist-label">{room.room}</p>
            <p className="report-dist-value">{String(room.score).padStart(2, "0")}</p>
            <div className="report-dist-bar">
              <div className="report-dist-bar-fill" style={{ width: `${room.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Verdict */}
      <div className="report-verdict">
        <div className="report-verdict-header">
          <span className="material-symbols-outlined text-primary">person_check</span>
          <h4 className="report-verdict-title font-mono">Ah Seng's Final Verdict</h4>
        </div>
        <p className="report-verdict-text">{data.inspector_note || inspectorMessage}</p>
      </div>

      {report.error && (
        <div className="error-banner" data-testid="report-error">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          Fallback report: {report.error}
        </div>
      )}

      {/* Export button */}
      <div className="report-export-section">
        <button className="report-export-btn">
          <span className="material-symbols-outlined">picture_as_pdf</span>
          Export Full PDF Report
        </button>
        <p className="report-export-note font-mono">Authorized Access Only</p>
      </div>
    </div>
  );
}

export default ReportDashboard;
