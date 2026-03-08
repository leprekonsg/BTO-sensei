import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CanvasDetector } from "../lib/vision/canvas-detector";
import { filterDetectorBoxes } from "../lib/vision/defect-class-filter";
import type { Detector } from "../lib/vision/detector-types";
import {
  DEFAULT_DETECTOR_CONFIG,
  type DetectorStatus,
} from "../lib/vision/detector-types";
import { FrameScheduler } from "../lib/vision/frame-scheduler";
import {
  DetectionTracker,
  type TrackedDetection,
} from "../lib/vision/tracking";

interface UseHudDetectorOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  targetFps?: number;
  onDetections?: (detections: TrackedDetection[]) => void;
}

export interface UseHudDetectorReturn {
  detectorStatus: DetectorStatus;
  liveDetections: TrackedDetection[];
  fps: number;
  warmUpProgress: number;
}

/** Mutable snapshot updated from the rAF loop; subscribers get batched re-renders. */
interface DetectorSnapshot {
  detectorStatus: DetectorStatus;
  liveDetections: TrackedDetection[];
  fps: number;
  warmUpProgress: number;
}

const IDLE_SNAPSHOT: DetectorSnapshot = {
  detectorStatus: "idle",
  liveDetections: [],
  fps: 0,
  warmUpProgress: 0,
};

async function createPreferredDetector(): Promise<Detector> {
  const fallback = new CanvasDetector();

  if (typeof window === "undefined") {
    await fallback.initialize();
    return fallback;
  }

  // v12: Try ONNX YOLO26N first
  try {
    const onnxModule = await import("../lib/vision/onnx-detector");
    if (await onnxModule.isOnnxYolo26ReadyForRuntime()) {
      const detector: Detector = new onnxModule.OnnxYolo26Detector();
      await detector.initialize();
      if (detector.status !== "unavailable" && detector.status !== "error") {
        return detector;
      }
      detector.dispose();
    }
  } catch {
    // Fall through to TF.js YOLO.
  }

  // Try TF.js YOLO11n
  try {
    const yoloModule = await import("../lib/vision/yolo-conquas");
    if (await yoloModule.isYoloConquasReadyForRuntime()) {
      const detector: Detector = new yoloModule.YoloConquasDetector();
      await detector.initialize();
      if (detector.status !== "unavailable" && detector.status !== "error") {
        return detector;
      }
      detector.dispose();
    }
  } catch {
    // Fall through to the lightweight canvas detector.
  }

  await fallback.initialize();
  return fallback;
}

function createDetectorStore() {
  let snapshot: DetectorSnapshot = IDLE_SNAPSHOT;
  const listeners = new Set<() => void>();

  function emit(next: DetectorSnapshot) {
    snapshot = next;
    for (const fn of listeners) fn();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    emit,
    reset: () => emit(IDLE_SNAPSHOT),
  };
}

export function useHudDetector({
  videoRef,
  enabled,
  targetFps = DEFAULT_DETECTOR_CONFIG.targetFps,
  onDetections,
}: UseHudDetectorOptions): UseHudDetectorReturn {
  const [store] = useState(createDetectorStore);
  const onDetectionsRef = useRef(onDetections);
  const busyRef = useRef(false);

  useEffect(() => {
    onDetectionsRef.current = onDetections;
  });

  useEffect(() => {
    const { emit, reset } = store;

    if (!enabled) {
      reset();
      return;
    }

    const scheduler = new FrameScheduler(targetFps);
    const tracker = new DetectionTracker(0.3, 8);
    let disposed = false;
    let activeDetector: Detector | null = null;

    void (async () => {
      try {
        emit({ ...IDLE_SNAPSHOT, detectorStatus: "warming-up" });
        activeDetector = await createPreferredDetector();
        if (disposed) return;

        emit({ ...IDLE_SNAPSHOT, detectorStatus: activeDetector.status });

        scheduler.start((frame) => {
          if (busyRef.current || disposed) return;
          const video = videoRef.current;
          const detector = activeDetector;
          if (!detector || !video || video.videoWidth === 0) return;

          busyRef.current = true;
          void detector
            .detect(video)
            .then((result) => {
              if (disposed) return;
              // v12: filter dimensional labels and annotate app-safe defectClass
              const filtered = filterDetectorBoxes(result.boxes);
              const tracked = tracker.update(filtered, frame);
              const warmUpProgress =
                detector.status === "warming-up"
                  ? Math.min(1, frame / DEFAULT_DETECTOR_CONFIG.warmUpFrames)
                  : 1;

              emit({
                detectorStatus: detector.status,
                liveDetections: tracked,
                fps: scheduler.fps,
                warmUpProgress,
              });

              onDetectionsRef.current?.(tracked);
            })
            .catch(() => {
              // Frame error; continue the next scheduled iteration.
            })
            .finally(() => {
              busyRef.current = false;
            });
        });
      } catch {
        if (!disposed) {
          emit({ ...IDLE_SNAPSHOT, detectorStatus: "unavailable" });
        }
      }
    })();

    return () => {
      disposed = true;
      scheduler.stop();
      activeDetector?.dispose();
      store.reset();
    };
  }, [enabled, targetFps, videoRef, store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return snapshot;
}
