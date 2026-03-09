import { getGeminiClient } from "../hooks/use-bto-config";
import { withRetryAndFallback, GEMINI_VISION_RETRY } from "./fallback";
import type { FloorPlanDraft, PlanRoomKind, Point2D } from "./types";

const EXTRACTION_MODEL =
  (import.meta.env?.VITE_GEMINI_AGENTIC_VISION_MODEL as string | undefined) ||
  "gemini-2.5-flash";

const EXTRACTION_TIMEOUT_MS = 20000;

const draftResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rooms", "walls", "overallConfidence"],
  properties: {
    unitLabel: { type: "string" },
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "kind", "polygon", "confidence"],
        properties: {
          label: { type: "string" },
          kind: {
            type: "string",
            enum: ["bedroom", "bathroom", "kitchen", "living", "balcony", "corridor", "utility", "study", "entrance"],
          },
          polygon: {
            type: "array",
            items: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
            },
          },
          confidence: { type: "number" },
        },
      },
    },
    walls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "confidence"],
        properties: {
          start: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          end: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          roomLabel: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    orientationHint: { type: "number" },
    overallConfidence: { type: "number" },
  },
};

const EXTRACTION_PROMPT = `You are analyzing a floor plan image of an HDB BTO flat in Singapore.

Extract the room layout as structured data. For each room, provide:
- A descriptive label (e.g. "Master Bedroom", "Kitchen")
- A kind from: bedroom, bathroom, kitchen, living, balcony, corridor, utility, study, entrance
- A polygon as an array of [x, y] coordinate pairs tracing the room boundary. Use pixel coordinates relative to the image. Minimum 3 vertices per room.
- A confidence score (0-1) for the extraction.

For walls, provide:
- Start and end coordinates as [x, y] pairs
- The roomLabel this wall belongs to (if identifiable)
- A confidence score (0-1)

Also provide:
- An orientationHint in degrees (0 = north up) if determinable
- An overallConfidence (0-1)

Focus on identifying rooms and their approximate polygonal boundaries. Do not attempt exact construction-grade dimensions. It is acceptable if polygons are approximate.

Return ONLY valid JSON matching the schema.`;

/** Extract a floor plan draft from an image using Gemini. */
export async function extractFloorPlanDraft(imageDataUrl: string): Promise<FloorPlanDraft> {
  const client = getGeminiClient();
  if (!client) throw new Error("No API key configured");

  const base64Match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!base64Match) throw new Error("Invalid image data URL");

  const mimeType = base64Match[1];
  const base64Data = base64Match[2];

  const result = await withRetryAndFallback(
    async () => {
      const response = await client.models.generateContent({
        model: EXTRACTION_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: EXTRACTION_PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: draftResponseSchema,
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Empty extraction response");

      const parsed = JSON.parse(text) as FloorPlanDraft;
      if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
        throw new Error("No rooms extracted from floor plan");
      }

      return validateAndCleanDraft(parsed);
    },
    null,
    EXTRACTION_TIMEOUT_MS,
    GEMINI_VISION_RETRY,
  );

  if (result.data === null) {
    throw new Error(result.error ?? "Floor plan extraction failed");
  }

  return result.data;
}

function validateAndCleanDraft(raw: FloorPlanDraft): FloorPlanDraft {
  const rooms = raw.rooms
    .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
    .map((r) => ({
      label: String(r.label || "Unknown Room"),
      kind: validateKind(r.kind),
      polygon: r.polygon.map((p): Point2D => [Number(p[0]) || 0, Number(p[1]) || 0]),
      confidence: clampConfidence(r.confidence),
    }));

  const walls = (raw.walls ?? [])
    .filter((w) => Array.isArray(w.start) && Array.isArray(w.end))
    .map((w) => ({
      start: [Number(w.start[0]) || 0, Number(w.start[1]) || 0] as Point2D,
      end: [Number(w.end[0]) || 0, Number(w.end[1]) || 0] as Point2D,
      roomLabel: w.roomLabel,
      confidence: clampConfidence(w.confidence),
    }));

  return {
    unitLabel: raw.unitLabel,
    rooms,
    walls,
    orientationHint: raw.orientationHint,
    overallConfidence: clampConfidence(raw.overallConfidence),
  };
}

const VALID_KINDS: Set<string> = new Set([
  "bedroom", "bathroom", "kitchen", "living", "balcony", "corridor", "utility", "study", "entrance",
]);

function validateKind(kind: string): PlanRoomKind {
  return VALID_KINDS.has(kind) ? (kind as PlanRoomKind) : "utility";
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Read a File as a data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
