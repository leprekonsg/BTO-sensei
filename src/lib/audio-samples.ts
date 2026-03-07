import { getAudioContext } from "./dsp";

const bufferCache = new Map<string, AudioBuffer>();

/**
 * Load a WAV file from public/audio/ and decode it to an AudioBuffer.
 * Results are cached so each file is fetched only once.
 */
export async function loadWavFile(filename: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(filename);
  if (cached) return cached;

  const ctx = getAudioContext();
  if (!ctx) throw new Error("AudioContext not available");

  const url = `${import.meta.env.BASE_URL}audio/${filename}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${filename}: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  bufferCache.set(filename, audioBuffer);
  return audioBuffer;
}

/**
 * Load a prerecorded tap sample as AudioBuffer.
 */
export async function loadTapSample(
  source: "prerecorded-hollow" | "prerecorded-solid",
): Promise<AudioBuffer> {
  const filename = source === "prerecorded-hollow" ? "hollow-tap.wav" : "solid-tap.wav";
  return loadWavFile(filename);
}

/**
 * Record a short tap from the microphone.
 * Listens for `durationMs` (default 1 second) and returns the AudioBuffer.
 */
export async function recordMicTap(durationMs = 1000): Promise<AudioBuffer> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Microphone not available in this environment");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ctx = getAudioContext();
  if (!ctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("AudioContext not available");
  }

  if (ctx.state === "suspended") await ctx.resume();

  const mediaSource = ctx.createMediaStreamSource(stream);
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks: Blob[] = [];

  return new Promise<AudioBuffer>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      mediaSource.disconnect();

      try {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        resolve(audioBuffer);
      } catch (err) {
        reject(err);
      }
    };

    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      mediaSource.disconnect();
      reject(new Error("Mic recording failed"));
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);
  });
}
