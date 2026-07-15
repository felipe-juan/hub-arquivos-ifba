(() => {
  "use strict";

  const RECENTS_KEY = "hubRecentItemsV1";
  const MAX_RECENTS = 8;

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const normalizeText = value => String(value ?? "").toLowerCase().replace(/ç/g, "__cedilla__").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/__cedilla__/g, "ç");
  const sameOriginUrl = path => new URL(path, document.baseURI).href;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function readRecents() {
    const items = readJson(RECENTS_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function recentKey(item) {
    return `${item.kind || "item"}:${item.id || item.url || item.title}`;
  }

  function addRecent(item = {}) {
    if (!item.title || !item.url) return;
    const clean = {
      id: item.id || item.url,
      kind: item.kind || "item",
      title: item.title,
      url: item.url,
      meta: item.meta || "Acesso recente",
      emoji: item.emoji || (item.kind === "document" ? "📄" : item.kind === "matrix" ? "🧭" : item.kind === "app" ? "🧰" : "🔗"),
      timestamp: Date.now()
    };
    const key = recentKey(clean);
    const next = [clean, ...readRecents().filter(entry => recentKey(entry) !== key)].slice(0, MAX_RECENTS);
    writeJson(RECENTS_KEY, next);
    renderRecents();
    document.dispatchEvent(new CustomEvent("hub:recents-changed"));
  }

  window.HUB_RECENTS = { add: addRecent, list: readRecents, render: renderRecents };

  function renderRecents() {
    const panel = qs("#recentItemsPanel");
    const list = qs("#recentItemsList");
    if (!panel || !list) return;
    const items = readRecents();
    panel.hidden = items.length === 0;
    list.innerHTML = items.map(item => `
      <a class="recent-item" href="${escapeHtml(item.url)}"${/^(https?:|mailto:|tel:)/i.test(item.url) || /\.(pdf|xlsx?|docx?)($|[?#])/i.test(item.url) ? ' target="_blank" rel="noopener"' : ""} data-recent-open="${escapeHtml(recentKey(item))}">
        <span class="recent-item-icon" aria-hidden="true">${escapeHtml(item.emoji)}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span>
      </a>
    `).join("");
  }

  qs("#clearRecentItems")?.addEventListener("click", () => {
    localStorage.removeItem(RECENTS_KEY);
    renderRecents();
  });

  function resourceFromClick(target) {
    const resourceCard = target.closest(".resource-card[id]");
    if (resourceCard) {
      const id = resourceCard.id;
      if (typeof documents !== "undefined") {
        const doc = documents.find(item => item.id === id);
        if (doc) return { id: doc.id, kind: "document", title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", meta: doc.group || doc.category || "Documento", emoji: "📄" };
      }
      if (typeof apps !== "undefined") {
        const app = apps.find(item => item.id === id);
        if (app) return { id: app.id, kind: "app", title: app.title, url: app.url, meta: app.category || "App acadêmico", emoji: "🧰" };
      }
      if (typeof usefulLinks !== "undefined") {
        const link = usefulLinks.find(item => item.id === id);
        if (link) return { id: link.id, kind: "link", title: link.title, url: link.url, meta: link.category || "Atalho", emoji: "🔗" };
      }
    }

    const rowDocId = target.closest("tr")?.querySelector("[data-directory-doc]")?.dataset.directoryDoc;
    if (rowDocId && typeof documents !== "undefined") {
      const doc = documents.find(item => item.id === rowDocId);
      if (doc) return { id: doc.id, kind: "document", title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", meta: doc.group || doc.category || "Documento", emoji: "📄" };
    }

    const resultPreview = target.closest(".result-card")?.querySelector("[data-preview-index]");
    if (resultPreview && typeof state !== "undefined") {
      const result = state.lastResults?.[Number(resultPreview.dataset.previewIndex)];
      const doc = result?.doc || result?.document;
      if (doc) return { id: doc.id, kind: "document", title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", meta: doc.group || doc.category || "Documento", emoji: "📄" };
    }

    const docId = target.closest("[data-doc-preview]")?.dataset.docPreview
      || target.closest("[data-directory-doc]")?.dataset.directoryDoc
      || target.closest("[data-open-doc]")?.dataset.openDoc;
    if (docId && typeof documents !== "undefined") {
      const doc = documents.find(item => item.id === docId);
      if (doc) return { id: doc.id, kind: "document", title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", meta: doc.group || doc.category || "Documento", emoji: "📄" };
    }

    const preview = target.closest("[data-preview-index]");
    if (preview && typeof state !== "undefined") {
      const result = state.lastResults?.[Number(preview.dataset.previewIndex)];
      const doc = result?.doc || result?.document;
      if (doc) return { id: doc.id, kind: "document", title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", meta: doc.group || doc.category || "Documento", emoji: "📄" };
    }

    const anchor = target.closest("a[href]");
    if (!anchor) return null;
    const href = anchor.getAttribute("href") || "";
    if (!href || href === "#" || href.startsWith("javascript:")) return null;
    if (typeof apps !== "undefined") {
      const app = apps.find(item => item.url === href || sameOriginUrl(item.url || "") === anchor.href);
      if (app) return { id: app.id, kind: "app", title: app.title, url: app.url, meta: app.category || "App acadêmico", emoji: "🧰" };
    }
    if (typeof usefulLinks !== "undefined") {
      const link = usefulLinks.find(item => item.url === href || item.url === anchor.href);
      if (link) return { id: link.id, kind: "link", title: link.title, url: link.url, meta: link.category || "Atalho", emoji: "🔗" };
    }
    if (/\.(pdf|xlsx?|docx?)($|[?#])/i.test(href)) return { id: href, kind: "document", title: anchor.textContent.trim() || href.split("/").pop(), url: href, meta: "Arquivo", emoji: "📄" };
    return null;
  }

  document.addEventListener("click", event => {
    const item = resourceFromClick(event.target);
    if (item) addRecent(item);
  }, true);

  // Command palette -------------------------------------------------------
  const palette = qs("#commandPaletteDialog");
  const paletteInput = qs("#commandPaletteInput");
  const paletteResults = qs("#commandPaletteResults");
  let paletteItems = [];
  let activePaletteIndex = 0;

  function commandItems() {
    const sections = [
      ["Buscar", "#buscar", "🔍", "Seção"],
      ["Início", "#inicio", "🏠", "Seção"],
      ["Acervo", "#acervo", "🗂️", "Seção"],
      ["Apps acadêmicos", "#apps", "🧰", "Seção"],
      ["Média e Prova Final", "#media-final", "🧮", "App"],
      ["Onde resolvo isso?", "#onde-resolvo", "🧭", "App"],
      ["Links", "#links", "🔗", "Seção"]
    ].map(([title, url, emoji, meta]) => ({ id: `section:${url}`, title, url, emoji, meta, kind: "section" }));
    const appItems = (typeof apps !== "undefined" ? apps : (window.HUB_DATA?.apps || [])).map(app => ({ id: app.id, title: app.title, url: app.url, emoji: "🧰", meta: app.category || "App", kind: "app" }));
    const links = (typeof usefulLinks !== "undefined" ? usefulLinks : (window.HUB_DATA?.usefulLinks || [])).map(link => ({ id: link.id, title: link.title, url: link.url, emoji: "🔗", meta: link.category || "Atalho", kind: "link" }));
    const docs = (typeof documents !== "undefined" ? documents : []).map(doc => ({ id: doc.id, title: doc.title, url: doc.pdfUrl || doc.sourceUrl || "#", emoji: "📄", meta: doc.group || doc.category || "Documento", kind: "document" }));
    const actions = [
      { id: "action:theme", title: "Alternar tema", emoji: "◐", meta: "Ação", action: "theme", kind: "action" },
      { id: "action:report", title: "Reportar problema", emoji: "🐞", meta: "Ação", action: "report", kind: "action" },
      { id: "action:preferences", title: "Restaurar preferências", emoji: "↺", meta: "Ação", action: "preferences", kind: "action" }
    ];
    return [...actions, ...sections, ...appItems, ...links, ...docs];
  }

  function filterCommands(query = "") {
    const normalized = normalizeText(query.trim());
    const source = commandItems();
    if (!normalized) return source.slice(0, 12);
    return source
      .map(item => {
        const title = normalizeText(item.title);
        const meta = normalizeText(item.meta);
        let score = 0;
        if (title === normalized) score += 100;
        if (title.startsWith(normalized)) score += 50;
        if (title.includes(normalized)) score += 25;
        if (meta.includes(normalized)) score += 5;
        return { ...item, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pt-BR"))
      .slice(0, 16);
  }

  function renderPalette(query = "") {
    if (!paletteResults) return;
    paletteItems = filterCommands(query);
    activePaletteIndex = Math.min(activePaletteIndex, Math.max(0, paletteItems.length - 1));
    paletteResults.innerHTML = paletteItems.length ? paletteItems.map((item, index) => `
      <button type="button" class="command-palette-item${index === activePaletteIndex ? " active" : ""}" data-command-index="${index}" role="option" aria-selected="${index === activePaletteIndex}">
        <span aria-hidden="true">${escapeHtml(item.emoji)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span><kbd>↵</kbd>
      </button>
    `).join("") : '<p class="command-palette-empty">Nenhum comando ou item encontrado.</p>';
    qsa(".command-palette-item", paletteResults)[activePaletteIndex]?.scrollIntoView({ block: "nearest" });
  }

  function openPalette() {
    if (!palette) return;
    activePaletteIndex = 0;
    paletteInput.value = "";
    renderPalette("");
    if (typeof palette.showModal === "function") palette.showModal(); else palette.setAttribute("open", "");
    requestAnimationFrame(() => paletteInput?.focus());
  }
  function closePalette() { palette?.close?.(); }

  function runCommand(item) {
    if (!item) return;
    closePalette();
    if (item.action === "theme") {
      const order = ["auto", "dark", "light"];
      const current = document.documentElement.dataset.themeMode || "auto";
      const next = order[(order.indexOf(current) + 1) % order.length];
      document.querySelector(`[data-theme-choice="${next}"]`)?.click();
      return;
    }
    if (item.action === "report") { window.HUB_UI?.openIssue({ title: "Paleta de comandos" }); return; }
    if (item.action === "preferences") { qs("#resetPreferencesButton")?.click(); return; }
    addRecent(item);
    if ((item.url || "").startsWith("#")) {
      location.hash = item.url;
      qs(item.url)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (item.url) {
      const external = /^(https?:|mailto:|tel:)/i.test(item.url) || /\.(pdf|xlsx?|docx?)($|[?#])/i.test(item.url);
      if (external) window.open(item.url, "_blank", "noopener"); else location.href = item.url;
    }
  }

  document.addEventListener("keydown", event => {
    const paletteShortcut = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "k" || (event.shiftKey && event.key.toLowerCase() === "p"));
    if (paletteShortcut) { event.preventDefault(); openPalette(); return; }
    if (!palette?.open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activePaletteIndex = Math.min(activePaletteIndex + 1, paletteItems.length - 1); renderPalette(paletteInput.value); }
    else if (event.key === "ArrowUp") { event.preventDefault(); activePaletteIndex = Math.max(activePaletteIndex - 1, 0); renderPalette(paletteInput.value); }
    else if (event.key === "Enter" && document.activeElement === paletteInput) { event.preventDefault(); runCommand(paletteItems[activePaletteIndex]); }
  });
  paletteInput?.addEventListener("input", () => { activePaletteIndex = 0; renderPalette(paletteInput.value); });
  paletteResults?.addEventListener("click", event => runCommand(paletteItems[Number(event.target.closest("[data-command-index]")?.dataset.commandIndex)]));
  qs(".command-palette-close", palette)?.addEventListener("click", closePalette);
  palette?.addEventListener("click", event => { if (event.target === palette) closePalette(); });

  renderRecents();
})();
