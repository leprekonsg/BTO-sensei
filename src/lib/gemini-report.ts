import { getGeminiClient } from "../hooks/use-bto-config";
import { getRoomCenters } from "./room-geometry";
import type {
  BlueprintCoord,
  Defect,
  FlatType,
  InspectionReport,
  RoomName,
  RoomScore,
  Severity,
} from "./types";
import { ROOMS } from "./types";

const REPORT_MODEL = "gemini-3-flash-preview";

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
  if (!defects.length) return `${room} looks clear.`;
  const topSeverity = defects
    .map((d) => d.severity)
    .sort((a, b) => severityPenalty(b) - severityPenalty(a))[0];
  return `${defects.length} issue${defects.length > 1 ? "s" : ""} logged, highest severity ${topSeverity.toLowerCase()}.`;
}

function localRoomScores(defects: Defect[]): RoomScore[] {
  return ROOMS.map((room) => {
    const roomDefects = defects.filter((d) => d.room === room);
    const penalty = roomDefects.reduce((t, d) => t + severityPenalty(d.severity), 0);
    return {
      room,
      score: Math.max(45, 100 - penalty),
      summary: roomSummary(room, roomDefects),
    };
  });
}

function localPriorityDefects(defects: Defect[]): Defect[] {
  return [...defects]
    .sort((a, b) => {
      const gap = severityPenalty(b.severity) - severityPenalty(a.severity);
      return gap !== 0 ? gap : b.timestamp - a.timestamp;
    })
    .slice(0, 5);
}

function countVerifyOnSite(defects: Defect[]): number {
  return defects.filter((defect) => defect.review_required).length;
}

function formatDefectForReport(defect: Defect, index: number): string {
  const confidence = Number.isFinite(defect.confidence) ? ` Confidence ${Math.round(defect.confidence * 100)}%.` : "";
  const verifyTag = defect.review_required ? " VERIFY ON SITE." : "";
  const rationale = defect.severity_rationale ? ` Rationale: ${defect.severity_rationale}` : "";
  return `${index + 1}. [${defect.room}] ${defect.defect_type} (${defect.severity}) - ${defect.description}.${confidence}${verifyTag}${rationale}`;
}

function hydratePriorityDefects(priorityDefects: Defect[] | undefined, defects: Defect[]): Defect[] {
  if (!Array.isArray(priorityDefects) || priorityDefects.length === 0) {
    return localPriorityDefects(defects);
  }

  const defectsById = new Map(defects.map((defect) => [defect.id, defect]));
  return priorityDefects.map((priorityDefect) => {
    const original = defectsById.get(priorityDefect.id);
    return original ? { ...original, ...priorityDefect } : priorityDefect;
  });
}

/** Local fallback report generation (no AI dependency) */
export function generateLocalReport(
  defects: Defect[],
  flatId: string,
  inspectionDate: string,
): InspectionReport {
  const roomScores = localRoomScores(defects);
  const avg = roomScores.reduce((t, r) => t + r.score, 0) / roomScores.length;

  return {
    flat_id: flatId.trim() || "BTO-UNKNOWN",
    inspection_date: inspectionDate,
    overall_health_score: Math.round(avg),
    room_scores: roomScores,
    priority_defects: localPriorityDefects(defects),
    inspector_note: defects.length
      ? countVerifyOnSite(defects) > 0
        ? `Most issues are serviceable within the defect liability window. Clear the critical items first, and verify ${countVerifyOnSite(defects)} item${countVerifyOnSite(defects) === 1 ? "" : "s"} on site before submission.`
        : "Most issues are serviceable within the defect liability window. Clear the critical items first."
      : "No significant defects logged yet. Continue inspecting room by room.",
  };
}

