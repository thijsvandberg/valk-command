// Minimal service worker for PWA installability.
// No offline caching: Bridge always requires network access.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-only: pass every request straight to the network.
  // respondWith is required for Chrome to consider this a valid fetch handler.
  event.respondWith(fetch(event.request));
});
