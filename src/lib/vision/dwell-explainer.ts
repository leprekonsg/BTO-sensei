import { ThinkingLevel } from "@google/genai";
import { getGeminiClient } from "../../hooks/use-bto-config";
import { withFallback } from "../fallback";
import type { Severity, VisualExplanationResult } from "../types";

/**
 * v12: Dwell-triggered crop explanation.
 *
 * When a tracked detection is stable for >= 1 second, the HUD crops the
 * region and calls this explainer with gemini-3.1-flash-lite-preview
 * for a lightweight structured explanation. No dimensional claims.
 */

const DWELL_MODEL =
  (import.meta.env?.VITE_GEMINI_DWELL_MODEL as string | undefined) ||
  "gemini-3.1-flash-lite-preview";
const DWELL_TIMEOUT_MS = 6000;

const DWELL_PROMPT = `You are a construction defect explanation assistant for Singapore BTO flat inspections.
Analyze this cropped region from a live camera feed. Provide a concise structured assessment.

RULES:
- Focus on textural/visual defect classification: cracks, stains, discoloration, spalling, delamination.
- Do NOT make dimensional claims (no mm measurements from monocular images).
- If measurement is needed, set manualCheckRequired to true and explain why.
- Reference CONQUAS 2022 R2 rule basis when applicable.
- Keep notes brief and actionable.

Return ONLY valid JSON:
{
  "label": "defect type (e.g. Wall crack, Paint spalling, Water stain)",
  "severity": "Minor" | "Moderate" | "Critical",
  "confidenceText": "brief confidence statement (e.g. High - clear crack pattern visible)",
  "likelyRuleBasis": "CONQUAS reference if applicable (e.g. Appendix 1, Item 2a-1) or 'General visual'",
  "manualCheckRequired": true | false,
  "notes": "brief actionable notes for inspector",
  "ahSengCommentary": "one-liner in Singlish from Ah Seng the veteran inspector"
}`;

const FALLBACK_RESULT: VisualExplanationResult = {
  label: "Unclassified",
  severity: "Moderate",
  confidenceText: "Offline — cloud explanation unavailable",
  likelyRuleBasis: "Pending manual review",
  manualCheckRequired: true,
  notes: "Cloud explanation could not be reached. Log and verify on site.",
  ahSengCommentary: "Cannot reach the cloud lah. Mark it down first, verify later.",
};

export async function requestDwellExplanation(
  cropDataUrl: string,
): Promise<VisualExplanationResult> {
  const client = getGeminiClient();
  if (!client) return FALLBACK_RESULT;

  const match = cropDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return FALLBACK_RESULT;

  const [, mimeType, base64Data] = match;

  const result = await withFallback(
    async () => {
      const response = await client.models.generateContent({
        model: DWELL_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: DWELL_PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
            includeThoughts: false,
          },
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Empty dwell explanation response");

      const parsed = JSON.parse(text) as Record<string, unknown>;

      const VALID_SEVERITIES = ["Minor", "Moderate", "Critical"];
      const severity = VALID_SEVERITIES.includes(parsed.severity as string)
        ? (parsed.severity as Severity)
        : "Moderate";

      return {
        label: typeof parsed.label === "string" ? parsed.label : "Unclassified",
        severity,
        confidenceText: typeof parsed.confidenceText === "string" ? parsed.confidenceText : "Unknown",
        likelyRuleBasis: typeof parsed.likelyRuleBasis === "string" ? parsed.likelyRuleBasis : "General visual",
        manualCheckRequired: typeof parsed.manualCheckRequired === "boolean" ? parsed.manualCheckRequired : true,
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        ahSengCommentary: typeof parsed.ahSengCommentary === "string" ? parsed.ahSengCommentary : "",
      } satisfies VisualExplanationResult;
    },
    FALLBACK_RESULT,
    DWELL_TIMEOUT_MS,
  );

  return result.data;
}
