import { ApiError } from "@google/genai";

function splitModelList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildModelCandidates(...values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => splitModelList(value)))];
}

export function getModelErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) {
    return error.status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return null;
}

export function shouldTryModelFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  const status = getModelErrorStatus(error);

  if (status !== null) {
    return [400, 404, 408, 409, 429, 500, 502, 503, 504].includes(status);
  }

  return [
    "deprecated",
    "not found",
    "not supported",
    "unsupported",
    "shutdown",
    "temporarily unavailable",
    "unavailable",
    "timed out",
    "timeout",
    "quota",
    "rate limit",
    "overloaded",
  ].some((pattern) => message.includes(pattern));
}
