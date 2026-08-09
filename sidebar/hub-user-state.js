(() => {
  'use strict';
  if (window.HUB_USER_STATE?.version >= 2) return;

  const FAVORITES_KEY = 'hubFavoritesV2';
  const LEGACY_FAVORITES = ['hubFavoritesV1', 'hubAssistantFavoritesV1'];
  const ASSISTANT_DB = 'hubAssistantHistoryV1';
  const ASSISTANT_LOCAL_KEYS = ['hubAssistantStateV1', 'hubAssistantStateV1:draft'];
  const INTERFACE_KEYS = ['hubSidebarCollapsed','hubSidebarWidth','hubSidebarAppsOpen','hubSidebarFavoritesOpen','hubSidebarLinksOpen','hubThemeMode','hubPopularPeriodV1'];

  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function cleanText(value, max = 240) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
  function normalizeFavorite(item = {}, index = 0) {
    const allowed = new Set(['document','answer','app','tool','link']);
    const kind = allowed.has(String(item.kind || '')) ? String(item.kind) : (item.url ? 'link' : 'answer');
    const id = cleanText(item.id || item.messageId || item.serverId || `${kind}-${index}-${Date.now()}`, 180);
    return {
      id, kind,
      title: cleanText(item.title || item.label || 'Favorito', 180),
      summary: cleanText(item.summary || item.text || '', 320),
      url: cleanText(item.url || item.href || '', 1200),
      prompt: cleanText(item.prompt || '', 500),
      messageId: cleanText(item.messageId || '', 180),
      serverId: cleanText(item.serverId || '', 180),
      createdAt: Number(item.createdAt || Date.now())
    };
  }
  function dedupe(items = []) {
    const seen = new Set(); const result = [];
    for (const [index, raw] of items.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const item = normalizeFavorite(raw, index);
      const marker = item.id || `${item.kind}|${item.url}|${item.title}`;
      if (seen.has(marker)) continue;
      seen.add(marker); result.push(item);
    }
    return result.sort((a,b) => b.createdAt - a.createdAt).slice(0, 100);
  }
  function migrateFavorites() {
    const existing = readJson(FAVORITES_KEY, null);
    const merged = Array.isArray(existing) ? [...existing] : [];
    for (const key of LEGACY_FAVORITES) {
      const legacy = readJson(key, []);
      if (Array.isArray(legacy)) merged.push(...legacy);
    }
    const normalized = dedupe(merged);
    writeJson(FAVORITES_KEY, normalized);
    for (const key of LEGACY_FAVORITES) { try { localStorage.removeItem(key); } catch {} }
    return normalized;
  }
  function getFavorites() { return migrateFavorites(); }
  function setFavorites(items = []) {
    const normalized = dedupe(items);
    writeJson(FAVORITES_KEY, normalized);
    window.dispatchEvent(new CustomEvent('hub:favorites-changed', { detail:{ count:normalized.length } }));
    return normalized;
  }
  function addFavorite(item) {
    const next = getFavorites().filter(entry => entry.id !== item?.id);
    next.unshift(normalizeFavorite(item));
    return setFavorites(next);
  }
  function removeFavorite(id) { return setFavorites(getFavorites().filter(item => item.id !== String(id || ''))); }
  function hasFavorite(id) { return getFavorites().some(item => item.id === String(id || '')); }

  function deleteDatabase(name) {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve();
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      } catch { resolve(); }
    });
  }
  function removeByPrefix(prefixes = []) {
    const keys = [];
    try { for (let i=0;i<localStorage.length;i+=1) keys.push(localStorage.key(i)); } catch {}
    for (const key of keys) if (key && prefixes.some(prefix => key.startsWith(prefix))) { try { localStorage.removeItem(key); } catch {} }
  }
  async function deleteDatabasesByPrefix(prefixes = [], exclusions = []) {
    if (!globalThis.indexedDB?.databases) return;
    let entries = [];
    try { entries = await indexedDB.databases(); } catch { return; }
    await Promise.all(entries.map(entry => String(entry?.name || '')).filter(name => name && prefixes.some(prefix => name.startsWith(prefix)) && !exclusions.includes(name)).map(deleteDatabase));
  }
  async function reset(selection = {}) {
    const all = Boolean(selection.all);
    if (all || selection.interface) for (const key of INTERFACE_KEYS) { try { localStorage.removeItem(key); } catch {} }
    if (all || selection.favorites) { try { localStorage.removeItem(FAVORITES_KEY); } catch {}; for (const key of LEGACY_FAVORITES) { try { localStorage.removeItem(key); } catch {} } }
    if (all || selection.assistant) {
      for (const key of ASSISTANT_LOCAL_KEYS) { try { localStorage.removeItem(key); } catch {} }
      await deleteDatabase(ASSISTANT_DB);
    }
    if (all || selection.apps) {
      removeByPrefix(['barema','fluxapp:','hubApp:','hubPdf','hubDocument','hubRecent']);
      await deleteDatabasesByPrefix(['hub','barema','flux'], all || selection.assistant ? [] : [ASSISTANT_DB]);
    }
    if (all) {
      // "Tudo" é um reset realmente global do HUB: remove qualquer chave hub*
      // restante, além dos dados dos apps conhecidos. IndexedDB já foi tratado acima.
      removeByPrefix(['hub','barema','fluxapp:']);
    }
    window.dispatchEvent(new CustomEvent('hub:state-reset', { detail:{ ...selection, all } }));
  }

  window.HUB_USER_STATE = Object.freeze({ version:2, FAVORITES_KEY, getFavorites, setFavorites, addFavorite, removeFavorite, hasFavorite, reset });
  migrateFavorites();
})();
