import { ApiError } from "@google/genai";
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
  getDelayMs?: (error: unknown, attempt: number, config: RetryConfig) => number;
}

export const GEMINI_RATE_LIMIT_RETRY: Partial<RetryConfig> = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
};

export const GEMINI_REPORT_RETRY: Partial<RetryConfig> = {
  maxAttempts: 2,
  baseDelayMs: 1000,
  maxDelayMs: 4000,
};

export const GEMINI_SUMMARY_RETRY: Partial<RetryConfig> = {
  maxAttempts: 1,
  baseDelayMs: 500,
  maxDelayMs: 500,
};

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  shouldRetry: isRetryable,
  getDelayMs: getRetryDelayMs,
};

export function isRetryable(error: unknown): boolean {
  const details = extractRetryDetails(error);

  if (details.message.includes("api key") || details.message.includes("invalid") || details.message.includes("simulated")) {
    return false;
  }

  if (details.status !== null) {
    return [408, 409, 429, 500, 502, 503, 504].includes(details.status);
  }

  return (
    details.message.includes("timed out") ||
    details.message.includes("timeout") ||
    details.message.includes("network") ||
    details.message.includes("fetch") ||
    details.message.includes("socket") ||
    details.message.includes("temporarily") ||
    details.message.includes("unavailable")
  );
}

function backoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

function extractRetryDetails(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  let status: number | null = null;

  if (error instanceof ApiError) {
    status = error.status;
  } else if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    status = (error as { status: number }).status;
  }

  return { message, status };
}

function parseRetryAfterMs(message: string): number | null {
  const retryInSeconds = message.match(/retry (?:again )?in\s+([0-9.]+)\s*s/);
  if (retryInSeconds) {
    return Math.round(Number(retryInSeconds[1]) * 1000);
  }

  const retryInMilliseconds = message.match(/retry (?:again )?in\s+([0-9.]+)\s*ms/);
  if (retryInMilliseconds) {
    return Math.round(Number(retryInMilliseconds[1]));
  }

  const retryDelaySeconds = message.match(/retrydelay['"]?\s*[:=]\s*['"]?([0-9.]+)s/i);
  if (retryDelaySeconds) {
    return Math.round(Number(retryDelaySeconds[1]) * 1000);
  }

  const retryDelayMilliseconds = message.match(
    /retrydelay['"]?\s*[:=]\s*['"]?([0-9.]+)ms/i,
  );
  if (retryDelayMilliseconds) {
    return Math.round(Number(retryDelayMilliseconds[1]));
  }

  return null;
}

export function getRetryDelayMs(
  error: unknown,
  attempt: number,
  config: RetryConfig,
): number {
  const { message, status } = extractRetryDetails(error);
  const serverDelay = parseRetryAfterMs(message);

  if (serverDelay !== null) {
    return Math.min(serverDelay, config.maxDelayMs);
  }

  if (status === 429) {
    return Math.min(config.baseDelayMs * Math.pow(2, attempt + 1), config.maxDelayMs);
  }

  return backoffDelay(attempt, config);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        await sleep(cfg.getDelayMs!(error, attempt, cfg));
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
      defect_type: "Unclassified defect (offline)",
      severity: "Moderate",
      description:
        "Vision fallback logged this item because the live inspection step failed.",
      recommendation: "Retake the photo with stronger lighting and keep a manual note.",
      confidence: 0.3,
      photo_url: photoUrl,
      timestamp: Date.now(),
      review_required: true,
      severity_rationale: "Fallback -- no AI analysis available. Verify on site.",
    };
  },
  report(flatId: string, defects: Defect[]): InspectionReport {
    const verifyOnSiteCount = defects.filter((defect) => defect.review_required).length;
    return {
      flat_id: flatId,
      inspection_date: new Date().toISOString().slice(0, 10),
      overall_health_score: defects.length ? 74 : 88,
      room_scores: [],
      priority_defects: defects.slice(0, 3),
      inspector_note:
        verifyOnSiteCount > 0
          ? `Fallback report generated. Verify ${verifyOnSiteCount} item${verifyOnSiteCount === 1 ? "" : "s"} on site before submission.`
          : "Fallback report generated. Review the logged evidence manually before submission.",
    };
  },
};
