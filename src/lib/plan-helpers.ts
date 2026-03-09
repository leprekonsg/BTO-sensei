import type {
  Defect,
  DefectPlacement,
  FloorPlanDraft,
  PlanRoom,
  PlanRoomKind,
  Point2D,
  Polygon,
  RoomName,
  Severity,
  SpatialMode,
  UnitPlan,
  WallSegment,
} from "./types";

// ── Marker type for VerifiedPlanSVG ──────────────────────────────────

export interface PlanMarker {
  defectId: string;
  x: number;
  y: number;
  severity: Severity;
  label: string;
}

// ── Geometry primitives ──────────────────────────────────────────────

export function centroid(polygon: Polygon): Point2D {
  if (polygon.length === 0) return [0, 0];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of polygon) {
    cx += x;
    cy += y;
  }
  return [cx / polygon.length, cy / polygon.length];
}

export function polygonBounds(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(point: Point2D, polygon: Polygon): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function segmentLength(a: Point2D, b: Point2D): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Check if a polygon is self-intersecting (simple edge-pair test). */
export function isSelfIntersecting(polygon: Polygon): boolean {
  const n = polygon.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (edgesIntersect(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])) {
        return true;
      }
    }
  }
  return false;
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(p: Point2D, q: Point2D, r: Point2D): boolean {
  return (
    Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1])
  );
}

function edgesIntersect(p1: Point2D, q1: Point2D, p2: Point2D, q2: Point2D): boolean {
  const d1 = cross(p2, q2, p1);
  const d2 = cross(p2, q2, q1);
  const d3 = cross(p1, q1, p2);
  const d4 = cross(p1, q1, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(p2, p1, q2)) return true;
  if (d2 === 0 && onSegment(p2, q1, q2)) return true;
  if (d3 === 0 && onSegment(p1, p2, q1)) return true;
  if (d4 === 0 && onSegment(p1, q2, q1)) return true;
  return false;
}

// ── Draft normalization ──────────────────────────────────────────────

let nextId = 1;
function uid(prefix: string): string {
  return `${prefix}-${nextId++}-${Date.now().toString(36)}`;
}

