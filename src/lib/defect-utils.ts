import type { Defect, Severity } from "./types";

export interface VisionLikeResponse {
  defect_type?: string;
  severity?: Severity | string;
  severity_rationale?: string;
  description?: string;
  recommendation?: string;
  confidence?: number;
  bbox?: [number, number, number, number] | [number | string, number | string, number | string, number | string] | null;
}

const VALID_SEVERITIES: Severity[] = ["Minor", "Moderate", "Critical"];

export function normalizeSeverity(value: unknown): Severity | undefined {
  return VALID_SEVERITIES.includes(value as Severity) ? (value as Severity) : undefined;
}

export function buildInvalidSeverityRationale(source: string, original?: string): string {
  const suffix = original ? ` Original rationale: ${original}` : "";
  return `${source} returned an invalid severity. Defaulted to Moderate and flagged for manual review.${suffix}`;
}

export function clampBBox(
  bbox?: [number, number, number, number] | [number | string, number | string, number | string, number | string] | null,
): [number, number, number, number] | undefined {
  if (!Array.isArray(bbox) || bbox.length !== 4) return undefined;

  const [yMinRaw, xMinRaw, yMaxRaw, xMaxRaw] = bbox.map((value) => Number(value));
  if ([yMinRaw, xMinRaw, yMaxRaw, xMaxRaw].some((value) => !Number.isFinite(value))) {
    return undefined;
  }

  let yMin = Math.max(0, Math.min(1000, Math.round(yMinRaw)));
  let xMin = Math.max(0, Math.min(1000, Math.round(xMinRaw)));
  let yMax = Math.max(0, Math.min(1000, Math.round(yMaxRaw)));
  let xMax = Math.max(0, Math.min(1000, Math.round(xMaxRaw)));

  if (yMax < yMin) [yMin, yMax] = [yMax, yMin];
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];

  return [yMin, xMin, yMax, xMax];
}

export function needsAgenticPass(defect: Defect, measureMode: boolean): boolean {
  const typeLower = defect.defect_type.toLowerCase();
  return defect.confidence < 0.6 || measureMode || ((/crack|seepage|leak|water/i.test(typeLower)) && defect.severity === "Minor");
}

export function validateSeverity(defect: Defect): Defect {
  const next: Defect = {
    ...defect,
    bbox: clampBBox(defect.bbox),
  };
  const typeLower = next.defect_type.toLowerCase();
  const descLower = next.description.toLowerCase();

  if (/water|seepage|leak/i.test(typeLower) && next.severity !== "Critical") {
    next.severity = "Critical";
    next.review_required = true;
    next.severity_rationale = `Upgraded to Critical: water/seepage defects require immediate attention. Original: ${next.severity_rationale ?? "none"}`;
  }

  if (/hollow/i.test(typeLower) && next.severity !== "Minor") {
    const hasSecondarySignals = /crack|lippage|loose|broken|displacement/i.test(descLower);
    if (!hasSecondarySignals) {
      next.severity = "Minor";
      next.review_required = true;
      next.severity_rationale = `Capped to Minor: hollow tile without secondary signals (crack/lippage/looseness). ${next.severity_rationale ?? ""}`.trim();
    }
  }

  if (next.confidence < 0.5) {
    next.review_required = true;
    if (!next.severity_rationale) {
      next.severity_rationale = "Low-confidence classification. Verify on site.";
    }
  }

  return next;
}

export function mergeVisionUpdate(defect: Defect, update: Partial<VisionLikeResponse>): Defect {
  const nextSeverity = normalizeSeverity(update.severity) ?? defect.severity;
  const invalidSeverity = update.severity !== undefined && !normalizeSeverity(update.severity);

  return validateSeverity({
    ...defect,
    defect_type: update.defect_type || defect.defect_type,
    severity: nextSeverity,
    severity_rationale: invalidSeverity
      ? buildInvalidSeverityRationale("Agentic pass", defect.severity_rationale)
      : update.severity_rationale || defect.severity_rationale,
    description: update.description || defect.description,
    recommendation: update.recommendation || defect.recommendation,
    confidence: typeof update.confidence === "number" ? update.confidence : defect.confidence,
    bbox: update.bbox === null ? undefined : clampBBox(update.bbox) ?? defect.bbox,
    review_required: invalidSeverity ? true : defect.review_required,
  });
}
