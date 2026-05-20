import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { captureException } from "@/lib/sentry";

// Top-level error boundary. Without this, a render error inside any
// route would replace the whole app with a blank screen — which is what
// users were getting before. Catches the throw, logs it (console plus
// any window.onerror listener), and shows a real "something went wrong"
// surface with reload + go-home actions.
//
// Note: this only catches errors thrown during render / lifecycle.
// Async errors inside fetch handlers etc. don't bubble up to React; we
// rely on toasts + per-page try/catch for those.
//
// Stale-chunk auto-heal: when a deploy ships new hashed JS chunks, a
// browser holding a cached old index.html will request chunk URLs that
// no longer exist. Vercel's SPA rewrite returns index.html for those,
// producing a MIME-type / "Failed to fetch dynamically imported module"
// error inside React.lazy that bubbles here. lazyWithReload in
// router/lazyRoutes already auto-reloads once per 60s, but a second
// chunk error inside that window hits this boundary instead. Detect the
// signature here and reload once (separate 60s budget) before showing
// the user the snag screen — most "intermittent appointments page
// broken, reload fixes it" reports trace back to exactly this race.

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|MIME type|Unexpected token '<'/i;
const RELOAD_KEY = "vendora.errorBoundaryChunkReload";
const RELOAD_WINDOW_MS = 60_000;

function isChunkLoadError(error: Error): boolean {
  return CHUNK_ERROR_PATTERN.test(String(error?.message ?? error));
}

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
    // Surface to console for dev tools + any external monitor hooked up
    // to console.error or window.onerror.
    console.error("Vendora ErrorBoundary caught:", error, errorInfo);
    // Log the component stack as a separate plain-text entry too —
    // it's the only fast way to see *which* component blew up in a
    // production-minified bundle without source maps.
    if (errorInfo?.componentStack) {
      console.error(
        "Vendora ErrorBoundary component stack:\n" + errorInfo.componentStack,
      );
    }
    // Report to Sentry with the component stack as extra context.
    // No-op until VITE_SENTRY_DSN is set + initSentry() has run.
    captureException(error, {
      componentStack: errorInfo?.componentStack,
    });
    // Stale-chunk auto-heal. Independent rate limit from lazyWithReload
    // so each layer gets one shot before bothering the user. The
    // boundary's already mounted by the time we reach here; reloading
    // immediately is fine, we just need the throttle so a genuinely
    // broken deploy doesn't put us in a refresh loop.
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      try {
        const last = window.sessionStorage.getItem(RELOAD_KEY);
        const now = Date.now();
        if (!last || now - Number(last) > RELOAD_WINDOW_MS) {
          window.sessionStorage.setItem(RELOAD_KEY, String(now));
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage can throw in private-mode Safari; ignore and
        // fall through to the regular error UI.
      }
    }
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
          <h1 className="font-editorial text-4xl md:text-4xl leading-tight mb-3">
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

          {/* Always-visible compact detail: error message + first
              ~20 lines of the component stack. Helps with bug
              reports from production users; full dev-mode trace is
              still below. */}
          {this.state.error && (
            <details className="text-left bg-secondary/40 rounded-2xl p-3 max-h-72 overflow-auto mb-3">
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
