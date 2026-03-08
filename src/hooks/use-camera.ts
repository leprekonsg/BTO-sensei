import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, ThinkingLevel } from "@google/genai";
import { getGeminiClient } from "./use-bto-config";
import { FALLBACKS, GEMINI_VISION_RETRY, withRetryAndFallback } from "../lib/fallback";
import {
  buildInvalidSeverityRationale,
  clampBBox,
  mergeVisionUpdate,
  needsAgenticPass,
  normalizeMeasurement,
  normalizeSeverity,
  validateSeverity,
  type VisionLikeResponse,
} from "../lib/defect-utils";
import { buildModelCandidates, shouldTryModelFallback } from "../lib/gemini-models";
import { sendVisionToSession } from "../lib/gemini-prompts";
import { useBTOStore } from "../lib/store";
import type { Defect, DefectSource, Measurement, Severity, UseCameraReturn } from "../lib/types";

const FAST_VISION_MODELS = buildModelCandidates(
  import.meta.env?.VITE_GEMINI_FAST_VISION_MODELS as string | undefined,
  import.meta.env?.VITE_GEMINI_FAST_VISION_MODEL as string | undefined,
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
);
const AGENTIC_VISION_MODEL =
  (import.meta.env?.VITE_GEMINI_AGENTIC_VISION_MODEL as string | undefined) ||
  "gemini-3-flash-preview";
const VISION_TIMEOUT_MS = 25000;
const MEASURE_VISION_TIMEOUT_MS = 45000;
const AGENTIC_TIMEOUT_MS = 12000;
const AGENTIC_MEASURE_TIMEOUT_MS = 20000;

import { buildConquasPromptBlock, lookupConquasItemId, lookupConquasAppendix } from "../lib/conquas";

const CONQUAS_SEVERITY_PROMPT = `SEVERITY CLASSIFICATION (BCA CONQUAS):
- Critical: Water seepage/leakage, broken glass, structural cracks >0.3mm or >300mm,
  non-functional doors/windows/locks, waterproofing failure, electrical hazard, FCU leak.
- Moderate: Hollow tiles, hairline cracks >50mm, paint spalling >50mm, misaligned frames >3mm,
  chipped tile edges, loose fittings.
- Minor: Cosmetic scratches, small paint blemishes <50mm, tonality differences, minor alignment,
  removable stains, scuff marks.

${buildConquasPromptBlock()}

When a defect exceeds a CONQUAS tolerance, cite the specific Item ID (e.g. "Appendix 1, Item 1c-5") in severity_rationale.`;

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

interface AgenticContext {
  mimeType: string;
  base64Data: string;
}

interface VisionAnalysisOptions {
  frameUrl: string;
  prompt?: string;
  measureMode?: boolean;
  source: DefectSource;
  contextLabel: "still" | "hud";
}

