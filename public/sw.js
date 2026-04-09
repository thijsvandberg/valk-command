// Minimal service worker for PWA installability.
// No offline caching: Bridge always requires network access.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-only: let the browser handle all requests normally.
  // This handler exists solely to satisfy Chrome's PWA installability check.
});
