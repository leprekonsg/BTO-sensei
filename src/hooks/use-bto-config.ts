import { useEffect } from "react";
import { buildAhSengPrompt } from "../lib/gemini-prompts";
import { useBTOStore } from "../lib/store";

export function useBTOConfig() {
  const currentRoom = useBTOStore((state) => state.currentRoom);
  const setSessionState = useBTOStore((state) => state.setSessionState);
  const setSessionPrompt = useBTOStore((state) => state.setSessionPrompt);

  useEffect(() => {
    let active = true;

    setSessionState(false, null);
    const timer = window.setTimeout(() => {
      if (!active) {
        return;
      }

      setSessionPrompt(buildAhSengPrompt(currentRoom));
      setSessionState(true, null);
    }, 80);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [currentRoom, setSessionPrompt, setSessionState]);
}
