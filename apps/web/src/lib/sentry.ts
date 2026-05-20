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
    // Drop noisy network errors that aren't actionable: aborted
    // fetches (user navigated away), expected supabase 4xx, etc.
    ignoreErrors: [
      "AbortError",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
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
