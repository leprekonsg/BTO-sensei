import type { DetectorBox } from "./detector-types";

export interface TrackedDetection {
  id: string;
  bbox: [number, number, number, number];
  score: number;
  label: string;
  framesSeen: number;
  lastSeenFrame: number;
  stability: number;
}

function computeIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const interYMin = Math.max(a[0], b[0]);
  const interXMin = Math.max(a[1], b[1]);
  const interYMax = Math.min(a[2], b[2]);
  const interXMax = Math.min(a[3], b[3]);

  if (interYMin >= interYMax || interXMin >= interXMax) return 0;

  const interArea = (interYMax - interYMin) * (interXMax - interXMin);
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  const bArea = (b[2] - b[0]) * (b[3] - b[1]);
  const unionArea = aArea + bArea - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

export class DetectionTracker {
  private tracked = new Map<string, TrackedDetection>();
  private nextId = 0;
  private iouThreshold: number;
  private maxAge: number;

  constructor(iouThreshold = 0.3, maxAge = 8) {
    this.iouThreshold = iouThreshold;
    this.maxAge = maxAge;
  }

  update(boxes: DetectorBox[], frame: number): TrackedDetection[] {
    const matched = new Set<string>();
    const result: TrackedDetection[] = [];

    for (const box of boxes) {
      let bestMatch: TrackedDetection | null = null;
      let bestIoU = 0;

      for (const [id, tracked] of this.tracked) {
        if (matched.has(id)) continue;
        const iou = computeIoU(box.bbox, tracked.bbox);
        if (iou > this.iouThreshold && iou > bestIoU) {
          bestMatch = tracked;
          bestIoU = iou;
        }
      }

      if (bestMatch) {
        matched.add(bestMatch.id);
        const updated: TrackedDetection = {
          ...bestMatch,
          bbox: box.bbox,
          score: box.score,
          label: box.label,
          framesSeen: bestMatch.framesSeen + 1,
          lastSeenFrame: frame,
          stability: Math.min(1, bestMatch.stability + 0.12),
        };
        this.tracked.set(bestMatch.id, updated);
        result.push(updated);
      } else {
        const id = `auto-${this.nextId++}`;
        const entry: TrackedDetection = {
          id,
          bbox: box.bbox,
          score: box.score,
          label: box.label,
          framesSeen: 1,
          lastSeenFrame: frame,
          stability: 0.1,
        };
        this.tracked.set(id, entry);
        result.push(entry);
      }
    }

    for (const [id, tracked] of this.tracked) {
      if (frame - tracked.lastSeenFrame > this.maxAge) {
        this.tracked.delete(id);
      }
    }

    return result;
  }

  reset() {
    this.tracked.clear();
    this.nextId = 0;
  }
}
