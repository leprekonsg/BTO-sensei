import { useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { buildAhSengPrompt } from "../lib/gemini-prompts";
import { geminiToolDeclarations } from "../lib/gemini-functions";
import { isRetryable } from "../lib/fallback";
import { useBTOStore } from "../lib/store";

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

function getApiKey(): string | null {
  if (typeof import.meta === "undefined") return null;
  return (import.meta.env?.VITE_GEMINI_API_KEY as string) || null;
}

let sharedClient: GoogleGenAI | null = null;

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
      setSessionState(true, "No API key configured. Running in offline mode.");
      setSessionTools(geminiToolDeclarations.map((t) => t.name!));
      return;
    }

    let session: Session | null = null;

    async function connect(attempt = 0) {
      try {
        session = await client!.live.connect({
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.TEXT],
            systemInstruction: prompt,
            tools: [{ functionDeclarations: geminiToolDeclarations }],
          },
          callbacks: {
            onopen: () => {
              if (!active) return;
              activeSession = session;
              sessionRef.current = session;
              setSessionState(true, null);
              setSessionTools(geminiToolDeclarations.map((t) => t.name!));
            },
            onmessage: (message: unknown) => {
              if (!active) return;
              const msg = message as Record<string, unknown>;

              // Handle tool calls
              if (msg.toolCall) {
                onToolCallRef.current?.(msg);
              }

              // Handle text responses from Ah Seng
              const sc = msg.serverContent as Record<string, unknown> | undefined;
              if (sc?.modelTurn) {
                const mt = sc.modelTurn as { parts?: Array<{ text?: string }> };
                if (mt.parts) {
                  for (const part of mt.parts) {
                    if (part.text) {
                      setInspectorMessage(part.text);
                    }
                  }
                }
              }
            },
            onerror: (e: { message?: string }) => {
              if (!active) return;
              setSessionState(false, e.message || "Live API connection error");
            },
            onclose: () => {
              if (!active) return;
              activeSession = null;
              sessionRef.current = null;
              setSessionState(false, "Session closed");
            },
          },
        });
      } catch (err) {
        if (!active) return;
        if (attempt < 2 && isRetryable(err)) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          return connect(attempt + 1);
        }
        const msg = err instanceof Error ? err.message : "Failed to connect to Gemini Live API";
        setSessionState(false, msg);
        setSessionTools(geminiToolDeclarations.map((t) => t.name!));
      }
    }

    connect();

    return () => {
      active = false;
      if (session) {
        try { session.close(); } catch { /* ignore */ }
        if (activeSession === session) activeSession = null;
      }
      sessionRef.current = null;
    };
  }, [currentRoom, setSessionPrompt, setSessionState, setSessionTools, setInspectorMessage]);
}
