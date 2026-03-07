import type { TapClassification, TapResult } from "./types";

const PROFILE_SIZE = 32;

function createBaseShape(type: TapClassification) {
  return Array.from({ length: PROFILE_SIZE }, (_, index) => {
    const position = index / (PROFILE_SIZE - 1);
    const primaryPeak =
      type === "hollow"
        ? Math.exp(-Math.pow(position - 0.28, 2) * 28)
        : Math.exp(-Math.pow(position - 0.63, 2) * 34);
    const secondaryPeak =
      type === "hollow"
        ? Math.exp(-Math.pow(position - 0.75, 2) * 18)
        : Math.exp(-Math.pow(position - 0.2, 2) * 12);
    const floor = type === "hollow" ? 0.11 : 0.08;
    return floor + primaryPeak * 0.82 + secondaryPeak * 0.24;
  });
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 17.13 + index * 11.07) * 43758.5453;
  return value - Math.floor(value);
}

function normalise(values: number[]) {
  const peak = Math.max(...values, 1);
  return new Float32Array(values.map((value) => value / peak));
}

export function buildFrequencyProfile(
  type: TapClassification,
  seed = 1,
): Float32Array {
  const shape = createBaseShape(type).map((value, index) => {
    const jitter = (seededNoise(seed, index) - 0.5) * 0.12;
    return Math.max(0.01, value + jitter);
  });

  return normalise(shape);
}

export function audioBufferToFrequencyProfile(buffer: AudioBuffer): Float32Array {
  const source = buffer.getChannelData(0);
  if (!source.length) {
    return buildFrequencyProfile("solid", 9);
  }

  const bucketSize = Math.max(1, Math.floor(source.length / PROFILE_SIZE));
  const buckets = Array.from({ length: PROFILE_SIZE }, (_, bucketIndex) => {
    let sum = 0;
    const start = bucketIndex * bucketSize;
    const end = Math.min(source.length, start + bucketSize);

    for (let index = start; index < end; index += 1) {
      sum += Math.abs(source[index] ?? 0);
    }

    return sum / Math.max(1, end - start);
  });

  return normalise(buckets);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function classifyTap(
  tapFreqs: Float32Array,
  hollowBaseline: Float32Array,
  solidBaseline: Float32Array,
): TapResult {
  const hollowScore = cosineSimilarity(tapFreqs, hollowBaseline);
  const solidScore = cosineSimilarity(tapFreqs, solidBaseline);
  const type: TapClassification = hollowScore >= solidScore ? "hollow" : "solid";
  const confidence = Number(Math.max(hollowScore, solidScore).toFixed(2));

  return {
    type,
    confidence,
    commentary:
      type === "hollow"
        ? "Wah, this pattern got that bong-bong signature. Better flag this tile."
        : "This one tok-tok solid. No hollow warning here.",
  };
}
