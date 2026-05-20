import { lazy, type ComponentType } from "react";
import {
  isChunkLoadError,
  reloadBustingCache,
  shouldAutoReload,
} from "./chunkReload";

// React.lazy wrapper that auto-heals stale-chunk errors after a deploy.
//
// When a deploy ships new hashed JS chunks, browsers holding a cached
// old index.html request chunks at the old hashes. Vercel's SPA rewrite
// serves index.html for the missing chunk URL, the browser rejects it
// with "Failed to fetch dynamically imported module" / MIME mismatch,
// and the page is dead.
//
// On chunk error, this reloads to pull the fresh index.html and
// re-resolve to a valid chunk URL. Rate-limited per-URL: each unique
// failing chunk gets one reload attempt. Different chunks failing don't
// share a budget. Same chunk failing twice in the budget window
// suppresses the reload to avoid loops on a genuinely broken deploy.
//
// When we DO reload, we swallow the error by returning a never-
// resolving promise. The page is about to navigate away — letting the
// rejection bubble out causes React to fire its internal
// invokeGuardedCallback synthetic event, which Sentry's
// auto-instrumentation captures via addEventListener. That's how the
// "Failed to fetch dynamically imported module" issues kept landing
// in Sentry even though the user was being healed transparently.

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (isChunkLoadError(err) && typeof window !== "undefined") {
        const msg = String((err as { message?: string })?.message ?? err);
        if (shouldAutoReload("lazy", msg)) {
          reloadBustingCache();
          // Stall React.lazy until the navigation completes. Throwing
          // here would surface the error to Sentry's global listener
          // before location.replace lands — noise we can't action.
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }),
  );
}
