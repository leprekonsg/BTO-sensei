import { clampBBox } from "../defect-utils";
import { CONQUAS_LABELS, type ConquasLabel } from "../conquas";
import { mapToAppDefectClass } from "./defect-class-filter";
import type {
  Detector,
  DetectorBackend,
  DetectorBox,
  DetectorResult,
  DetectorStatus,
} from "./detector-types";

/**
 * YOLO11n (Nano) detector running on TensorFlow.js.
 *
 * Classification labels match CONQUAS Appendix 4 defect groupings:
 *   floor_hollow, wall_crack, joint_misalignment, tile_lippage, stain_mark
 *
 * The model is expected at /models/yolo11n-conquas/model.json (TFJS Graph Model).
 * If the feature flag, dependency, or model is unavailable, `initialize()`
 * sets status to "unavailable" and the HUD detector falls back to CanvasDetector.
 */

const MODEL_INPUT_SIZE = 640;
const MODEL_PATH = "/models/yolo11n-conquas/model.json";
const YOLO_HUD_ENABLED =
  (import.meta.env?.VITE_ENABLE_YOLO_HUD as string | undefined) === "true";

/** Map class index to CONQUAS Appendix 4 label */
const CLASS_MAP: ConquasLabel[] = [...CONQUAS_LABELS];

interface TFGraphModel {
  predict(input: unknown): unknown;
  dispose(): void;
}

interface TFTensor {
  data(): Promise<Float32Array>;
  shape: number[];
  dispose(): void;
}

type TFInstance = {
  loadGraphModel(path: string): Promise<TFGraphModel>;
  browser: {
    fromPixels(
      source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    ): TFTensor;
  };
  image: {
    resizeBilinear(tensor: TFTensor, size: [number, number]): TFTensor;
  };
  expandDims(tensor: TFTensor, axis: number): TFTensor;
  div(tensor: TFTensor, scalar: number): TFTensor;
  tidy<T>(fn: () => T): T;
  dispose(tensor: TFTensor): void;
  setBackend(backend: string): Promise<boolean>;
  getBackend(): string;
  ready(): Promise<void>;
};

/** Lazy reference to @tensorflow/tfjs - loaded at runtime */
let _tf: TFInstance | null = null;
let _modelAvailabilityPromise: Promise<boolean> | null = null;

