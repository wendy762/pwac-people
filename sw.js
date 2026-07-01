// Minimal service worker — enables "Add to Home Screen" installability.
// NETWORK-FIRST for app shell files, so updates always take effect
// immediately rather than getting stuck on an old cached version.
// Data (Sheet + photos) always comes straight from the network.
const CACHE_NAME = "pwac-people-shell-v2";
const SHELL_FILES = [
  "./index.html",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./logo_transparent.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin && event.request.method === "GET") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
