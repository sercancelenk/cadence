// @ts-nocheck
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[cadence] Unhandled UI error:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="boot" role="alert">
        <div className="boot__card" style={{ maxWidth: 480, textAlign: 'left' }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            The application hit an unexpected error. You can try to recover; your data is safe.
          </p>
          <pre
            className="pre"
            style={{
              maxHeight: 220,
              overflow: 'auto',
              fontSize: 12,
              padding: 12,
              borderRadius: 8,
            }}
          >
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--primary" onClick={this.reset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
