import { useState } from "react";
import { useCamera } from "../../hooks/use-camera";
import { useBTOStore } from "../../lib/store";
import "./CameraCapture.css";

export function CameraCapture() {
  const [prompt, setPrompt] = useState("Hairline crack near the window frame");
  const [working, setWorking] = useState(false);
  const cameraPreview = useBTOStore((s) => s.cameraPreview);
  const { captureFrame, sendToVision } = useCamera();

  async function handleCapture() {
    setWorking(true);
    try { await captureFrame(); } finally { setWorking(false); }
  }

  async function handleAnalyze() {
    setWorking(true);
    try { await sendToVision(cameraPreview ?? "", prompt); } finally { setWorking(false); }
  }

  return (
    <div className="camera-section">
      {/* Viewfinder */}
      <div className="viewfinder industrial-border">
        {cameraPreview ? (
          <img src={cameraPreview} alt="Inspection preview" className="viewfinder-image" data-testid="camera-preview" />
        ) : (
          <div className="viewfinder-placeholder">
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>photo_camera</span>
            <p className="font-mono">POINT & CAPTURE</p>
          </div>
        )}

        {/* Corner markers */}
        <div className="corner corner--tl" />
        <div className="corner corner--tr" />
        <div className="corner corner--bl" />
        <div className="corner corner--br" />

        {/* Crosshairs */}
        <div className="crosshair-h" />
        <div className="crosshair-v" />
        <div className="hud-scanline" />

        {/* Capture controls */}
        <div className="viewfinder-controls">
          <button className="vf-btn" disabled>
            <span className="material-symbols-outlined">image</span>
          </button>
          <button
            className="vf-capture-btn"
            onClick={handleCapture}
            disabled={working}
            data-testid="capture-frame"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>photo_camera</span>
          </button>
          <button className="vf-btn" disabled>
            <span className="material-symbols-outlined">sync</span>
          </button>
        </div>
      </div>

      {/* Prompt input */}
      <div className="inspect-note">
        <label htmlFor="defect-prompt" className="inspect-note-label font-mono">INSPECTION NOTE</label>
        <textarea
          id="defect-prompt"
          className="inspect-note-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          data-testid="defect-prompt"
        />
      </div>

      {/* Analyze button */}
      <button
        className="analyze-btn"
        onClick={handleAnalyze}
        disabled={working || !cameraPreview}
        data-testid="analyze-frame"
      >
        <span className="material-symbols-outlined">search</span>
        Analyze Evidence
      </button>
    </div>
  );
}
