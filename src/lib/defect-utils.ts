import {
  assessConquasCompliance,
  lookupConquasAppendix,
  lookupConquasItemId,
} from "./conquas.ts";
import type { Defect, Measurement, Severity } from "./types";

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

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function normalizeMeasurement(
  measurement?: Partial<Measurement> | null,
): Measurement | undefined {
  if (!measurement || typeof measurement !== "object") {
    return undefined;
  }

  const normalized: Measurement = {
    reference_object:
      typeof measurement.reference_object === "string" &&
      measurement.reference_object.trim().length > 0
        ? measurement.reference_object
        : "Unknown reference",
    notes: typeof measurement.notes === "string" ? measurement.notes : "",
  };

  const widthMm = toFiniteNumber(measurement.width_mm);
  if (widthMm !== undefined) normalized.width_mm = widthMm;

  const lengthMm = toFiniteNumber(measurement.length_mm);
  if (lengthMm !== undefined) normalized.length_mm = lengthMm;

  if (typeof measurement.depth_mm === "string" && measurement.depth_mm.trim().length > 0) {
    normalized.depth_mm = measurement.depth_mm;
  }

  const gapMm = toFiniteNumber(measurement.gap_mm);
  if (gapMm !== undefined) normalized.gap_mm = gapMm;

  const lippageMm = toFiniteNumber(measurement.lippage_mm);
  if (lippageMm !== undefined) normalized.lippage_mm = lippageMm;

  const verticalityMmPerM = toFiniteNumber(measurement.verticality_mm_per_m);
  if (verticalityMmPerM !== undefined) {
    normalized.verticality_mm_per_m = verticalityMmPerM;
  }

  const surfaceEvennessMm = toFiniteNumber(measurement.surface_evenness_mm);
  if (surfaceEvennessMm !== undefined) {
    normalized.surface_evenness_mm = surfaceEvennessMm;
  }

  return normalized;
}

function appendRationale(existing: string | undefined, addition: string): string {
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing} ${addition}`;
}

export function validateSeverity(defect: Defect): Defect {
  const next: Defect = {
    ...defect,
    bbox: clampBBox(defect.bbox),
    measurement: normalizeMeasurement(defect.measurement),
    conquas_item_id:
      defect.conquas_item_id ?? lookupConquasItemId(defect.defect_type),
    conquas_appendix:
      defect.conquas_appendix ?? lookupConquasAppendix(defect.defect_type),
  };
  const typeLower = next.defect_type.toLowerCase();
  const descLower = next.description.toLowerCase();
  const assessment = assessConquasCompliance(next.defect_type, next.measurement);

  if (assessment) {
    next.conquas_item_id = assessment.itemId;
    next.conquas_appendix = assessment.appendix;
    next.conquas_verdict = assessment.verdict;
    next.severity_rationale = appendRationale(
      next.severity_rationale,
      assessment.summary,
    );

    if (assessment.verdict === "FAIL") {
      next.review_required = true;
      if (next.severity === "Minor") {
        next.severity = "Moderate";
      }
    }
  }

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
