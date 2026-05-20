import { lazy, type ComponentType } from "react";

// React.lazy wrapper that auto-heals stale-chunk errors after a deploy.
//
// When a deploy ships new hashed JS chunks, browsers holding a cached
// old index.html request chunks at the old hashes. Vercel's SPA rewrite
// serves index.html for the missing chunk URL, the browser rejects it
// with "Failed to fetch dynamically imported module" / MIME mismatch,
// and the page is dead.
//
// On chunk error, this reloads once (per 60s window) to pull the fresh
// index.html and re-resolve to a valid chunk URL. Always re-throws so
// the ErrorBoundary still fires its own safety-net reload + Sentry
// report. The 60s throttle prevents an infinite refresh loop if the
// deploy itself is broken.
//
// Use this in place of React.lazy() for ALL lazy-loaded chunks —
// page routes (router/lazyRoutes.ts) and one-off modal/banner lazies
// (CookieBanner, InquiryFormModal, etc.).

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|MIME type|Unexpected token '<'/i;
const RELOAD_KEY = "vendora.lastChunkReload";
const RELOAD_WINDOW_MS = 60_000;

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const msg = String((err as { message?: string })?.message ?? err);
      if (CHUNK_ERROR_PATTERN.test(msg) && typeof window !== "undefined") {
        try {
          const last = window.sessionStorage.getItem(RELOAD_KEY);
          const now = Date.now();
          if (!last || now - Number(last) > RELOAD_WINDOW_MS) {
            window.sessionStorage.setItem(RELOAD_KEY, String(now));
            window.location.reload();
          }
        } catch {
          // sessionStorage can throw in private-mode Safari; ignore.
        }
      }
      throw err;
    }),
  );
}
