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

/**
 * v12: Mel-spectrogram feature extraction for second-stage TinyML classifier.
 * Produces a compact [numMelBands x numFrames] matrix from an AudioBuffer.
 * Used only for ambiguous first-pass results (confidence near 0.5).
 */

const MEL_BANDS = 40;
const MEL_FRAME_SIZE = 512;
const MEL_HOP_SIZE = 256;
const MEL_LOW_HZ = 80;
const MEL_HIGH_HZ = 4000;

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function buildMelFilterbank(
  fftSize: number,
  sampleRate: number,
  numBands: number,
  lowHz: number,
  highHz: number,
): Float32Array[] {
  const numBins = fftSize / 2 + 1;
  const melLow = hzToMel(lowHz);
  const melHigh = hzToMel(highHz);
  const melStep = (melHigh - melLow) / (numBands + 1);
  const melPoints: number[] = [];
  for (let i = 0; i <= numBands + 1; i++) {
    melPoints.push(melToHz(melLow + i * melStep));
  }

  const binFreq = sampleRate / fftSize;
  const filterbank: Float32Array[] = [];

  for (let m = 0; m < numBands; m++) {
    const filter = new Float32Array(numBins);
    const fStart = melPoints[m];
    const fCenter = melPoints[m + 1];
    const fEnd = melPoints[m + 2];

    for (let k = 0; k < numBins; k++) {
      const freq = k * binFreq;
      if (freq >= fStart && freq <= fCenter) {
        filter[k] = (freq - fStart) / (fCenter - fStart);
      } else if (freq > fCenter && freq <= fEnd) {
        filter[k] = (fEnd - freq) / (fEnd - fCenter);
      }
    }
    filterbank.push(filter);
  }

  return filterbank;
}

/**
 * Extract a Mel-spectrogram from raw PCM samples.
 * Returns a Float32Array of [numMelBands * numFrames] in row-major order.
 */
export function extractMelSpectrogram(
  samples: Float32Array,
  sampleRate: number,
): { features: Float32Array; numFrames: number; numBands: number } {
  const numFrames = Math.max(1, Math.floor((samples.length - MEL_FRAME_SIZE) / MEL_HOP_SIZE) + 1);
  const filterbank = buildMelFilterbank(MEL_FRAME_SIZE, sampleRate, MEL_BANDS, MEL_LOW_HZ, MEL_HIGH_HZ);
  const features = new Float32Array(MEL_BANDS * numFrames);
  const fftBins = MEL_FRAME_SIZE / 2 + 1;
  const window = new Float32Array(MEL_FRAME_SIZE);

  // Hann window
  for (let i = 0; i < MEL_FRAME_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (MEL_FRAME_SIZE - 1)));
  }

  for (let f = 0; f < numFrames; f++) {
    const offset = f * MEL_HOP_SIZE;

    // Windowed real/imag DFT (simplified — no FFT library needed for small frames)
    const powerSpectrum = new Float32Array(fftBins);
    for (let k = 0; k < fftBins; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < MEL_FRAME_SIZE; n++) {
        const sample = (samples[offset + n] ?? 0) * window[n];
        const angle = (2 * Math.PI * k * n) / MEL_FRAME_SIZE;
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      powerSpectrum[k] = re * re + im * im;
    }

    // Apply Mel filterbank
    for (let m = 0; m < MEL_BANDS; m++) {
      let energy = 0;
      const filter = filterbank[m];
      for (let k = 0; k < fftBins; k++) {
        energy += powerSpectrum[k] * filter[k];
      }
      // Log-Mel energy
      features[m * numFrames + f] = Math.log(Math.max(energy, 1e-10));
    }
  }

  return { features, numFrames, numBands: MEL_BANDS };
}

/** Ambiguity threshold for first-pass confidence to trigger second-stage. */
const ACOUSTIC_AMBIGUITY_THRESHOLD = 0.35;

/**
 * v12: Determine whether a first-pass tap result is ambiguous
 * and should be sent to the second-stage classifier.
 */
export function isAcousticAmbiguous(confidence: number): boolean {
  return Math.abs(confidence - 0.5) < ACOUSTIC_AMBIGUITY_THRESHOLD;
}

/**
 * v12: Second-stage acoustic classifier stub.
 * When TinyML ONNX model is available, runs inference on Mel features.
 * Currently returns null (model not yet deployed), letting the caller
 * keep the first-pass result.
 */
let _tinyMlAvailable: boolean | null = null;

async function checkTinyMlAvailability(): Promise<boolean> {
  if (_tinyMlAvailable !== null) return _tinyMlAvailable;

  try {
    const response = await fetch("/models/acoustic-tinyml/model.onnx", {
      method: "HEAD",
      cache: "no-store",
    });
    _tinyMlAvailable = response.ok;
  } catch {
    _tinyMlAvailable = false;
  }

  return _tinyMlAvailable;
}

export async function classifyTapSecondStage(
  audioBuffer: AudioBuffer,
): Promise<{ type: "hollow" | "solid"; confidence: number; acoustic_certainty: number } | null> {
  if (!(await checkTinyMlAvailability())) return null;

  // Extract Mel-spectrogram features for future TinyML inference
  const channelData = audioBuffer.getChannelData(0);
  const { features: _features } = extractMelSpectrogram(channelData, audioBuffer.sampleRate);
  void _features; // Will be used as model input when TinyML ONNX is deployed

  // Stub: return null until model is deployed
  return null;
}

