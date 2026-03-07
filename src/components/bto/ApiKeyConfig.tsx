import { useState } from "react";
import { saveApiKey, clearApiKey, getSavedApiKey, hasApiKey } from "../../hooks/use-bto-config";
import { useBTOStore } from "../../lib/store";

export function ApiKeyConfig() {
  const bumpApiKeyVersion = useBTOStore((s) => s.bumpApiKeyVersion);
  const sessionError = useBTOStore((s) => s.sessionError);
  const [input, setInput] = useState(() => getSavedApiKey());
  const [revealed, setRevealed] = useState(false);
  const connected = hasApiKey();

  function handleSave() {
    const trimmed = input.trim();
    if (!trimmed) return;
    saveApiKey(trimmed);
    setRevealed(false);
    bumpApiKeyVersion();
  }

  function handleClear() {
    clearApiKey();
    setInput("");
    setRevealed(false);
    bumpApiKeyVersion();
  }

  // Show connection error from the session (invalid key, rate limit, etc.)
  const showError = connected && sessionError && !sessionError.includes("offline mode");

  return (
    <div
      className="fallback-panel industrial-border"
      data-testid="api-key-config"
      style={!connected ? { borderColor: "#ef4444" } : undefined}
    >
      <div className="fallback-header">
        <p className="font-mono fallback-title">
          {connected ? "API CONFIG" : "API KEY REQUIRED"}
        </p>
        <span className="fallback-subtitle">
          {connected
            ? "Gemini API key configured. Stored in your browser only."
            : "Paste your Gemini API key below. Without it, acoustic analysis, vision inspection, and report generation run in offline fallback mode with limited accuracy."}
        </span>
      </div>

      {!connected && (
        <p
          className="font-mono"
          style={{ fontSize: "0.78rem", color: "var(--text-dim, #888)", margin: "0 0 4px" }}
        >
          Get a free key at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary, #f97316)", textDecoration: "underline" }}
          >
            aistudio.google.com/apikey
          </a>
        </p>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type={revealed ? "text" : "password"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="AIza..."
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 160,
            padding: "6px 10px",
            background: "var(--deep-charcoal, #151a1f)",
            border: `1px solid ${connected ? "var(--primary, #f97316)" : "#ef4444"}`,
            borderRadius: 4,
            color: "var(--text, #f4f1ea)",
            fontFamily: "monospace",
            fontSize: "0.85rem",
          }}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="font-mono"
          style={{
            padding: "6px 10px",
            background: "transparent",
            border: "1px solid var(--text-dim, #888)",
            borderRadius: 4,
            color: "var(--text-dim, #888)",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          {revealed ? "HIDE" : "SHOW"}
        </button>
        <button
          type="submit"
          className="font-mono"
          disabled={!input.trim()}
          style={{
            padding: "6px 14px",
            background: "var(--primary, #f97316)",
            border: "none",
            borderRadius: 4,
            color: "#151a1f",
            cursor: input.trim() ? "pointer" : "not-allowed",
            fontWeight: 700,
            fontSize: "0.75rem",
            opacity: input.trim() ? 1 : 0.5,
          }}
        >
          SAVE
        </button>
        {connected && (
          <button
            type="button"
            onClick={handleClear}
            className="font-mono"
            style={{
              padding: "6px 10px",
              background: "transparent",
              border: "1px solid #ef4444",
              borderRadius: 4,
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            CLEAR
          </button>
        )}
      </form>

      {showError && (
        <p
          className="font-mono"
          style={{ fontSize: "0.78rem", color: "#ef4444", margin: "6px 0 0" }}
        >
          Connection failed: {sessionError}. Check that your key is valid and has the Gemini API enabled.
        </p>
      )}
    </div>
  );
}
