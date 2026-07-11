const VERSION = "hub-ifba-v0.2.12";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CORE = [
  "./", "./index.html", "./offline.html",
  "./styles.css?v=0.2.12", "./css/enhancements.css?v=0.2.12",
  "./data.js?v=0.2.12", "./app.js?v=0.2.12", "./js/storage.js?v=0.2.12",
  "./js/where-data.js?v=0.2.12", "./js/enhancements.js?v=0.2.12", "./js/experience.js?v=0.2.12",
  "./assets/logo-pixel.png", "./assets/logo-pixel-64.png", "./assets/apple-touch-icon.png", "./favicon.ico",
  "./apps/app-shell.css?v=0.2.12", "./apps/app-shell.js?v=0.2.12", "./apps/catalog.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => /^hub-ifba-v\d/.test(key) && ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || (await caches.match(request)) || (request.mode === "navigate" ? caches.match("./offline.html") : Response.error());
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin !== self.location.origin || /\.(?:pdf|xlsx?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
