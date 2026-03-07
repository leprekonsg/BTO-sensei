import type {
  BlueprintCoord,
  Defect,
  InspectionReport,
  RoomName,
  RoomScore,
  Severity,
} from "./types";
import { ROOMS } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function severityPenalty(severity: Severity) {
  switch (severity) {
    case "Critical":
      return 24;
    case "Moderate":
      return 14;
    case "Minor":
      return 7;
  }
}

function roomSummary(room: string, defects: Defect[]) {
  if (!defects.length) {
    return `${room} looks clear.`;
  }

  const topSeverity = defects
    .map((defect) => defect.severity)
    .sort((left, right) => severityPenalty(right) - severityPenalty(left))[0];

  return `${defects.length} issue${defects.length > 1 ? "s" : ""} logged, highest severity ${topSeverity.toLowerCase()}.`;
}

async function buildRoomScores(defects: Defect[]): Promise<RoomScore[]> {
  await delay(120);

  return ROOMS.map((room) => {
    const roomDefects = defects.filter((defect) => defect.room === room);
    const penalty = roomDefects.reduce(
      (total, defect) => total + severityPenalty(defect.severity),
      0,
    );

    return {
      room,
      score: Math.max(45, 100 - penalty),
      summary: roomSummary(room, roomDefects),
    };
  });
}

async function buildPriorityDefects(defects: Defect[]): Promise<Defect[]> {
  await delay(90);

  return [...defects]
    .sort((left: Defect, right: Defect) => {
      const severityGap =
        severityPenalty(right.severity) - severityPenalty(left.severity);
      if (severityGap !== 0) {
        return severityGap;
      }

      return right.timestamp - left.timestamp;
    })
    .slice(0, 5);
}

export async function generateInspectionReport(
  defects: Defect[],
  flatId: string,
  inspectionDate: string,
): Promise<InspectionReport> {
  const [roomScores, priorityDefects] = await Promise.all([
    buildRoomScores(defects),
    buildPriorityDefects(defects),
  ]);

  const average =
    roomScores.reduce((total, room) => total + room.score, 0) / roomScores.length;

  return {
    flat_id: flatId.trim() || "BTO-UNKNOWN",
    inspection_date: inspectionDate,
    overall_health_score: Math.round(average),
    room_scores: roomScores,
    priority_defects: priorityDefects,
    inspector_note: defects.length
      ? "Most issues are serviceable within the defect liability window. Clear the critical items first."
      : "No significant defects logged yet. Continue inspecting room by room.",
  };
}

const ROOM_CENTERS: Record<RoomName, { x: number; y: number }> = {
  "Living Room": { x: 210, y: 210 },
  Kitchen: { x: 360, y: 145 },
  "Master Bedroom": { x: 360, y: 320 },
  "Common Bedroom": { x: 150, y: 95 },
  "Master Bathroom": { x: 425, y: 390 },
  "Common Bathroom": { x: 275, y: 390 },
  Balcony: { x: 95, y: 285 },
};

export function deriveBlueprintCoords(defects: Defect[]): BlueprintCoord[] {
  return defects.map((defect, index) => {
    const roomCenter =
      ROOM_CENTERS[defect.room as RoomName] ?? ROOM_CENTERS["Living Room"];
    const offsetX = (index % 3) * 18 - 14;
    const offsetY = Math.floor(index / 3) * 16 - 10;

    return {
      defect_id: defect.id,
      x: roomCenter.x + offsetX,
      y: roomCenter.y + offsetY,
      severity: defect.severity,
      label: defect.defect_type,
    };
  });
}
