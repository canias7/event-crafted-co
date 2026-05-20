import * as Sentry from "@sentry/react";

// Sentry init. Runs once at module import from main.tsx. DSN is
// optional — without VITE_SENTRY_DSN set we skip init entirely so dev /
// local builds don't ship events. The boundary still works either way
// (captureException is a no-op until init runs).
//
// Sample rates are conservative so we don't blow through the free
// quota on a busy day. Bump tracesSampleRate when actively profiling.

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
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

export function setUser(user: { id: string; email?: string | null } | null) {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } else {
    Sentry.setUser(null);
  }
}
