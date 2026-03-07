import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, ThinkingLevel } from "@google/genai";
import { getGeminiClient } from "./use-bto-config";
import { FALLBACKS, GEMINI_RATE_LIMIT_RETRY, withRetryAndFallback } from "../lib/fallback";
import {
  buildInvalidSeverityRationale,
  clampBBox,
  mergeVisionUpdate,
  needsAgenticPass,
  normalizeSeverity,
  validateSeverity,
  type VisionLikeResponse,
} from "../lib/defect-utils";
import { sendVisionToSession } from "../lib/gemini-prompts";
import { useBTOStore } from "../lib/store";
import type { Defect, Measurement, Severity, UseCameraReturn } from "../lib/types";

const VISION_MODEL = "gemini-3-flash-preview";
const AGENTIC_TIMEOUT_MS = 12000;
const AGENTIC_MEASURE_TIMEOUT_MS = 20000;

const CONQUAS_SEVERITY_PROMPT = `SEVERITY CLASSIFICATION (BCA CONQUAS):
- Critical: Water seepage/leakage, broken glass, structural cracks >0.3mm or >300mm,
  non-functional doors/windows/locks, waterproofing failure, electrical hazard, FCU leak.
- Moderate: Hollow tiles, hairline cracks >50mm, paint spalling >50mm, misaligned frames >3mm,
  chipped tile edges, loose fittings.
- Minor: Cosmetic scratches, small paint blemishes <50mm, tonality differences, minor alignment,
  removable stains, scuff marks.`;

interface VisionResponse extends VisionLikeResponse {
  defect_type: string;
  severity: Severity;
  severity_rationale: string;
  description: string;
  recommendation: string;
  confidence: number;
  bbox?: [number, number, number, number] | null;
  measurement?: Measurement;
}

function toAgenticErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status ? `Gemini API ${error.status}: ${error.message}` : error.message;
  }
  if (error instanceof SyntaxError) {
    return `Agentic vision returned invalid JSON: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown agentic vision failure.";
}

/** Second-pass agentic verification with code execution for ambiguous defects. */
async function triggerAgenticPass(
  base64Data: string,
  mimeType: string,
  fastResult: VisionResponse,
  room: string,
  measureMode = false,
): Promise<Partial<VisionResponse> | null> {
  const client = getGeminiClient();
  if (!client) return null;

  const bboxContext = fastResult.bbox
    ? `\nThe fast pass identified a bounding box at [${fastResult.bbox.join(", ")}] (normalized 0-1000).`
    : "";

  const prompt = `You are verifying a defect classification from a fast pass. The initial result was:
- Type: ${fastResult.defect_type}
- Severity: ${fastResult.severity} (rationale: ${fastResult.severity_rationale})
- Confidence: ${fastResult.confidence}
- Room: ${room}${bboxContext}

${CONQUAS_SEVERITY_PROMPT}

${measureMode
    ? `MEASUREMENT MODE:
- A Singapore 50-cent coin (24.66mm diameter) should be visible as the scale reference.
- Use code execution to inspect the image, zoom into the defect, and estimate width/length using the coin when possible.`
    : "Use code execution to analyze the image if helpful (e.g. measure crack width relative to reference objects, check color distribution for water stains)."}
Then provide your final verified assessment.

Return ONLY valid JSON:
{
  "defect_type": "...",
  "severity": "Minor" | "Moderate" | "Critical",
  "severity_rationale": "one-line reason after verification",
  "description": "...",
  "recommendation": "...",
  "confidence": 0.0-1.0,
  "bbox": [ymin, xmin, ymax, xmax] or null${measureMode ? `,
  "measurement": {
    "width_mm": <estimated width in mm>,
    "length_mm": <estimated length in mm>,
    "depth_mm": "<estimated depth description>",
    "reference_object": "SG 50-cent coin (24.66mm)",
    "notes": "<measurement notes>"
  }` : ""}
}`;

  try {
    const response = await client.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
      ],
      config: {
        tools: [{ codeExecution: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "text/plain",
      },
    });

    // Code execution responses have multiple parts (executableCode, codeExecutionResult, text).
    // Extract the last text part which contains the final JSON answer.
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts?.length) return null;

    let lastText = "";
    for (const part of parts) {
      if (part.text) lastText = part.text;
    }
    if (!lastText) return null;

    // Extract JSON from potential markdown fences
    const jsonMatch = lastText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, lastText];
    const cleaned = (jsonMatch[1] ?? lastText).trim();
    return JSON.parse(cleaned) as Partial<VisionResponse>;
  } catch (error) {
    throw new Error(toAgenticErrorMessage(error));
  }
}

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `defect-${Date.now()}`;
}

/** Wait until video element reports non-zero dimensions (metadata loaded). */
function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 3000): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const onReady = () => { cleanup(); resolve(); };
    const timer = window.setTimeout(onReady, timeoutMs);
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      window.clearTimeout(timer);
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
  });
}

export function useCamera(): UseCameraReturn {
  const currentRoom = useBTOStore((state) => state.currentRoom);
  const setCameraPreview = useBTOStore((state) => state.setCameraPreview);
  const addDefect = useBTOStore((state) => state.addDefect);
  const updateDefect = useBTOStore((state) => state.updateDefect);
  const failureModes = useBTOStore((state) => state.failureModes);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startStream = useCallback(async () => {
    if (streamRef.current) return; // already running
    setCameraError(null);

    // Try multiple constraints -- environment (mobile), then user (laptop), then bare minimum
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true },
    ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "");
          await videoRef.current.play();
          await waitForVideoReady(videoRef.current);
        }
        setStreamActive(true);
        setCameraError(null);
        return;
      } catch (err) {
        lastError = err;
      }
    }

    // All attempts failed -- surface the error
    const msg = lastError instanceof DOMException
      ? lastError.name === "NotAllowedError"
        ? "Camera access denied. Check browser permissions (click the lock icon in the address bar)."
        : lastError.name === "NotFoundError"
          ? "No camera detected. Use the upload button to load a photo instead."
          : `Camera error: ${lastError.message}`
      : "Camera unavailable. Use the upload button to load a photo instead.";
    setCameraError(msg);
    setStreamActive(false);
  }, []);

  // Auto-start camera on mount
  useEffect(() => {
    startStream();
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setStreamActive(false);
    };
  }, [startStream]);

  async function captureFrame() {
    // If the stream isn't active, try to start it first
    if (!streamRef.current) {
      await startStream();
    }

    const video = videoRef.current;
    // Wait a beat for dimensions if the stream just started
    if (video && video.videoWidth === 0) {
      await waitForVideoReady(video, 2000);
    }

    if (!video || video.videoWidth === 0) {
      // Fallback: generate a placeholder preview
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
        <rect width="720" height="480" fill="#151a1f" rx="28"/>
        <rect x="56" y="62" width="608" height="356" rx="22" fill="#232b33" stroke="#fa7c2f" stroke-width="6"/>
        <text x="72" y="104" fill="#f4f1ea" font-size="34" font-family="sans-serif">${currentRoom}</text>
        <text x="72" y="382" fill="#b7b7b1" font-size="22" font-family="sans-serif">Camera unavailable - simulated frame</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      setCameraPreview(dataUrl);
      return dataUrl;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCameraPreview(dataUrl);
    return dataUrl;
  }

  async function sendToVision(frameUrl: string, prompt = "", measureMode = false) {
    const fallback = FALLBACKS.vision(currentRoom, frameUrl);
    const base64Match = frameUrl.match(/^data:([^;]+);base64,(.+)$/);
    const agenticContext = base64Match
      ? { mimeType: base64Match[1], base64Data: base64Match[2] }
      : null;

    const result = await withRetryAndFallback(
      async () => {
        if (!frameUrl) throw new Error("Capture a frame before running evidence analysis.");
        if (failureModes.camera) throw new Error("Simulated vision service outage.");

        const client = getGeminiClient();
        if (!client) {
          throw new Error("No Gemini API key configured.");
        }

        if (!agenticContext) {
          return inferDefectLocal(prompt, currentRoom, frameUrl, measureMode);
        }

        const { mimeType, base64Data } = agenticContext;

        const measurementInstructions = measureMode
          ? `\n\nMEASUREMENT MODE: A Singapore 50-cent coin (24.66mm diameter) should be visible as a size reference.
Estimate the physical dimensions of the defect relative to the coin.
Include a "measurement" field in your response:
{
  "measurement": {
    "width_mm": <estimated width in mm>,
    "length_mm": <estimated length in mm>,
    "depth_mm": "<estimated depth description, e.g. 'surface-level' or '~2mm'>",
    "reference_object": "SG 50-cent coin (24.66mm)",
    "notes": "<any measurement notes>"
  }
}`
          : "";

        const visionPrompt = `You are Ah Seng, a veteran Singapore BTO flat inspector. Analyze this photo from the ${currentRoom} for construction defects.
${prompt ? `User note: ${prompt}` : ""}

${CONQUAS_SEVERITY_PROMPT}

Return a JSON object with:
{
  "defect_type": "type of defect found (e.g. Wall crack, Hollow tile, Water stain, Paint defect, Chipped edge)",
  "severity": "Minor" | "Moderate" | "Critical",
  "severity_rationale": "one-line reason referencing the criteria above",
  "description": "brief description of what you see",
  "recommendation": "what the homeowner should do",
  "confidence": <number 0.0 to 1.0>,
  "bbox": [ymin, xmin, ymax, xmax] // normalized 0-1000, or null${measureMode ? ',\n  "measurement": { ... }' : ""}
}${measurementInstructions}

If no defect is visible, still return your best assessment. Return ONLY valid JSON.`;

        const response = await client.models.generateContent({
          model: VISION_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: visionPrompt },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        const text = response.text?.trim();
        if (!text) throw new Error("Empty response from Gemini Vision");

        const parsed = JSON.parse(text) as VisionResponse;
        const parsedSeverity = normalizeSeverity(parsed.severity);

        let defect: Defect = {
          id: nextId(),
          room: currentRoom,
          defect_type: parsed.defect_type || "Unclassified defect",
          severity: parsedSeverity ?? "Moderate",
          description: parsed.description || "Defect detected by AI vision.",
          recommendation: parsed.recommendation || "Log and follow up during defect liability period.",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
          photo_url: frameUrl,
          timestamp: Date.now(),
          severity_rationale: parsedSeverity
            ? parsed.severity_rationale || undefined
            : buildInvalidSeverityRationale("Fast pass", parsed.severity_rationale),
          review_required: parsedSeverity ? undefined : true,
          bbox: clampBBox(parsed.bbox),
        };

        if (parsed.measurement) {
          defect.measurement = parsed.measurement;
        }

        return validateSeverity(defect);
      },
      fallback,
      15000,
      GEMINI_RATE_LIMIT_RETRY,
    );

    addDefect(result.data);

    const measureInfo = result.data.measurement
      ? ` (~${result.data.measurement.width_mm ?? "?"}mm x ${result.data.measurement.length_mm ?? "?"}mm)`
      : "";
    const fallbackMessage = result.error?.toLowerCase().includes("api key")
      ? "No Gemini API key configured, so I logged an offline fallback defect for manual verification."
      : "Vision service dropped, but I logged a fallback defect for follow-up.";
    setInspectorMessage(
      result.error
        ? fallbackMessage
        : `${result.data.defect_type}${measureInfo} logged in ${currentRoom}.`,
    );

    void sendVisionToSession(
      currentRoom,
      `${result.data.defect_type} (${result.data.severity}): ${result.data.description}${measureInfo}`,
    );

    if (!result.isFallback && agenticContext && needsAgenticPass(result.data, measureMode)) {
      void (async () => {
        try {
          const baseResult: VisionResponse = {
            defect_type: result.data.defect_type,
            severity: result.data.severity,
            severity_rationale: result.data.severity_rationale ?? "",
            description: result.data.description,
            recommendation: result.data.recommendation,
            confidence: result.data.confidence,
            bbox: result.data.bbox,
            measurement: result.data.measurement,
          };

          const agenticResult = await Promise.race([
            triggerAgenticPass(agenticContext.base64Data, agenticContext.mimeType, baseResult, currentRoom, measureMode),
            new Promise<null>((resolve) => {
              window.setTimeout(
                () => resolve(null),
                measureMode ? AGENTIC_MEASURE_TIMEOUT_MS : AGENTIC_TIMEOUT_MS,
              );
            }),
          ]);

          if (!agenticResult) {
            updateDefect(result.data.id, validateSeverity({
              ...result.data,
              review_required: true,
              severity_rationale: result.data.severity_rationale ?? "Agentic verification timed out. Verify on site.",
            }));
            setInspectorMessage(`${result.data.defect_type} logged. Verification timed out, verify on site.`);
            return;
          }

          const refined = mergeVisionUpdate({ ...result.data, agentic_pass: true }, agenticResult);
          const measurementPatch = agenticResult.measurement ? { measurement: agenticResult.measurement } : {};
          updateDefect(result.data.id, { ...refined, ...measurementPatch, agentic_pass: true });
          setInspectorMessage(`${refined.defect_type} verified with second-pass analysis in ${currentRoom}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Agentic verification failed";
          updateDefect(result.data.id, validateSeverity({
            ...result.data,
            review_required: true,
            severity_rationale: result.data.severity_rationale ?? "Agentic verification failed. Verify on site.",
          }));
          setInspectorMessage(`${result.data.defect_type} logged. ${message}. Verify on site.`);
        }
      })();
    }
  }

  async function loadFromFile(file: File) {
    return new Promise<void>((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Selected file is not an image."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCameraPreview(dataUrl);
        resolve();
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  return { captureFrame, sendToVision, loadFromFile, videoRef, streamActive, cameraError, startStream };
}

function inferDefectLocal(prompt: string, room: string, frameUrl: string, measureMode = false): Defect {
  const lowered = prompt.toLowerCase();

  // Type-based mapping
  let defectType: string;
  let severity: Severity;
  let reviewRequired = false;
  let rationale: string;

  if (/water|seepage|leak/i.test(lowered)) {
    defectType = "Water stain";
    severity = "Critical";
    rationale = "Water/seepage keywords detected -- Critical per CONQUAS.";
  } else if (/hollow|loose\s*tile/i.test(lowered)) {
    defectType = "Hollow tile";
    severity = "Minor";
    rationale = "Hollow tile without secondary signals capped at Minor.";
  } else if (/crack/i.test(lowered)) {
    defectType = "Wall crack";
    severity = "Moderate";
    rationale = "Crack detected -- Moderate pending measurement.";
  } else {
    defectType = lowered.includes("tile") ? "Tile defect" : "Surface defect";
    severity = "Moderate";
    reviewRequired = true;
    rationale = "Local inference -- no AI vision. Verify on site.";
  }

  let defect: Defect = {
    id: nextId(),
    room,
    defect_type: defectType,
    severity,
    description:
      defectType === "Wall crack"
        ? "Hairline crack near the inspection zone. Track for widening."
        : `Detected ${defectType.toLowerCase()} in the ${room.toLowerCase()}.`,
    recommendation:
      severity === "Critical"
        ? "Escalate to contractor immediately and keep dated photos."
        : "Log it under the defect liability period and request rectification.",
    confidence: severity === "Critical" ? 0.9 : 0.6,
    photo_url: frameUrl,
    timestamp: Date.now(),
    severity_rationale: rationale,
    review_required: reviewRequired || undefined,
  };

  if (measureMode) {
    defect.measurement = {
      width_mm: defectType === "Wall crack" ? 0.5 : 15,
      length_mm: defectType === "Wall crack" ? 120 : 25,
      depth_mm: "surface-level",
      reference_object: "SG 50-cent coin (24.66mm)",
      notes: "Estimated from local inference (no AI). Place coin next to defect for accurate measurement.",
    };
  }

  defect = validateSeverity(defect);
  return defect;
}
