import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBTOAudio } from "../../hooks/use-bto-audio";
import { useCamera } from "../../hooks/use-camera";
import { useHudDetector } from "../../hooks/use-hud-detector";
import { useBTOStore } from "../../lib/store";
import { acousticConquasSeverity } from "../../lib/conquas";
import {
  buildHudAnchor,
  createManualHudDetection,
  getHudSupport,
  trackedToHudDetection,
} from "../../lib/vision/hud";
import {
  shouldClearHudTapPoint,
  shouldFinalizeWorkingAnchor,
} from "../../lib/vision/hud-guards";
import { DEFAULT_DETECTOR_CONFIG } from "../../lib/vision/detector-types";
import type { TrackedDetection } from "../../lib/vision/tracking";
import type { Defect, HudTapPoint, TapResult } from "../../lib/types";
import "./CameraCapture.css";
import "./HeadsUpView.css";

function nextId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function anchorSummary(defect: Defect) {
  const confidence = `${Math.round(defect.confidence * 100)}%`;
  if (defect.measurement?.width_mm || defect.measurement?.length_mm) {
    return `${defect.severity} \u00B7 ${defect.measurement.width_mm ?? "?"}mm x ${defect.measurement.length_mm ?? "?"}mm`;
  }
  if (defect.review_required) {
    return `${defect.severity} \u00B7 ${confidence} \u00B7 verify on site`;
  }
  return `${defect.severity} \u00B7 ${confidence}`;
}

function createHollowDefect(
  room: string,
  bbox: [number, number, number, number],
  result: TapResult,
): Defect {
  const severity = acousticConquasSeverity(result.confidence);
  return {
    id: nextId("acoustic-defect"),
    room,
    defect_type: "Hollow tile",
    severity,
    description:
      "Tap-to-location HUD acoustic check detected a hollow tile signature.",
    recommendation:
      "Log this tile for contractor rectification and verify adjacent tiles on site.",
    confidence: result.confidence,
    timestamp: Date.now(),
    bbox,
    review_required: true,
    severity_rationale:
      severity === "Critical"
        ? "DSP hollow index > 0.8 - exceeds CONQUAS Appendix 1, Item 1a-4 tolerance."
        : "DSP hollow signature detected. Verify on site per CONQUAS Appendix 1, Item 1a-4.",
    source: "acoustic",
    conquas_item_id: "1a-4",
    conquas_appendix: "Appendix 1, Item 1a-4",
  };
}

