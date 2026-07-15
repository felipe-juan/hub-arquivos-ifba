const VERSION = "hub-ifba-v0.2.22";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CORE = [
  "./", "./index.html", "./offline.html", "./document-viewer.html",
  "./styles.css?v=0.2.22", "./css/enhancements.css?v=0.2.22", "./css/sidebar-quick-search.css?v=0.2.22", "./css/design-system.css?v=0.2.22",
  "./data.js?v=0.2.22", "./app.js?v=0.2.22", "./js/storage.js?v=0.2.22", "./js/design-system.js?v=0.2.22",
  "./js/where-data.js?v=0.2.22", "./js/enhancements.js?v=0.2.22", "./js/experience.js?v=0.2.22", "./js/sidebar-quick-search.js?v=0.2.22",
  "./assets/logo-pixel.png", "./assets/logo-pixel-64.png", "./assets/apple-touch-icon.png", "./favicon.ico",
  "./apps/app-shell.css?v=0.2.22", "./apps/app-shell.js?v=0.2.22", "./apps/catalog.json",
  "./apps/calendario/", "./apps/calendario/index.html", "./apps/calendario/data/calendar-data.js?v=0.2.22", "./apps/calendario/data/source-metadata.json",
  "./apps/fluxogramas/", "./apps/fluxogramas/index.html", "./apps/fluxogramas/data/fluxogramas-data.js?v=0.2.22", "./apps/fluxogramas/data/source-metadata.json",
  "./apps/barema/", "./apps/barema/index.html", "./apps/barema/data/barema-data.js?v=0.2.22", "./apps/barema/data/source-metadata.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => /^hub-ifba-v\d/.test(key) && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request, event) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const preload = event?.preloadResponse ? await event.preloadResponse : null;
    const response = preload || await fetch(request);
    if (response && (response.ok || response.type === "opaque")) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || (await caches.match(request)) || caches.match("./offline.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const network = fetch(request).then(async response => {
    if (response && (response.ok || response.type === "opaque")) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event));
    return;
  }

  // Arquivos grandes não são pré-carregados. Depois da primeira abertura,
  // PDFs e planilhas ficam no cache de execução do navegador.
  if (/\.(?:pdf|xlsx?|docx?|pptx?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/\.(?:css|js|json|png|jpe?g|webp|gif|ico|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
