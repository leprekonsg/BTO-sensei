import type { ConquasVerdict, Measurement } from "./types";

/**
 * CONQUAS 2022 R2 - BCA Singapore Construction Quality Standards
 * Hard-coded tolerances and item IDs for the AI reasoning engine.
 */

export interface ConquasTolerance {
  itemId: string;
  element: string;
  standard: string;
  failThreshold: string;
  unit: string;
}

export interface ConquasCategory {
  id: string;
  name: string;
  appendix: string;
  tolerances: ConquasTolerance[];
}

export interface ConquasAssessment {
  itemId: string;
  appendix: string;
  verdict: ConquasVerdict;
  metricLabel: string;
  measuredValue: number;
  threshold: number;
  unit: string;
  summary: string;
}

/** CONQUAS Appendix 4 defect groupings for edge detector labels */
export const CONQUAS_LABELS = [
  "floor_hollow",
  "wall_crack",
  "joint_misalignment",
  "tile_lippage",
  "stain_mark",
] as const;

export type ConquasLabel = (typeof CONQUAS_LABELS)[number];

/** Map AI/vision defect_type free-text to CONQUAS label */
export function matchConquasLabel(defectType: string): ConquasLabel | null {
  const t = defectType.toLowerCase();
  if (t.includes("hollow")) return "floor_hollow";
  if (t.includes("crack")) return "wall_crack";
  if (t.includes("misalign") || t.includes("alignment")) {
    return "joint_misalignment";
  }
  if (t.includes("lippage") || t.includes("lip")) return "tile_lippage";
  if (t.includes("stain") || t.includes("mark") || t.includes("water")) {
    return "stain_mark";
  }
  return null;
}

/** CONQUAS Appendix 1 tolerance categories used in the AI knowledge base */
export const CONQUAS_CATEGORIES: ConquasCategory[] = [
  {
    id: "floor-tiles",
    name: "Floor Tiles",
    appendix: "Appendix 1, Item 1a-4",
    tolerances: [
      {
        itemId: "1a-4",
        element: "Floor Tiles (Hollow Sound)",
        standard: "No hollow sound when tapped",
        failThreshold: "hollow index > 0.8",
        unit: "acoustic",
      },
    ],
  },
  {
    id: "tile-lippage",
    name: "Tile Lippage",
    appendix: "Appendix 1, Item 1c-5",
    tolerances: [
      {
        itemId: "1c-5",
        element: "Lippage between tiles",
        standard: "Not more than 0.5mm between 2 tiles",
        failThreshold: "> 0.5",
        unit: "mm",
      },
    ],
  },
  {
    id: "wall-defects",
    name: "Wall Defects",
    appendix: "Appendix 1, Item 2a",
    tolerances: [
      {
        itemId: "2a-1",
        element: "Wall Cracks",
        standard: "No visible damage/defects",
        failThreshold: "> 200mm long or > 2mm wide (Domestic Grade)",
        unit: "mm",
      },
      {
        itemId: "2a-2",
        element: "Wall Verticality",
        standard: "Not more than 3mm per meter",
        failThreshold: "> 3",
        unit: "mm/m",
      },
    ],
  },
  {
    id: "surface-evenness",
    name: "Surface Evenness",
    appendix: "Appendix 1, Item 2b",
    tolerances: [
      {
        itemId: "2b-1",
        element: "Surface Evenness",
        standard: "Not more than 3mm per 1.2m straightedge",
        failThreshold: "> 3",
        unit: "mm/1.2m",
      },
    ],
  },
  {
    id: "doors-windows",
    name: "Doors & Windows",
    appendix: "Appendix 1, Item 3a",
    tolerances: [
      {
        itemId: "3a-1",
        element: "Door Gaps",
        standard: "Not more than 5mm between leaf and frame",
        failThreshold: "> 5",
        unit: "mm",
      },
    ],
  },
];

/** Flat lookup: defect_type keyword -> CONQUAS item ID */
const ITEM_ID_MAP: Record<string, string> = {
  hollow: "1a-4",
  lippage: "1c-5",
  crack: "2a-1",
  vertical: "2a-2",
  even: "2b-1",
  door: "3a-1",
  gap: "3a-1",
};

export function lookupConquasItemId(defectType: string): string | undefined {
  const lower = defectType.toLowerCase();
  for (const [keyword, itemId] of Object.entries(ITEM_ID_MAP)) {
    if (lower.includes(keyword)) return itemId;
  }
  return undefined;
}

export function lookupConquasAppendix(defectType: string): string | undefined {
  const itemId = lookupConquasItemId(defectType);
  if (!itemId) return undefined;
  for (const category of CONQUAS_CATEGORIES) {
    for (const tolerance of category.tolerances) {
      if (tolerance.itemId === itemId) return category.appendix;
    }
  }
  return undefined;
}

