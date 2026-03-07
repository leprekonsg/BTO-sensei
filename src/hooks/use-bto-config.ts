import { useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Content, FunctionDeclaration, Session } from "@google/genai";
import { buildAhSengPrompt } from "../lib/gemini-prompts";
import { geminiToolDeclarations } from "../lib/gemini-functions";
import { resetPlaybackQueue, playInlineAudio } from "../lib/live-audio";
import { GEMINI_RATE_LIMIT_RETRY, withRetry } from "../lib/fallback";
import { buildModelCandidates, shouldTryModelFallback } from "../lib/gemini-models";
import { useBTOStore } from "../lib/store";

const LIVE_MODEL_CANDIDATES = buildModelCandidates(
  import.meta.env?.VITE_GEMINI_LIVE_MODELS as string | undefined,
  import.meta.env?.VITE_GEMINI_LIVE_MODEL as string | undefined,
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
);
const LIVE_VOICE =
  (import.meta.env?.VITE_GEMINI_VOICE_NAME as string | undefined) || "Kore";

const API_KEY_STORAGE_KEY = "bto-gemini-api-key";

function getApiKey(): string | null {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) return stored;
  }
  if (typeof import.meta === "undefined") return null;
  return (import.meta.env?.VITE_GEMINI_API_KEY as string) || null;
}

export function saveApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  resetGeminiClient();
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  resetGeminiClient();
}

export function getSavedApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

let sharedClient: GoogleGenAI | null = null;

export function resetGeminiClient() {
  sharedClient = null;
}

export function getGeminiClient(): GoogleGenAI | null {
  if (sharedClient) return sharedClient;
  const key = getApiKey();
  if (!key) return null;
  sharedClient = new GoogleGenAI({ apiKey: key });
  return sharedClient;
}

// Shared session reference for other hooks
let activeSession: Session | null = null;
export function getActiveSession(): Session | null {
  return activeSession;
}

function detectLiveResponseMode(model: string) {
  return model.includes("native-audio") ? Modality.AUDIO : Modality.TEXT;
}

function buildLiveConnectConfig(model: string, prompt: string) {
  const responseModality = detectLiveResponseMode(model);
  const baseConfig = {
    responseModalities: [responseModality],
    systemInstruction: prompt,
    tools: [
      {
        functionDeclarations: geminiToolDeclarations as FunctionDeclaration[],
      },
    ],
  };

  if (responseModality === Modality.AUDIO) {
    return {
      ...baseConfig,
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: LIVE_VOICE,
          },
        },
      },
    };
  }

  return baseConfig;
}

function logLiveInfo(stage: "connect-start" | "connect-success" | "model-fallback", details: Record<string, unknown>) {
  console.debug(`[live:${stage}]`, details);
}

function logLiveFailure(details: Record<string, unknown>) {
  console.groupCollapsed("[live:connect] failure");
  for (const [key, value] of Object.entries(details)) {
    console.error(key, value);
  }
  console.groupEnd();
}

