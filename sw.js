// Minimal service worker — enables "Add to Home Screen" installability.
// Data (Sheet + photos) is always fetched fresh over the network;
// this does not cache the live data, only the app shell files.
const CACHE_NAME = "pwac-people-shell-v1";
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
    )
  );
});

self.addEventListener("fetch", event => {
  // Only serve cached shell files for same-origin GET requests.
  // Everything else (Sheets API, Drive API, images) always goes to network.
  const url = new URL(event.request.url);
  if (url.origin === location.origin && event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