/** Generate an inspection report using Gemini with structured output */
export async function generateInspectionReport(
  defects: Defect[],
  flatId: string,
  inspectionDate: string,
): Promise<InspectionReport> {
  const client = getGeminiClient();
  if (!client) {
    return generateLocalReport(defects, flatId, inspectionDate);
  }

  const defectSummary = defects.map((defect, index) => formatDefectForReport(defect, index)).join("\n");
  const verifyOnSiteCount = countVerifyOnSite(defects);

  const prompt = `You are Ah Seng, a veteran BTO flat inspector in Singapore. Generate a structured inspection report.

Flat ID: ${flatId}
Inspection Date: ${inspectionDate}
Total Defects Found: ${defects.length}

Defect Log:
${defectSummary || "No defects logged."}

Based on the defects, generate a JSON report with this exact structure:
{
  "flat_id": "${flatId}",
  "inspection_date": "${inspectionDate}",
  "overall_health_score": <number 0-100>,
  "room_scores": [
    { "room": "<room name>", "score": <number 0-100>, "summary": "<brief assessment>" }
  ],
  "priority_defects": [<top 5 defect objects from the log, keeping all fields>],
  "inspector_note": "<Ah Seng's overall assessment in Singlish, practical and direct>"
}

Rules:
- Score rooms based on HDB defect liability standards
- Critical defects drop room score by 20-25 points
- Moderate defects drop by 10-15 points
- Minor defects drop by 5-8 points
- Rooms with no defects score 90-100
- Overall score is weighted average of room scores
- Inspector note should be in Singlish, practical, and mention the most important items
- If any defect is marked "VERIFY ON SITE", explicitly mention those manual-check items in the inspector note
- Preserve fields such as severity_rationale, review_required, bbox, and measurement when copying priority_defects from the log
- Include ALL rooms from: ${ROOMS.join(", ")}

Return ONLY valid JSON, no markdown fences.`;

  const response = await client.models.generateContent({
    model: REPORT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(text) as InspectionReport;

  if (typeof parsed.overall_health_score !== "number" || !Array.isArray(parsed.room_scores)) {
    throw new Error("Invalid report structure from Gemini");
  }

  return {
    flat_id: parsed.flat_id || flatId,
    inspection_date: parsed.inspection_date || inspectionDate,
    overall_health_score: parsed.overall_health_score,
    room_scores: parsed.room_scores,
    priority_defects: hydratePriorityDefects(parsed.priority_defects, defects),
    inspector_note: parsed.inspector_note || (
      verifyOnSiteCount > 0
        ? `Report generated by AI. Verify ${verifyOnSiteCount} item${verifyOnSiteCount === 1 ? "" : "s"} on site before submission.`
        : "Report generated by AI."
    ),
  };
}

export function deriveBlueprintCoords(defects: Defect[], flatType: FlatType = "4-room"): BlueprintCoord[] {
  const centers = getRoomCenters(flatType);
  return defects.map((defect, index) => {
    const roomCenter =
      centers[defect.room as RoomName] ?? centers["Living Room"];
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

/** Generate a professional cover summary for the inspection report */
export async function generateCoverSummary(
  report: InspectionReport,
  flatType: FlatType,
): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    return generateLocalCoverSummary(report, flatType);
  }

  const prompt = `You are Ah Seng, a veteran BTO inspector in Singapore. Write a 2-3 sentence executive summary for the cover page of an HDB ${flatType} flat inspection report.

Flat ID: ${report.flat_id}
Date: ${report.inspection_date}
Overall Score: ${report.overall_health_score}/100
Total Defects: ${report.priority_defects.length}
Critical Issues: ${report.priority_defects.filter(d => d.severity === "Critical").length}

Write in professional English (not Singlish). Be concise and authoritative. Return ONLY the summary text, no JSON.`;

  const response = await client.models.generateContent({
    model: REPORT_MODEL,
    contents: prompt,
  });

  return response.text?.trim() || generateLocalCoverSummary(report, flatType);
}

function generateLocalCoverSummary(report: InspectionReport, flatType: FlatType): string {
  const criticalCount = report.priority_defects.filter(d => d.severity === "Critical").length;
  const score = report.overall_health_score;
  const verdict = score >= 85 ? "excellent" : score >= 70 ? "acceptable" : "below standard";

  return `This ${flatType} HDB unit (${report.flat_id}) achieved a structural integrity score of ${score}/100, rated ${verdict}. ${
    criticalCount > 0
      ? `${criticalCount} critical defect${criticalCount > 1 ? "s" : ""} require${criticalCount === 1 ? "s" : ""} immediate contractor attention before handover acceptance.`
      : "No critical defects were identified during this inspection cycle."
  }`;
}
