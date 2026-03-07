import type { Defect } from "../../lib/types";
import "./DefectCard.css";

interface DefectCardProps {
    defect: Defect;
}

const SEVERITY_COLOR: Record<string, string> = {
    Critical: "var(--severity-critical)",
    Moderate: "var(--severity-moderate)",
    Minor: "var(--severity-minor)",
};

const SEVERITY_WIDTH: Record<string, string> = {
    Critical: "90%",
    Moderate: "45%",
    Minor: "20%",
};

export function DefectCard({ defect }: DefectCardProps) {
    const color = SEVERITY_COLOR[defect.severity] ?? "var(--primary)";
    const barWidth = SEVERITY_WIDTH[defect.severity] ?? "50%";

    return (
        <article className="defect-card industrial-border" data-testid="defect-item">
            {/* Thumbnail */}
            {defect.photo_url ? (
                <div className="defect-thumb">
                    <img src={defect.photo_url} alt={defect.defect_type} />
                </div>
            ) : (
                <div className="defect-thumb defect-thumb--empty">
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>image</span>
                </div>
            )}

            {/* Info */}
            <div className="defect-info">
                <div className="defect-header">
                    <span className="defect-type">{defect.defect_type}</span>
                    <span className="defect-id font-mono">{defect.room}</span>
                </div>
                <div className="defect-severity-row">
                    <span className="defect-severity-label">Severity</span>
                    <span className="defect-severity-value" style={{ color }}>{defect.severity}</span>
                </div>
                <div className="defect-bar">
                    <div className="defect-bar-fill" style={{ width: barWidth, background: color }} />
                </div>
                {defect.measurement && (
                    <div className="defect-measurement">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>straighten</span>
                        <span>
                            {defect.measurement.width_mm != null && defect.measurement.length_mm != null
                                ? `${defect.measurement.width_mm}mm x ${defect.measurement.length_mm}mm`
                                : defect.measurement.notes}
                        </span>
                    </div>
                )}
            </div>
        </article>
    );
}
