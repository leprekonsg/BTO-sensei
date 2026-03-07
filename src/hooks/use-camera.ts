import { useRef } from "react";
import { getGeminiClient } from "./use-bto-config";
import { FALLBACKS, withRetryAndFallback } from "../lib/fallback";
import { useBTOStore } from "../lib/store";
import type { Defect, Severity, UseCameraReturn } from "../lib/types";

const VISION_MODEL = "gemini-3-flash-preview";

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `defect-${Date.now()}`;
}

export function useCamera(): UseCameraReturn {
  const currentRoom = useBTOStore((state) => state.currentRoom);
  const setCameraPreview = useBTOStore((state) => state.setCameraPreview);
  const addDefect = useBTOStore((state) => state.addDefect);
  const failureModes = useBTOStore((state) => state.failureModes);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function captureFrame() {
    // Try real camera capture
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;

        // Create a temporary video element to get frames
        const video = document.createElement("video");
        video.srcObject = stream;
        video.setAttribute("playsinline", "");
        await video.play();
        videoRef.current = video;
      }

      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        throw new Error("Camera not ready");
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
    } catch {
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
  }

  async function sendToVision(frameUrl: string, prompt = "") {
    const fallback = FALLBACKS.vision(currentRoom, frameUrl);

    const result = await withRetryAndFallback(
      async () => {
        if (!frameUrl) throw new Error("Capture a frame before running evidence analysis.");
        if (failureModes.camera) throw new Error("Simulated vision service outage.");

        const client = getGeminiClient();
        if (!client) {
          // No API key -- use local inference
          return inferDefectLocal(prompt, currentRoom, frameUrl);
        }

        // Extract base64 data from data URL
        const base64Match = frameUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!base64Match) {
          // SVG or non-base64 data -- use local inference
          return inferDefectLocal(prompt, currentRoom, frameUrl);
        }

        const mimeType = base64Match[1];
        const base64Data = base64Match[2];

        const visionPrompt = `You are Ah Seng, a veteran Singapore BTO flat inspector. Analyze this photo from the ${currentRoom} for construction defects.
${prompt ? `User note: ${prompt}` : ""}

Return a JSON object with:
{
  "defect_type": "type of defect found (e.g. Wall crack, Hollow tile, Water stain, Paint defect, Chipped edge)",
  "severity": "Minor" or "Moderate" or "Critical",
  "description": "brief description of what you see",
  "recommendation": "what the homeowner should do",
  "confidence": <number 0.0 to 1.0>
}

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

        const parsed = JSON.parse(text) as {
          defect_type: string;
          severity: Severity;
          description: string;
          recommendation: string;
          confidence: number;
        };

        return {
          id: nextId(),
          room: currentRoom,
          defect_type: parsed.defect_type || "Unclassified defect",
          severity: parsed.severity || "Moderate",
          description: parsed.description || "Defect detected by AI vision.",
          recommendation: parsed.recommendation || "Log and follow up during defect liability period.",
          confidence: parsed.confidence || 0.7,
          photo_url: frameUrl,
          timestamp: Date.now(),
        } satisfies Defect;
      },
      fallback,
      8000,
    );

    addDefect(result.data);
    setInspectorMessage(
      result.error
        ? "Vision service dropped, but I logged a fallback defect for follow-up."
        : `${result.data.defect_type} logged in ${currentRoom}.`,
    );
  }

  return { captureFrame, sendToVision };
}

function inferDefectLocal(prompt: string, room: string, frameUrl: string): Defect {
  const lowered = prompt.toLowerCase();
  const defectType = lowered.includes("water")
    ? "Water stain"
    : lowered.includes("tile")
      ? "Loose tile edge"
      : "Wall crack";
  const severity: Severity = lowered.includes("critical")
    ? "Critical"
    : lowered.includes("minor")
      ? "Minor"
      : "Moderate";

  return {
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
    confidence: severity === "Critical" ? 0.9 : 0.78,
    photo_url: frameUrl,
    timestamp: Date.now(),
  };
}
