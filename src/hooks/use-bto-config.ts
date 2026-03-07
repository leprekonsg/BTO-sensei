import { useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Content, FunctionDeclaration, Session } from "@google/genai";
import { buildAhSengPrompt } from "../lib/gemini-prompts";
import { geminiToolDeclarations } from "../lib/gemini-functions";
import { resetPlaybackQueue, playInlineAudio } from "../lib/live-audio";
import { GEMINI_RATE_LIMIT_RETRY, withRetry } from "../lib/fallback";
import { useBTOStore } from "../lib/store";

const LIVE_MODEL =
  (import.meta.env?.VITE_GEMINI_LIVE_MODEL as string | undefined) ||
  "gemini-2.5-flash-native-audio-preview-12-2025";
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
        const connectedSession = await withRetry(
          () =>
            liveClient.live.connect({
              model: LIVE_MODEL,
              config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: prompt,
                outputAudioTranscription: {},
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: LIVE_VOICE,
                    },
                  },
                },
                tools: [
                  {
                    functionDeclarations: geminiToolDeclarations as FunctionDeclaration[],
                  },
                ],
              },
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
            },
          ),
          GEMINI_RATE_LIMIT_RETRY,
        );
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
