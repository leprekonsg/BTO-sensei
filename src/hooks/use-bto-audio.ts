import { loadTapSample, recordMicTap } from "../lib/audio-samples";
import { analyzeAudioBuffer, classifyTap, downsampleForDisplay } from "../lib/dsp";
import { FALLBACKS, withFallback } from "../lib/fallback";
import { buildAcousticCommentary, sendAcousticToSession } from "../lib/gemini-prompts";
import { useBTOStore } from "../lib/store";
import type { TapResult, UseBTOAudioReturn } from "../lib/types";

const DEFAULT_SAMPLE_RATE = 44100;

export function useBTOAudio(): UseBTOAudioReturn {
  const audioMode = useBTOStore((state) => state.audioMode);
  const setAudioMode = useBTOStore((state) => state.setAudioMode);
  const lastTapResult = useBTOStore((state) => state.lastTapResult);
  const setLastTapResult = useBTOStore((state) => state.setLastTapResult);
  const frequencyData = useBTOStore((state) => state.frequencyData);
  const setFrequencyData = useBTOStore((state) => state.setFrequencyData);
  const failureModes = useBTOStore((state) => state.failureModes);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const currentRoom = useBTOStore((state) => state.currentRoom);

  async function analyzeTap(
    source: "prerecorded-hollow" | "prerecorded-solid" | AudioBuffer,
  ) {
    setLastTapResult({
      data: lastTapResult.data,
      loading: true,
      error: null,
    });

    const fallback =
      source === "prerecorded-solid" ? FALLBACKS.acoustic.solid : FALLBACKS.acoustic.hollow;

    const result = await withFallback<TapResult>(
      async () => {
        if (failureModes.audio) {
          throw new Error("Simulated acoustic pipeline failure.");
        }

        // Get the AudioBuffer -- either from prerecorded file or passed directly
        let audioBuffer: AudioBuffer;
        if (source instanceof AudioBuffer) {
          audioBuffer = source;
        } else {
          audioBuffer = await loadTapSample(source);
        }

        // Run real FFT analysis via Web Audio AnalyserNode
        const freqData = await analyzeAudioBuffer(audioBuffer);
        const displayData = downsampleForDisplay(freqData, 64);
        setFrequencyData(displayData);

        // Multi-band energy ratio classification with Z-score normalization
        const sampleRate = audioBuffer.sampleRate || DEFAULT_SAMPLE_RATE;
        const classified = classifyTap(freqData, sampleRate);
        return {
          ...classified,
          commentary: buildAcousticCommentary(classified, false),
        };
      },
      fallback,
    );

    setLastTapResult({
      data: result.data,
      loading: false,
      error: result.error,
    });
    setInspectorMessage(buildAcousticCommentary(result.data, result.isFallback));

    // Send result to Live API session for Ah Seng commentary
    if (!result.isFallback) {
      void sendAcousticToSession(result.data, currentRoom);
    }

    return result.data;
  }

  async function analyzeLiveMic() {
    setLastTapResult({
      data: lastTapResult.data,
      loading: true,
      error: null,
    });

    const result = await withFallback<TapResult>(
      async () => {
        if (failureModes.audio) {
          throw new Error("Simulated acoustic pipeline failure.");
        }

        const audioBuffer = await recordMicTap(1000);
        const freqData = await analyzeAudioBuffer(audioBuffer);
        const displayData = downsampleForDisplay(freqData, 64);
        setFrequencyData(displayData);

        const sampleRate = audioBuffer.sampleRate || DEFAULT_SAMPLE_RATE;
        const classified = classifyTap(freqData, sampleRate);
        return {
          ...classified,
          commentary: buildAcousticCommentary(classified, false),
        };
      },
      FALLBACKS.acoustic.hollow,
      5000, // longer timeout for mic recording
    );

    setLastTapResult({
      data: result.data,
      loading: false,
      error: result.error,
    });
    setInspectorMessage(buildAcousticCommentary(result.data, result.isFallback));

    // Send result to Live API session for Ah Seng commentary
    if (!result.isFallback) {
      void sendAcousticToSession(result.data, currentRoom);
    }

    return result.data;
  }

  return {
    analyzeTap,
    analyzeLiveMic,
    frequencyData,
    lastTapResult,
    audioMode,
    setAudioMode,
  };
}
