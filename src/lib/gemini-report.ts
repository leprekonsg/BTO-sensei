import { withRetryAndFallback, GEMINI_SUMMARY_RETRY } from "./fallback";
import { getGeminiClient } from "../hooks/use-bto-config";
import { lookupConquasItemId, lookupConquasAppendix, buildConquasPromptBlock } from "./conquas";
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

const REPORT_MODEL =
  (import.meta.env?.VITE_GEMINI_REPORT_MODEL as string | undefined) ||
  "gemini-2.5-flash";
const COVER_SUMMARY_TIMEOUT_MS = 8000;

const reportResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["flat_id", "inspection_date", "overall_health_score", "room_scores", "priority_defects", "inspector_note"],
  properties: {
    flat_id: { type: "string" },
    inspection_date: { type: "string" },
    overall_health_score: { type: "number" },
    room_scores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["room", "score", "summary"],
        properties: {
          room: { type: "string" },
          score: { type: "number" },
          summary: { type: "string" },
        },
      },
    },
    priority_defects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          room: { type: "string" },
          defect_type: { type: "string" },
          severity: { type: "string", enum: ["Minor", "Moderate", "Critical"] },
          description: { type: "string" },
          recommendation: { type: "string" },
          confidence: { type: "number" },
          photo_url: { type: "string" },
          timestamp: { type: "number" },
          severity_rationale: { type: "string" },
          review_required: { type: "boolean" },
          bbox: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "number" },
          },
          measurement: {
            type: "object",
            properties: {
              width_mm: { type: "number" },
              length_mm: { type: "number" },
              depth_mm: { type: "string" },
              reference_object: { type: "string" },
              notes: { type: "string" },
            },
          },
          agentic_pass: { type: "boolean" },
        },
      },
    },
    inspector_note: { type: "string" },
    conquas_grade: { type: "string", enum: ["Pass", "Fail", "Conditional"] },
  },
};

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
  const conquasRef = defect.conquas_appendix
    ? ` [CONQUAS: ${defect.conquas_appendix}, Item ${defect.conquas_item_id}]`
    : "";
  return `${index + 1}. [${defect.room}] ${defect.defect_type} (${defect.severity}) - ${defect.description}.${confidence}${verifyTag}${rationale}${conquasRef}`;
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

/** Compute CONQUAS grade based on defect severity distribution */
function computeConquasGrade(defects: Defect[]): "Pass" | "Fail" | "Conditional" {
  const criticalCount = defects.filter((d) => d.severity === "Critical").length;
  const moderateCount = defects.filter((d) => d.severity === "Moderate").length;
  if (criticalCount > 0) return "Fail";
  if (moderateCount > 3) return "Conditional";
  return "Pass";
}

/** Enrich a defect with CONQUAS item ID and appendix if not already set */
export function enrichDefectWithConquas(defect: Defect): Defect {
  if (defect.conquas_item_id) return defect;
  const itemId = lookupConquasItemId(defect.defect_type);
  const appendix = lookupConquasAppendix(defect.defect_type);
  if (!itemId) return defect;
  return { ...defect, conquas_item_id: itemId, conquas_appendix: appendix };
}

