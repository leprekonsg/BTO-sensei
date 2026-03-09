import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useBTOStore } from "../../lib/store";
import { findRoomAtPoint, findNearestWall } from "../../lib/plan-helpers";
import type { DefectPlacement, Point2D, UnitPlan } from "../../lib/types";
import "./DefectPlacementOverlay.css";

interface DefectPlacementOverlayProps {
  defectId: string;
  plan: UnitPlan;
  onDone: () => void;
  existingPlacement?: DefectPlacement;
}

export function DefectPlacementOverlay({ defectId, plan, onDone, existingPlacement }: DefectPlacementOverlayProps) {
  const upsertDefectPlacement = useBTOStore((s) => s.upsertDefectPlacement);
  const removeDefectPlacement = useBTOStore((s) => s.removeDefectPlacement);

  const [tapPoint, setTapPoint] = useState<Point2D | null>(
    existingPlacement?.localPos ?? existingPlacement?.screenTap ?? null,
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    existingPlacement?.roomId ?? null,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const vb = plan.bounds;
  const viewBox = `0 0 ${vb.width} ${vb.height}`;

  const getSvgPoint = useCallback((e: ReactPointerEvent): Point2D => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * vb.width),
      Math.round(((e.clientY - rect.top) / rect.height) * vb.height),
    ];
  }, [vb]);

  const handleTap = useCallback((e: ReactPointerEvent) => {
    const pt = getSvgPoint(e);
    setTapPoint(pt);

    const room = findRoomAtPoint(plan, pt);
    if (room) {
      setSelectedRoomId(room.id);
    }
  }, [getSvgPoint, plan]);

  const handleConfirm = useCallback(() => {
    if (!selectedRoomId && !tapPoint) return;

    if (tapPoint) {
      const wall = findNearestWall(plan, tapPoint, 15);
      const placement: DefectPlacement = {
        defectId,
        planId: plan.id,
        planVersion: plan.version,
        mode: wall ? "wall" : selectedRoomId ? "point" : "unplaced",
        roomId: selectedRoomId ?? undefined,
        segmentId: wall?.id,
        localPos: tapPoint,
        screenTap: tapPoint,
        confirmedByUser: true,
      };
      upsertDefectPlacement(placement);
    } else if (selectedRoomId) {
      upsertDefectPlacement({
        defectId,
        planId: plan.id,
        planVersion: plan.version,
        mode: "room",
        roomId: selectedRoomId,
        confirmedByUser: true,
      });
    }

    onDone();
  }, [defectId, tapPoint, selectedRoomId, plan, upsertDefectPlacement, onDone]);

  const handleRoomSelect = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    // Clear exact tap point when selecting a room directly
    setTapPoint(null);
  }, []);

  const handleSkip = useCallback(() => {
    upsertDefectPlacement({
      defectId,
      planId: plan.id,
      planVersion: plan.version,
      mode: "unplaced",
      confirmedByUser: false,
    });
    onDone();
  }, [defectId, plan, upsertDefectPlacement, onDone]);

  const handleRemove = useCallback(() => {
    removeDefectPlacement(defectId);
    onDone();
  }, [defectId, removeDefectPlacement, onDone]);

  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId);

  return (
    <div className="placement-overlay" data-testid="placement-overlay">
      <svg
        ref={svgRef}
        className="placement-overlay-svg"
        viewBox={viewBox}
        onPointerUp={handleTap}
        data-testid="placement-overlay-svg"
      >
        <rect width={vb.width} height={vb.height} fill="#14191e" />

        {/* Room polygons */}
        {plan.rooms.map((room) => (
          <g key={room.id}>
            <polygon
              points={room.polygon.map((p) => p.join(",")).join(" ")}
              fill={room.id === selectedRoomId ? "rgba(0,255,136,0.12)" : "rgba(31,38,45,0.7)"}
              stroke={room.id === selectedRoomId ? "var(--primary, #00ff88)" : "rgba(255,255,255,0.1)"}
              strokeWidth={room.id === selectedRoomId ? 2 : 1}
              className={`placement-room ${room.id === selectedRoomId ? "placement-room--active" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleRoomSelect(room.id); }}
              data-testid={`placement-room-${room.id}`}
            />
            <text
              x={room.centroid[0]}
              y={room.centroid[1]}
              fill="#f4f1ea"
              fontSize={Math.min(13, vb.width / 45)}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: "none" }}
            >
              {room.label}
            </text>
          </g>
        ))}

        {/* Walls */}
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

        {/* Current tap marker */}
        {tapPoint && (
          <g className="placement-marker">
            <circle cx={tapPoint[0]} cy={tapPoint[1]} r={12} fill="rgba(239,68,68,0.2)" />
            <circle
              cx={tapPoint[0]}
              cy={tapPoint[1]}
              r={6}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={2}
              style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,0.6))" }}
            />
          </g>
        )}
      </svg>

      {/* Prompt */}
      <div className="placement-prompt" data-testid="placement-prompt">
        <span className="material-symbols-outlined" style={{ fontSize: 16, opacity: 0.5 }}>touch_app</span>
        <span>
          {tapPoint
            ? `Placed in ${selectedRoom?.label ?? "plan"}. Confirm or adjust.`
            : selectedRoomId
              ? `${selectedRoom?.label ?? "Room"} selected. Confirm or tap exact spot.`
              : "Tap a room or exact spot to place defect."}
        </span>
      </div>

      {/* Actions */}
      <div className="placement-actions">
        <button className="placement-btn placement-btn--skip" onClick={handleSkip} data-testid="placement-skip">
          Place Later
        </button>
        {existingPlacement && (
          <button className="placement-btn" onClick={handleRemove} data-testid="placement-remove">
            Remove
          </button>
        )}
        {(tapPoint || selectedRoomId) && (
          <button
            className="placement-btn placement-btn--confirm"
            onClick={handleConfirm}
            data-testid="placement-confirm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}
