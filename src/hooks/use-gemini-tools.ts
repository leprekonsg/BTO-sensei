import { useEffect, useRef } from "react";
import { getActiveSession } from "./use-bto-config";
import { useBTOStore } from "../lib/store";
import type {
  AcousticToolPayload,
  LogDefectToolPayload,
  GenerateReportToolPayload,
} from "../lib/types";

function nextId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `defect-${Date.now()}`;
}

export function useGeminiTools() {
  const addDefect = useBTOStore((state) => state.addDefect);
  const setInspectorMessage = useBTOStore((state) => state.setInspectorMessage);
  const setLastTapResult = useBTOStore((state) => state.setLastTapResult);
  const requestReport = useBTOStore((state) => state.requestReport);
  const storeRef = useRef({ addDefect, setInspectorMessage, setLastTapResult, requestReport });

  useEffect(() => {
    storeRef.current = { addDefect, setInspectorMessage, setLastTapResult, requestReport };
  }, [addDefect, setInspectorMessage, setLastTapResult, requestReport]);

  useEffect(() => {
    // Register the tool call handler via the shared ref
    const handlerRef = (window as unknown as Record<string, unknown>).__btoToolCallHandler as
      | React.MutableRefObject<((msg: unknown) => void) | null>
      | undefined;

    if (!handlerRef) return;

    handlerRef.current = (message: unknown) => {
      const msg = message as { toolCall?: { functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> } };
      const toolCall = msg.toolCall;
      if (!toolCall?.functionCalls) return;

      const session = getActiveSession();
      const functionResponses: Array<{ id: string; name: string; response: { result: string } }> = [];

      for (const fc of toolCall.functionCalls) {
        switch (fc.name) {
          case "report_acoustic_result": {
            const payload = fc.args as unknown as AcousticToolPayload;
            storeRef.current.setLastTapResult({
              data: {
                type: payload.tile_type,
                confidence: payload.confidence,
                commentary: (fc.args as Record<string, unknown>).commentary as string || "",
              },
              loading: false,
              error: null,
            });
            storeRef.current.setInspectorMessage(
              (fc.args as Record<string, unknown>).commentary as string ||
                `Tile classified as ${payload.tile_type} (${(payload.confidence * 100).toFixed(0)}% confident)`,
            );
            functionResponses.push({ id: fc.id, name: fc.name, response: { result: "ok" } });
            break;
          }

          case "log_defect": {
            const payload = fc.args as unknown as LogDefectToolPayload;
            storeRef.current.addDefect({
              id: nextId(),
              room: payload.room,
              defect_type: payload.defect_type,
              severity: payload.severity,
              description: payload.description,
              recommendation: payload.recommendation,
              confidence: payload.confidence,
              timestamp: Date.now(),
            });
            storeRef.current.setInspectorMessage(
              `${payload.defect_type} logged in ${payload.room}. Severity: ${payload.severity}.`,
            );
            functionResponses.push({ id: fc.id, name: fc.name, response: { result: "ok" } });
            break;
          }

          case "generate_report": {
            const payload = fc.args as unknown as GenerateReportToolPayload;
            storeRef.current.requestReport(payload.flat_id);
            functionResponses.push({ id: fc.id, name: fc.name, response: { result: "ok" } });
            break;
          }

          default:
            functionResponses.push({ id: fc.id, name: fc.name, response: { result: "unknown tool" } });
        }
      }

      // Send tool responses back to the Live API session
      if (session && functionResponses.length > 0) {
        try {
          session.sendToolResponse({ functionResponses });
        } catch {
          // Session may have closed
        }
      }
    };

    return () => {
      if (handlerRef) handlerRef.current = null;
    };
  }, []);
}
