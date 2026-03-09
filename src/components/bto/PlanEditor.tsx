import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { centroid } from "../../lib/plan-helpers";
import type { PlanRoomKind, Point2D, UnitPlan } from "../../lib/types";
import "./PlanEditor.css";

const ROOM_KINDS: PlanRoomKind[] = [
  "bedroom", "bathroom", "kitchen", "living", "balcony", "corridor", "utility", "study", "entrance",
];

const ROOM_FILL = "rgba(31, 38, 45, 0.7)";
const VERTEX_RADIUS = 5;

interface PlanEditorProps {
  plan: UnitPlan;
  onConfirm: (plan: UnitPlan) => void;
  onReset: () => void;
  onClear: () => void;
}

export function PlanEditor({ plan, onConfirm, onReset, onClear }: PlanEditorProps) {
  const [editPlan, setEditPlan] = useState<UnitPlan>(() => structuredClone(plan));
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ roomId: string; vertexIndex: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const vb = editPlan.bounds;
  const viewBox = `0 0 ${vb.width} ${vb.height}`;

  const getSvgPoint = useCallback((e: ReactPointerEvent): Point2D => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * vb.width;
    const y = ((e.clientY - rect.top) / rect.height) * vb.height;
    return [Math.round(x), Math.round(y)];
  }, [vb]);

  const handleVertexDown = useCallback((roomId: string, vertexIndex: number, e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragState({ roomId, vertexIndex });
    setSelectedRoomId(roomId);
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragState) return;
    const pt = getSvgPoint(e);
    setEditPlan((prev) => {
      const rooms = prev.rooms.map((room) => {
        if (room.id !== dragState.roomId) return room;
        const polygon = [...room.polygon];
        polygon[dragState.vertexIndex] = pt;
        return { ...room, polygon, centroid: centroid(polygon) };
      });
      return { ...prev, rooms };
    });
    setDirty(true);
  }, [dragState, getSvgPoint]);

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleRoomClick = useCallback((roomId: string) => {
    setSelectedRoomId((prev) => (prev === roomId ? null : roomId));
  }, []);

  const handleLabelChange = useCallback((roomId: string, label: string) => {
    setEditPlan((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, label } : r)),
    }));
    setDirty(true);
  }, []);

  const handleKindChange = useCallback((roomId: string, kind: PlanRoomKind) => {
    setEditPlan((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, kind } : r)),
    }));
    setDirty(true);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(editPlan);
  }, [editPlan, onConfirm]);

  const handleReset = useCallback(() => {
    setEditPlan(structuredClone(plan));
    setSelectedRoomId(null);
    setDirty(false);
    onReset();
  }, [plan, onReset]);

  const selectedRoom = editPlan.rooms.find((r) => r.id === selectedRoomId);

  return (
    <div className="plan-editor">
      <div className="plan-editor-svg-wrap">
        <svg
          ref={svgRef}
          className="plan-editor-svg"
          viewBox={viewBox}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Background */}
          <rect width={vb.width} height={vb.height} fill="#14191e" />

          {/* Room polygons */}
          {editPlan.rooms.map((room) => (
            <g key={room.id}>
              <polygon
                points={room.polygon.map((p) => p.join(",")).join(" ")}
                fill={room.id === selectedRoomId ? "rgba(0,255,136,0.12)" : ROOM_FILL}
                stroke={room.id === selectedRoomId ? "var(--primary, #00ff88)" : "rgba(255,255,255,0.1)"}
                strokeWidth={room.id === selectedRoomId ? 2 : 1}
                className={`plan-editor-room-poly ${room.id === selectedRoomId ? "plan-editor-room-poly--selected" : ""}`}
                onClick={() => handleRoomClick(room.id)}
              />
              {/* Room label */}
              <text
                x={room.centroid[0]}
                y={room.centroid[1]}
                fill="#f4f1ea"
                fontSize={Math.min(14, vb.width / 40)}
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
                className="plan-editor-label"
              >
                {room.label}
              </text>
              {/* Vertices (draggable) */}
              {room.polygon.map((vertex, vi) => (
                <circle
                  key={vi}
                  cx={vertex[0]}
                  cy={vertex[1]}
                  r={VERTEX_RADIUS}
                  fill={dragState?.roomId === room.id && dragState.vertexIndex === vi ? "var(--primary)" : "#fff"}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={1}
                  className={`plan-editor-vertex ${dragState?.roomId === room.id && dragState.vertexIndex === vi ? "plan-editor-vertex--dragging" : ""}`}
                  onPointerDown={(e) => handleVertexDown(room.id, vi, e)}
                />
              ))}
            </g>
          ))}

          {/* Wall segments */}
          {editPlan.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start[0]}
              y1={wall.start[1]}
              x2={wall.end[0]}
              y2={wall.end[1]}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={2}
              className="plan-editor-wall"
            />
          ))}
        </svg>
      </div>

      {/* Selected room editor */}
      {selectedRoom && (
        <div className="plan-editor-room-panel">
          <label>
            <span>Label</span>
            <input
              value={selectedRoom.label}
              onChange={(e) => handleLabelChange(selectedRoom.id, e.target.value)}
            />
          </label>
          <label style={{ marginTop: 6 }}>
            <span>Kind</span>
            <select
              value={selectedRoom.kind}
              onChange={(e) => handleKindChange(selectedRoom.id, e.target.value as PlanRoomKind)}
            >
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Toolbar */}
      <div className="plan-editor-toolbar">
        <button className="plan-editor-btn plan-editor-btn--danger" onClick={onClear}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          Clear
        </button>
        <button className="plan-editor-btn" onClick={handleReset} disabled={!dirty}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
          Reset to Draft
        </button>
        <button className="plan-editor-btn plan-editor-btn--primary" onClick={handleConfirm}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
          Confirm Plan
        </button>
      </div>
    </div>
  );
}
