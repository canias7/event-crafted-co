import { Component, type ErrorInfo, type ReactNode } from "react";

// Per-section error boundary. Renders nothing (or an optional
// fallback) when its child throws — used to keep one shaky
// component (e.g. VendorServiceAreaMap, which can get unhappy on
// edge-case leaflet input) from taking down the rest of the page.
//
// Differs from the top-level ErrorBoundary in shared/ErrorBoundary.tsx
// in that it doesn't show a "page hit a snag" state; it just hides
// the broken section and lets everything around it render.

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional label so the console error is grep-able when triaging. */
  label?: string;
}

interface State {
  hasError: boolean;
}

export class SilentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `SilentErrorBoundary[${this.props.label ?? "unknown"}] caught:`,
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
