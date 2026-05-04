import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

// Top-level error boundary. Without this, a render error inside any
// route would replace the whole app with a blank screen — which is what
// users were getting before. Catches the throw, logs it (console plus
// any window.onerror listener), and shows a real "something went wrong"
// surface with reload + go-home actions.
//
// Note: this only catches errors thrown during render / lifecycle.
// Async errors inside fetch handlers etc. don't bubble up to React; we
// rely on toasts + per-page try/catch for those.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Surface to console for dev tools + any external monitor (Sentry,
    // etc.) hooked up to console.error or window.onerror.
    console.error("Vendora ErrorBoundary caught:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-5">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <p className="text-xs uppercase tracking-[0.4em] text-destructive mb-3">
            — Something went wrong
          </p>
          <h1 className="font-display text-3xl md:text-4xl leading-tight mb-3">
            That page hit a snag.
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            We logged the error so we can fix it. Try a reload first — if it
            keeps happening, head home and we'll route you somewhere stable.
          </p>

          <div className="flex items-center gap-2 justify-center mb-8">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background h-10 px-5 text-sm hover:bg-foreground/90 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background h-10 px-5 text-sm hover:border-foreground/30 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Back to home
            </button>
          </div>

          {/* Dev-mode error details — hidden in prod so users don't see
              stack traces, but lifesaving locally. */}
          {import.meta.env.DEV && this.state.error && (
            <details className="text-left bg-secondary/40 rounded-sm p-3 max-h-72 overflow-auto">
              <summary className="text-xs uppercase tracking-wide text-muted-foreground cursor-pointer">
                Stack trace (dev only)
              </summary>
              <pre className="text-[10px] mt-3 whitespace-pre-wrap font-mono text-foreground/85">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <p className="text-[11px] text-muted-foreground mt-6">
            If you think this is a bug, please email{" "}
            <a
              href="mailto:hello@vendora.events"
              className="text-accent hover:underline"
            >
              hello@vendora.events
            </a>{" "}
            with the steps you took.
          </p>
        </div>
      </div>
    );
  }
}
