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
 * YOLO26N detector running on ONNX Runtime Web.
 *
 * Preferred backend for v12 when both the ONNX model and onnxruntime-web
 * are present. Falls back to the TF.js YOLO or canvas detector when
 * the feature flag, runtime, or model assets are unavailable.
 *
 * Feature flag: VITE_ENABLE_YOLO26_ONNX=true
 * Model path:   /models/yolo26n-conquas/model.onnx
 */

const MODEL_INPUT_SIZE = 640;
const MODEL_PATH = "/models/yolo26n-conquas/model.onnx";
const YOLO26_ONNX_ENABLED =
  (import.meta.env?.VITE_ENABLE_YOLO26_ONNX as string | undefined) === "true";

const CLASS_MAP: ConquasLabel[] = [...CONQUAS_LABELS];

interface OrtInferenceSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}

interface OrtTensor {
  data: Float32Array;
  dims: number[];
  dispose(): void;
}

interface OrtInstance {
  InferenceSession: {
    create(path: string, options?: Record<string, unknown>): Promise<OrtInferenceSession>;
  };
  Tensor: new (type: string, data: Float32Array | number[], dims: number[]) => OrtTensor;
  env: {
    wasm: { numThreads: number; proxy: boolean };
  };
}

let _ort: OrtInstance | null = null;
let _modelCheckPromise: Promise<boolean> | null = null;

async function checkModelAvailability(): Promise<boolean> {
  if (!YOLO26_ONNX_ENABLED || typeof window === "undefined" || typeof fetch !== "function") {
    return false;
  }

  try {
    const response = await fetch(MODEL_PATH, { method: "HEAD", cache: "no-store" });
    if (response.ok) return true;
  } catch {
    // HEAD may not be supported by all static hosts.
  }

  try {
    const response = await fetch(MODEL_PATH, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isOnnxYolo26ReadyForRuntime(): Promise<boolean> {
  if (!_modelCheckPromise) {
    _modelCheckPromise = checkModelAvailability();
  }
  return _modelCheckPromise;
}

async function loadOrt(): Promise<OrtInstance | null> {
  if (_ort) return _ort;
  try {
    const ortModule = "onnxruntime-web";
    const mod = await (Function("m", "return import(m)")(ortModule) as Promise<Record<string, unknown>>);
    _ort = (mod.default ?? mod) as unknown as OrtInstance;
    return _ort;
  } catch {
    return null;
  }
}

export class OnnxYolo26Detector implements Detector {
  readonly id = "yolo26n-onnx";
  private _status: DetectorStatus = "idle";
  private _backend: DetectorBackend = "none";
  private session: OrtInferenceSession | null = null;
  private ort: OrtInstance | null = null;
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private confidenceThreshold: number;
  private maxDetections: number;

  constructor(options?: { confidenceThreshold?: number; maxDetections?: number }) {
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.35;
    this.maxDetections = options?.maxDetections ?? 10;
  }

  get status() { return this._status; }
  get backend() { return this._backend; }

  async initialize(): Promise<void> {
    this._status = "warming-up";

    if (!(await isOnnxYolo26ReadyForRuntime())) {
      this._status = "unavailable";
      return;
    }

    const ort = await loadOrt();
    if (!ort) {
      this._status = "unavailable";
      return;
    }
    this.ort = ort;

    // Prefer WebGPU EP, fall back to WASM
    const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    this._backend = hasWebGpu ? "webgpu" : "wasm";

    try {
      ort.env.wasm.numThreads = 2;
      ort.env.wasm.proxy = true;

      const epOptions: Record<string, unknown> = hasWebGpu
        ? { executionProviders: ["webgpu", "wasm"] }
        : { executionProviders: ["wasm"] };

      this.session = await ort.InferenceSession.create(MODEL_PATH, epOptions);

      this.canvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      this.ctx = this.canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
      if (!this.ctx) {
        this._status = "error";
        return;
      }

      this._status = "ready";
    } catch {
      this._status = "unavailable";
    }
  }

  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<DetectorResult> {
    if (!this.ort || !this.session || !this.ctx || !this.canvas) {
      return { boxes: [], frameTimeMs: 0 };
    }

    const start = performance.now();
    this._status = "running";

    try {
      this.canvas.width = MODEL_INPUT_SIZE;
      this.canvas.height = MODEL_INPUT_SIZE;
      this.ctx.drawImage(source, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      const imageData = this.ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

      // Convert RGBA to CHW float32 [1, 3, 640, 640], normalized 0-1
      const pixels = imageData.data;
      const totalPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
      const inputData = new Float32Array(3 * totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        inputData[i] = (pixels[i * 4] ?? 0) / 255;                       // R
        inputData[totalPixels + i] = (pixels[i * 4 + 1] ?? 0) / 255;     // G
        inputData[2 * totalPixels + i] = (pixels[i * 4 + 2] ?? 0) / 255; // B
      }

      const inputTensor = new this.ort.Tensor(
        "float32",
        inputData,
        [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE],
      );

      const results = await this.session.run({ images: inputTensor });
      const outputTensor = results[Object.keys(results)[0]];
      const data = outputTensor.data;
      const dims = outputTensor.dims;

      inputTensor.dispose();
      outputTensor.dispose();

      const boxes = this.postProcess(data, dims);
      this._status = "ready";
      return { boxes, frameTimeMs: performance.now() - start };
    } catch {
      this._status = "ready";
      return { boxes: [], frameTimeMs: performance.now() - start };
    }
  }

  /**
   * Expected shape: [1, numClasses + 4, numDetections]
   * Layout per detection: [cx, cy, w, h, class_scores...]
   */
  private postProcess(data: Float32Array, dims: number[]): DetectorBox[] {
    const numClasses = CLASS_MAP.length;
    const numDetections = dims[2] ?? 0;
    const boxes: DetectorBox[] = [];

    for (let d = 0; d < numDetections; d++) {
      let bestScore = 0;
      let bestClass = 0;

      for (let c = 0; c < numClasses; c++) {
        const score = data[(4 + c) * numDetections + d] ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }

      if (bestScore < this.confidenceThreshold) continue;

      const cx = (data[d] ?? 0) / MODEL_INPUT_SIZE;
      const cy = (data[numDetections + d] ?? 0) / MODEL_INPUT_SIZE;
      const w = (data[2 * numDetections + d] ?? 0) / MODEL_INPUT_SIZE;
      const h = (data[3 * numDetections + d] ?? 0) / MODEL_INPUT_SIZE;

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
    void this.session?.release();
    this.session = null;
    this.canvas = null;
    this.ctx = null;
    this._status = "idle";
  }
}
