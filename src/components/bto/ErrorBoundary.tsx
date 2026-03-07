import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Label shown in the fallback UI so users know which section crashed. */
    label?: string;
    /** Optional custom fallback. If omitted, a generic error card is rendered. */
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info.componentStack);
    }

    private handleRetry = () => {
        this.setState({ error: null });
    };

    render() {
        if (this.state.error) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="error-boundary-card">
                    <span className="material-symbols-outlined error-boundary-icon">error</span>
                    <p className="error-boundary-label font-mono">
                        {this.props.label ? `${this.props.label} — ` : ""}COMPONENT ERROR
                    </p>
                    <p className="error-boundary-msg">{this.state.error.message}</p>
                    <button className="error-boundary-retry" onClick={this.handleRetry}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
