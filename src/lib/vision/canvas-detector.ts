import { clampBBox } from "../defect-utils";
import { mapToAppDefectClass } from "./defect-class-filter";
import type {
  Detector,
  DetectorBackend,
  DetectorBox,
  DetectorResult,
  DetectorStatus,
} from "./detector-types";

/**
 * Canvas-based anomaly detector for construction defects.
 * Uses edge density and color variance analysis per grid cell to flag
 * spatially anomalous regions without ML model downloads.
 * Implements the Detector interface so it can be swapped for
 * MediaPipe/YOLO via the adapter contract.
 */
export class CanvasDetector implements Detector {
  readonly id = "canvas-edge";
  private _status: DetectorStatus = "idle";
  private _backend: DetectorBackend = "none";
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private warmUpCount = 0;
  private warmUpTarget: number;
  private confidenceThreshold: number;
  private maxDetections: number;

  constructor(options?: {
    warmUpFrames?: number;
    confidenceThreshold?: number;
    maxDetections?: number;
  }) {
    this.warmUpTarget = options?.warmUpFrames ?? 5;
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.4;
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
    this.canvas = new OffscreenCanvas(320, 240);
    this.ctx = this.canvas.getContext("2d", {
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D | null;
    if (!this.ctx) {
      this._status = "error";
      throw new Error("OffscreenCanvas 2D context unavailable");
    }
    this._backend =
      typeof navigator !== "undefined" && "gpu" in navigator
        ? "webgpu"
        : this.checkWebGl()
          ? "webgl"
          : "wasm";
    this._status = "ready";
  }

  private checkWebGl() {
    if (typeof document === "undefined") return false;
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl"));
  }

  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<DetectorResult> {
    if (!this.ctx || !this.canvas) {
      return { boxes: [], frameTimeMs: 0 };
    }

    const start = performance.now();
    this._status = "running";

    const w = 320;
    const h = 240;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(source, 0, 0, w, h);

    const imageData = this.ctx.getImageData(0, 0, w, h);

    if (this.warmUpCount < this.warmUpTarget) {
      this.warmUpCount++;
      this._status = "warming-up";
      return { boxes: [], frameTimeMs: performance.now() - start };
    }

    this._status = "ready";
    const boxes = this.findAnomalies(imageData, w, h);
    return { boxes, frameTimeMs: performance.now() - start };
  }

  private findAnomalies(
    imageData: ImageData,
    w: number,
    h: number,
  ): DetectorBox[] {
    const data = imageData.data;
    const gridW = 8;
    const gridH = 6;
    const cellW = Math.floor(w / gridW);
    const cellH = Math.floor(h / gridH);
    const edgeDensities: number[] = [];
    const colorVariances: number[] = [];

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const startX = gx * cellW;
        const startY = gy * cellH;
        let edgeSum = 0;
        let pixelCount = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let rSqSum = 0;
        let gSqSum = 0;
        let bSqSum = 0;

        for (
          let y = startY + 1;
          y < startY + cellH - 1 && y < h - 1;
          y++
        ) {
          for (
            let x = startX + 1;
            x < startX + cellW - 1 && x < w - 1;
            x++
          ) {
            const idx = (y * w + x) * 4;
            const leftIdx = (y * w + (x - 1)) * 4;
            const rightIdx = (y * w + (x + 1)) * 4;
            const topIdx = ((y - 1) * w + x) * 4;
            const bottomIdx = ((y + 1) * w + x) * 4;

            const grayL =
              data[leftIdx] * 0.299 +
              data[leftIdx + 1] * 0.587 +
              data[leftIdx + 2] * 0.114;
            const grayR =
              data[rightIdx] * 0.299 +
              data[rightIdx + 1] * 0.587 +
              data[rightIdx + 2] * 0.114;
            const grayT =
              data[topIdx] * 0.299 +
              data[topIdx + 1] * 0.587 +
              data[topIdx + 2] * 0.114;
            const grayB =
              data[bottomIdx] * 0.299 +
              data[bottomIdx + 1] * 0.587 +
              data[bottomIdx + 2] * 0.114;

            const sobelX = grayR - grayL;
            const sobelY = grayB - grayT;
            edgeSum += Math.sqrt(sobelX * sobelX + sobelY * sobelY);

            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            rSqSum += data[idx] * data[idx];
            gSqSum += data[idx + 1] * data[idx + 1];
            bSqSum += data[idx + 2] * data[idx + 2];
            pixelCount++;
          }
        }

        edgeDensities.push(pixelCount > 0 ? edgeSum / pixelCount : 0);

        if (pixelCount > 1) {
          const rVar =
            (rSqSum - (rSum * rSum) / pixelCount) / (pixelCount - 1);
          const gVar =
            (gSqSum - (gSum * gSum) / pixelCount) / (pixelCount - 1);
          const bVar =
            (bSqSum - (bSum * bSum) / pixelCount) / (pixelCount - 1);
          colorVariances.push(rVar + gVar + bVar);
        } else {
          colorVariances.push(0);
        }
      }
    }

    const edgeMean =
      edgeDensities.reduce((a, b) => a + b, 0) / edgeDensities.length;
    const edgeStd = Math.sqrt(
      edgeDensities.reduce((a, b) => a + (b - edgeMean) ** 2, 0) /
        edgeDensities.length,
    );
    const colorMean =
      colorVariances.reduce((a, b) => a + b, 0) / colorVariances.length;
    const colorStd = Math.sqrt(
      colorVariances.reduce((a, b) => a + (b - colorMean) ** 2, 0) /
        colorVariances.length,
    );

    const boxes: DetectorBox[] = [];

    for (let i = 0; i < edgeDensities.length; i++) {
      const edgeZ = edgeStd > 0 ? (edgeDensities[i] - edgeMean) / edgeStd : 0;
      const colorZ =
        colorStd > 0 ? (colorVariances[i] - colorMean) / colorStd : 0;
      const anomalyScore = Math.max(edgeZ, colorZ) / 4;

      if (anomalyScore >= this.confidenceThreshold) {
        const gx = i % gridW;
        const gy = Math.floor(i / gridW);
        const yMin = Math.round((gy / gridH) * 1000);
        const xMin = Math.round((gx / gridW) * 1000);
        const yMax = Math.round(((gy + 1) / gridH) * 1000);
        const xMax = Math.round(((gx + 1) / gridW) * 1000);
        const clamped = clampBBox([yMin, xMin, yMax, xMax]);
        if (clamped) {
          // Map heuristic anomaly type to CONQUAS Appendix 4 labels
          const rawLabel = edgeZ > colorZ ? "wall_crack" : "stain_mark";
          boxes.push({
            bbox: clamped,
            score: Math.min(1, anomalyScore),
            label: rawLabel,
            rawLabel,
            defectClass: mapToAppDefectClass(rawLabel) ?? undefined,
          });
        }
      }
    }

    boxes.sort((a, b) => b.score - a.score);
    return boxes.slice(0, this.maxDetections);
  }

  dispose() {
    this.canvas = null;
    this.ctx = null;
    this._status = "idle";
    this.warmUpCount = 0;
  }
}
