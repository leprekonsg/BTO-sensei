export class FrameScheduler {
  private targetIntervalMs: number;
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private running = false;
  private totalFrames = 0;
  private fpsFrames = 0;
  private fpsUpdateTime = 0;
  private measuredFps = 0;

  constructor(targetFps: number) {
    this.targetIntervalMs = 1000 / targetFps;
  }

  get fps() {
    return this.measuredFps;
  }

  get frame() {
    return this.totalFrames;
  }

  start(callback: (frame: number) => void) {
    if (this.running) return;
    this.running = true;
    this.fpsUpdateTime = performance.now();
    this.fpsFrames = 0;

    const loop = (timestamp: number) => {
      if (!this.running) return;

      const elapsed = timestamp - this.lastFrameTime;
      if (elapsed >= this.targetIntervalMs) {
        this.lastFrameTime = timestamp;
        this.totalFrames++;
        this.fpsFrames++;
        callback(this.totalFrames);

        const fpsDelta = timestamp - this.fpsUpdateTime;
        if (fpsDelta >= 1000) {
          this.measuredFps = Math.round((this.fpsFrames / fpsDelta) * 1000);
          this.fpsUpdateTime = timestamp;
          this.fpsFrames = 0;
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.totalFrames = 0;
    this.fpsFrames = 0;
    this.measuredFps = 0;
  }

  setTargetFps(fps: number) {
    this.targetIntervalMs = 1000 / fps;
  }
}
