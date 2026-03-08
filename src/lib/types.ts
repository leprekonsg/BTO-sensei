export type Severity = "Minor" | "Moderate" | "Critical";
export type ConquasVerdict = "PASS" | "FAIL";
export type AudioMode = "prerecorded" | "live-mic";
export type TapClassification = "hollow" | "solid";
export type FailureMode = "audio" | "camera" | "report";
export type DefectSource = "manual-vision" | "hud-vision" | "acoustic";
export type HudAnchorStatus = "pending" | "locked" | "explaining" | "resolved" | "review-required";
export type HudAnchorSide = "left" | "right";
export type HudMode = "vision" | "acoustic";

export interface HudSupport {
  mode: "manual" | "auto" | "auto-fallback";
  backend: "webgpu" | "webgl" | "wasm" | "none";
  reason: string;
}

export interface HudDetection {
  id: string;
  bbox: [number, number, number, number];
  score: number;
  label_hint?: string;
  stability: number;
  last_seen_at: number;
  source: "manual" | "canvas-detector";
}

export interface HudAnchor {
  id: string;
  detection_id: string;
  bbox: [number, number, number, number];
  x: number;
  y: number;
  side: HudAnchorSide;
  status: HudAnchorStatus;
  title: string;
  subtitle: string;
  defect_id?: string;
  review_required?: boolean;
}

export interface HudTapPoint {
  x: number;
  y: number;
  timestamp: number;
}

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
  gap_mm?: number;
  lippage_mm?: number;
  verticality_mm_per_m?: number;
  surface_evenness_mm?: number;
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
  source?: DefectSource;
  evidence_thumbnail?: string;
  conquas_item_id?: string;
  conquas_appendix?: string;
  conquas_verdict?: ConquasVerdict;
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
  conquas_grade?: "Pass" | "Fail" | "Conditional";
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
  hudSupport: HudSupport;
  setHudSupport: (support: HudSupport) => void;
  hudMode: HudMode;
  setHudMode: (mode: HudMode) => void;
  hudDetections: HudDetection[];
  setHudDetections: (detections: HudDetection[]) => void;
  addHudDetection: (detection: HudDetection) => void;
  hudAnchors: HudAnchor[];
  upsertHudAnchor: (anchor: HudAnchor) => void;
  removeHudAnchor: (id: string) => void;
  clearHudAnchors: () => void;
  hudTapPoint: HudTapPoint | null;
  setHudTapPoint: (point: HudTapPoint | null) => void;
  clearHudSession: () => void;
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
  ) => Promise<TapResult | null>;
  analyzeLiveMic: () => Promise<TapResult | null>;
  frequencyData: Float32Array | null;
  lastTapResult: AsyncState<TapResult>;
  audioMode: AudioMode;
  setAudioMode: (mode: AudioMode) => void;
}

export interface UseCameraReturn {
  captureFrame: () => Promise<string | null>;
  sendToVision: (frameUrl: string, prompt?: string, measureMode?: boolean) => Promise<void>;
  analyzeHudRegion: (
    bbox: [number, number, number, number],
    prompt?: string,
  ) => Promise<Defect | null>;
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
