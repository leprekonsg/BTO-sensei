import { clampBBox } from "../defect-utils.ts";
import type {
  HudAnchor,
  HudAnchorStatus,
  HudDetection,
  HudSupport,
  HudTapPoint,
} from "../types.ts";
import type { DetectorStatus } from "./detector-types.ts";
import type { TrackedDetection } from "./tracking.ts";

function nextHudId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function detectWebGlSupport() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getHudSupport(detectorStatus?: DetectorStatus): HudSupport {
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const hasWebGl = detectWebGlSupport();
  const backend = hasWebGpu ? "webgpu" as const : hasWebGl ? "webgl" as const : "none" as const;

  if (detectorStatus === "ready" || detectorStatus === "running") {
    return {
      mode: "auto",
      backend,
      reason: "Live edge detector active. Auto-detected anomalies appear as pending pills.",
    };
  }

  if (detectorStatus === "warming-up") {
    return {
      mode: "auto",
      backend,
      reason: "Edge detector warming up. Detections will appear shortly.",
    };
  }

  if (detectorStatus === "error" || detectorStatus === "unavailable") {
    return {
      mode: "auto-fallback",
      backend,
      reason: "Live detector unavailable on this device. Tap to mark defects manually.",
    };
  }

  return {
    mode: "manual",
    backend,
    reason: "Tap to mark defects and trigger ROI analysis manually.",
  };
}

/** Convert a tracked detection from the frame loop into a HudDetection. */
export function trackedToHudDetection(tracked: TrackedDetection): HudDetection {
  const bbox = clampBBox(tracked.bbox) ?? [0, 0, 180, 180] as [number, number, number, number];
  return {
    id: tracked.id,
    bbox,
    score: tracked.score,
    label_hint: tracked.label,
    stability: tracked.stability,
    last_seen_at: Date.now(),
    source: "canvas-detector",
    defectClass: tracked.defectClass,
  };
}

export function createManualHudDetection(point: HudTapPoint, boxSize = 180): HudDetection {
  const half = Math.round(boxSize / 2);
  const bbox = clampBBox([point.y - half, point.x - half, point.y + half, point.x + half]) ?? [0, 0, 180, 180];

  return {
    id: nextHudId("hud-detection"),
    bbox,
    score: 0.78,
    label_hint: "Manual mark",
    stability: 1,
    last_seen_at: point.timestamp,
    source: "manual",
  };
}

export function buildHudAnchor(
  detection: HudDetection,
  index: number,
  status: HudAnchorStatus,
  overrides: Partial<Pick<HudAnchor, "id" | "title" | "subtitle" | "defect_id" | "review_required">> = {},
): HudAnchor {
  const [, xMin, yMax, xMax] = detection.bbox;
  const yMin = detection.bbox[0];
  const centerX = (xMin + xMax) / 2;
  const centerY = (yMin + yMax) / 2;
  const side = centerX < 500 ? "right" : "left";
  const horizontalBias = side === "right" ? xMax / 10 + 6 : xMin / 10 - 26;
  const verticalOffset = ((index % 3) - 1) * 10;

  return {
    id: overrides.id ?? nextHudId("hud-anchor"),
    detection_id: detection.id,
    bbox: detection.bbox,
    x: clampPercent(horizontalBias, 4, 74),
    y: clampPercent(centerY / 10 - 7 + verticalOffset, 10, 78),
    side,
    status,
    title: overrides.title ?? "Manual mark",
    subtitle: overrides.subtitle ?? "Tap to inspect this ROI",
    defect_id: overrides.defect_id,
    review_required: overrides.review_required,
  };
}
