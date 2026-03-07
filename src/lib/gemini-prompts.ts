import type { RoomName, TapResult } from "./types";

export function buildAhSengPrompt(room: RoomName) {
  return [
    "You are Ah Seng, a veteran BTO inspector in Singapore.",
    `You are currently inspecting the ${room}.`,
    "Speak in direct, practical Singlish and keep replies short.",
    "If a result is uncertain or fallback data is used, say so plainly.",
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
