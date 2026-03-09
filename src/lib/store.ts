import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FALLBACKS, GEMINI_REPORT_RETRY, withRetryAndFallback } from "./fallback";
import { clampBBox } from "./defect-utils";
import { deriveBlueprintCoords, generateInspectionReport } from "./gemini-report";
import type {
  AsyncState,
  BlueprintCoord,
  BTOStore,
  DefectPlacement,
  ExplanationQueueItem,
  FailureMode,
  FloorPlanDraft,
  FlatType,
  InspectionReport,
  PlanEditorState,
  PlanImportState,
  SpatialMode,
  TapResult,
  UnitPlan,
} from "./types";

const memoryStore = new Map<string, string>();

const memoryStorage: Storage = {
  get length() {
    return memoryStore.size;
  },
  clear() {
    memoryStore.clear();
  },
  getItem(key) {
    return memoryStore.get(key) ?? null;
  },
  key(index) {
    return Array.from(memoryStore.keys())[index] ?? null;
  },
  removeItem(key) {
    memoryStore.delete(key);
  },
  setItem(key, value) {
    memoryStore.set(key, value);
  },
};

function getStorage() {
  if (typeof window === "undefined") {
    return memoryStorage;
  }

  return window.sessionStorage;
}

function emptyAsyncState<T>(): AsyncState<T> {
  return {
    data: null,
    loading: false,
    error: null,
  };
}

type PersistedState = Pick<BTOStore, "currentRoom" | "audioMode" | "defects" | "flatType"> & {
  reportData: InspectionReport | null;
  // v2 spatial fields
  spatialMode?: SpatialMode;
  unitPlan?: UnitPlan | null;
  defectPlacements?: Record<string, DefectPlacement>;
};

const DEFAULT_PLAN_EDITOR_STATE: PlanEditorState = {
  selectedRoomId: null,
  selectedSegmentId: null,
  dragVertex: null,
  dirty: false,
};

const DEFAULT_PLAN_IMPORT_STATE: PlanImportState = {
  status: "idle",
};

function buildReportState(data: InspectionReport | null): AsyncState<InspectionReport> {
  return {
    data,
    loading: false,
    error: null,
  };
}

function buildReportStatusMessage(error: string | null): string {
  if (!error) {
    return "Report ready lah. Prioritise the serious items first.";
  }

  const lowered = error.toLowerCase();
  if (lowered.includes("timed out")) {
    return "AI report generation took too long, so I loaded a fallback report. Review it before sharing.";
  }
  if (lowered.includes("api key")) {
    return "No Gemini API key configured. Generated a local report for manual review.";
  }
  if (lowered.includes("429") || lowered.includes("rate")) {
    return "Gemini rate-limited the report request, so I loaded a fallback report. Try again shortly.";
  }

  return "Report generated using fallback data. Review before sharing.";
}

function buildBlueprintState(defects: BTOStore["defects"], flatType: FlatType): AsyncState<BlueprintCoord[]> {
  return {
    data: deriveBlueprintCoords(defects, flatType),
    loading: false,
    error: null,
  };
}