/** Normalize a Gemini FloorPlanDraft into an app-owned UnitPlan. */
export function normalizeDraft(draft: FloorPlanDraft, source: UnitPlan["source"] = "upload"): UnitPlan {
  const rooms: PlanRoom[] = [];
  const walls: WallSegment[] = [];
  let maxX = 0, maxY = 0;

  for (const draftRoom of draft.rooms) {
    if (draftRoom.polygon.length < 3) continue;
    if (isSelfIntersecting(draftRoom.polygon)) continue;

    const roomId = uid("room");
    const c = centroid(draftRoom.polygon);
    rooms.push({
      id: roomId,
      label: draftRoom.label,
      kind: draftRoom.kind,
      polygon: draftRoom.polygon,
      centroid: c,
    });

    const bounds = polygonBounds(draftRoom.polygon);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  for (const draftWall of draft.walls) {
    const matchRoom = rooms.find((r) => r.label === draftWall.roomLabel);
    walls.push({
      id: uid("wall"),
      roomId: matchRoom?.id ?? "",
      start: draftWall.start,
      end: draftWall.end,
      length: segmentLength(draftWall.start, draftWall.end),
      surfaceType: "wall",
    });
  }

  return {
    id: uid("plan"),
    source,
    status: "draft",
    version: 1,
    bounds: { width: Math.ceil(maxX), height: Math.ceil(maxY) },
    rooms,
    walls,
    orientation: draft.orientationHint,
  };
}

// ── Compatibility helpers ────────────────────────────────────────────

const ROOM_KIND_MAP: Record<string, PlanRoomKind> = {
  "Master Bedroom": "bedroom",
  "Common Bedroom": "bedroom",
  "Master Bathroom": "bathroom",
  "Common Bathroom": "bathroom",
  Kitchen: "kitchen",
  "Living Room": "living",
  Balcony: "balcony",
};

/** Map a RoomName to a PlanRoomKind for template matching. */
export function roomNameToKind(room: string): PlanRoomKind {
  return ROOM_KIND_MAP[room] ?? "utility";
}

/** Get the display room name for a defect, using placement if available. */
export function getDefectDisplayRoom(
  defect: Defect,
  placements: Record<string, DefectPlacement>,
  plan: UnitPlan | null,
): string {
  const placement = placements[defect.id];
  if (!placement || placement.mode === "unplaced" || !placement.roomId || !plan) {
    return defect.room;
  }
  const planRoom = plan.rooms.find((r) => r.id === placement.roomId);
  return planRoom?.label ?? defect.room;
}

/** Derive the effective spatial mode from store state. */
export function getEffectiveSpatialMode(
  explicitMode: SpatialMode,
  plan: UnitPlan | null,
): SpatialMode {
  if (plan?.status === "verified" && explicitMode === "verified-plan") {
    return "verified-plan";
  }
  return "fallback";
}

/** Check whether the store has a usable verified plan. */
export function hasVerifiedPlan(plan: UnitPlan | null): boolean {
  return plan?.status === "verified" && plan.rooms.length > 0;
}

/** Find which plan room a screen tap lands in. */
export function findRoomAtPoint(plan: UnitPlan, point: Point2D): PlanRoom | null {
  for (const room of plan.rooms) {
    if (pointInPolygon(point, room.polygon)) return room;
  }
  return null;
}

/** Find the nearest wall segment to a point within a threshold distance. */
export function findNearestWall(plan: UnitPlan, point: Point2D, threshold = 20): WallSegment | null {
  let best: WallSegment | null = null;
  let bestDist = threshold;
  for (const wall of plan.walls) {
    const d = pointToSegmentDist(point, wall.start, wall.end);
    if (d < bestDist) {
      bestDist = d;
      best = wall;
    }
  }
  return best;
}

function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return segmentLength(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const proj: Point2D = [a[0] + t * dx, a[1] + t * dy];
  return segmentLength(p, proj);
}

/** Create a default room-level DefectPlacement for a defect. */
export function createRoomPlacement(defectId: string, roomId: string, planId: string, planVersion: number, confirmed = false): DefectPlacement {
  return {
    defectId,
    planId,
    planVersion,
    mode: "room",
    roomId,
    confirmedByUser: confirmed,
  };
}

/** Match a RoomName to the closest PlanRoom by label similarity. */
export function matchRoomByName(plan: UnitPlan, roomName: RoomName): PlanRoom | null {
  const lower = roomName.toLowerCase();
  return plan.rooms.find((r) => r.label.toLowerCase() === lower)
    ?? plan.rooms.find((r) => lower.includes(r.label.toLowerCase()) || r.label.toLowerCase().includes(lower))
    ?? null;
}

/** Return only placements that belong to the current plan version. */
export function selectValidPlacements(
  placements: Record<string, DefectPlacement>,
  plan: UnitPlan | null,
): Record<string, DefectPlacement> {
  if (!plan) return {};
  const result: Record<string, DefectPlacement> = {};
  for (const [id, p] of Object.entries(placements)) {
    if (p.planId === plan.id && p.planVersion === plan.version) {
      result[id] = p;
    }
  }
  return result;
}

/**
 * Derive plan markers from defects + valid placements + unitPlan.
 * This is the single source of truth for VerifiedPlanSVG markers.
 */
export function selectVerifiedPlanMarkers(
  defects: Defect[],
  placements: Record<string, DefectPlacement>,
  plan: UnitPlan,
): PlanMarker[] {
  const valid = selectValidPlacements(placements, plan);
  const markers: PlanMarker[] = [];

  for (const defect of defects) {
    const placement = valid[defect.id];
    if (!placement || placement.mode === "unplaced") continue;

    let x: number;
    let y: number;

    if (placement.localPos) {
      [x, y] = placement.localPos;
    } else if (placement.roomId) {
      const room = plan.rooms.find((r) => r.id === placement.roomId);
      if (room) {
        [x, y] = room.centroid;
      } else {
        continue;
      }
    } else {
      continue;
    }

    markers.push({
      defectId: defect.id,
      x,
      y,
      severity: defect.severity,
      label: defect.defect_type,
    });
  }

  return markers;
}
