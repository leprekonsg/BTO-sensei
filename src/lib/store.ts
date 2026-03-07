import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FALLBACKS, GEMINI_RATE_LIMIT_RETRY, withRetryAndFallback } from "./fallback";
import { deriveBlueprintCoords, generateInspectionReport } from "./gemini-report";
import type {
  AsyncState,
  BlueprintCoord,
  BTOStore,
  FailureMode,
  InspectionReport,
  TapResult,
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

type PersistedState = Pick<BTOStore, "currentRoom" | "audioMode" | "defects"> & {
  reportData: InspectionReport | null;
};

function buildReportState(data: InspectionReport | null): AsyncState<InspectionReport> {
  return {
    data,
    loading: false,
    error: null,
  };
}

export const useBTOStore = create<BTOStore>()(
  persist(
    (set, get) => ({
      currentRoom: "Living Room",
      setCurrentRoom: (room) => set({ currentRoom: room }),
      audioMode: "prerecorded",
      setAudioMode: (mode) => set({ audioMode: mode }),
      lastTapResult: emptyAsyncState<TapResult>(),
      setLastTapResult: (state) => set({ lastTapResult: state }),
      frequencyData: null,
      setFrequencyData: (data) => set({ frequencyData: data }),
      defects: [],
      addDefect: (defect) =>
        set((state) => ({
          defects: [...state.defects, defect],
          blueprintCoords: {
            data: deriveBlueprintCoords([...state.defects, defect]),
            loading: false,
            error: null,
          },
        })),
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
          15000,
          GEMINI_RATE_LIMIT_RETRY,
        );

        set({
          report: {
            data: result.data,
            loading: false,
            error: result.error,
          },
          inspectorMessage: result.error
            ? "Report generated using fallback data. Review before sharing."
            : "Report ready lah. Prioritise the serious items first.",
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
    }),
    {
      name: "bto-store",
      version: 1,
      storage: createJSONStorage(() => getStorage()),
      partialize: (state): PersistedState => ({
        currentRoom: state.currentRoom,
        audioMode: state.audioMode,
        defects: state.defects,
        reportData: state.report.data,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as PersistedState | undefined;
        return {
          ...current,
          ...(persistedState ?? {}),
          report: buildReportState(persistedState?.reportData ?? null),
          blueprintCoords: {
            data: deriveBlueprintCoords(persistedState?.defects ?? []),
            loading: false,
            error: null,
          },
        };
      },
    },
  ),
);
