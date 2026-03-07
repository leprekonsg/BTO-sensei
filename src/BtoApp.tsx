import type { ReactNode } from "react";
import { useBTOConfig } from "./hooks/use-bto-config";
import { useGeminiTools } from "./hooks/use-gemini-tools";

interface BtoAppProps {
  children: ReactNode;
}

export function BtoApp({ children }: BtoAppProps) {
  useBTOConfig();
  useGeminiTools();

  return <>{children}</>;
}