export function useBTOConfig() {
  const currentRoom = useBTOStore((state) => state.currentRoom);
  const apiKeyVersion = useBTOStore((state) => state.apiKeyVersion);
  const setSessionState = useBTOStore((state) => state.setSessionState);
  const setSessionPrompt = useBTOStore((state) => state.setSessionPrompt);
  const setSessionTools = useBTOStore((state) => state.setSessionTools);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const sessionRef = useRef<Session | null>(null);
  const onToolCallRef = useRef<((msg: unknown) => void) | null>(null);

  // Expose a way for useGeminiTools to register its handler
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__btoToolCallHandler = onToolCallRef;
  }, []);

  useEffect(() => {
    let active = true;
    const prompt = buildAhSengPrompt(currentRoom);
    setSessionPrompt(prompt);
    setSessionState(false, null);

    const client = getGeminiClient();
    if (!client) {
      // No API key -- run in offline/fallback mode
      setSessionState(false, "No API key configured. Running in offline mode. Add your key in the API Config panel above to enable AI features.");
      setSessionTools(geminiToolDeclarations.map((t) => t.name!));
      return;
    }

    let session: Session | null = null;
    const liveClient = client;

    async function connect() {
      try {
        let connectedSession: Session | null = null;

        for (const [index, model] of LIVE_MODEL_CANDIDATES.entries()) {
          try {
            logLiveInfo("connect-start", {
              model,
              responseModality: detectLiveResponseMode(model),
              fallbackIndex: index,
              candidates: LIVE_MODEL_CANDIDATES,
            });

            connectedSession = await withRetry(
              () =>
                liveClient.live.connect({
                  model,
                  config: buildLiveConnectConfig(model, prompt),
                  callbacks: {
                    onopen: () => {
                      if (!active) return;
                      setSessionState(true, null);
                      setSessionTools(geminiToolDeclarations.map((tool) => tool.name!));
                    },
                    onmessage: (message: unknown) => {
                      if (!active) return;
                      const msg = message as Record<string, unknown>;

                      if (msg.toolCall) {
                        onToolCallRef.current?.(msg);
                      }

                      const sc = msg.serverContent as Record<string, unknown> | undefined;
                      const transcription = sc?.outputTranscription as { text?: string } | undefined;
                      if (transcription?.text) {
                        setInspectorMessage(transcription.text);
                      }

                      if (sc?.modelTurn) {
                        const mt = sc.modelTurn as Content;
                        if (mt.parts) {
                          for (const part of mt.parts) {
                            if (part.text && !transcription?.text) {
                              setInspectorMessage(part.text);
                            }

                            if (
                              part.inlineData?.data &&
                              typeof part.inlineData.data === "string"
                            ) {
                              const mimeType = part.inlineData.mimeType || "audio/pcm;rate=24000";
                              void playInlineAudio(part.inlineData.data, mimeType).catch(() => {
                                if (!active) return;
                                setInspectorMessage(
                                  "Audio reply came back, but playback failed. Read the transcript instead.",
                                );
                              });
                            }
                          }
                        }
                      }

                      if (sc?.interrupted) {
                        resetPlaybackQueue();
                      }
                    },
                    onerror: (error: { message?: string }) => {
                      if (!active) return;
                      setSessionState(false, error.message || "Live API connection error");
                    },
                    onclose: () => {
                      if (!active) return;
                      activeSession = null;
                      sessionRef.current = null;
                      resetPlaybackQueue();
                      setSessionState(false, "Session closed");
                    },
                  },
                }),
              GEMINI_RATE_LIMIT_RETRY,
            );

            logLiveInfo("connect-success", {
              model,
              responseModality: detectLiveResponseMode(model),
            });
            break;
          } catch (error) {
            logLiveFailure({
              model,
              responseModality: detectLiveResponseMode(model),
              error,
            });

            const nextModel = LIVE_MODEL_CANDIDATES[index + 1];
            if (nextModel && shouldTryModelFallback(error)) {
              logLiveInfo("model-fallback", {
                fromModel: model,
                toModel: nextModel,
              });
              continue;
            }

            throw error;
          }
        }

        if (!connectedSession) {
          throw new Error("Failed to connect to any configured Gemini Live model.");
        }
        if (!active) {
          connectedSession.close();
          return;
        }
        session = connectedSession;
        activeSession = connectedSession;
        sessionRef.current = connectedSession;
        setSessionState(true, null);
        setSessionTools(geminiToolDeclarations.map((tool) => tool.name!));
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : "Failed to connect to Gemini Live API";
        setSessionState(false, msg);
        setSessionTools(geminiToolDeclarations.map((t) => t.name!));
      }
    }

    connect();

    return () => {
      active = false;
      resetPlaybackQueue();
      if (session) {
        try {
          session.close();
        } catch {
          // Ignore teardown errors during unmount.
        }
        if (activeSession === session) activeSession = null;
      }
      sessionRef.current = null;
    };
  }, [currentRoom, apiKeyVersion, setSessionPrompt, setSessionState, setSessionTools, setInspectorMessage]);
}
