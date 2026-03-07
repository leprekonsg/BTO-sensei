export type Severity = "Minor" | "Moderate" | "Critical";
export type AudioMode = "prerecorded" | "live-mic";
export type TapClassification = "hollow" | "solid";
export type FailureMode = "audio" | "camera" | "report";

export interface TapResult {
  type: TapClassification;
  confidence: number;
  commentary: string;
}

export interface Defect {
  id: string;
  room: string;
  defect_type: string;
  severity: Severity;
  description: string;
  recommendation: string;
  confidence: number;
  photo_url?: string;
  timestamp: number;
}

export interface RoomScore {
  room: string;
  score: number;
  summary: string;
}

export interface InspectionReport {
  flat_id: string;
  inspection_date: string;
  overall_health_score: number;
  room_scores: RoomScore[];
  priority_defects: Defect[];
  inspector_note: string;
}

export interface BlueprintCoord {
  defect_id: string;
  x: number;
  y: number;
  severity: Severity;
  label: string;
}

export interface AsyncState<T = unknown> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface FailureModes {
  audio: boolean;
  camera: boolean;
  report: boolean;
}

export interface BTOStore {
  currentRoom: RoomName;
  setCurrentRoom: (room: RoomName) => void;
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
  lastTapResult: AsyncState<TapResult>;
  setLastTapResult: (state: AsyncState<TapResult>) => void;
  frequencyData: Float32Array | null;
  setFrequencyData: (data: Float32Array | null) => void;
  defects: Defect[];
  addDefect: (defect: Defect) => void;
  cameraPreview: string | null;
  setCameraPreview: (url: string | null) => void;
  report: AsyncState<InspectionReport>;
  requestReport: (flatId: string) => Promise<void>;
  blueprintCoords: AsyncState<BlueprintCoord[]>;
  setBlueprintCoords: (state: AsyncState<BlueprintCoord[]>) => void;
  sessionConnected: boolean;
  sessionError: string | null;
  sessionPrompt: string;
  sessionTools: string[];
  setSessionState: (connected: boolean, error?: string | null) => void;
  setSessionPrompt: (prompt: string) => void;
  setSessionTools: (tools: string[]) => void;
  inspectorMessage: string;
  setInspectorMessage: (message: string) => void;
  failureModes: FailureModes;
  setFailureMode: (mode: FailureMode, enabled: boolean) => void;
}

export interface UseBTOAudioReturn {
  analyzeTap: (
    source: "prerecorded-hollow" | "prerecorded-solid" | AudioBuffer,
  ) => Promise<void>;
  analyzeLiveMic: () => Promise<void>;
  frequencyData: Float32Array | null;
  lastTapResult: AsyncState<TapResult>;
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
}

export interface UseCameraReturn {
  captureFrame: () => Promise<string | null>;
  sendToVision: (frameUrl: string, prompt?: string) => Promise<void>;
}

export interface AcousticToolPayload {
  tile_type: TapClassification;
  confidence: number;
}

export interface LogDefectToolPayload {
  room: string;
  defect_type: string;
  severity: Severity;
  description: string;
  recommendation: string;
  confidence: number;
}

export interface GenerateReportToolPayload {
  flat_id: string;
  inspection_date: string;
}

export const ROOMS = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Common Bedroom",
  "Master Bathroom",
  "Common Bathroom",
  "Balcony",
] as const;

export type RoomName = (typeof ROOMS)[number];
