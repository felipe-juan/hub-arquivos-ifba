const VERSION = "hub-ifba-v0.2.42";
const STATIC_CACHE = `${VERSION}-static`;
const METADATA_CACHE = `${VERSION}-metadata`;
const IMAGE_CACHE = `${VERSION}-images`;
const DOCUMENT_CACHE = `${VERSION}-documents`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const KNOWN_CACHES = [STATIC_CACHE, METADATA_CACHE, IMAGE_CACHE, DOCUMENT_CACHE, RUNTIME_CACHE];

const CORE = [
  "./", "./index.html", "./offline.html", "./document-viewer.html",
  "assets/build/styles.66a4b6caf231.css", "assets/build/enhancements.254c728974fb.css", "assets/build/sidebar-quick-search.ea5032187b1e.css", "assets/build/design-system.afe11aadcef7.css",
  "assets/build/data.d5d624533d89.js", "assets/build/app.b868202497d1.js", "assets/build/storage.aade70adc118.js", "assets/build/design-system.e91c6c2e7121.js", "assets/build/where-data.2815ed20f527.js",
  "./assets/logo-pixel.png", "./assets/logo-pixel-64.png", "./assets/apple-touch-icon.png", "./favicon.ico",
  "apps/build/app-shell.f5dcd9311598.css", "apps/build/app-shell.e4d3759152fc.js", "./apps/catalog.json",
  "./apps/calendario/", "./apps/calendario/index.html", "apps/build/calendar-data.84ae485c16ae.js", "./apps/calendario/data/source-metadata.json",
  "./apps/fluxogramas/", "./apps/fluxogramas/index.html", "apps/build/fluxogramas-data.a37b87063d78.js", "./apps/fluxogramas/data/source-metadata.json",
  "./apps/barema/", "./apps/barema/index.html", "apps/build/barema-data.33efba1c5da4.js", "./apps/barema/data/source-metadata.json",
  "./apps/doom/", "./apps/doom/index.html", "apps/build/doom.e8cc1dfcf3ec.css", "apps/build/doom.01d14f0a77a1.js",
  "./apps/doom/vendor/runtime-manifest.json", "./apps/doom/coi-serviceworker.js"
];

const REQUIRED_CORE = new Set([
  "./", "./index.html", "./offline.html", "./document-viewer.html",
  "assets/build/styles.66a4b6caf231.css", "assets/build/enhancements.254c728974fb.css", "assets/build/sidebar-quick-search.ea5032187b1e.css", "assets/build/design-system.afe11aadcef7.css",
  "assets/build/data.d5d624533d89.js", "assets/build/app.b868202497d1.js", "assets/build/storage.aade70adc118.js", "assets/build/design-system.e91c6c2e7121.js", "assets/build/where-data.2815ed20f527.js",
]);

async function installCoreResources() {
  const cache = await caches.open(STATIC_CACHE);
  const results = await Promise.allSettled(CORE.map(async resource => {
    const request = new Request(new URL(resource, self.registration.scope).href, { cache: "reload" });
    const response = await fetchWithTimeout(request, 15000);
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
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting()); });
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
async function fetchWithTimeout(request, timeoutMs = 0) {
  if (!timeoutMs || typeof AbortController !== "function") return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const sourceSignal = request.signal;
  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) controller.abort();
  else sourceSignal?.addEventListener?.("abort", abortFromSource, { once: true });
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    sourceSignal?.removeEventListener?.("abort", abortFromSource);
  }
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
async function cacheFirst(request, cacheName = STATIC_CACHE, maxEntries = 0, event = null) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (maxEntries) {
      const refreshRecency = put(cacheName, request, cached, maxEntries);
      if (event?.waitUntil) event.waitUntil(refreshRecency);
      else refreshRecency.catch(() => {});
    }
    return cached;
  }
  const response = await fetchWithTimeout(request, 15000);
  await put(cacheName, request, response, maxEntries);
  return response;
}
async function staleWhileRevalidate(request, cacheName, maxEntries = 0, event = null) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetchWithTimeout(request, 10000).then(async response => { await put(cacheName, request, response, maxEntries); return response; }).catch(() => null);
  if (cached && event?.waitUntil) event.waitUntil(network.then(() => undefined));
  return cached || (await network) || Response.error();
}
async function networkFirst(request, cacheName, fallback = null, maxEntries = 0, event = null, timeoutMs = 0) {
  try {
    let preload = null;
    if (event?.preloadResponse) {
      preload = timeoutMs
        ? await Promise.race([event.preloadResponse, new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))])
        : await event.preloadResponse;
    }
    const response = preload || await fetchWithTimeout(request, timeoutMs);
    await put(cacheName, request, response, maxEntries);
    return response;
  } catch (_) {
    const cache = await caches.open(cacheName);
    const staticCache = fallback ? await caches.open(STATIC_CACHE) : null;
    return (await cache.match(request)) || (fallback ? await staticCache.match(fallback) : null) || Response.error();
  }
}

function navigationFallback(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  const rawRelative = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  let relative = rawRelative;
  try { relative = decodeURIComponent(rawRelative); } catch (_) {}
  relative = relative.replace(/^\/+|\/+$/g, "");
  if (!relative || relative === "index.html") return "./index.html";
  if (relative === "document-viewer.html") return "./document-viewer.html";
  const app = relative.match(/^apps\/(calendario|fluxogramas|barema|doom)(?:\/|$)/i)?.[1];
  if (app) return `./apps/${app.toLowerCase()}/index.html`;
  return "./offline.html";
}
function isExecutableAsset(url) { return /\.(?:js|mjs|css|wasm|jsdos|data|worker)(?:$|\?)/i.test(url.pathname + url.search); }
function isMetadata(url) { return /(?:manifest|catalog|metadata|index|content-blueprint|VERSION).*\.(?:json|csv|txt)$/i.test(url.pathname) || /\/documents\/manifest\.(?:json|csv)$/i.test(url.pathname); }
function isThumbnail(url) { return /\/assets\/document-thumbnails\//i.test(url.pathname); }

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") { event.respondWith(networkFirst(request, RUNTIME_CACHE, navigationFallback(url), 20, event, 7000)); return; }

  // Recursos externos, inclusive todos os fallbacks do js-dos, seguem diretamente
  // para a rede e nunca recebem offline.html como substituto.
  if (url.origin !== self.location.origin) return;

  if (/\/VERSION$/i.test(url.pathname)) { event.respondWith(networkFirst(new Request(request, { cache: "no-store" }), METADATA_CACHE, null, 2)); return; }
  if (isMetadata(url)) { event.respondWith(staleWhileRevalidate(request, METADATA_CACHE, 24, event)); return; }
  if (isThumbnail(url)) { event.respondWith(cacheFirst(request, IMAGE_CACHE, 120, event)); return; }
  if (/\.(?:pdf|xlsx?|docx?|pptx?)$/i.test(url.pathname)) { event.respondWith(networkFirst(request, DOCUMENT_CACHE, null, 8, event, 15000)); return; }
  if (isExecutableAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 0, event).catch(() => Response.error()));
    return;
  }
  if (/\.(?:png|jpe?g|webp|avif|gif|ico|svg|woff2?)$/i.test(url.pathname)) { event.respondWith(cacheFirst(request, IMAGE_CACHE, 160, event)); return; }
  event.respondWith(cacheFirst(request, RUNTIME_CACHE, 40, event));
});
