import { useRef, useState } from "react";
import { useCamera } from "../../hooks/use-camera";
import { useBTOStore } from "../../lib/store";
import "./CameraCapture.css";

export function CameraCapture() {
  const [prompt, setPrompt] = useState("Hairline crack near the window frame");
  const [working, setWorking] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraPreview = useBTOStore((s) => s.cameraPreview);
  const { captureFrame, sendToVision, loadFromFile, videoRef, streamActive, cameraError, startStream } = useCamera();

  async function handleCapture() {
    setWorking(true);
    try { await captureFrame(); } finally { setWorking(false); }
  }

  async function handleAnalyze() {
    setWorking(true);
    try { await sendToVision(cameraPreview ?? "", prompt, measureMode); } finally { setWorking(false); }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorking(true);
    try { await loadFromFile(file); } finally { setWorking(false); }
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="camera-section">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Viewfinder */}
      <div className="viewfinder industrial-border">
        {/* Live video feed -- always rendered so browser can connect the stream */}
        {/* eslint-disable-next-line react/no-unknown-property */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // @ts-expect-error -- webkit prefix needed for iOS Safari live preview
          webkit-playsinline=""
          muted
          className="viewfinder-video"
        />

        {/* Captured snapshot overlay (covers video) */}
        {cameraPreview && (
          <img src={cameraPreview} alt="Inspection preview" className="viewfinder-image" data-testid="camera-preview" />
        )}

        {/* Placeholder when no camera and no snapshot */}
        {!streamActive && !cameraPreview && (
          <div className="viewfinder-placeholder">
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3 }}>
              {cameraError ? "no_photography" : "photo_camera"}
            </span>
            <p className="font-mono">{cameraError ? "NO CAMERA" : "POINT & CAPTURE"}</p>
            {cameraError && (
              <p className="viewfinder-error">{cameraError}</p>
            )}
            <div className="viewfinder-fallback-actions">
              <button className="vf-fallback-btn" onClick={() => fileInputRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload</span>
                Upload Photo
              </button>
              <button className="vf-fallback-btn" onClick={startStream}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                Retry Camera
              </button>
            </div>
          </div>
        )}

        {/* Measurement mode overlay */}
        {measureMode && !cameraPreview && (
          <div className="measure-overlay">
            <div className="measure-coin-guide">
              <div className="measure-coin-circle" />
              <span className="measure-coin-label font-mono">PLACE 50c COIN HERE</span>
            </div>
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
          <button
            className={`vf-btn ${measureMode ? "vf-btn--active" : ""}`}
            onClick={() => setMeasureMode(!measureMode)}
            title="Toggle measurement mode"
          >
            <span className="material-symbols-outlined">straighten</span>
          </button>
          <button
            className="vf-capture-btn"
            onClick={streamActive ? handleCapture : () => fileInputRef.current?.click()}
            disabled={working}
            data-testid="capture-frame"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
              {streamActive ? "photo_camera" : "upload"}
            </span>
          </button>
          <button className="vf-btn" disabled>
            <span className="material-symbols-outlined">sync</span>
          </button>
        </div>
      </div>

      {/* Measurement hint */}
      {measureMode && (
        <div className="measure-hint">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>straighten</span>
          <span className="font-mono">MEASURE MODE: Place a SG 50-cent coin next to the defect as size reference</span>
        </div>
      )}

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
        <span className="material-symbols-outlined">{measureMode ? "straighten" : "search"}</span>
        {measureMode ? "Measure & Analyze" : "Analyze Evidence"}
      </button>
    </div>
  );
}
