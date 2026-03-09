import { Suspense, lazy, useState } from "react";
import { useBTOStore } from "../../lib/store";
import { generateCoverSummary, generateLocalCoverSummary } from "../../lib/gemini-report";
import { FloorPlanSVG } from "./FloorPlanSVG";
import { VerifiedPlanSVG } from "./VerifiedPlanSVG";
import { SpatialBadge } from "./SpatialBadge";
import { hasVerifiedPlan, selectVerifiedPlanMarkers } from "../../lib/plan-helpers";
import type { FlatType } from "../../lib/types";
import "./ReportDashboard.css";

const PlanImportLazy = lazy(() => import("./PlanImport").then((m) => ({ default: m.PlanImport })));

const FLAT_TYPES: FlatType[] = ["3-room", "4-room", "5-room"];

export function ReportDashboard() {
  const report = useBTOStore((s) => s.report);
  const coords = useBTOStore((s) => s.blueprintCoords);
  const defects = useBTOStore((s) => s.defects);
  const requestReport = useBTOStore((s) => s.requestReport);
  const inspectorMessage = useBTOStore((s) => s.inspectorMessage);
  const flatType = useBTOStore((s) => s.flatType);
  const setFlatType = useBTOStore((s) => s.setFlatType);
  const unitPlan = useBTOStore((s) => s.unitPlan);
  const defectPlacements = useBTOStore((s) => s.defectPlacements);
  const spatialMode = useBTOStore((s) => s.spatialMode);
  const [coverSummary, setCoverSummary] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);

  const useVerifiedPlan = spatialMode === "verified-plan" && hasVerifiedPlan(unitPlan);
  const [showPlanImport, setShowPlanImport] = useState(false);

  async function handleGenerateReport() {
    setCoverSummary(null);
    await requestReport("HB-402-A");
    const reportState = useBTOStore.getState().report;
    const reportData = reportState.data;
    if (reportData) {
      if (reportState.error) {
        setCoverSummary(generateLocalCoverSummary(reportData, flatType));
        return;
      }

      setCoverLoading(true);
      try {
        const summary = await generateCoverSummary(reportData, flatType);
        setCoverSummary(summary);
      } finally {
        setCoverLoading(false);
      }
    }
  }

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

        {/* Flat type selector */}
        <div className="flat-type-selector">
          <span className="flat-type-label font-mono">FLAT TYPE</span>
          <div className="flat-type-options">
            {FLAT_TYPES.map((type) => (
              <button
                key={type}
                className={`flat-type-btn font-mono ${flatType === type ? "flat-type-btn--active" : ""}`}
                onClick={() => setFlatType(type)}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="report-empty">
          <p>Log defects first, then generate a report.</p>
          <p className="font-mono text-dim">Defects logged: {defects.length}</p>

          {/* Floor plan import entry */}
          <button
            className="report-generate-btn"
            onClick={() => setShowPlanImport(!showPlanImport)}
            style={{ marginBottom: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }}
            data-testid="plan-import-toggle"
          >
            <span className="material-symbols-outlined">add_photo_alternate</span>
            {unitPlan?.status === "verified" ? "Floor Plan Added" : "Add Floor Plan"}
            <SpatialBadge />
          </button>
          {showPlanImport && (
            <Suspense fallback={<p className="font-mono text-dim">Loading...</p>}>
              <PlanImportLazy />
            </Suspense>
          )}

          <button
            className="report-generate-btn"
            onClick={handleGenerateReport}
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
  const verifyOnSiteDefects = defects.filter((defect) => defect.review_required);

  return (
    <div className="report-section" data-testid="report-dashboard">
      {/* Cover Page */}
      <div className="report-cover">
        <div className="report-cover-inner">
          <div className="report-cover-badge font-mono">CONQUAS-READY INSPECTION DOCUMENT</div>
          <div className="report-cover-logo">
            <img src="/bto_sensei_logo_transparent.png" alt="BTO-Sensei" className="report-cover-logo-img" />
          </div>
          <h1 className="report-cover-title">BTO INSPECTION REPORT</h1>
          <p className="report-cover-edition font-mono">NANO BANANA EDITION // {flatType.toUpperCase()} FLAT <SpatialBadge /></p>
          <div className="report-cover-meta">
            <div className="report-cover-meta-item">
              <span className="font-mono text-dim">CASE ID</span>
              <span className="font-mono">{data.flat_id}</span>
            </div>
            <div className="report-cover-meta-item">
              <span className="font-mono text-dim">DATE</span>
              <span className="font-mono">{data.inspection_date}</span>
            </div>
            <div className="report-cover-meta-item">
              <span className="font-mono text-dim">SCORE</span>
              <span className="font-mono text-primary">{score}/100</span>
            </div>
            <div className="report-cover-meta-item">
              <span className="font-mono text-dim">DEFECTS</span>
              <span className="font-mono">{defects.length}</span>
            </div>
            {data.conquas_grade && (
              <div className="report-cover-meta-item">
                <span className="font-mono text-dim">CONQUAS GRADE</span>
                <span className={`font-mono ${data.conquas_grade === "Pass" ? "text-primary" : data.conquas_grade === "Fail" ? "text-critical" : "text-amber"}`}>
                  {data.conquas_grade.toUpperCase()}
                </span>
              </div>
            )}
          </div>
          {coverLoading && (
            <div className="report-cover-summary font-mono text-dim">Generating executive summary...</div>
          )}
          {coverSummary && (
            <div className="report-cover-summary">
              <p>{coverSummary}</p>
            </div>
          )}
          <div className="report-cover-stamp stamp-effect">
            <div className="report-stamp-label">CONQUAS 2022 R2</div>
            <div className="report-stamp-value">{data.conquas_grade === "Fail" ? "REVIEW" : data.conquas_grade === "Conditional" ? "CONDITIONAL" : score >= 70 ? "PASSED" : "REVIEW"}</div>
            <div className="report-stamp-sub">Ah Seng // BTO-Sensei</div>
          </div>
        </div>
      </div>

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

      {/* Blueprint - Nano Banana Blueprint */}
      <div className="report-blueprint-section">
        <div className="report-blueprint-header">
          <h4 className="report-blueprint-title">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>architecture</span>
            Nano Banana Blueprint: {data.flat_id}
            <SpatialBadge />
          </h4>
          <div className="report-blueprint-controls">
            <button
              className={`blueprint-annotate-btn font-mono ${showAnnotations ? "blueprint-annotate-btn--active" : ""}`}
              onClick={() => setShowAnnotations(!showAnnotations)}
            >
              {showAnnotations ? "LABELS ON" : "LABELS OFF"}
            </button>
            <span className="font-mono text-dim" style={{ fontSize: 10 }}>
              {useVerifiedPlan ? "VERIFIED" : "SCALE 1:50"}
            </span>
          </div>
        </div>
        <div className="report-blueprint-container blueprint-grid">
          {useVerifiedPlan && unitPlan ? (
            <VerifiedPlanSVG
              plan={unitPlan}
              markers={selectVerifiedPlanMarkers(defects, defectPlacements, unitPlan)}
              showAnnotations={showAnnotations}
            />
          ) : (
            <FloorPlanSVG coords={coords.data ?? []} flatType={flatType} showAnnotations={showAnnotations} />
          )}
          <div className="report-blueprint-status font-mono">
            {useVerifiedPlan
              ? `Verified Plan // ${unitPlan!.rooms.length} Rooms`
              : `Live Sensor Data Feed: Connected // ${flatType.toUpperCase()} Layout`}
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

      {verifyOnSiteDefects.length > 0 && (
        <div className="report-review-section">
          <div className="report-review-header">
            <div className="report-review-title">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
              <h4 className="font-mono">Verify On Site</h4>
            </div>
            <span className="report-review-badge font-mono">
              {verifyOnSiteDefects.length} flagged
            </span>
          </div>
          <div className="report-review-list">
            {verifyOnSiteDefects.slice(0, 5).map((defect) => (
              <article key={defect.id} className="report-review-item">
                <div className="report-review-meta">
                  <span className="font-mono">{defect.room}</span>
                  <span>{defect.defect_type}</span>
                </div>
                <p>{defect.severity_rationale || defect.description}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {report.error && (
        <div className="error-banner" data-testid="report-error">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          Fallback report: {report.error}
        </div>
      )}

      {/* Export button */}
      <div className="report-export-section">
        <button
          className="report-export-btn"
          onClick={() => {
            const el = document.querySelector<HTMLElement>("[data-testid='report-dashboard']");
            if (el) el.dataset.printing = "true";
            window.print();
            requestAnimationFrame(() => {
              if (el) delete el.dataset.printing;
            });
          }}
        >
          <span className="material-symbols-outlined">picture_as_pdf</span>
          Export Full PDF Report
        </button>
        <p className="report-export-note font-mono">Authorized Access Only</p>
      </div>
    </div>
  );
}

export default ReportDashboard;
