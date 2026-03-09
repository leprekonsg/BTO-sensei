import { useMemo, useState } from "react";
import { useBTOStore } from "../../lib/store";
import { getDefectDisplayRoom, hasVerifiedPlan, selectValidPlacements } from "../../lib/plan-helpers";
import { DefectCard } from "./DefectCard";
import { DefectPlacementOverlay } from "./DefectPlacementOverlay";
import "./DefectLogSidebar.css";

export function DefectLogSidebar() {
  const defects = useBTOStore((s) => s.defects);
  const unitPlan = useBTOStore((s) => s.unitPlan);
  const defectPlacements = useBTOStore((s) => s.defectPlacements);
  const [activeDefectId, setActiveDefectId] = useState<string | null>(null);

  const placementEnabled = hasVerifiedPlan(unitPlan);
  const validPlacements = useMemo(
    () => selectValidPlacements(defectPlacements, unitPlan),
    [defectPlacements, unitPlan],
  );
  const activeDefect = activeDefectId ? defects.find((defect) => defect.id === activeDefectId) ?? null : null;

  return (
    <div className="defect-log">
      <div className="defect-log-header">
        <h3 className="defect-log-title">
          <span className="defect-log-badge">Detected Items</span>
          <span className="text-primary">{String(defects.length).padStart(2, "0")} Total</span>
        </h3>
        {placementEnabled && (
          <p className="defect-log-subtitle font-mono">
            Verified plan active. Place each defect on the plan for precise reporting.
          </p>
        )}
      </div>

      <div className="defect-log-list" data-testid="defect-count">
        {defects.length ? (
          defects.map((defect) => (
            <DefectCard
              key={defect.id}
              defect={defect}
              displayRoom={getDefectDisplayRoom(defect, validPlacements, unitPlan)}
              placement={validPlacements[defect.id]}
              onPlace={placementEnabled ? () => setActiveDefectId(defect.id) : undefined}
            />
          ))
        ) : (
          <div className="defect-log-empty">
            <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>
              checklist
            </span>
            <p className="font-mono">NO DEFECTS LOGGED</p>
          </div>
        )}
      </div>

      {placementEnabled && activeDefect && unitPlan && (
        <div className="defect-log-overlay-shell" data-testid="placement-overlay-shell">
          <button
            type="button"
            className="defect-log-overlay-backdrop"
            aria-label="Close placement overlay"
            onClick={() => setActiveDefectId(null)}
          />
          <div className="defect-log-overlay-panel industrial-border">
            <div className="defect-log-overlay-header">
              <div>
                <p className="font-mono defect-log-overlay-kicker">Plan Placement</p>
                <h4>{activeDefect.defect_type}</h4>
              </div>
              <button
                type="button"
                className="defect-log-overlay-close"
                onClick={() => setActiveDefectId(null)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
            <DefectPlacementOverlay
              defectId={activeDefect.id}
              plan={unitPlan}
              existingPlacement={validPlacements[activeDefect.id]}
              onDone={() => setActiveDefectId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
