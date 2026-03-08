import type { AppDefectClass } from "../types";
import type { DetectorBox } from "./detector-types";

/**
 * v12: Map raw detector labels to app-safe defect classes.
 *
 * App-facing visual classes: crack, stain, spalling, delamination.
 * Dimensional and acoustic-only labels are suppressed from the live optical
 * path - those stay manual-assist or acoustic-only.
 */

const RAW_LABEL_MAP: Record<string, AppDefectClass> = {
  wall_crack: "crack",
  crack: "crack",
  hairline_crack: "crack",
  structural_crack: "crack",
  stain_mark: "stain",
  stain: "stain",
  water_stain: "stain",
  discoloration: "stain",
  paint_spalling: "spalling",
  spalling: "spalling",
  paint_defect: "spalling",
  delamination: "delamination",
  paint_peel: "delamination",
  surface_peel: "delamination",
};

const SUPPRESSED_LABELS = new Set([
  "floor_hollow",
  "hollow",
  "tile_lippage",
  "lippage",
  "joint_misalignment",
  "misalignment",
  "gap",
  "surface_evenness",
  "verticality",
]);

export function mapToAppDefectClass(rawLabel: string): AppDefectClass | null {
  const key = rawLabel.toLowerCase().replace(/\s+/g, "_");
  return RAW_LABEL_MAP[key] ?? null;
}

export function formatAppDefectClass(defectClass: AppDefectClass): string {
  switch (defectClass) {
    case "crack":
      return "Crack";
    case "stain":
      return "Stain";
    case "spalling":
      return "Spalling";
    case "delamination":
      return "Delamination";
  }
}

export function isDimensionalLabel(rawLabel: string): boolean {
  return SUPPRESSED_LABELS.has(rawLabel.toLowerCase().replace(/\s+/g, "_"));
}

/**
 * Filter and annotate detector boxes with app-safe defect classes.
 * Only app-safe visual classes are allowed through the live optical path.
 */
export function filterDetectorBoxes(boxes: DetectorBox[]): DetectorBox[] {
  return boxes
    .filter((box) => !isDimensionalLabel(box.label))
    .map((box) => {
      const defectClass = mapToAppDefectClass(box.label) ?? box.defectClass;
      return {
        ...box,
        rawLabel: box.label,
        defectClass,
      };
    })
    .filter((box) => box.defectClass !== undefined);
}
