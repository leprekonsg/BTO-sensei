import type { BlueprintCoord, DefectPlacement, UnitPlan } from "../../lib/types";
import "./FloorPlanSVG.css";

interface VerifiedPlanSVGProps {
  plan: UnitPlan;
  coords: BlueprintCoord[];
  placements: Record<string, DefectPlacement>;
  showAnnotations?: boolean;
}

function markerColor(severity: string) {
  switch (severity) {
    case "Critical": return "#ef4444";
    case "Moderate": return "#f97316";
    default: return "#facc15";
  }
}

/**
 * Renders a verified UnitPlan as SVG with defect markers placed
 * using explicit DefectPlacement coordinates.
 */
export function VerifiedPlanSVG({ plan, coords, placements, showAnnotations = false }: VerifiedPlanSVGProps) {
  const vb = plan.bounds;
  const viewBox = `0 0 ${vb.width} ${vb.height}`;

  return (
    <div className="floor-plan-wrap">
      <svg viewBox={viewBox} aria-label="Verified floor plan with defects" className="floor-plan-svg">
        {/* Background */}
        <rect width={vb.width} height={vb.height} rx="4" fill="#14191e" />

        {/* Room polygons */}
        {plan.rooms.map((room) => (
          <g key={room.id}>
            <polygon
              points={room.polygon.map((p) => p.join(",")).join(" ")}
              fill="#1f262d"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={2}
              data-room={room.label}
            />
            <text
              x={room.centroid[0]}
              y={room.centroid[1]}
              fill="#f4f1ea"
              fontSize={Math.min(15, vb.width / 35)}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {room.label}
            </text>
          </g>
        ))}

        {/* Wall segments */}
        {plan.walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.start[0]}
            y1={wall.start[1]}
            x2={wall.end[0]}
            y2={wall.end[1]}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={2}
          />
        ))}

        {/* Defect markers - use placement positions when available, fall back to coords */}
        {coords.map((coord) => {
          const placement = placements[coord.defect_id];
          let cx = coord.x;
          let cy = coord.y;

          if (placement?.localPos) {
            cx = placement.localPos[0];
            cy = placement.localPos[1];
          } else if (placement?.roomId) {
            const room = plan.rooms.find((r) => r.id === placement.roomId);
            if (room) {
              cx = room.centroid[0];
              cy = room.centroid[1];
            }
          }

          return (
            <g key={coord.defect_id}>
              <circle cx={cx} cy={cy} r="14" fill={markerColor(coord.severity)} opacity="0.16" />
              <circle
                cx={cx} cy={cy} r="6"
                fill={markerColor(coord.severity)}
                stroke="white"
                strokeWidth="2"
                style={{ filter: `drop-shadow(0 0 6px ${markerColor(coord.severity)})` }}
              />
              {showAnnotations && (
                <>
                  <line
                    x1={cx + 6} y1={cy - 6}
                    x2={cx + 22} y2={cy - 18}
                    stroke={markerColor(coord.severity)}
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  <rect
                    x={cx + 20} y={cy - 28}
                    width={Math.max(coord.label.length * 5.5, 50)} height="14"
                    rx="2"
                    fill="rgba(0,0,0,0.85)"
                    stroke={markerColor(coord.severity)}
                    strokeWidth="1"
                  />
                  <text
                    x={cx + 24} y={cy - 18}
                    fill={markerColor(coord.severity)}
                    fontSize="8"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {coord.label.toUpperCase()}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Plan type label */}
        <text
          x={vb.width / 2} y={vb.height - 8}
          fill="rgba(244,241,234,0.3)"
          fontSize="10"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="monospace"
        >
          VERIFIED FLOOR PLAN
        </text>
      </svg>
    </div>
  );
}