export const useBTOStore = create<BTOStore>()(
  persist(
    (set, get) => ({
      currentRoom: "Living Room",
      setCurrentRoom: (room) => set({ currentRoom: room }),
      flatType: "4-room" as FlatType,
      setFlatType: (type) => set({ flatType: type }),
      audioMode: "prerecorded",
      setAudioMode: (mode) => set({ audioMode: mode }),
      lastTapResult: emptyAsyncState<TapResult>(),
      setLastTapResult: (state) => set({ lastTapResult: state }),
      frequencyData: null,
      setFrequencyData: (data) => set({ frequencyData: data }),
      defects: [],
      addDefect: (defect) =>
        set((state) => ({
          defects: [...state.defects, { ...defect, bbox: clampBBox(defect.bbox) }],
          blueprintCoords: buildBlueprintState([...state.defects, { ...defect, bbox: clampBBox(defect.bbox) }], state.flatType),
        })),
      updateDefect: (id, patch) =>
        set((state) => {
          const defects = state.defects.map((defect) => defect.id === id
            ? { ...defect, ...patch, bbox: clampBBox(patch.bbox ?? defect.bbox) }
            : defect);

          return {
            defects,
            blueprintCoords: buildBlueprintState(defects, state.flatType),
          };
        }),
      hudSupport: {
        mode: "manual",
        backend: "none",
        reason: "Tap to mark defects manually. Local edge detection can be wired in behind this HUD contract.",
      },
      setHudSupport: (support) => set({ hudSupport: support }),
      hudMode: "vision",
      setHudMode: (mode) => set({ hudMode: mode }),
      hudDetections: [],
      setHudDetections: (detections) => set({ hudDetections: detections }),
      addHudDetection: (detection) =>
        set((state) => {
          const next = [...state.hudDetections, detection];
          return { hudDetections: next.length > 50 ? next.slice(-50) : next };
        }),
      hudAnchors: [],
      upsertHudAnchor: (anchor) =>
        set((state) => ({
          hudAnchors: state.hudAnchors.some((entry) => entry.id === anchor.id)
            ? state.hudAnchors.map((entry) => entry.id === anchor.id ? anchor : entry)
            : [...state.hudAnchors, anchor],
        })),
      removeHudAnchor: (id) =>
        set((state) => ({
          hudAnchors: state.hudAnchors.filter((anchor) => anchor.id !== id),
        })),
      clearHudAnchors: () => set({ hudAnchors: [], hudDetections: [] }),
      hudTapPoint: null,
      setHudTapPoint: (point) => set({ hudTapPoint: point }),
      clearHudSession: () => set({ hudDetections: [], hudAnchors: [], hudTapPoint: null }),
      cameraPreview: null,
      setCameraPreview: (url) => set({ cameraPreview: url }),
      report: emptyAsyncState<InspectionReport>(),
      requestReport: async (flatId) => {
        const defects = get().defects;
        const inspectionDate = new Date().toISOString().slice(0, 10);

        set((state) => ({
          report: {
            ...state.report,
            loading: true,
            error: null,
          },
        }));

        const result = await withRetryAndFallback(
          async () => {
            if (get().failureModes.report) {
              throw new Error("Simulated report service outage.");
            }

            return generateInspectionReport(defects, flatId, inspectionDate);
          },
          FALLBACKS.report(flatId, defects),
          30000,
          GEMINI_REPORT_RETRY,
        );

        set({
          report: {
            data: result.data,
            loading: false,
            error: result.error,
          },
          inspectorMessage: buildReportStatusMessage(result.error),
        });
      },
      blueprintCoords: emptyAsyncState<BlueprintCoord[]>(),
      setBlueprintCoords: (state) => set({ blueprintCoords: state }),
      sessionConnected: false,
      sessionError: null,
      sessionPrompt: "",
      sessionTools: [],
      setSessionState: (connected, error = null) =>
        set({ sessionConnected: connected, sessionError: error }),
      setSessionPrompt: (prompt) => set({ sessionPrompt: prompt }),
      setSessionTools: (tools) => set({ sessionTools: tools }),
      inspectorMessage:
        "Acoustic-first session ready. Start with a tap test, then capture evidence.",
      setInspectorMessage: (message) => set({ inspectorMessage: message }),
      failureModes: {
        audio: false,
        camera: false,
        report: false,
      },
      setFailureMode: (mode: FailureMode, enabled: boolean) =>
        set((state) => ({
          failureModes: {
            ...state.failureModes,
            [mode]: enabled,
          },
        })),
      apiKeyVersion: 0,
      bumpApiKeyVersion: () =>
        set((state) => ({ apiKeyVersion: state.apiKeyVersion + 1 })),
      explanationQueue: [] as ExplanationQueueItem[],
      enqueueExplanation: (item: ExplanationQueueItem) =>
        set((state) => ({
          explanationQueue: [...state.explanationQueue, item].slice(-50),
        })),
      updateExplanation: (id: string, patch: Partial<ExplanationQueueItem>) =>
        set((state) => ({
          explanationQueue: state.explanationQueue.map((entry) =>
            entry.id === id ? { ...entry, ...patch } : entry,
          ),
        })),
      clearCompletedExplanations: () =>
        set((state) => ({
          explanationQueue: state.explanationQueue.filter(
            (entry) => entry.status !== "completed" && entry.status !== "failed",
          ),
        })),

      // ── Spatial Truth state & actions ──
      spatialMode: "fallback" as SpatialMode,
      setSpatialMode: (mode: SpatialMode) => set({ spatialMode: mode }),

      unitPlan: null as UnitPlan | null,
      planDraft: null as FloorPlanDraft | null,
      setPlanDraft: (draft: FloorPlanDraft | null) => set({ planDraft: draft }),

      verifyUnitPlan: (plan: UnitPlan) =>
        set({
          unitPlan: { ...plan, status: "verified" },
          planDraft: null,
          spatialMode: "verified-plan",
        }),

      clearUnitPlan: () =>
        set({
          unitPlan: null,
          planDraft: null,
          spatialMode: "fallback",
          selectedPlanRoomId: null,
          defectPlacements: {},
          planEditorState: DEFAULT_PLAN_EDITOR_STATE,
          planImportState: DEFAULT_PLAN_IMPORT_STATE,
        }),

      defectPlacements: {} as Record<string, DefectPlacement>,
      upsertDefectPlacement: (placement: DefectPlacement) =>
        set((state) => ({
          defectPlacements: {
            ...state.defectPlacements,
            [placement.defectId]: placement,
          },
        })),
      removeDefectPlacement: (defectId: string) =>
        set((state) => {
          const next = { ...state.defectPlacements };
          delete next[defectId];
          return { defectPlacements: next };
        }),

      selectedPlanRoomId: null as string | null,
      setSelectedPlanRoomId: (roomId: string | null) => set({ selectedPlanRoomId: roomId }),

      planEditorState: DEFAULT_PLAN_EDITOR_STATE,
      setPlanEditorState: (patch: Partial<PlanEditorState>) =>
        set((state) => ({
          planEditorState: { ...state.planEditorState, ...patch },
        })),

      planImportState: DEFAULT_PLAN_IMPORT_STATE as PlanImportState,
      setPlanImportState: (patch: Partial<PlanImportState>) =>
        set((state) => ({
          planImportState: { ...state.planImportState, ...patch },
        })),
    }),
    {
      name: "bto-store",
      version: 2,
      storage: createJSONStorage(() => getStorage()),
      partialize: (state): PersistedState => ({
        currentRoom: state.currentRoom,
        flatType: state.flatType,
        audioMode: state.audioMode,
        defects: state.defects,
        reportData: state.report.data,
        spatialMode: state.spatialMode,
        // Strip rawAssetRef to avoid bloating sessionStorage
        unitPlan: state.unitPlan
          ? { ...state.unitPlan, rawAssetRef: undefined }
          : null,
        defectPlacements: state.defectPlacements,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as PersistedState | undefined;
        const effectiveSpatialMode: SpatialMode =
          persistedState?.unitPlan?.status === "verified"
            ? (persistedState.spatialMode ?? "verified-plan")
            : "fallback";
        return {
          ...current,
          ...(persistedState ?? {}),
          report: buildReportState(persistedState?.reportData ?? null),
          blueprintCoords: buildBlueprintState(persistedState?.defects ?? [], persistedState?.flatType ?? "4-room"),
          spatialMode: effectiveSpatialMode,
          unitPlan: persistedState?.unitPlan ?? null,
          defectPlacements: persistedState?.defectPlacements ?? {},
          planDraft: null,
          selectedPlanRoomId: null,
          planEditorState: DEFAULT_PLAN_EDITOR_STATE,
          planImportState: DEFAULT_PLAN_IMPORT_STATE,
        };
      },
      migrate: (persisted, version) => {
        const state = persisted as PersistedState;
        if (version < 2) {
          // v1 -> v2: add spatial fields with safe defaults
          return {
            ...state,
            spatialMode: "fallback" as SpatialMode,
            unitPlan: null,
            defectPlacements: {},
          };
        }
        return state;
      },
    },
  ),
);