async function checkModelAvailability(): Promise<boolean> {
  if (!YOLO_HUD_ENABLED || typeof window === "undefined" || typeof fetch !== "function") {
    return false;
  }

  try {
    const response = await fetch(MODEL_PATH, {
      method: "HEAD",
      cache: "no-store",
    });
    if (response.ok) return true;
  } catch {
    // Some hosts do not support HEAD for static assets.
  }

  try {
    const response = await fetch(MODEL_PATH, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isYoloConquasReadyForRuntime(): Promise<boolean> {
  if (!_modelAvailabilityPromise) {
    _modelAvailabilityPromise = checkModelAvailability();
  }

  return _modelAvailabilityPromise;
}

async function loadTF(): Promise<TFInstance | null> {
  if (_tf) return _tf;
  try {
    // Dynamic import keeps tfjs out of the main bundle until the detector is enabled.
    const tfjsModule = "@tensorflow/tfjs";
    const mod = await (Function("m", "return import(m)")(tfjsModule) as Promise<Record<string, unknown>>);
    _tf = (mod.default ?? mod) as unknown as TFInstance;
    return _tf;
  } catch {
    return null;
  }
}

export class YoloConquasDetector implements Detector {
  readonly id = "yolo11n-conquas";
  private _status: DetectorStatus = "idle";
  private _backend: DetectorBackend = "none";
  private model: TFGraphModel | null = null;
  private tf: TFInstance | null = null;
  private confidenceThreshold: number;
  private maxDetections: number;

  constructor(options?: { confidenceThreshold?: number; maxDetections?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.35;
    this.maxDetections = options?.maxDetections ?? 10;
  }

  get status() {
    return this._status;
  }

  get backend() {
    return this._backend;
  }

  async initialize(): Promise<void> {
    this._status = "warming-up";

    if (!(await isYoloConquasReadyForRuntime())) {
      this._status = "unavailable";
      return;
    }

    const tf = await loadTF();
    if (!tf) {
      this._status = "unavailable";
      return;
    }
    this.tf = tf;

    for (const candidate of ["webgpu", "webgl", "cpu"] as const) {
      try {
        await tf.setBackend(candidate);
        await tf.ready();
        break;
      } catch {
        continue;
      }
    }

    const activeBackend = tf.getBackend();
    this._backend =
      activeBackend === "webgpu"
        ? "webgpu"
        : activeBackend === "webgl"
          ? "webgl"
          : "wasm";

    try {
      this.model = await tf.loadGraphModel(MODEL_PATH);
      this._status = "ready";
    } catch {
      this._status = "unavailable";
    }
  }

  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<DetectorResult> {
    if (!this.tf || !this.model) {
      return { boxes: [], frameTimeMs: 0 };
    }

    const tf = this.tf;
    const start = performance.now();
    this._status = "running";

    try {
      const rawOutput = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(source);
        const resized = tf.image.resizeBilinear(pixels, [
          MODEL_INPUT_SIZE,
          MODEL_INPUT_SIZE,
        ]);
        const normalized = tf.div(resized, 255);
        const batched = tf.expandDims(normalized, 0);
        return this.model!.predict(batched) as TFTensor;
      });

      const data = await (rawOutput as TFTensor).data();
      const shape = (rawOutput as TFTensor).shape;
      tf.dispose(rawOutput as TFTensor);

      const boxes = this.postProcess(data, shape);
      this._status = "ready";
      return { boxes, frameTimeMs: performance.now() - start };
    } catch {
      this._status = "ready";
      return { boxes: [], frameTimeMs: performance.now() - start };
    }
  }

  /**
   * Expected shape: [1, numClasses + 4, numDetections]
   * Each detection: [cx, cy, w, h, class_scores...]
   */
  private postProcess(data: Float32Array, shape: number[]): DetectorBox[] {
    const numClasses = CLASS_MAP.length;
    const numDetections = shape[2] ?? 0;
    const boxes: DetectorBox[] = [];

    for (let detectionIndex = 0; detectionIndex < numDetections; detectionIndex++) {
      let bestScore = 0;
      let bestClass = 0;

      for (let classIndex = 0; classIndex < numClasses; classIndex++) {
        const score =
          data[(4 + classIndex) * numDetections + detectionIndex] ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestClass = classIndex;
        }
      }

      if (bestScore < this.confidenceThreshold) continue;

      const cx = (data[detectionIndex] ?? 0) / MODEL_INPUT_SIZE;
      const cy = (data[numDetections + detectionIndex] ?? 0) / MODEL_INPUT_SIZE;
      const w =
        (data[2 * numDetections + detectionIndex] ?? 0) / MODEL_INPUT_SIZE;
      const h =
        (data[3 * numDetections + detectionIndex] ?? 0) / MODEL_INPUT_SIZE;

      const yMin = Math.round((cy - h / 2) * 1000);
      const xMin = Math.round((cx - w / 2) * 1000);
      const yMax = Math.round((cy + h / 2) * 1000);
      const xMax = Math.round((cx + w / 2) * 1000);

      const clamped = clampBBox([yMin, xMin, yMax, xMax]);
      if (clamped) {
        const rawLabel = CLASS_MAP[bestClass] ?? "unknown";
        boxes.push({
          bbox: clamped,
          score: bestScore,
          label: rawLabel,
          rawLabel,
          defectClass: mapToAppDefectClass(rawLabel) ?? undefined,
        });
      }
    }

    boxes.sort((a, b) => b.score - a.score);
    return boxes.slice(0, this.maxDetections);
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
    this._status = "idle";
  }
}
