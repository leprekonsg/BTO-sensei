import type { Defect, DefectSource } from "../../lib/types";
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

const SOURCE_LABELS: Record<DefectSource, string> = {
    "hud-vision": "HUD Vision",
    "acoustic": "Acoustic",
    "manual-vision": "Camera",
};

const SOURCE_ICONS: Record<DefectSource, string> = {
    "hud-vision": "visibility",
    "acoustic": "graphic_eq",
    "manual-vision": "photo_camera",
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
                    <div className="defect-header-meta">
                        {defect.source && (
                            <span className={`defect-source defect-source--${defect.source}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>
                                    {SOURCE_ICONS[defect.source] ?? "info"}
                                </span>
                                {SOURCE_LABELS[defect.source] ?? defect.source}
                            </span>
                        )}
                        <span className="defect-id font-mono">{defect.room}</span>
                    </div>
                </div>
                <div className="defect-severity-row">
                    <span className="defect-severity-label">Severity</span>
                    <div className="defect-severity-meta">
                        {defect.review_required && (
                            <span className="defect-review-flag" title="Manual verification required">
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                                Verify on site
                            </span>
                        )}
                        <span className="defect-severity-value" style={{ color }}>{defect.severity}</span>
                    </div>
                </div>
                <div className="defect-bar">
                    <div className="defect-bar-fill" style={{ width: barWidth, background: color }} />
                </div>
                {defect.severity_rationale && (
                    <div className="defect-rationale" title={defect.severity_rationale}>
                        {defect.severity_rationale}
                    </div>
                )}
                {defect.conquas_appendix && (
                    <div className="defect-conquas-ref">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>verified</span>
                        <span>{defect.conquas_appendix}</span>
                    </div>
                )}
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
