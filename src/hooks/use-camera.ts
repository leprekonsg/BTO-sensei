import { FALLBACKS, withFallback } from "../lib/fallback";
import { useBTOStore } from "../lib/store";
import type { Defect, Severity, UseCameraReturn } from "../lib/types";

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `defect-${Date.now()}`;
}

function buildPreviewDataUrl(room: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
      <rect width="720" height="480" fill="#151a1f" rx="28" />
      <rect x="56" y="62" width="608" height="356" rx="22" fill="#232b33" stroke="#fa7c2f" stroke-width="6" />
      <circle cx="196" cy="204" r="68" fill="#fa7c2f" opacity="0.18" />
      <path d="M420 168 Q468 198 448 246 T500 324" fill="none" stroke="#ffd270" stroke-width="12" stroke-linecap="round" />
      <text x="72" y="104" fill="#f4f1ea" font-size="34" font-family="Segoe UI, sans-serif">${room}</text>
      <text x="72" y="382" fill="#b7b7b1" font-size="22" font-family="Segoe UI, sans-serif">Simulated inspection evidence frame</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function inferDefect(prompt: string, room: string, frameUrl: string): Defect {
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

export function useCamera(): UseCameraReturn {
  const currentRoom = useBTOStore((state) => state.currentRoom);
  const setCameraPreview = useBTOStore((state) => state.setCameraPreview);
  const addDefect = useBTOStore((state) => state.addDefect);
  const failureModes = useBTOStore((state) => state.failureModes);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);

  async function captureFrame() {
    const preview = buildPreviewDataUrl(currentRoom);
    setCameraPreview(preview);
    return preview;
  }

  async function sendToVision(frameUrl: string, prompt = "") {
    const fallback = FALLBACKS.vision(currentRoom, frameUrl);

    const result = await withFallback(
      async () => {
        if (!frameUrl) {
          throw new Error("Capture a frame before running evidence analysis.");
        }

        if (failureModes.camera) {
          throw new Error("Simulated vision service outage.");
        }

        return inferDefect(prompt, currentRoom, frameUrl);
      },
      fallback,
    );

    addDefect(result.data);
    setInspectorMessage(
      result.error
        ? "Vision service dropped, but I logged a fallback defect for follow-up."
        : `${result.data.defect_type} logged in ${currentRoom}.`,
    );
  }

  return {
    captureFrame,
    sendToVision,
  };
}
