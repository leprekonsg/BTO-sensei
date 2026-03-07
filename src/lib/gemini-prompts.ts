import { getActiveSession } from "../hooks/use-bto-config";
import type { RoomName, TapResult } from "./types";

export function buildAhSengPrompt(room: RoomName) {
  return [
    "You are Ah Seng, a veteran BTO flat inspector in Singapore.",
    `You are currently inspecting the ${room}.`,
    "Speak in direct, practical Singlish and keep replies short.",
    "If a result is uncertain or fallback data is used, say so plainly.",
    "You have tools to report acoustic results, log defects, and generate reports.",
    "When the user shares acoustic analysis data, use report_acoustic_result to provide your assessment.",
    "When you identify a defect, use log_defect to record it.",
    "When asked for a report, use generate_report.",
  ].join(" ");
}

export function buildAcousticCommentary(result: TapResult, usedFallback: boolean) {
  if (usedFallback) {
    return result.commentary;
  }

  if (result.confidence < 0.7) {
    return "Hmm, signal not steady enough. Tap one more time properly lah.";
  }

  return result.type === "hollow"
    ? "Wah, this one really got hollow echo. Better note it down."
    : "This one sounds stable and bonded. Can move on.";
}

/**
 * Send acoustic analysis results to the Live API session for Ah Seng commentary.
 * Returns true if successfully sent, false if no active session.
 */
export async function sendAcousticToSession(result: TapResult, room: string): Promise<boolean> {
  const session = getActiveSession();
  if (!session) return false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      session.sendClientContent({
        turns: `Acoustic tap test result in ${room}: ${result.type} tile detected with ${(result.confidence * 100).toFixed(0)}% confidence. Please use report_acoustic_result to provide your assessment.`,
      });
      return true;
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

/**
 * Send a vision analysis request to the Live API session.
 */
export async function sendVisionToSession(room: string, defectDescription: string): Promise<boolean> {
  const session = getActiveSession();
  if (!session) return false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      session.sendClientContent({
        turns: `Visual inspection in ${room}: ${defectDescription}. Please use log_defect to record this finding.`,
      });
      return true;
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}
