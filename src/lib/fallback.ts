import type { Defect, InspectionReport, TapResult } from "./types";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected failure.";
}

export interface FallbackOutcome<T> {
  data: T;
  error: string | null;
  isFallback: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  shouldRetry: isRetryable,
};

export function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  if (msg.includes("api key") || msg.includes("invalid") || msg.includes("simulated")) return false;
  return true;
}

function backoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < cfg.maxAttempts - 1 && cfg.shouldRetry!(error)) {
        await new Promise((r) => setTimeout(r, backoffDelay(attempt, cfg)));
      }
    }
  }

  throw lastError;
}

export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs = 3000,
): Promise<FallbackOutcome<T>> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms.`));
      window.clearTimeout(timer);
    }, timeoutMs);
  });

  try {
    const data = await Promise.race([fn(), timeoutPromise]);
    return {
      data,
      error: null,
      isFallback: false,
    };
  } catch (error) {
    return {
      data: fallback,
      error: toErrorMessage(error),
      isFallback: true,
    };
  }
}

export async function withRetryAndFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs = 8000,
  retry: Partial<RetryConfig> = {},
): Promise<FallbackOutcome<T>> {
  return withFallback(() => withRetry(fn, retry), fallback, timeoutMs);
}

export const FALLBACKS = {
  acoustic: {
    hollow: {
      type: "hollow",
      confidence: 0.87,
      commentary:
        "Wah, this one fallback already but still sounds hollow lah. Flag it first.",
    } satisfies TapResult,
    solid: {
      type: "solid",
      confidence: 0.91,
      commentary:
        "Fallback mode says this one still sounds solid. Can keep moving first.",
    } satisfies TapResult,
  },
  vision(room: string, photoUrl?: string): Defect {
    return {
      id: `fallback-${room.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      room,
      defect_type: "Possible finishing defect",
      severity: "Moderate",
      description:
        "Vision fallback logged this item because the live inspection step failed.",
      recommendation: "Retake the photo with stronger lighting and keep a manual note.",
      confidence: 0.62,
      photo_url: photoUrl,
      timestamp: Date.now(),
    };
  },
  report(flatId: string, defects: Defect[]): InspectionReport {
    return {
      flat_id: flatId,
      inspection_date: new Date().toISOString().slice(0, 10),
      overall_health_score: defects.length ? 74 : 88,
      room_scores: [],
      priority_defects: defects.slice(0, 3),
      inspector_note:
        "Fallback report generated. Review the logged evidence manually before submission.",
    };
  },
};
