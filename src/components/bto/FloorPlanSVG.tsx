import type { BlueprintCoord, FlatType } from "../../lib/types";
import { ROOM_CENTERS } from "../../lib/room-geometry";
import "./FloorPlanSVG.css";

export { ROOM_CENTERS };

interface FloorPlanSVGProps {
  coords: BlueprintCoord[];
  flatType?: FlatType;
  showAnnotations?: boolean;
}

function markerColor(severity: string) {
  switch (severity) {
    case "Critical": return "#ef4444";
    case "Moderate": return "#f97316";
    default: return "#facc15";
  }
}

function ThreeRoomLayout() {
  return (
    <>
      {/* Bedroom (left, large) */}
      <rect x="10" y="10" width="280" height="290" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bedroom" />
      {/* Common Bedroom (left, bottom) */}
      <rect x="10" y="300" width="280" height="190" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bedroom" />
      {/* Bathroom (center) */}
      <rect x="290" y="10" width="140" height="140" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bathroom" />
      {/* Common Bath (center) */}
      <rect x="290" y="150" width="140" height="140" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bathroom" />
      {/* Corridor + HS */}
      <rect x="290" y="290" width="140" height="200" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      {/* Kitchen (right, top) */}
      <rect x="430" y="10" width="200" height="230" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Kitchen" />
      {/* Living Room (right, bottom) */}
      <rect x="430" y="240" width="200" height="250" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Living Room" />
      {/* Balcony */}
      <rect x="630" y="240" width="60" height="250" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Balcony" />
      {/* Labels */}
      <text x="150" y="150" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Master Bed</text>
      <text x="150" y="390" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Common Bed</text>
      <text x="360" y="80" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">M. Bath</text>
      <text x="360" y="220" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">C. Bath</text>
      <text x="530" y="130" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Kitchen</text>
      <text x="530" y="370" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Living Room</text>
      <text x="660" y="370" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle" writingMode="vertical-rl" transform="rotate(180 660 370)">Balcony</text>
      {/* Flat type label */}
      <text x="350" y="475" fill="rgba(244,241,234,0.3)" fontSize="10" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">3-ROOM BTO FLAT</text>
    </>
  );
}

function FourRoomLayout() {
  return (
    <>
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
      {/* Flat type label */}
      <text x="350" y="475" fill="rgba(244,241,234,0.3)" fontSize="10" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">4-ROOM BTO FLAT</text>
    </>
  );
}

function FiveRoomLayout() {
  return (
    <>
      {/* Master Bedroom (top-left) */}
      <rect x="10" y="10" width="210" height="200" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bedroom" />
      {/* Common Bedroom (bottom-left) */}
      <rect x="10" y="210" width="210" height="180" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bedroom" />
      {/* Study / Extra room (far bottom-left) */}
      <rect x="10" y="390" width="210" height="100" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
      {/* Bathrooms */}
      <rect x="220" y="10" width="120" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Master Bathroom" />
      <rect x="220" y="130" width="120" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Common Bathroom" />
      {/* Corridor */}
      <rect x="220" y="250" width="120" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      {/* HS + Entrance */}
      <rect x="220" y="370" width="80" height="120" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <rect x="300" y="370" width="40" height="120" rx="4" fill="#14191e" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
      {/* Kitchen (right, top) */}
      <rect x="340" y="10" width="240" height="210" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Kitchen" />
      {/* Living + Dining (right, bottom - larger) */}
      <rect x="340" y="220" width="240" height="270" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Living Room" />
      {/* Balcony */}
      <rect x="580" y="220" width="90" height="270" rx="4" fill="#1f262d" stroke="rgba(255,255,255,0.08)" strokeWidth="2" data-room="Balcony" />
      {/* Labels */}
      <text x="115" y="110" fill="#f4f1ea" fontSize="14" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Master Bed</text>
      <text x="115" y="300" fill="#f4f1ea" fontSize="14" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Common Bed</text>
      <text x="115" y="440" fill="#f4f1ea" fontSize="12" fontWeight="600" textAnchor="middle" dominantBaseline="middle" opacity="0.5">Study</text>
      <text x="280" y="70" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">M. Bath</text>
      <text x="280" y="190" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle">C. Bath</text>
      <text x="260" y="435" fill="#f4f1ea" fontSize="10" textAnchor="middle" dominantBaseline="middle" opacity="0.6">HS</text>
      <text x="460" y="120" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Kitchen</text>
      <text x="460" y="350" fill="#f4f1ea" fontSize="15" fontWeight="600" textAnchor="middle" dominantBaseline="middle">Living Room</text>
      <text x="625" y="355" fill="#f4f1ea" fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="middle" writingMode="vertical-rl" transform="rotate(180 625 355)">Balcony</text>
      {/* Flat type label */}
      <text x="350" y="475" fill="rgba(244,241,234,0.3)" fontSize="10" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">5-ROOM BTO FLAT</text>
    </>
  );
}

const FLAT_LAYOUTS: Record<FlatType, () => React.JSX.Element> = {
  "3-room": ThreeRoomLayout,
  "4-room": FourRoomLayout,
  "5-room": FiveRoomLayout,
};

export function FloorPlanSVG({ coords, flatType = "4-room", showAnnotations = false }: FloorPlanSVGProps) {
  const LayoutComponent = FLAT_LAYOUTS[flatType];

  return (
    <div className="floor-plan-wrap">
      <svg viewBox="0 0 700 500" aria-label="Floor plan with defects" className="floor-plan-svg">
        {/* Outer boundary / Background */}
        <rect x="10" y="10" width="670" height="480" rx="8" fill="#14191e" stroke="#f4f1ea" opacity="0.18" />

        <LayoutComponent />

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
            {/* Annotation labels for Nano Banana Blueprint mode */}
            {showAnnotations && (
              <>
                <line
                  x1={coord.x + 8} y1={coord.y - 8}
                  x2={coord.x + 28} y2={coord.y - 22}
                  stroke={markerColor(coord.severity)}
                  strokeWidth="1"
                  opacity="0.6"
                />
                <rect
                  x={coord.x + 26} y={coord.y - 34}
                  width={Math.max(coord.label.length * 6, 60)} height="16"
                  rx="2"
                  fill="rgba(0,0,0,0.85)"
                  stroke={markerColor(coord.severity)}
                  strokeWidth="1"
                />
                <text
                  x={coord.x + 30} y={coord.y - 23}
                  fill={markerColor(coord.severity)}
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {coord.label.toUpperCase()}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
