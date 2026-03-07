let playbackContext: AudioContext | null = null;
let playbackQueue: Promise<void> = Promise.resolve();
let activeSource: AudioBufferSourceNode | null = null;

function getPlaybackContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (playbackContext && playbackContext.state !== "closed") {
    return playbackContext;
  }

  const AudioCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtor) {
    return null;
  }

  playbackContext = new AudioCtor();
  return playbackContext;
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseSampleRate(mimeType: string) {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function pcm16ToAudioBuffer(
  bytes: Uint8Array,
  sampleRate: number,
  ctx: AudioContext,
) {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true);
    channelData[index] = sample / 32768;
  }

  return audioBuffer;
}

async function playBuffer(audioBuffer: AudioBuffer, ctx: AudioContext) {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  await new Promise<void>((resolve) => {
    const source = ctx.createBufferSource();
    activeSource = source;
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (activeSource === source) {
        activeSource = null;
      }
      resolve();
    };
    source.start();
  });
}

async function decodeAudioData(
  bytes: Uint8Array,
  mimeType: string,
  ctx: AudioContext,
) {
  if (mimeType.includes("pcm")) {
    return pcm16ToAudioBuffer(bytes, parseSampleRate(mimeType), ctx);
  }

  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return ctx.decodeAudioData(arrayBuffer);
}

export async function playInlineAudio(
  base64Data: string,
  mimeType = "audio/pcm;rate=24000",
) {
  const ctx = getPlaybackContext();
  if (!ctx) {
    return;
  }

  const bytes = base64ToUint8Array(base64Data);
  const audioBuffer = await decodeAudioData(bytes, mimeType, ctx);

  playbackQueue = playbackQueue
    .catch(() => undefined)
    .then(() => playBuffer(audioBuffer, ctx));

  await playbackQueue;
}

export function resetPlaybackQueue() {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      // Ignore playback teardown errors.
    }
    activeSource.disconnect();
    activeSource = null;
  }
  playbackQueue = Promise.resolve();
}
