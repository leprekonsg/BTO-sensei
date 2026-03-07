import { useBTOAudio } from "../../hooks/use-bto-audio";
import "./AudioCapture.css";

export function AudioCapture() {
  const { analyzeTap, audioMode, lastTapResult, setAudioMode } = useBTOAudio();

  return (
    <div className="audio-capture">
      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${audioMode === "prerecorded" ? "mode-btn--active" : ""}`}
          onClick={() => setAudioMode("prerecorded")}
          data-testid="audio-mode-prerecorded"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>audio_file</span>
          Prerecorded
        </button>
        <button
          className={`mode-btn ${audioMode === "live-mic" ? "mode-btn--active" : ""}`}
          onClick={() => setAudioMode("live-mic")}
          data-testid="audio-mode-live-mic"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mic</span>
          Live Mic
        </button>
      </div>

      {/* Action Buttons */}
      <div className="tap-actions">
        <button
          className="tap-btn tap-btn--primary"
          onClick={() => analyzeTap("prerecorded-hollow")}
          disabled={lastTapResult.loading}
          data-testid="tap-hollow"
        >
          <span className="material-symbols-outlined">warning</span>
          {lastTapResult.loading ? "Analyzing..." : "Run Hollow Sample"}
        </button>
        <div className="tap-actions-secondary">
          <button
            className="tap-btn tap-btn--secondary"
            onClick={() => analyzeTap("prerecorded-solid")}
            disabled={lastTapResult.loading}
            data-testid="tap-solid"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>construction</span>
            Solid Sample
          </button>
          <button
            className="tap-btn tap-btn--secondary"
            disabled
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>history</span>
            Logs
          </button>
        </div>
      </div>
    </div>
  );
}
