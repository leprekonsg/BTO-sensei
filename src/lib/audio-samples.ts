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
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;

  return new Promise<AudioBuffer>((resolve, reject) => {
    const chunks: Float32Array[] = [];
    let cleanedUp = false;

    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      processor.disconnect();
      mediaSource.disconnect();
      sink.disconnect();
      stream.getTracks().forEach((track) => track.stop());
    }

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
    };

    mediaSource.connect(processor);
    processor.connect(sink);
    sink.connect(ctx.destination);

    setTimeout(() => {
      try {
        const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (!totalSamples) {
          throw new Error("No microphone audio captured");
        }

        const audioBuffer = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        let offset = 0;

        for (const chunk of chunks) {
          channelData.set(chunk, offset);
          offset += chunk.length;
        }

        cleanup();
        resolve(audioBuffer);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, durationMs);
  });
}
