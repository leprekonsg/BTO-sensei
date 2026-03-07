import type { BlueprintCoord } from "../../lib/types";
import { ROOM_CENTERS } from "../../lib/room-geometry";
import "./FloorPlanSVG.css";

export { ROOM_CENTERS };

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
      <svg viewBox="0 0 700 500" aria-label="Floor plan with defects" className="floor-plan-svg">
        {/* Outer boundary / Background */}
        <rect x="10" y="10" width="670" height="480" rx="8" fill="#14191e" stroke="#f4f1ea" opacity="0.18" />

        {/* Rooms - Left Column */}
        <rect x="10" y="10" width="230" height="230" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bedroom" />
        <rect x="10" y="240" width="230" height="250" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bedroom" />

        {/* Rooms - Middle Column */}
        <rect x="240" y="10" width="120" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bathroom" />
        <rect x="240" y="130" width="120" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bathroom" />

        {/* Internal Corridor */}
        <rect x="240" y="250" width="120" height="140" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />

        {/* Household Shelter & Entrance Zone */}
        <rect x="240" y="390" width="80" height="100" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <rect x="320" y="390" width="40" height="100" rx="4" fill="#14191e" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />

        {/* Rooms - Right Column */}
        <rect x="360" y="10" width="230" height="240" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Kitchen" />
        <rect x="360" y="250" width="230" height="240" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Living Room" />

        {/* Balcony */}
        <rect x="590" y="250" width="80" height="240" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Balcony" />

        {/* Labels */}
        <text x="125" y="125" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Master Bed</text>
        <text x="125" y="365" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Common Bed</text>

        <text x="300" y="70" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle" dominantBaseline="middle">M. Bath</text>
        <text x="300" y="190" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle" dominantBaseline="middle">C. Bath</text>
        <text x="280" y="445" fill="#f4f1ea" fontSize="10" textAnchor="middle" dominantBaseline="middle" opacity="0.6">HS</text>
        <text x="340" y="445" fill="#f4f1ea" fontSize="10" textAnchor="middle" dominantBaseline="middle" opacity="0.6" writingMode="vertical-rl" transform="rotate(180 340 445)">ENTRANCE</text>

        <text x="475" y="130" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Kitchen</text>
        <text x="475" y="370" fill="#f4f1ea" fontSize="16" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Living Room</text>
        <text x="630" y="370" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle" dominantBaseline="middle" writingMode="vertical-rl" transform="rotate(180 630 370)">Balcony</text>

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
