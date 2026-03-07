import { useBTOStore } from "../../lib/store";
import { DefectCard } from "./DefectCard";
import "./DefectLogSidebar.css";

export function DefectLogSidebar() {
  const defects = useBTOStore((s) => s.defects);

  return (
    <div className="defect-log">
      <div className="defect-log-header">
        <h3 className="defect-log-title">
          <span className="defect-log-badge">Detected Items</span>
          <span className="text-primary">{String(defects.length).padStart(2, "0")} Total</span>
        </h3>
      </div>

      <div className="defect-log-list" data-testid="defect-count">
        {defects.length ? (
          defects.map((defect) => <DefectCard key={defect.id} defect={defect} />)
        ) : (
          <div className="defect-log-empty">
            <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>
              checklist
            </span>
            <p className="font-mono">NO DEFECTS LOGGED</p>
          </div>
        )}
      </div>
    </div>
  );
}
