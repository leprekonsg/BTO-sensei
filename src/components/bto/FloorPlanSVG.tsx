import type { BlueprintCoord } from "../../lib/types";
import "./FloorPlanSVG.css";

interface FloorPlanSVGProps {
  coords: BlueprintCoord[];
}

function markerColor(severity: string) {
  switch (severity) {
    case "Critical": return "#ef4444";
    case "Moderate": return "#f97316";
    default: return "#facc15";
  }
}

export function FloorPlanSVG({ coords }: FloorPlanSVGProps) {
  return (
    <div className="floor-plan-wrap">
      <svg viewBox="0 0 480 430" aria-label="Floor plan with defects" className="floor-plan-svg">
        {/* Outer boundary */}
        <rect x="20" y="20" width="440" height="390" rx="24" fill="#14191e" stroke="#f4f1ea" opacity="0.18" />

        {/* Rooms */}
        <rect x="40" y="40" width="210" height="180" rx="18" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />
        <rect x="265" y="40" width="175" height="125" rx="18" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />
        <rect x="265" y="180" width="175" height="135" rx="18" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />
        <rect x="40" y="235" width="175" height="160" rx="18" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />
        <rect x="230" y="330" width="100" height="65" rx="14" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />
        <rect x="345" y="330" width="95" height="65" rx="14" fill="#1f262d" stroke="rgba(255,255,255,0.08)" />

        {/* Labels */}
        <text x="100" y="136" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle">Living</text>
        <text x="350" y="105" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle">Kitchen</text>
        <text x="350" y="255" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle">Master Bed</text>
        <text x="125" y="320" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle">Common Bed</text>
        <text x="280" y="368" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle">Bath</text>
        <text x="392" y="368" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle">Bath</text>

        {/* Defect markers */}
        {coords.map((coord) => (
          <g key={coord.defect_id}>
            <circle cx={coord.x} cy={coord.y} r="18" fill={markerColor(coord.severity)} opacity="0.16" />
            <circle
              cx={coord.x} cy={coord.y} r="8"
              fill={markerColor(coord.severity)}
              stroke="white"
              strokeWidth="2"
              style={{ filter: `drop-shadow(0 0 8px ${markerColor(coord.severity)})` }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
