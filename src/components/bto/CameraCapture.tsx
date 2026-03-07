import { useRef, useState } from "react";
import { useCamera } from "../../hooks/use-camera";
import { clampBBox } from "../../lib/defect-utils";
import { useBTOStore } from "../../lib/store";
import "./CameraCapture.css";

export function CameraCapture() {
  const [prompt, setPrompt] = useState("Hairline crack near the window frame");
  const [working, setWorking] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraPreview = useBTOStore((s) => s.cameraPreview);
  const setCameraPreview = useBTOStore((s) => s.setCameraPreview);
  const defects = useBTOStore((s) => s.defects);
  const { captureFrame, sendToVision, loadFromFile, videoRef, streamActive, cameraError, startStream } = useCamera();

  const captured = !!cameraPreview;
  const lastDefect = defects.length > 0 ? defects[defects.length - 1] : null;
  const clampedBBox = clampBBox(lastDefect?.bbox);
  // Only show overlays when the preview matches the last defect's photo
  const showDefectOverlay = captured && lastDefect?.photo_url === cameraPreview;

  async function handleCapture() {
    setWorking(true);
    try {
      setFlashActive(true);
      await captureFrame();
      setTimeout(() => setFlashActive(false), 300);
    } finally { setWorking(false); }
  }

  function handleRetake() {
    setCameraPreview(null);
  }

  async function handleAnalyze() {
    setWorking(true);
    console.debug("[camera:analyze]", {
      hasPreview: Boolean(cameraPreview),
      measureMode,
      prompt,
    });
    try { await sendToVision(cameraPreview ?? "", prompt, measureMode); } finally { setWorking(false); }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorking(true);
    try { await loadFromFile(file); } finally { setWorking(false); }
    e.target.value = "";
  }

  return (
    <div className="camera-section">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Viewfinder */}
      <div className={`viewfinder industrial-border${captured ? " viewfinder--captured" : ""}`}>
        {/* Live video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="viewfinder-video"
        />

        {/* Captured snapshot overlay */}
        {cameraPreview && (
          <img src={cameraPreview} alt="Inspection preview" className="viewfinder-image" data-testid="camera-preview" />
        )}

        {/* Bounding box overlay */}
        {showDefectOverlay && clampedBBox && (
          <div
            className={`bbox-overlay bbox-overlay--${lastDefect.severity.toLowerCase()}`}
            style={{
              top: `${clampedBBox[0] / 10}%`,
              left: `${clampedBBox[1] / 10}%`,
              height: `${(clampedBBox[2] - clampedBBox[0]) / 10}%`,
              width: `${(clampedBBox[3] - clampedBBox[1]) / 10}%`,
            }}
          />
        )}

        {/* Review required badge */}
        {showDefectOverlay && lastDefect?.review_required && (
          <div className="review-badge font-mono">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
            VERIFY ON SITE
          </div>
        )}

        {/* Agentic pass indicator */}
        {showDefectOverlay && lastDefect?.agentic_pass && (
          <div className="agentic-badge font-mono">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
            AI VERIFIED
          </div>
        )}

        {/* Capture flash */}
        {flashActive && <div className="capture-flash" />}

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

        {/* Measurement mode overlay (live viewfinder only) */}
        {measureMode && !captured && (
          <div className="measure-overlay">
            <div className="measure-coin-guide">
              <div className="measure-coin-circle" />
              <span className="measure-coin-label font-mono">PLACE 50c COIN HERE</span>
            </div>
          </div>
        )}

        {/* HUD elements -- hidden after capture so user sees a clean preview */}
        {!captured && (
          <>
            <div className="corner corner--tl" />
            <div className="corner corner--tr" />
            <div className="corner corner--bl" />
            <div className="corner corner--br" />
            <div className="crosshair-h" />
            <div className="crosshair-v" />
            <div className="hud-scanline" />
          </>
        )}

        {/* Controls */}
        <div className="viewfinder-controls">
          {captured ? (
            <>
              <button
                className={`vf-btn ${measureMode ? "vf-btn--active" : ""}`}
                onClick={() => setMeasureMode(!measureMode)}
                title="Toggle measurement mode for this captured photo"
              >
                <span className="material-symbols-outlined">straighten</span>
              </button>
              <button className="vf-btn" onClick={handleRetake} title="Retake photo">
                <span className="material-symbols-outlined">replay</span>
              </button>
              <button className="vf-btn" onClick={() => fileInputRef.current?.click()} title="Upload different photo">
                <span className="material-symbols-outlined">upload</span>
              </button>
            </>
          ) : (
            <>
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
              <button className="vf-btn" onClick={() => fileInputRef.current?.click()} title="Upload from gallery">
                <span className="material-symbols-outlined">upload</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Measurement hint */}
      {measureMode && (
        <div className="measure-hint">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>straighten</span>
          <span className="font-mono">
            {captured
              ? "MEASURE MODE ACTIVE: This photo will run coin-referenced measurement during analysis"
              : "MEASURE MODE: Place a SG 50-cent coin next to the defect as size reference"}
          </span>
        </div>
      )}

      {/* Severity rationale caption */}
      {showDefectOverlay && lastDefect?.severity_rationale && (
        <div className={`severity-rationale severity-rationale--${lastDefect.severity.toLowerCase()}`}>
          <span className="font-mono">{lastDefect.severity}</span>
          <span>{lastDefect.severity_rationale}</span>
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
