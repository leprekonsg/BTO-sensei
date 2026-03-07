import { useEffect } from "react";
import { geminiToolDeclarations } from "../lib/gemini-functions";
import { useBTOStore } from "../lib/store";

export function useGeminiTools() {
  const setSessionTools = useBTOStore((state) => state.setSessionTools);

  useEffect(() => {
    setSessionTools(geminiToolDeclarations.map((tool) => tool.name));
  }, [setSessionTools]);
}