/** Local fallback report generation (no AI dependency) */
export function generateLocalReport(
  defects: Defect[],
  flatId: string,
  inspectionDate: string,
): InspectionReport {
  const enriched = defects.map(enrichDefectWithConquas);
  const roomScores = localRoomScores(enriched);
  const avg = roomScores.reduce((t, r) => t + r.score, 0) / roomScores.length;

  return {
    flat_id: flatId.trim() || "BTO-UNKNOWN",
    inspection_date: inspectionDate,
    overall_health_score: Math.round(avg),
    room_scores: roomScores,
    priority_defects: localPriorityDefects(enriched),
    conquas_grade: computeConquasGrade(enriched),
    inspector_note: enriched.length
      ? countVerifyOnSite(enriched) > 0
        ? `Most issues are serviceable within the defect liability window. Clear the critical items first, and verify ${countVerifyOnSite(enriched)} item${countVerifyOnSite(enriched) === 1 ? "" : "s"} on site before submission. CONQUAS grade: ${computeConquasGrade(enriched)}.`
        : `Most issues are serviceable within the defect liability window. Clear the critical items first. CONQUAS grade: ${computeConquasGrade(enriched)}.`
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

  const defectSummary = defects.map((defect, index) => formatDefectForReport(enrichDefectWithConquas(defect), index)).join("\n");
  const verifyOnSiteCount = countVerifyOnSite(defects);

  const prompt = `You are Ah Seng, a veteran BTO flat inspector in Singapore and a Digital CONQUAS Assessor. Generate a structured CONQUAS-ready inspection report.

Flat ID: ${flatId}
Inspection Date: ${inspectionDate}
Total Defects Found: ${defects.length}

${buildConquasPromptBlock()}

Defect Log:
${defectSummary || "No defects logged."}

Based on the defects and CONQUAS 2022 R2 tolerances, generate a JSON report with this exact structure:
{
  "flat_id": "${flatId}",
  "inspection_date": "${inspectionDate}",
  "overall_health_score": <number 0-100>,
  "room_scores": [
    { "room": "<room name>", "score": <number 0-100>, "summary": "<brief assessment referencing CONQUAS standards>" }
  ],
  "priority_defects": [<top 5 defect objects from the log, keeping all fields>],
  "inspector_note": "<Ah Seng's overall assessment in Singlish, referencing CONQUAS grade>",
  "conquas_grade": "Pass" | "Fail" | "Conditional"
}

Rules:
- Score rooms based on CONQUAS 2022 R2 tolerance thresholds
- Critical defects (exceeding CONQUAS limits) drop room score by 20-25 points
- Moderate defects drop by 10-15 points
- Minor defects drop by 5-8 points
- Rooms with no defects score 90-100
- Overall score is weighted average of room scores
- CONQUAS grade: "Fail" if any Critical defects, "Conditional" if >3 Moderate, else "Pass"
- Inspector note should be in Singlish, include the CONQUAS grade, and mention the most important items
- If any defect is marked "VERIFY ON SITE", explicitly mention those manual-check items in the inspector note
- For each priority_defect, include conquas_item_id and conquas_appendix fields if applicable
- Preserve fields such as severity_rationale, review_required, bbox, and measurement when copying priority_defects from the log
- Include ALL rooms from: ${ROOMS.join(", ")}

Return ONLY valid JSON, no markdown fences.`;

  const response = await client.models.generateContent({
    model: REPORT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: reportResponseSchema,
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
    priority_defects: hydratePriorityDefects(parsed.priority_defects, defects).map(enrichDefectWithConquas),
    conquas_grade: parsed.conquas_grade || computeConquasGrade(defects),
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

  const prompt = `You are Ah Seng, a veteran BTO inspector in Singapore. Write a 2-3 sentence executive summary for the cover page of an HDB ${flatType} flat inspection report. This is a CONQUAS-Ready report.

Flat ID: ${report.flat_id}
Date: ${report.inspection_date}
Overall Score: ${report.overall_health_score}/100
CONQUAS Grade: ${report.conquas_grade ?? "N/A"}
Total Defects: ${report.priority_defects.length}
Critical Issues: ${report.priority_defects.filter(d => d.severity === "Critical").length}

Write in professional English (not Singlish). Reference the CONQUAS 2022 R2 grade. Be concise and authoritative. Return ONLY the summary text, no JSON.`;

  const fallback = generateLocalCoverSummary(report, flatType);
  const result = await withRetryAndFallback(
    async () => {
      const response = await client.models.generateContent({
        model: REPORT_MODEL,
        contents: prompt,
      });

      const summary = response.text?.trim();
      if (!summary) throw new Error("Empty cover summary from Gemini");
      return summary;
    },
    fallback,
    COVER_SUMMARY_TIMEOUT_MS,
    GEMINI_SUMMARY_RETRY,
  );

  return result.data;
}

export function generateLocalCoverSummary(report: InspectionReport, flatType: FlatType): string {
  const criticalCount = report.priority_defects.filter(d => d.severity === "Critical").length;
  const score = report.overall_health_score;
  const verdict = score >= 85 ? "excellent" : score >= 70 ? "acceptable" : "below standard";
  const grade = report.conquas_grade ?? "N/A";

  return `This ${flatType} HDB unit (${report.flat_id}) achieved a structural integrity score of ${score}/100, rated ${verdict}. CONQUAS 2022 R2 assessment grade: ${grade}. ${
    criticalCount > 0
      ? `${criticalCount} critical defect${criticalCount > 1 ? "s" : ""} require${criticalCount === 1 ? "s" : ""} immediate contractor attention before handover acceptance.`
      : "No critical defects were identified during this inspection cycle."
  }`;
}
