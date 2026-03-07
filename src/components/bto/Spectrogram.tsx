import { useRef, useEffect } from "react";
import "./Spectrogram.css";

interface SpectrogramProps {
  values: Float32Array | null;
}

const BAR_COUNT = 16;

export function Spectrogram({ values }: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Grid overlay
    ctx.strokeStyle = "rgba(249, 115, 22, 0.05)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < w; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let j = 0; j < h; j += 20) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
    }

    // Bars
    const bars = values ? Array.from(values).slice(0, BAR_COUNT) : [];
    const gap = 4;
    const barW = (w - gap * (BAR_COUNT + 1)) / BAR_COUNT;

    bars.forEach((v, i) => {
      const barH = Math.max(4, v * (h - 16));
      const x = gap + i * (barW + gap);
      const y = h - barH - 8;

      const intensity = Math.min(1, v * 1.5);
      const green = `rgba(34, 197, 94, ${0.3 + intensity * 0.7})`;
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
      ctx.fill();

      // Glow
      if (intensity > 0.6) {
        ctx.shadowColor = "#22C55E";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Placeholder bars when no data
    if (!bars.length) {
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = gap + i * (barW + gap);
        const barH = 12 + (i % 5) * 8;
        const y = h - barH - 8;
        ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        ctx.fill();
      }
    }
  }, [values]);

  return (
    <div className="spectrogram-wrap" data-testid="spectrogram">
      <div className="spectrogram-overlay-grid" />
      <canvas ref={canvasRef} className="spectrogram-canvas" />

      {/* HUD overlays */}
      <div className="spectrogram-hud-left font-mono phosphor-glow">
        <span>DB LEVEL: {values ? (60 + Math.random() * 30).toFixed(1) : "--.-"}</span>
        <span>FREQ: {values ? (8 + Math.random() * 10).toFixed(1) + " KHZ" : "--.- KHZ"}</span>
      </div>
      {values && (
        <div className="spectrogram-hud-badge">
          ANALYZING
        </div>
      )}
    </div>
  );
}
