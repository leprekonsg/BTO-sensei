import { useCallback, useEffect, useRef } from "react";
import { requestDwellExplanation } from "../lib/vision/dwell-explainer";
import { clampBBox } from "../lib/defect-utils";
import { useBTOStore } from "../lib/store";
import type { ExplanationQueueItem, VisualExplanationResult } from "../lib/types";
import type { TrackedDetection } from "../lib/vision/tracking";

/**
 * v12: Dwell-triggered crop explanation hook.
 *
 * Monitors tracked detections. When a detection remains stable
 * (stability >= threshold) for >= dwellMs, automatically crops the
 * region from the video, sends it to the cloud explainer, and queues
 * the result in the store. Never blocks overlay rendering.
 */

interface UseDwellExplanationOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  resetKey?: string | number;
  dwellMs?: number;
  stabilityThreshold?: number;
  onExplanation?: (
    detectionId: string,
    result: VisualExplanationResult,
    cropDataUrl: string,
  ) => void;
}

const DEFAULT_DWELL_MS = 1000;
const DEFAULT_STABILITY_THRESHOLD = 0.7;

function nextQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `expl-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

export function useDwellExplanation({
  videoRef,
  enabled,
  resetKey,
  dwellMs = DEFAULT_DWELL_MS,
  stabilityThreshold = DEFAULT_STABILITY_THRESHOLD,
  onExplanation,
}: UseDwellExplanationOptions) {
  const dwellTimers = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());
  const explained = useRef(new Set<string>());
  const onExplanationRef = useRef(onExplanation);
  useEffect(() => {
    onExplanationRef.current = onExplanation;
  });

  useEffect(() => {
    for (const timer of dwellTimers.current.values()) {
      window.clearTimeout(timer);
    }
    dwellTimers.current.clear();
    inflight.current.clear();
    explained.current.clear();
  }, [enabled, resetKey]);

  const enqueueExplanation = useBTOStore((s) => s.enqueueExplanation);
  const updateExplanation = useBTOStore((s) => s.updateExplanation);

  const cropDetection = useCallback((bbox: [number, number, number, number]): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const normalized = clampBBox(bbox) ?? bbox;
    const [yMin, xMin, yMax, xMax] = normalized;
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const boxW = ((xMax - xMin) / 1000) * srcW;
    const boxH = ((yMax - yMin) / 1000) * srcH;
    const padX = Math.max(16, Math.round(boxW * 0.15));
    const padY = Math.max(16, Math.round(boxH * 0.15));
    const sx = Math.max(0, Math.round((xMin / 1000) * srcW) - padX);
    const sy = Math.max(0, Math.round((yMin / 1000) * srcH) - padY);
    const sw = Math.min(srcW - sx, Math.round(boxW) + padX * 2);
    const sh = Math.min(srcH - sy, Math.round(boxH) + padY * 2);

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, [videoRef]);

  /**
   * Called by the detection loop for each frame's tracked detections.
   * Manages dwell timers and triggers explanation requests.
   */
  const onDetectionsUpdate = useCallback((detections: TrackedDetection[]) => {
    if (!enabled) return;

    const activeIds = new Set(detections.map((d) => d.id));

    // Clear per-track state once a detection disappears from the live set.
    for (const [id, timer] of dwellTimers.current) {
      if (!activeIds.has(id)) {
        window.clearTimeout(timer);
        dwellTimers.current.delete(id);
      }
    }
    for (const id of explained.current) {
      if (!activeIds.has(id)) {
        explained.current.delete(id);
      }
    }

    for (const detection of detections) {
      if (detection.stability < stabilityThreshold) continue;
      if (dwellTimers.current.has(detection.id)) continue;
      if (inflight.current.has(detection.id)) continue;
      if (explained.current.has(detection.id)) continue;

      const detId = detection.id;
      const bbox = detection.bbox;

      const timer = window.setTimeout(() => {
        dwellTimers.current.delete(detId);

        if (inflight.current.has(detId)) return;
        inflight.current.add(detId);

        const cropUrl = cropDetection(bbox);
        if (!cropUrl) {
          inflight.current.delete(detId);
          return;
        }

        const queueItem: ExplanationQueueItem = {
          id: nextQueueId(),
          detectionId: detId,
          cropDataUrl: cropUrl,
          status: "in-flight",
          result: null,
          retries: 0,
          createdAt: Date.now(),
        };

        enqueueExplanation(queueItem);

        void requestDwellExplanation(cropUrl)
          .then((result) => {
            updateExplanation(queueItem.id, { status: "completed", result });
            explained.current.add(detId);
            onExplanationRef.current?.(detId, result, cropUrl);
          })
          .catch(() => {
            updateExplanation(queueItem.id, { status: "failed" });
          })
          .finally(() => {
            inflight.current.delete(detId);
          });
      }, dwellMs);

      dwellTimers.current.set(detId, timer);
    }
  }, [enabled, stabilityThreshold, dwellMs, cropDetection, enqueueExplanation, updateExplanation]);

  return { onDetectionsUpdate };
}
