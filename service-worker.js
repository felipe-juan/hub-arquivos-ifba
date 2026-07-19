const VERSION = "hub-ifba-v0.2.33";
const STATIC_CACHE = `${VERSION}-static`;
const METADATA_CACHE = `${VERSION}-metadata`;
const IMAGE_CACHE = `${VERSION}-images`;
const DOCUMENT_CACHE = `${VERSION}-documents`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const KNOWN_CACHES = [STATIC_CACHE, METADATA_CACHE, IMAGE_CACHE, DOCUMENT_CACHE, RUNTIME_CACHE];

const CORE = [
  "./", "./index.html", "./offline.html", "./document-viewer.html",
  "assets/build/styles.cfcabf51a064.css", "assets/build/enhancements.254c728974fb.css", "assets/build/sidebar-quick-search.ea5032187b1e.css", "assets/build/design-system.afe11aadcef7.css",
  "assets/build/data.d5d624533d89.js", "assets/build/app.6557047fb3b9.js", "assets/build/storage.aade70adc118.js", "assets/build/design-system.207b345af7d9.js", "assets/build/where-data.2815ed20f527.js",
  "./assets/logo-pixel.png", "./assets/logo-pixel-64.png", "./assets/apple-touch-icon.png", "./favicon.ico",
  "apps/build/app-shell.f5dcd9311598.css", "apps/build/app-shell.e4d3759152fc.js", "./apps/catalog.json",
  "./apps/calendario/", "./apps/calendario/index.html", "apps/build/calendar-data.84ae485c16ae.js", "./apps/calendario/data/source-metadata.json",
  "./apps/fluxogramas/", "./apps/fluxogramas/index.html", "apps/build/fluxogramas-data.a37b87063d78.js", "./apps/fluxogramas/data/source-metadata.json",
  "./apps/barema/", "./apps/barema/index.html", "apps/build/barema-data.33efba1c5da4.js", "./apps/barema/data/source-metadata.json",
  "./apps/doom/", "./apps/doom/index.html", "apps/build/doom.2fa2668a07ca.css", "apps/build/doom.1846854009c5.js"
];

const REQUIRED_CORE = new Set([
  "./", "./index.html", "./offline.html", "./document-viewer.html",
]);

async function installCoreResources() {
  const cache = await caches.open(STATIC_CACHE);
  const results = await Promise.allSettled(CORE.map(async resource => {
    const request = new Request(new URL(resource, self.registration.scope).href, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`${resource}: HTTP ${response.status}`);
    await cache.put(request, response);
  }));
  const failures = results
    .map((result, index) => ({ result, resource: CORE[index] }))
    .filter(item => item.result.status === "rejected");
  const critical = failures.filter(item => REQUIRED_CORE.has(item.resource));
  if (critical.length) {
    throw new Error(`Falha ao instalar recursos essenciais: ${critical.map(item => item.resource).join(", ")}`);
  }
  failures.forEach(item => console.warn("Recurso offline opcional indisponível durante a instalação:", item.resource));
}

self.addEventListener("install", event => {
  event.waitUntil(installCoreResources());
});
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => /^hub-ifba-v\d/.test(key) && !KNOWN_CACHES.includes(key)).map(key => caches.delete(key)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (_) {} }
    await self.clients.claim();
  })());
});

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}
async function put(cacheName, request, response, maxEntries = 0) {
  if (!response || !(response.ok || response.type === "opaque")) return;
  try {
    const cache = await caches.open(cacheName);
    if (maxEntries) await cache.delete(request);
    await cache.put(request, response.clone());
    if (maxEntries) await trimCache(cacheName, maxEntries);
  } catch (error) {
    // Quota/storage failures must never discard a valid network response.
    console.warn("Falha ao atualizar cache:", cacheName, error);
  }
}
async function cacheFirst(request, cacheName = STATIC_CACHE, maxEntries = 0) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await put(cacheName, request, response, maxEntries);
  return response;
}
async function staleWhileRevalidate(request, cacheName, maxEntries = 0, event = null) {
  const cached = await caches.match(request);
  const network = fetch(request).then(async response => { await put(cacheName, request, response, maxEntries); return response; }).catch(() => null);
  if (cached && event?.waitUntil) event.waitUntil(network.then(() => undefined));
  return cached || (await network) || Response.error();
}
async function networkFirst(request, cacheName, fallback = null, maxEntries = 0, event = null) {
  try {
    const preload = event?.preloadResponse ? await event.preloadResponse : null;
    const response = preload || await fetch(request);
    await put(cacheName, request, response, maxEntries);
    return response;
  } catch (_) {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : null) || Response.error();
  }
}
function isExecutableAsset(url) { return /\.(?:js|mjs|css|wasm|jsdos|data|worker)(?:$|\?)/i.test(url.pathname + url.search); }
function isMetadata(url) { return /(?:manifest|catalog|metadata|index|content-blueprint|VERSION).*\.(?:json|csv|txt)$/i.test(url.pathname) || /\/documents\/manifest\.(?:json|csv)$/i.test(url.pathname); }
function isThumbnail(url) { return /\/assets\/document-thumbnails\//i.test(url.pathname); }

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") { event.respondWith(networkFirst(request, RUNTIME_CACHE, "./offline.html", 20, event)); return; }

  // Recursos externos, inclusive todos os fallbacks do js-dos, seguem diretamente
  // para a rede e nunca recebem offline.html como substituto.
  if (url.origin !== self.location.origin) return;

  if (/\/VERSION$/i.test(url.pathname)) { event.respondWith(networkFirst(new Request(request, { cache: "no-store" }), METADATA_CACHE, null, 2)); return; }
  if (isMetadata(url)) { event.respondWith(staleWhileRevalidate(request, METADATA_CACHE, 24, event)); return; }
  if (isThumbnail(url)) { event.respondWith(cacheFirst(request, IMAGE_CACHE, 120)); return; }
  if (/\.(?:pdf|xlsx?|docx?|pptx?)$/i.test(url.pathname)) { event.respondWith(networkFirst(request, DOCUMENT_CACHE, null, 8)); return; }
  if (isExecutableAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE).catch(() => Response.error()));
    return;
  }
  if (/\.(?:png|jpe?g|webp|avif|gif|ico|svg|woff2?)$/i.test(url.pathname)) { event.respondWith(cacheFirst(request, IMAGE_CACHE, 160)); return; }
  event.respondWith(cacheFirst(request, RUNTIME_CACHE, 40));
});