/** Build the CONQUAS tolerance block for Gemini system prompt injection */
export function buildConquasPromptBlock(): string {
  const lines = [
    "CONQUAS 2022 R2 TOLERANCES (BCA Singapore):",
    "You must reference these official standards when assessing defect severity.",
  ];

  for (const category of CONQUAS_CATEGORIES) {
    for (const tolerance of category.tolerances) {
      lines.push(
        `- ${tolerance.element} (${category.appendix}): ${tolerance.standard}. FAIL if ${tolerance.failThreshold}.`,
      );
    }
  }

  lines.push(
    "",
    "CONQUAS WORKFLOW BRANCHES:",
    "Apply the correct assessment workflow based on the defect type detected:",
    "",
    "1. FLOOR TILES / HOLLOW (Item 1a-4): Acoustic tap analysis. hollow index > 0.8 = FAIL.",
    "   Check for debonding pattern across adjacent tiles. Mark cluster boundaries.",
    "",
    "2. TILE LIPPAGE (Item 1c-5): Shadow-line analysis at tile joints.",
    "   Visible step between adjacent tiles > 0.5mm = FAIL.",
    "   Use coin reference to estimate lip height if measurement mode active.",
    "",
    "3. WALL VERTICALITY (Item 2a-2): Plumb-line / vertical-edge analysis.",
    "   Deviation > 3mm per meter = FAIL.",
    "   Check door/window frame squareness as secondary indicator.",
    "",
    "4. SURFACE EVENNESS (Item 2b-1): Straightedge / shadow-gap analysis.",
    "   Undulation > 3mm per 1.2m span = FAIL.",
    "   Look for paint pooling or light reflection anomalies.",
    "",
    "5. DOOR / WINDOW GAPS (Item 3a-1): Gap measurement between leaf and frame.",
    "   Gap > 5mm = FAIL. Use SG 10-cent coin (18.5mm) as scale reference.",
    "   Check all four edges: top, bottom, latch side, hinge side.",
    "",
    "When logging a defect, include the CONQUAS Item ID (e.g. Appendix 1, Item 1c-5) in the severity_rationale.",
    "Assess severity based on whether the defect exceeds the CONQUAS tolerance threshold.",
  );

  return lines.join("\n");
}

/** Acoustic CONQUAS check: does the hollow index exceed the CONQUAS threshold? */
export function isHollowExceedingConquas(hollowRatio: number): boolean {
  return hollowRatio > 0.8;
}

/** CONQUAS severity for acoustic result */
export function acousticConquasSeverity(
  hollowRatio: number,
): "Minor" | "Critical" {
  return isHollowExceedingConquas(hollowRatio) ? "Critical" : "Minor";
}

/** Door gap compliance per CONQUAS Appendix 1, Item 3a-1 (max 5mm) */
export function isDoorGapCompliant(gapMm: number): boolean {
  return gapMm <= 5;
}

/** Lippage compliance per CONQUAS Appendix 1, Item 1c-5 (max 0.5mm) */
export function isLippageCompliant(lippageMm: number): boolean {
  return lippageMm <= 0.5;
}

/** Wall verticality compliance per CONQUAS Appendix 1, Item 2a-2 (max 3mm/m) */
export function isVerticalityCompliant(deviationMmPerM: number): boolean {
  return deviationMmPerM <= 3;
}

/** Surface evenness compliance per CONQUAS Appendix 1, Item 2b-1 (max 3mm/1.2m) */
export function isSurfaceEvennessCompliant(deviationMm: number): boolean {
  return deviationMm <= 3;
}

function createAssessment(
  itemId: string,
  appendix: string,
  verdict: ConquasVerdict,
  metricLabel: string,
  measuredValue: number,
  threshold: number,
  unit: string,
): ConquasAssessment {
  return {
    itemId,
    appendix,
    verdict,
    metricLabel,
    measuredValue,
    threshold,
    unit,
    summary:
      `${metricLabel}: ${verdict} per ${appendix} ` +
      `(${measuredValue}${unit} vs limit ${threshold}${unit}).`,
  };
}

export function assessConquasCompliance(
  defectType: string,
  measurement?: Measurement,
): ConquasAssessment | null {
  if (!measurement) return null;

  const normalizedType = defectType.toLowerCase();

  if (
    /door|window/.test(normalizedType) &&
    /gap|frame|leaf/.test(normalizedType)
  ) {
    const gapMm = measurement.gap_mm ?? measurement.width_mm;
    if (typeof gapMm === "number" && Number.isFinite(gapMm)) {
      return createAssessment(
        "3a-1",
        "Appendix 1, Item 3a-1",
        isDoorGapCompliant(gapMm) ? "PASS" : "FAIL",
        "Door/window gap",
        gapMm,
        5,
        "mm",
      );
    }
  }

  if (
    /lippage|joint[_\s-]?misalignment|tile lip|uneven tile/.test(
      normalizedType,
    )
  ) {
    const lippageMm = measurement.lippage_mm ?? measurement.width_mm;
    if (typeof lippageMm === "number" && Number.isFinite(lippageMm)) {
      return createAssessment(
        "1c-5",
        "Appendix 1, Item 1c-5",
        isLippageCompliant(lippageMm) ? "PASS" : "FAIL",
        "Tile lippage",
        lippageMm,
        0.5,
        "mm",
      );
    }
  }

  if (/vertical|plumb|out of plumb|misaligned frame/.test(normalizedType)) {
    const verticalityMmPerM =
      measurement.verticality_mm_per_m ?? measurement.width_mm;
    if (
      typeof verticalityMmPerM === "number" &&
      Number.isFinite(verticalityMmPerM)
    ) {
      return createAssessment(
        "2a-2",
        "Appendix 1, Item 2a-2",
        isVerticalityCompliant(verticalityMmPerM) ? "PASS" : "FAIL",
        "Wall/frame verticality",
        verticalityMmPerM,
        3,
        "mm/m",
      );
    }
  }

  if (/surface even|undulation|uneven surface|waviness/.test(normalizedType)) {
    const surfaceEvennessMm =
      measurement.surface_evenness_mm ?? measurement.width_mm;
    if (
      typeof surfaceEvennessMm === "number" &&
      Number.isFinite(surfaceEvennessMm)
    ) {
      return createAssessment(
        "2b-1",
        "Appendix 1, Item 2b-1",
        isSurfaceEvennessCompliant(surfaceEvennessMm) ? "PASS" : "FAIL",
        "Surface evenness",
        surfaceEvennessMm,
        3,
        "mm",
      );
    }
  }

  return null;
}
