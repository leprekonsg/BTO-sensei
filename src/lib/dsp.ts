import type { TapClassification, TapResult } from "./types";

// FFT size for AnalyserNode -- 2048 gives 1024 frequency bins
const FFT_SIZE = 2048;

// Band definitions in Hz for multi-band energy ratio classification
// Solid tiles: energy concentrated in 100-500Hz (low thud)
// Hollow tiles: energy concentrated in 800-2000Hz (resonant ring)
const BAND_SOLID_LOW = 100;
const BAND_SOLID_HIGH = 500;
const BAND_HOLLOW_LOW = 800;
const BAND_HOLLOW_HIGH = 2000;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  sharedContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return sharedContext;
}

/**
 * Extract frequency-domain data from an AudioBuffer using AnalyserNode.
 * Returns a Float32Array of frequency magnitudes (0..1 normalized).
 */
export async function analyzeAudioBuffer(buffer: AudioBuffer): Promise<Float32Array> {
  const ctx = getAudioContext();
  if (!ctx) {
    return new Float32Array(FFT_SIZE / 2);
  }

  // Resume context if suspended (autoplay policy)
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  // Create offline context for deterministic rendering
  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource();
  const analyser = offline.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;

  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(offline.destination);
  source.start(0);

  await offline.startRendering();

  const freqData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(freqData);

  // Convert from dB to linear magnitude (0..1)
  const maxDb = -10;
  const minDb = -100;
  const normalized = new Float32Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    const db = freqData[i] ?? minDb;
    normalized[i] = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  }

  return normalized;
}

/**
 * Compute energy in a frequency band from normalized frequency data.
 */
function bandEnergy(
  freqData: Float32Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const binCount = freqData.length;
  const binWidth = sampleRate / 2 / binCount;
  const startBin = Math.max(0, Math.floor(lowHz / binWidth));
  const endBin = Math.min(binCount - 1, Math.ceil(highHz / binWidth));

  let energy = 0;
  let count = 0;
  for (let i = startBin; i <= endBin; i++) {
    energy += (freqData[i] ?? 0) ** 2;
    count++;
  }

  return count > 0 ? energy / count : 0;
}

/**
 * Z-score normalization across all frequency bins to compensate
 * for varying tap strengths.
 */
function zScoreNormalize(freqData: Float32Array): Float32Array {
  let sum = 0;
  let sumSq = 0;
  const n = freqData.length;

  for (let i = 0; i < n; i++) {
    const v = freqData[i] ?? 0;
    sum += v;
    sumSq += v * v;
  }

  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const std = Math.sqrt(Math.max(variance, 1e-10));

  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = ((freqData[i] ?? 0) - mean) / std;
  }
  return result;
}

/**
 * Multi-band energy ratio classifier.
 * Compares energy in the solid band (100-500Hz) vs hollow band (800-2kHz)
 * after Z-score normalization.
 */
export function classifyTap(
  freqData: Float32Array,
  sampleRate: number,
): TapResult {
  const normalized = zScoreNormalize(freqData);

  const solidEnergy = bandEnergy(normalized, sampleRate, BAND_SOLID_LOW, BAND_SOLID_HIGH);
  const hollowEnergy = bandEnergy(normalized, sampleRate, BAND_HOLLOW_LOW, BAND_HOLLOW_HIGH);

  const totalEnergy = solidEnergy + hollowEnergy;
  if (totalEnergy < 1e-10) {
    return {
      type: "solid",
      confidence: 0.5,
      commentary: "Signal too weak. Tap harder lah.",
    };
  }

  const hollowRatio = hollowEnergy / totalEnergy;
  const type: TapClassification = hollowRatio > 0.5 ? "hollow" : "solid";

  // Confidence: how far the ratio is from the 0.5 decision boundary
  const confidence = Number((0.5 + Math.abs(hollowRatio - 0.5)).toFixed(2));

  return {
    type,
    confidence,
    commentary:
      type === "hollow"
        ? "Wah, this pattern got that bong-bong signature. Better flag this tile."
        : "This one tok-tok solid. No hollow warning here.",
  };
}

/**
 * Downsample frequency data to a fixed number of bins for spectrogram display.
 */
export function downsampleForDisplay(
  freqData: Float32Array,
  targetBins = 64,
): Float32Array {
  const sourceBins = freqData.length;
  if (sourceBins <= targetBins) return freqData;

  const result = new Float32Array(targetBins);
  const ratio = sourceBins / targetBins;

  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += freqData[j] ?? 0;
    }
    result[i] = sum / (end - start);
  }

  return result;
}

// Re-export for backward compat -- kept minimal
export { getAudioContext, FFT_SIZE };
