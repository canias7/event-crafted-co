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
// share a budget (so navigating across multiple stale pages doesn't
// strand the user). Same chunk failing twice in the budget window
// suppresses the reload to avoid loops on a genuinely broken deploy.
// Always re-throws so the ErrorBoundary still fires its own safety-net
// + Sentry report.
//
// Use this in place of React.lazy() for ALL lazy-loaded chunks —
// page routes (router/lazyRoutes.ts) and one-off modal/banner lazies
// (CookieBanner, InquiryFormModal, etc.).

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (isChunkLoadError(err) && typeof window !== "undefined") {
        const msg = String((err as { message?: string })?.message ?? err);
        if (shouldAutoReload("lazy", msg)) {
          reloadBustingCache();
        }
      }
      throw err;
    }),
  );
}
