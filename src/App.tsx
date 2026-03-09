import { Suspense, lazy, useCallback, useState } from "react";
import { BtoApp } from "./BtoApp";
import { Layout, type ViewTab } from "./components/bto/Layout";
import { RoomNavigator } from "./components/bto/RoomNavigator";
import { AhSengAvatar } from "./components/bto/AhSengAvatar";
import { AudioCapture } from "./components/bto/AudioCapture";
import { Spectrogram } from "./components/bto/Spectrogram";
import { AcousticResultCard } from "./components/bto/AcousticResultCard";
import { CameraCapture } from "./components/bto/CameraCapture";
import { DefectLogSidebar } from "./components/bto/DefectLogSidebar";
import { HeadsUpView } from "./components/bto/HeadsUpView";
import { UnitInfo } from "./components/bto/UnitInfo";
import { ConfirmChopButton } from "./components/bto/ConfirmChopButton";
import { ChopStamp } from "./components/bto/ChopStamp";
import { ErrorBoundary } from "./components/bto/ErrorBoundary";
import { PlacementOverlayHarness } from "./components/bto/PlacementOverlayHarness";
import { useBTOAudio } from "./hooks/use-bto-audio";
import { useBTOStore } from "./lib/store";
import type { FailureMode } from "./lib/types";

const ReportDashboard = lazy(() => import("./components/bto/ReportDashboard"));

function LoadingSpinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div className="report-loading-bar" style={{ width: 160, height: 6 }}>
        <div className="report-loading-fill" />
      </div>
    </div>
  );
}

const FAILURE_LABELS: Record<FailureMode, string> = {
  audio: "Acoustic fallback",
  camera: "Vision fallback",
  report: "Report fallback",
};

function FailureControls() {
  const failureModes = useBTOStore((s) => s.failureModes);
  const setFailureMode = useBTOStore((s) => s.setFailureMode);

  return (
    <div className="fallback-panel industrial-border" data-testid="failure-controls">
      <div className="fallback-header">
        <p className="font-mono fallback-title">FAILSAFE CONTROLS</p>
        <span className="fallback-subtitle">Force graceful degradation paths for browser verification.</span>
      </div>
      <div className="fallback-grid">
        {(Object.keys(FAILURE_LABELS) as FailureMode[]).map((mode) => (
          <label key={mode} className="fallback-toggle" htmlFor={`failure-${mode}`}>
            <span>{FAILURE_LABELS[mode]}</span>
            <input
              id={`failure-${mode}`}
              type="checkbox"
              checked={failureModes[mode]}
              onChange={(event) => setFailureMode(mode, event.target.checked)}
              data-testid={`failure-${mode}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const { frequencyData, lastTapResult } = useBTOAudio();
  const inspectorMessage = useBTOStore((s) => s.inspectorMessage);
  const defects = useBTOStore((s) => s.defects);
  const [showStamp, setShowStamp] = useState(false);
  const [prevDefectCount, setPrevDefectCount] = useState(defects.length);
  if (defects.length > prevDefectCount) {
    setPrevDefectCount(defects.length);
    if (!showStamp) setShowStamp(true);
  } else if (defects.length !== prevDefectCount) {
    setPrevDefectCount(defects.length);
  }

  const handleStampDone = useCallback(() => setShowStamp(false), []);

  const harness =
    import.meta.env.DEV && typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("harness")
      : null;

  if (harness === "placement-overlay") {
    return <PlacementOverlayHarness />;
  }

  return (
    <>
      <Layout>
        {(activeTab: ViewTab) => {
          switch (activeTab) {
            case "scan":
              return (
                <ErrorBoundary label="Scan">
                  <div className="view-content animate-fade-in">
                    {/* System status */}
                    <div className="system-status font-mono phosphor-glow">
                      <p>&gt; BOOTING HDB_CONSTRUCTION_HUD...</p>
                      <p>&gt; LOADING AH_SENG_AI_V0.1... [SUCCESS]</p>
                      <p>&gt; MIC_INPUT: CALIBRATED (BTO SITE 14)</p>
                    </div>

                    <FailureControls />
                    <RoomNavigator />
                    <Spectrogram values={frequencyData} />
                    <AhSengAvatar />
                    <AcousticResultCard result={lastTapResult} inspectorMessage={inspectorMessage} />
                    <AudioCapture />
                  </div>
                </ErrorBoundary>
              );

            case "logger":
              return (
                <ErrorBoundary label="Logger">
                  <div className="view-content animate-fade-in" style={{ paddingBottom: 0 }}>
                    <FailureControls />
                    <RoomNavigator />
                    <div style={{ height: 12 }} />
                    <UnitInfo />
                    <div style={{ height: 16 }} />
                    <CameraCapture />
                    <div style={{ height: 16 }} />
                    <DefectLogSidebar />
                    <ConfirmChopButton />
                  </div>
                </ErrorBoundary>
              );

            case "heads-up":
              return (
                <ErrorBoundary label="Heads Up">
                  <div className="view-content animate-fade-in" style={{ paddingBottom: 0 }}>
                    <FailureControls />
                    <RoomNavigator />
                    <div style={{ height: 8 }} />
                    <HeadsUpView />
                    <div style={{ height: 16 }} />
                    <DefectLogSidebar />
                  </div>
                </ErrorBoundary>
              );

            case "report":
              return (
                <ErrorBoundary label="Report">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div className="view-content animate-fade-in">
                      <FailureControls />
                      <ReportDashboard />
                    </div>
                  </Suspense>
                </ErrorBoundary>
              );
          }
        }}
      </Layout>
      <ChopStamp visible={showStamp} onDone={handleStampDone} />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary label="BTO-Sensei">
      <BtoApp>
        <AppContent />
      </BtoApp>
    </ErrorBoundary>
  );
}

export default App;
