export type Severity = "Minor" | "Moderate" | "Critical";
export type AudioMode = "prerecorded" | "live-mic";
export type TapClassification = "hollow" | "solid";
export type FailureMode = "audio" | "camera" | "report";

export interface TapResult {
  type: TapClassification;
  confidence: number;
  commentary: string;
}

export interface Measurement {
  width_mm?: number;
  length_mm?: number;
  depth_mm?: string;
  reference_object: string;
  notes: string;
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
  measurement?: Measurement;
  severity_rationale?: string;
  review_required?: boolean;
  bbox?: [number, number, number, number];
  agentic_pass?: boolean;
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
  cover_summary?: string;
}

export type FlatType = "3-room" | "4-room" | "5-room";

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
  flatType: FlatType;
  setFlatType: (type: FlatType) => void;
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
  lastTapResult: AsyncState<TapResult>;
  setLastTapResult: (state: AsyncState<TapResult>) => void;
  frequencyData: Float32Array | null;
  setFrequencyData: (data: Float32Array | null) => void;
  defects: Defect[];
  addDefect: (defect: Defect) => void;
  updateDefect: (id: string, patch: Partial<Defect>) => void;
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
  apiKeyVersion: number;
  bumpApiKeyVersion: () => void;
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
  sendToVision: (frameUrl: string, prompt?: string, measureMode?: boolean) => Promise<void>;
  loadFromFile: (file: File) => Promise<void>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  streamActive: boolean;
  cameraError: string | null;
  startStream: () => Promise<void>;
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
  severity_rationale?: string;
  review_required?: boolean;
  bbox?: [number, number, number, number];
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