function toLoggableError(error: unknown) {
  if (error instanceof ApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function logVisionFailure(
  stage: "fast-pass" | "agentic-pass" | "vision-fallback",
  details: Record<string, unknown>,
) {
  console.groupCollapsed(`[vision:${stage}] failure`);
  for (const [key, value] of Object.entries(details)) {
    console.error(key, value);
  }
  console.groupEnd();
}

function logVisionInfo(
  stage:
    | "fast-pass-start"
    | "fast-pass-success"
    | "agentic-pass-start"
    | "agentic-pass-success"
    | "model-fallback",
  details: Record<string, unknown>,
) {
  console.debug(`[vision:${stage}]`, details);
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

async function runFastVisionPass(
  client: NonNullable<ReturnType<typeof getGeminiClient>>,
  base64Data: string,
  mimeType: string,
  visionPrompt: string,
  room: string,
  measureMode: boolean,
  startedAt: number,
) {
  let lastError: unknown;

  for (const [index, model] of FAST_VISION_MODELS.entries()) {
    try {
      logVisionInfo("fast-pass-start", {
        room,
        measureMode,
        model,
        mimeType,
        startedAt,
        fallbackIndex: index,
        candidates: FAST_VISION_MODELS,
      });

      const response = await client.models.generateContent({
        model,
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

      return { model, response };
    } catch (error) {
      lastError = error;
      logVisionFailure("fast-pass", {
        room,
        measureMode,
        model,
        mimeType,
        error: toLoggableError(error),
      });

      const nextModel = FAST_VISION_MODELS[index + 1];
      if (nextModel && shouldTryModelFallback(error)) {
        logVisionInfo("model-fallback", {
          stage: "fast-pass",
          fromModel: model,
          toModel: nextModel,
          room,
          measureMode,
        });
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error("No fast vision model candidates configured.");
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
  const startedAt = performance.now();

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
- A Singapore 10-cent coin (18.5mm diameter) should be visible as the scale reference.
- Use code execution to inspect the image, zoom into the defect, and estimate width/length using the coin when possible.
- Return raw numeric measurements when visible so the app can evaluate CONQUAS compliance.
- For door/window gaps, populate gap_mm.
- For tile lippage, populate lippage_mm.
- For wall/frame verticality, populate verticality_mm_per_m.
- For surface evenness, populate surface_evenness_mm.`
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
    "reference_object": "SG 10-cent coin (18.5mm)",
    "notes": "<measurement notes>",
    "gap_mm": <number or null>,
    "lippage_mm": <number or null>,
    "verticality_mm_per_m": <number or null>,
    "surface_evenness_mm": <number or null>
  }` : ""}
}`;

  try {
    logVisionInfo("agentic-pass-start", {
      room,
      measureMode,
      model: AGENTIC_VISION_MODEL,
      mimeType,
      startedAt,
    });
    const response = await client.models.generateContent({
      model: AGENTIC_VISION_MODEL,
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
        temperature: 0,
        tools: [{ codeExecution: {} }],
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
          includeThoughts: false,
        },
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

    // Extract JSON: try the last ```json...``` fence first, then fall back to first { ... } block.
    const fenceMatches = [...lastText.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
    const fenceJson = fenceMatches.length ? fenceMatches[fenceMatches.length - 1][1].trim() : null;
    const rawJson = fenceJson ?? lastText.match(/\{[\s\S]*\}/)?.[0]?.trim() ?? lastText.trim();
    const parsed = JSON.parse(rawJson) as Partial<VisionResponse>;
    logVisionInfo("agentic-pass-success", {
      room,
      measureMode,
      elapsedMs: Math.round(performance.now() - startedAt),
      hasMeasurement: Boolean(parsed.measurement),
    });
    return parsed;
  } catch (error) {
    logVisionFailure("agentic-pass", {
      room,
      measureMode,
      model: AGENTIC_VISION_MODEL,
      mimeType,
      fastResult,
      error: toLoggableError(error),
    });
    throw new Error(toAgenticErrorMessage(error));
  }
}

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `defect-${Date.now()}`;
}

function parseDataUrl(frameUrl: string): AgenticContext | null {
  const match = frameUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

function buildVisionPrompt(
  room: string,
  prompt: string,
  measureMode: boolean,
  contextLabel: VisionAnalysisOptions["contextLabel"],
) {
  const measurementInstructions = measureMode
    ? `\n\nMEASUREMENT MODE: A Singapore 10-cent coin (18.5mm diameter) should be visible as a size reference.
Estimate the physical dimensions of the defect relative to the coin.
Return raw numeric measurements when visible so the app can evaluate CONQUAS compliance.
For door/window gaps, populate gap_mm.
For tile lippage, populate lippage_mm.
For wall/frame verticality, populate verticality_mm_per_m.
For surface evenness, populate surface_evenness_mm.
Include a "measurement" field in your response:
{
  "measurement": {
    "width_mm": <estimated width in mm>,
    "length_mm": <estimated length in mm>,
    "depth_mm": "<estimated depth description, e.g. 'surface-level' or '~2mm'>",
    "reference_object": "SG 10-cent coin (18.5mm)",
    "notes": "<measurement notes>",
    "gap_mm": <number or null>,
    "lippage_mm": <number or null>,
    "verticality_mm_per_m": <number or null>,
    "surface_evenness_mm": <number or null>
  }
}`
    : "";

  const contextInstruction = contextLabel === "hud"
    ? "Analyze this cropped ROI from the live heads-up HUD camera feed."
    : "Analyze this photo from the inspection capture flow.";

  return `You are Ah Seng, a veteran Singapore BTO flat inspector. ${contextInstruction} The evidence is from the ${room}.
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

  const stopStream = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  }, []);

  // Auto-start camera on mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startStream();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopStream();
    };
  }, [startStream, stopStream]);

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

  async function cropHudRegion(bbox: [number, number, number, number]) {
    if (!streamRef.current) {
      await startStream();
    }

    const video = videoRef.current;
    if (video && video.videoWidth === 0) {
      await waitForVideoReady(video, 2000);
    }

    if (!video || video.videoWidth === 0) {
      return captureFrame();
    }

    const normalized = clampBBox(bbox) ?? bbox;
    const [yMin, xMin, yMax, xMax] = normalized;
    const srcWidth = video.videoWidth;
    const srcHeight = video.videoHeight;
    const boxWidth = ((xMax - xMin) / 1000) * srcWidth;
    const boxHeight = ((yMax - yMin) / 1000) * srcHeight;
    const padX = Math.max(24, Math.round(boxWidth * 0.18));
    const padY = Math.max(24, Math.round(boxHeight * 0.18));
    const sourceX = Math.max(0, Math.round((xMin / 1000) * srcWidth) - padX);
    const sourceY = Math.max(0, Math.round((yMin / 1000) * srcHeight) - padY);
    const sourceWidth = Math.min(srcWidth - sourceX, Math.round(boxWidth) + padX * 2);
    const sourceHeight = Math.min(srcHeight - sourceY, Math.round(boxHeight) + padY * 2);

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function runVisionAnalysis({
    frameUrl,
    prompt = "",
    measureMode = false,
    source,
    contextLabel,
  }: VisionAnalysisOptions): Promise<Defect> {
    const fallback = {
      ...FALLBACKS.vision(currentRoom, frameUrl),
      source,
      evidence_thumbnail: contextLabel === "hud" ? frameUrl : undefined,
    } satisfies Defect;
    const agenticContext = parseDataUrl(frameUrl);
    const startedAt = performance.now();

    const result = await withRetryAndFallback(
      async () => {
        if (!frameUrl) throw new Error("Capture a frame before running evidence analysis.");
        if (failureModes.camera) throw new Error("Simulated vision service outage.");

        const client = getGeminiClient();
        if (!client) {
          throw new Error("No Gemini API key configured.");
        }

        if (!agenticContext) {
          return inferDefectLocal(prompt, currentRoom, frameUrl, measureMode, source);
        }

        const { mimeType, base64Data } = agenticContext;
        const visionPrompt = buildVisionPrompt(currentRoom, prompt, measureMode, contextLabel);

        const { model: selectedFastVisionModel, response } = await runFastVisionPass(
          client,
          base64Data,
          mimeType,
          visionPrompt,
          currentRoom,
          measureMode,
          startedAt,
        );

        const text = response.text?.trim();
        if (!text) throw new Error("Empty response from Gemini Vision");

        const parsed = JSON.parse(text) as VisionResponse;
        const parsedSeverity = normalizeSeverity(parsed.severity);

        const defect: Defect = {
          id: nextId(),
          room: currentRoom,
          defect_type: parsed.defect_type || "Unclassified defect",
          severity: parsedSeverity ?? "Moderate",
          description: parsed.description || "Defect detected by AI vision.",
          recommendation: parsed.recommendation || "Log and follow up during defect liability period.",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
          photo_url: frameUrl,
          timestamp: Date.now(),
          source,
          evidence_thumbnail: contextLabel === "hud" ? frameUrl : undefined,
          severity_rationale: parsedSeverity
            ? parsed.severity_rationale || undefined
            : buildInvalidSeverityRationale("Fast pass", parsed.severity_rationale),
          review_required: parsedSeverity ? undefined : true,
          bbox: clampBBox(parsed.bbox),
          conquas_item_id: lookupConquasItemId(parsed.defect_type || ""),
          conquas_appendix: lookupConquasAppendix(parsed.defect_type || ""),
          classification_stage: "fast-vision",
          cloud_status: "completed",
        };

        const measurement = normalizeMeasurement(parsed.measurement);
        if (measurement) {
          defect.measurement = measurement;
        }

        logVisionInfo("fast-pass-success", {
          room: currentRoom,
          measureMode,
          model: selectedFastVisionModel,
          elapsedMs: Math.round(performance.now() - startedAt),
          hasMeasurement: Boolean(parsed.measurement),
        });
        return validateSeverity(defect);
      },
      fallback,
      measureMode ? MEASURE_VISION_TIMEOUT_MS : VISION_TIMEOUT_MS,
      GEMINI_VISION_RETRY,
    );

    addDefect(result.data);

    const measureInfo = result.data.measurement
      ? ` (~${result.data.measurement.width_mm ?? "?"}mm x ${result.data.measurement.length_mm ?? "?"}mm)`
      : "";
    const fallbackMessage = result.error?.toLowerCase().includes("api key")
      ? contextLabel === "hud"
        ? "No Gemini API key configured, so the HUD marker was logged with offline fallback data."
        : "No Gemini API key configured, so I logged an offline fallback defect for manual verification."
      : contextLabel === "hud"
        ? "HUD ROI analysis failed, but the marker was logged for follow-up."
        : "Vision service dropped, but I logged a fallback defect for follow-up.";
    if (result.error) {
      logVisionFailure("vision-fallback", {
        room: currentRoom,
        measureMode,
        error: result.error,
        fallback: result.data,
      });
    }
    setInspectorMessage(
      result.error
        ? fallbackMessage
        : contextLabel === "hud"
          ? `${result.data.defect_type}${measureInfo} anchored in Heads Up for ${currentRoom}.`
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
          const measurement = normalizeMeasurement(agenticResult.measurement);
          const measurementPatch = measurement ? { measurement } : {};
          updateDefect(result.data.id, { ...refined, ...measurementPatch, agentic_pass: true, classification_stage: "agentic-vision" as const });
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

    return result.data;
  }

  async function sendToVision(frameUrl: string, prompt = "", measureMode = false) {
    await runVisionAnalysis({
      frameUrl,
      prompt,
      measureMode,
      source: "manual-vision",
      contextLabel: "still",
    });
  }

  async function analyzeHudRegion(
    bbox: [number, number, number, number],
    prompt = "",
  ) {
    const cropUrl = await cropHudRegion(bbox);
    if (!cropUrl) return null;
    return runVisionAnalysis({
      frameUrl: cropUrl,
      prompt,
      measureMode: false,
      source: "hud-vision",
      contextLabel: "hud",
    });
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

  return { captureFrame, sendToVision, analyzeHudRegion, loadFromFile, videoRef, streamActive, cameraError, startStream };
}

function inferDefectLocal(
  prompt: string,
  room: string,
  frameUrl: string,
  measureMode = false,
  source: DefectSource = "manual-vision",
): Defect {
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
    source,
    evidence_thumbnail: source === "hud-vision" ? frameUrl : undefined,
    severity_rationale: rationale,
    review_required: reviewRequired || undefined,
    classification_stage: "heuristic",
    cloud_status: "offline",
  };

  if (measureMode) {
    defect.measurement = {
      width_mm: defectType === "Wall crack" ? 0.5 : 15,
      length_mm: defectType === "Wall crack" ? 120 : 25,
      depth_mm: "surface-level",
      reference_object: "SG 10-cent coin (18.5mm)",
      notes: "Estimated from local inference (no AI). Place coin next to defect for accurate measurement.",
    };
  }

  defect = validateSeverity(defect);
  return defect;
}