export function HeadsUpView() {
  const [prompt, setPrompt] = useState("Explain the visible defect and severity.");
  const [workingAnchorId, setWorkingAnchorId] = useState<string | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const { videoRef, streamActive, cameraError, startStream, analyzeHudRegion } =
    useCamera();
  const { analyzeLiveMic, audioMode, setAudioMode, lastTapResult } =
    useBTOAudio();

  const currentRoom = useBTOStore((state) => state.currentRoom);
  const inspectorMessage = useBTOStore((state) => state.inspectorMessage);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const addDefect = useBTOStore((state) => state.addDefect);
  const hudSupport = useBTOStore((state) => state.hudSupport);
  const setHudSupport = useBTOStore((state) => state.setHudSupport);
  const hudMode = useBTOStore((state) => state.hudMode);
  const setHudMode = useBTOStore((state) => state.setHudMode);
  const hudDetections = useBTOStore((state) => state.hudDetections);
  const addHudDetection = useBTOStore((state) => state.addHudDetection);
  const hudAnchors = useBTOStore((state) => state.hudAnchors);
  const upsertHudAnchor = useBTOStore((state) => state.upsertHudAnchor);
  const removeHudAnchor = useBTOStore((state) => state.removeHudAnchor);
  const clearHudSession = useBTOStore((state) => state.clearHudSession);
  const hudTapPoint = useBTOStore((state) => state.hudTapPoint);
  const setHudTapPoint = useBTOStore((state) => state.setHudTapPoint);

  // ---- Cancellation generation counter ----
  // Increments on room change, clear, dismiss-of-working-anchor, and
  // acoustic-check start so stale async completions are discarded.
  const hudGenRef = useRef(0);
  const workingAnchorRef = useRef<string | null>(null);

  const bumpGeneration = useCallback(() => {
    hudGenRef.current += 1;
  }, []);

  const beginWorkingAnchor = useCallback((anchorId: string) => {
    workingAnchorRef.current = anchorId;
    setWorkingAnchorId(anchorId);
  }, []);

  const clearWorkingAnchor = useCallback(() => {
    workingAnchorRef.current = null;
    setWorkingAnchorId(null);
  }, []);

  const finalizeWorkingAnchor = useCallback(
    (anchorId: string, generation: number) => {
      if (
        shouldFinalizeWorkingAnchor(
          generation,
          hudGenRef.current,
          anchorId,
          workingAnchorRef.current,
        )
      ) {
        clearWorkingAnchor();
      }
    },
    [clearWorkingAnchor],
  );

  // ---- Detector integration ----
  const detectorEnabled = hudMode === "vision" && streamActive;

  const handleAutoDetections = useCallback(
    (tracked: TrackedDetection[]) => {
      const stable = tracked.filter(
        (t) => t.stability >= 0.4 && t.framesSeen >= DEFAULT_DETECTOR_CONFIG.stabilityThreshold,
      );
      for (const det of stable) {
        const exists = hudAnchors.some((a) => a.detection_id === det.id);
        if (exists) continue;
        const hudDet = trackedToHudDetection(det);
        addHudDetection(hudDet);
        const anchor = buildHudAnchor(hudDet, hudAnchors.length, "pending", {
          id: `auto-${det.id}`,
          title: det.label,
          subtitle: `${Math.round(det.score * 100)}% confidence`,
        });
        upsertHudAnchor(anchor);
      }
    },
    [hudAnchors, addHudDetection, upsertHudAnchor],
  );

  const { detectorStatus, fps, warmUpProgress } = useHudDetector({
    videoRef,
    enabled: detectorEnabled,
    onDetections: handleAutoDetections,
  });

  // Update HUD support badge whenever detector status changes.
  useEffect(() => {
    setHudSupport(getHudSupport(detectorStatus));
  }, [detectorStatus, setHudSupport]);

  // Clear HUD state on room change and on unmount.
  useEffect(() => {
    bumpGeneration();
    return () => {
      clearHudSession();
      clearWorkingAnchor();
    };
  }, [currentRoom, clearHudSession, bumpGeneration, clearWorkingAnchor]);

  const orderedAnchors = useMemo(
    () => [...hudAnchors].sort((a, b) => a.y - b.y || a.x - b.x),
    [hudAnchors],
  );

  // ---- Pointer helpers ----

  function getTapPoint(
    event: React.PointerEvent<HTMLDivElement>,
  ): HudTapPoint | null {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, textarea, .hud-pill")) return null;

    const rect = viewfinderRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    const x = Math.min(
      1000,
      Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * 1000)),
    );
    const y = Math.min(
      1000,
      Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * 1000)),
    );
    return { x, y, timestamp: Date.now() };
  }

  // ---- Handlers ----

  function handleClearHud() {
    bumpGeneration();
    clearHudSession();
    clearWorkingAnchor();
    setInspectorMessage("HUD cleared.");
  }

  function handleDismissAnchor(anchorId: string) {
    if (anchorId === workingAnchorId) {
      bumpGeneration();
      clearWorkingAnchor();
    }
    removeHudAnchor(anchorId);
  }

  async function handlePillTap(anchorId: string) {
    const anchor = hudAnchors.find((a) => a.id === anchorId);
    if (!anchor || anchor.status !== "pending" || workingAnchorId) return;

    const detection =
      hudDetections.find((d) => d.id === anchor.detection_id) ??
      createManualHudDetection(
        { x: anchor.bbox[1], y: anchor.bbox[0], timestamp: Date.now() },
      );

    upsertHudAnchor({
      ...anchor,
      status: "explaining",
      title: "Analyzing ROI",
      subtitle: "Gemini reviewing cropped region...",
    });
    beginWorkingAnchor(anchorId);
    const generation = hudGenRef.current;

    try {
      const defect = await analyzeHudRegion(detection.bbox, prompt);
      if (generation !== hudGenRef.current) return;

      if (!defect) {
        upsertHudAnchor({
          ...anchor,
          status: "review-required",
          title: "Manual review required",
          subtitle: "ROI capture failed before analysis.",
          review_required: true,
        });
        return;
      }

      upsertHudAnchor({
        ...anchor,
        status: defect.review_required ? "review-required" : "resolved",
        title: defect.defect_type,
        subtitle: anchorSummary(defect),
        defect_id: defect.id,
        review_required: defect.review_required,
      });
    } catch (error) {
      if (generation !== hudGenRef.current) return;
      upsertHudAnchor({
        ...anchor,
        status: "review-required",
        title: "Manual review required",
        subtitle: error instanceof Error ? error.message : "HUD analysis failed.",
        review_required: true,
      });
    } finally {
      finalizeWorkingAnchor(anchorId, generation);
    }
  }

  async function handleHudPointer(event: React.PointerEvent<HTMLDivElement>) {
    const point = getTapPoint(event);
    if (!point) return;

    if (hudMode === "acoustic") {
      if (lastTapResult.loading) {
        setInspectorMessage("Acoustic check already running. Wait for the current tap result.");
        return;
      }
      const detection = createManualHudDetection(point, 150);
      const anchor = buildHudAnchor(detection, orderedAnchors.length, "locked", {
        id: `hud-tap-${point.timestamp}`,
        title: "Tile marked",
        subtitle: "Run acoustic check to classify this tile",
      });
      addHudDetection(detection);
      upsertHudAnchor(anchor);
      setHudTapPoint(point);
      setInspectorMessage(
        `Tile marked in ${currentRoom}. Record a tap to classify it.`,
      );
      return;
    }

    // Concurrency guard: skip if an analysis is already in-flight.
    if (workingAnchorId) return;

    const detection = createManualHudDetection(point);
    const anchor = buildHudAnchor(detection, orderedAnchors.length, "explaining", {
      title: "Analyzing ROI",
      subtitle: "Gemini reviewing cropped defect...",
    });

    addHudDetection(detection);
    upsertHudAnchor(anchor);
    beginWorkingAnchor(anchor.id);

    const generation = hudGenRef.current;

    try {
      const defect = await analyzeHudRegion(detection.bbox, prompt);

      if (generation !== hudGenRef.current) return;

      if (!defect) {
        upsertHudAnchor({
          ...anchor,
          status: "review-required",
          title: "Manual review required",
          subtitle: "ROI capture failed before Gemini analysis.",
          review_required: true,
        });
        return;
      }

      upsertHudAnchor({
        ...anchor,
        status: defect.review_required ? "review-required" : "resolved",
        title: defect.defect_type,
        subtitle: anchorSummary(defect),
        defect_id: defect.id,
        review_required: defect.review_required,
      });
    } catch (error) {
      if (generation !== hudGenRef.current) return;

      upsertHudAnchor({
        ...anchor,
        status: "review-required",
        title: "Manual review required",
        subtitle:
          error instanceof Error ? error.message : "HUD analysis failed.",
        review_required: true,
      });
    } finally {
      finalizeWorkingAnchor(anchor.id, generation);
    }
  }

  async function handleAcousticCheck() {
    if (!hudTapPoint) {
      setInspectorMessage(
        "Tap a tile location in the HUD before running the acoustic check.",
      );
      return;
    }

    // Invalidate prior async completions.
    bumpGeneration();

    if (audioMode !== "live-mic") {
      setAudioMode("live-mic");
    }

    const anchorId = `hud-tap-${hudTapPoint.timestamp}`;
    const anchor = hudAnchors.find((entry) => entry.id === anchorId);
    const detection =
      hudDetections.find(
        (entry) => entry.last_seen_at === hudTapPoint.timestamp,
      ) ?? createManualHudDetection(hudTapPoint, 150);
    const baseAnchor =
      anchor ??
      buildHudAnchor(detection, orderedAnchors.length, "locked", {
        id: anchorId,
        title: "Tile marked",
        subtitle: "Run acoustic check to classify this tile",
      });

    upsertHudAnchor({
      ...baseAnchor,
      status: "explaining",
      title: "Listening for tap",
      subtitle: "DSP is classifying the marked tile...",
    });

    const generation = hudGenRef.current;
    const requestTapTimestamp = hudTapPoint.timestamp;

    const result = await analyzeLiveMic();

    if (generation !== hudGenRef.current) return;

    if (!result) {
      upsertHudAnchor({
        ...baseAnchor,
        status: "review-required",
        title: "Acoustic check failed",
        subtitle: "No tap result returned. Retry on site.",
        review_required: true,
      });
      return;
    }

    if (result.type === "hollow") {
      const defect = createHollowDefect(currentRoom, detection.bbox, result);
      addDefect(defect);
      upsertHudAnchor({
        ...baseAnchor,
        status: "review-required",
        title: "Hollow tile",
        subtitle: `${Math.round(result.confidence * 100)}% confidence \u00B7 verify on site`,
        defect_id: defect.id,
        review_required: true,
      });
      setInspectorMessage(
        `Hollow tile logged in ${currentRoom}. Verify on site.`,
      );
    } else {
      upsertHudAnchor({
        ...baseAnchor,
        status: "resolved",
        title: "Tile sounds solid",
        subtitle: `${Math.round(result.confidence * 100)}% confidence`,
      });
      setInspectorMessage(
        `Tile sounds solid at the marked location in ${currentRoom}.`,
      );
    }

    const currentTapTimestamp = useBTOStore.getState().hudTapPoint?.timestamp ?? null;
    if (
      shouldClearHudTapPoint(
        generation,
        hudGenRef.current,
        requestTapTimestamp,
        currentTapTimestamp,
      )
    ) {
      setHudTapPoint(null);
    }
  }

  // ---- Detector status bar ----

  function renderDetectorBar() {
    if (hudMode !== "vision") return null;

    if (detectorStatus === "unavailable" || detectorStatus === "error") {
      return (
        <div className="hud-detector-bar hud-detector-bar--unavailable">
          <span className="hud-detector-dot" />
          <span className="font-mono">DETECTOR UNAVAILABLE</span>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>Manual mode</span>
        </div>
      );
    }

    if (detectorStatus === "warming-up") {
      return (
        <div className="hud-detector-bar hud-detector-bar--warming">
          <span className="hud-detector-dot hud-detector-dot--pulse" />
          <span className="font-mono">WARMING UP</span>
          <div className="hud-warmup-track">
            <div
              className="hud-warmup-fill"
              style={{ width: `${Math.round(warmUpProgress * 100)}%` }}
            />
          </div>
        </div>
      );
    }

    if (
      detectorStatus === "ready" ||
      detectorStatus === "running"
    ) {
      return (
        <div className="hud-detector-bar">
          <span className="hud-detector-dot hud-detector-dot--pulse" />
          <span className="font-mono">LIVE DETECT</span>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>
            {fps > 0 ? `${fps} FPS` : "..."}
          </span>
        </div>
      );
    }

    return null;
  }

  // ---- Render ----

  return (
    <div className="heads-up-section">
      <div className="heads-up-panel industrial-border">
        <div className="heads-up-topline">
          <div>
            <p className="heads-up-kicker font-mono">HEADS UP HUD</p>
            <h2 className="heads-up-title">{currentRoom}</h2>
          </div>
          <div
            className={`heads-up-badge heads-up-badge--${hudSupport.backend}`}
          >
            <span className="material-symbols-outlined">visibility</span>
            {hudSupport.mode.toUpperCase()} / {hudSupport.backend.toUpperCase()}
          </div>
        </div>
        <p className="heads-up-support">{hudSupport.reason}</p>
      </div>

      <div
        ref={viewfinderRef}
        className={`viewfinder industrial-border heads-up-viewfinder${workingAnchorId ? " heads-up-viewfinder--busy" : ""}`}
        onPointerUp={handleHudPointer}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="viewfinder-video"
        />

        {!streamActive && (
          <div className="viewfinder-placeholder">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 48, opacity: 0.3 }}
            >
              {cameraError ? "no_photography" : "photo_camera"}
            </span>
            <p className="font-mono">
              {cameraError ? "NO CAMERA" : "POINT & TAP"}
            </p>
            {cameraError && (
              <p className="viewfinder-error">{cameraError}</p>
            )}
            <button className="vf-fallback-btn" onClick={startStream}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18 }}
              >
                refresh
              </span>
              Retry Camera
            </button>
          </div>
        )}

        <div className="heads-up-clear-zone" aria-hidden="true">
          <span className="font-mono">CENTER STAYS CLEAR</span>
        </div>

        {renderDetectorBar()}

        {orderedAnchors.map((anchor) => {
          const isAuto = anchor.id.startsWith("auto-");
          return (
            <button
              key={anchor.id}
              className={`hud-pill hud-pill--${anchor.status} hud-pill--${anchor.side}${isAuto && anchor.status === "pending" ? " hud-pill--auto" : ""}`}
              style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
              onClick={(event) => {
                event.stopPropagation();
                if (anchor.status === "pending") {
                  void handlePillTap(anchor.id);
                }
              }}
              type="button"
            >
              <span className="hud-pill-title">{anchor.title}</span>
              <span className="hud-pill-subtitle">{anchor.subtitle}</span>
              <span className="hud-pill-action-row">
                <span className="hud-pill-status font-mono">
                  {anchor.status.replace("-", " ")}
                </span>
                <span
                  className="hud-pill-dismiss material-symbols-outlined"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDismissAnchor(anchor.id);
                  }}
                >
                  close
                </span>
              </span>
            </button>
          );
        })}

        <div className="heads-up-guides" aria-hidden="true">
          <div className="corner corner--tl" />
          <div className="corner corner--tr" />
          <div className="corner corner--bl" />
          <div className="corner corner--br" />
          <div className="hud-scanline" />
        </div>

        <div className="heads-up-controls">
          <div className="heads-up-mode-toggle">
            <button
              className={`heads-up-mode-btn ${hudMode === "vision" ? "heads-up-mode-btn--active" : ""}`}
              onClick={() => setHudMode("vision")}
              type="button"
            >
              <span className="material-symbols-outlined">search</span>
              Visual Mark
            </button>
            <button
              className={`heads-up-mode-btn ${hudMode === "acoustic" ? "heads-up-mode-btn--active" : ""}`}
              onClick={() => setHudMode("acoustic")}
              type="button"
            >
              <span className="material-symbols-outlined">graphic_eq</span>
              Acoustic Tile
            </button>
          </div>

          <div className="heads-up-inline-actions">
            <button
              className="vf-btn"
              onClick={handleAcousticCheck}
              disabled={hudMode !== "acoustic" || lastTapResult.loading}
              type="button"
            >
              <span className="material-symbols-outlined">mic</span>
              {lastTapResult.loading ? "Listening..." : "Run Acoustic Check"}
            </button>
            <button className="vf-btn" onClick={handleClearHud} type="button">
              <span className="material-symbols-outlined">layers_clear</span>
              Clear HUD
            </button>
          </div>
        </div>
      </div>

      <div className="heads-up-status-grid">
        <div className="heads-up-note industrial-border">
          <label htmlFor="hud-prompt" className="inspect-note-label font-mono">
            HUD NOTE
          </label>
          <textarea
            id="hud-prompt"
            className="inspect-note-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
          />
        </div>

        <div className="heads-up-note industrial-border">
          <p className="heads-up-note-label font-mono">INSPECTOR FEED</p>
          <p className="heads-up-note-copy">
            {inspectorMessage}
          </p>
          <p className="heads-up-note-meta">
            Mode: {hudMode === "vision" ? "Visual ROI" : "Acoustic tap"}
            {" \u00B7 "}Audio: {audioMode}
            {detectorStatus === "ready" || detectorStatus === "running"
              ? ` \u00B7 Detector: ${fps} FPS`
              : ""}
            {workingAnchorId
              ? ` \u00B7 Analyzing ${workingAnchorId.slice(0, 8)}`
              : ""}
            {hudTapPoint
              ? ` \u00B7 Tile @ ${hudTapPoint.x}, ${hudTapPoint.y}`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
