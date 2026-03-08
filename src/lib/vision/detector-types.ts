export type DetectorBackend = "webgpu" | "webgl" | "wasm" | "none";
export type DetectorStatus =
  | "idle"
  | "warming-up"
  | "ready"
  | "running"
  | "error"
  | "unavailable";

export interface DetectorBox {
  /** [yMin, xMin, yMax, xMax] normalized 0-1000 */
  bbox: [number, number, number, number];
  score: number;
  label: string;
}

export interface DetectorResult {
  boxes: DetectorBox[];
  frameTimeMs: number;
}

export interface Detector {
  readonly id: string;
  readonly status: DetectorStatus;
  readonly backend: DetectorBackend;
  initialize(): Promise<void>;
  detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<DetectorResult>;
  dispose(): void;
}

export interface DetectorConfig {
  targetFps: number;
  confidenceThreshold: number;
  maxDetections: number;
  warmUpFrames: number;
  stabilityThreshold: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  targetFps: 15,
  confidenceThreshold: 0.4,
  maxDetections: 10,
  warmUpFrames: 5,
  stabilityThreshold: 3,
};
