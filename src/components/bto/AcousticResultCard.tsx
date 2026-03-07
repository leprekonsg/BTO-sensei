import type { AsyncState, TapResult } from "../../lib/types";
import "./AcousticResultCard.css";

interface AcousticResultCardProps {
  result: AsyncState<TapResult>;
  inspectorMessage: string;
}

export function AcousticResultCard({ result, inspectorMessage }: AcousticResultCardProps) {
  const isHollow = result.data?.type === "hollow";

  return (
    <div className="acoustic-result">
      {/* Metrics grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <p className="metric-label font-mono">Classification</p>
          <p className={`metric-value ${isHollow ? "metric-value--danger" : "metric-value--safe"}`}
            data-testid="tap-status"
          >
            {result.loading
              ? "..."
              : result.data
                ? result.data.type.toUpperCase()
                : "READY"}
          </p>
          {result.error && (
            <p className="metric-fallback font-mono">FALLBACK</p>
          )}
        </div>
        <div className="metric-card">
          <p className="metric-label font-mono">Confidence</p>
          <p className="metric-value metric-value--orange" data-testid="tap-confidence">
            {result.data ? `${Math.round(result.data.confidence * 100)}%` : "--%"}
          </p>
          <div className="metric-bar">
            <div
              className="metric-bar-fill"
              style={{ width: result.data ? `${result.data.confidence * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      {/* Inspector callout */}
      <div className="inspector-callout" data-testid="inspector-message">
        <p>{result.loading ? "Analyzing tap signature..." : inspectorMessage}</p>
      </div>

      {result.error && (
        <div className="error-banner" data-testid="tap-error">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          {result.error}
        </div>
      )}
    </div>
  );
}
