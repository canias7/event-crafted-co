// Vendora service worker — handles web push notifications + a minimal
// offline shell. Lives at /sw.js so it can claim the whole origin scope.
//
// Updates: bump CACHE_VERSION any time the shell strategy changes.

const CACHE_VERSION = "vendora-v1";

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

// Web Push — server posts to the subscription endpoint, push event fires
// here. We render a notification with the payload's title/body/link.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Vendora", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Vendora";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: data.tag,
    data: { link: data.link || "/" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on a push notification — focus an existing tab if possible,
// otherwise open the link.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Same-origin tab? Navigate it and focus.
        if (client.url && "focus" in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
