import * as Sentry from "@sentry/react";

// Sentry init. Runs once at module import from main.tsx.
//
// DSN resolution: VITE_SENTRY_DSN wins if set (per-environment override
// via Vercel envs), otherwise we fall back to the hardcoded production
// DSN below. DSNs are intentionally public — they authorize event
// ingestion only, never reads — and a VITE_* env var ends up baked
// into the public bundle anyway, so there's no secrecy gain to hiding
// it. Hardcoding the fallback means a fresh deploy ships with Sentry
// already wired without touching Vercel env vars.
//
// To disable Sentry locally, set VITE_SENTRY_DSN="" in your .env.local.
//
// Sample rates are conservative so we don't blow through the free
// quota on a busy day. Bump tracesSampleRate when actively profiling.

const PRODUCTION_DSN =
  "https://95e6e8cecdabe9a13b4c8251550120be@o4511420871802880.ingest.us.sentry.io/4511420910731264";

// Substrings we treat as "stale chunk after deploy" noise — any event
// whose error text contains one of these gets dropped in beforeSend.
const CHUNK_ERROR_NEEDLES = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
];

// Pulls the most useful text we can match against out of either the
// original exception (when Sentry hands one to beforeSend) or the
// event payload itself (when the integration synthesized one).
function chunkErrorText(
  originalException: unknown,
  event: Sentry.ErrorEvent,
): string {
  const parts: string[] = [];
  if (originalException) {
    const ex = originalException as { message?: unknown; toString?: () => string };
    if (typeof ex.message === "string") parts.push(ex.message);
    try {
      if (typeof ex.toString === "function") parts.push(ex.toString());
    } catch {
      // some thrown values stringify oddly; ignore.
    }
  }
  if (event.message) parts.push(event.message);
  const ex = event.exception?.values?.[0];
  if (ex?.value) parts.push(ex.value);
  if (ex?.type) parts.push(`${ex.type}: ${ex.value ?? ""}`);
  return parts.join(" || ");
}

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const envDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  // Empty string explicitly opts out (handy for `.env.local`); undefined
  // falls through to the production DSN.
  const dsn = envDsn === undefined ? PRODUCTION_DSN : envDsn;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_GIT_SHA as string | undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.05,
    // Don't replay sessions by default — replay storage is expensive.
    replaysSessionSampleRate: 0,
    // Replay only sessions that hit an error.
    replaysOnErrorSampleRate: 1.0,
    // Drop noisy errors that aren't actionable:
    //   - AbortError / ResizeObserver: harmless browser-internal
    //   - "Failed to fetch dynamically imported module" et al: stale-
    //     chunk after deploy. lazyWithReload + ErrorBoundary auto-
    //     reload the page; the Sentry report is duplicate noise. We
    //     match here as defense-in-depth in case a chunk import
    //     bypasses both layers (e.g. an unguarded dynamic import in
    //     a third-party lib).
    ignoreErrors: [
      "AbortError",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Failed to fetch dynamically imported module",
      "ChunkLoadError",
      "Loading chunk",
      "Importing a module script failed",
    ],
    // Belt-and-suspenders over `ignoreErrors`. The default browser
    // integrations (specifically `BrowserApiErrors`) capture errors
    // thrown inside addEventListener callbacks BEFORE the inbound
    // filter chain that consults `ignoreErrors` — at least for some
    // error shapes (React 18's `react-invokeguardedcallback` synthetic
    // event firing during a failed dynamic import is the canonical
    // case). `beforeSend` runs for every event regardless of how it
    // was captured, so this catches what `ignoreErrors` misses.
    beforeSend(event, hint) {
      const text = chunkErrorText(hint?.originalException, event);
      if (text && CHUNK_ERROR_NEEDLES.some((n) => text.includes(n))) {
        return null;
      }
      return event;
    },
  });
  initialized = true;
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
) {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

// Non-error event ping. Useful for tracing a flow that "silently does
// nothing" — see EditModal's transform pipeline instrumentation.
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
) {
  if (!initialized) return;
  Sentry.captureMessage(message, {
    level: "info",
    ...(context ? { extra: context } : {}),
  });
}

export function setUser(user: { id: string; email?: string | null } | null) {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } else {
    Sentry.setUser(null);
  }
}
