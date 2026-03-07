import { loadBaselineProfile, loadTapSample } from "../lib/audio-samples";
import { audioBufferToFrequencyProfile, classifyTap } from "../lib/dsp";
import { FALLBACKS, withFallback } from "../lib/fallback";
import { buildAcousticCommentary } from "../lib/gemini-prompts";
import { useBTOStore } from "../lib/store";
import type { TapResult, UseBTOAudioReturn } from "../lib/types";

export function useBTOAudio(): UseBTOAudioReturn {
  const audioMode = useBTOStore((state) => state.audioMode);
  const setAudioMode = useBTOStore((state) => state.setAudioMode);
  const lastTapResult = useBTOStore((state) => state.lastTapResult);
  const setLastTapResult = useBTOStore((state) => state.setLastTapResult);
  const frequencyData = useBTOStore((state) => state.frequencyData);
  const setFrequencyData = useBTOStore((state) => state.setFrequencyData);
  const failureModes = useBTOStore((state) => state.failureModes);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);

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
        const [hollowBaseline, solidBaseline, tapProfile] = await Promise.all([
          loadBaselineProfile("hollow"),
          loadBaselineProfile("solid"),
          source instanceof AudioBuffer
            ? Promise.resolve(audioBufferToFrequencyProfile(source))
            : loadTapSample(source),
        ]);

        if (failureModes.audio) {
          throw new Error("Simulated acoustic pipeline failure.");
        }

        setFrequencyData(tapProfile);
        const classified = classifyTap(tapProfile, hollowBaseline, solidBaseline);
        return {
          ...classified,
          commentary: buildAcousticCommentary(classified, false),
        };
      },
      fallback,
    );

    if (result.isFallback && !frequencyData) {
      setFrequencyData(
        source === "prerecorded-solid"
          ? await loadTapSample("prerecorded-solid")
          : await loadTapSample("prerecorded-hollow"),
      );
    }

    setLastTapResult({
      data: result.data,
      loading: false,
      error: result.error,
    });
    setInspectorMessage(buildAcousticCommentary(result.data, result.isFallback));
  }

  return {
    analyzeTap,
    frequencyData,
    lastTapResult,
    audioMode,
    setAudioMode,
  };
}
