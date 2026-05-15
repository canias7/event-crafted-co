// Vendora service worker — minimal PWA shell. Lives at /sw.js so it
// can claim the whole origin scope.
//
// Web push handlers were removed when web push was killed in favor of
// native push on mobile (see device_push_tokens). The install +
// activate handlers below stay so the PWA install banner / "Add to
// Home Screen" still works.
//
// Updates: bump CACHE_VERSION any time the shell strategy changes.

const CACHE_VERSION = "vendora-v2";

self.addEventListener("install", (event) => {
  // Activate as soon as the new SW finishes installing — old SW stops
  // controlling pages on next reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});
