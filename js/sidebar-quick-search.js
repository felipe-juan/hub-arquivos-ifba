(() => {
  "use strict";

  const STORAGE = {
    recentSearches: "hubRecentSearchesV1",
    savedSearches: "hubSavedSearchesV1",
    recentItems: "hubRecentItemsV1",
    pendingSaved: "hubSidebarPendingSavedSearchV1"
  };
  const SCOPES = {
    all: { label: "Tudo", icon: "◉", type: "all" },
    document: { label: "Documentos", icon: "📄", type: "document" },
    app: { label: "Apps", icon: "🧰", type: "app" },
    link: { label: "Links", icon: "🔗", type: "link" },
    contact: { label: "Contatos", icon: "💬", type: "answer" }
  };
  const PREFIXES = {
    doc: "document", docs: "document", documento: "document", documentos: "document",
    app: "app", apps: "app",
    link: "link", links: "link", atalho: "link", atalhos: "link",
    contact: "contact", contacts: "contact", contato: "contact", contatos: "contact"
  };
  const MAX_RESULTS = 3;
  const MAX_RECENT_SEARCHES = 6;
  const instances = [];
  let documentResourcesPromise = null;

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return value ?? fallback;
    } catch (_) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };
  const read = (key, fallback = "") => {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
  const normalize = value => String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const isExternal = url => /^(https?:|mailto:|tel:)/i.test(String(url || ""));
  const isFile = url => /\.(?:pdf|xlsx?|docx?|pptx?|od[stp])(?:$|[?#])/i.test(String(url || ""));
  const compact = (value, max = 160) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
  };
  const unique = items => [...new Map(items.filter(Boolean).map(item => [item.id || `${item.kind}:${item.url}:${item.title}`, item])).values()];

  function currentRoot(form) {
    const isApp = form.id === "hubShellSearchForm" || location.pathname.includes("/apps/");
    const base = document.baseURI || location.href;
    return {
      isApp,
      root: new URL(isApp ? "../../" : "./", base),
      home: new URL(isApp ? "../../index.html" : "./index.html", base)
    };
  }

  function absoluteResourceUrl(url, rootInfo) {
    const value = String(url || "#").trim();
    if (!value || value === "#") return rootInfo.home.href;
    if (value.startsWith("#")) return `${rootInfo.home.href.split("#")[0]}${value}`;
    try { return new URL(value, rootInfo.root).href; } catch (_) { return value; }
  }

  function documentViewerUrl(resource, rootInfo) {
    const source = absoluteResourceUrl(resource.rawUrl || resource.url, rootInfo);
    const viewer = new URL("document-viewer.html", rootInfo.root);
    viewer.searchParams.set("file", source.split("#")[0]);
    if (resource.page) viewer.searchParams.set("page", String(resource.page));
    return viewer.href;
  }

  function typeMeta(kind, raw = {}) {
    if (kind === "document") {
      const format = raw.format || raw.fileFormat || "";
      return { icon: "📄", label: format ? `Documento · ${format}` : "Documento", action: "Abrir" };
    }
    if (kind === "app") return { icon: raw.icon || raw.emoji || "🧰", label: "App do HUB", action: "Abrir" };
    if (kind === "contact") return { icon: raw.icon || raw.emoji || "💬", label: raw.category || "Contato", action: "Acessar" };
    if (kind === "section") return { icon: raw.icon || raw.emoji || "↗", label: "Seção", action: "Ir" };
    if (kind === "answer") return { icon: raw.icon || raw.emoji || "💡", label: raw.category || "Resposta", action: "Ver" };
    return { icon: raw.icon || raw.emoji || "🔗", label: raw.category || "Link", action: "Acessar" };
  }

  function isContactResource(item = {}) {
    const text = normalize([item.category, item.title, item.description, ...(item.tags || [])].join(" "));
    return /contato|whatsapp|telefone|ramal|email|e-mail|setor|coordenaç|caens|capne|cores|serviço social/.test(text);
  }

  function makeResource(raw, kind, rootInfo, extra = {}) {
    const meta = typeMeta(kind, raw);
    const title = raw.title || raw.name || "Item";
    const rawUrl = raw.pdfUrl || raw.sourceUrl || raw.file || raw.path || raw.url || extra.url || "#";
    const url = absoluteResourceUrl(rawUrl, rootInfo);
    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    const chunks = Array.isArray(raw.chunks) ? raw.chunks : [];
    const content = chunks.slice(0, 80).map(chunk => chunk?.text || "").join(" ").slice(0, 80000);
    const primary = [title, raw.description, raw.summary, raw.answer, raw.category, raw.group, raw.docType, raw.documentType, raw.kind, raw.correspondent, raw.format, raw.fileFormat, tags.join(" ")].filter(Boolean).join(" ");
    return {
      id: raw.id || `${kind}:${title}:${rawUrl}`,
      kind,
      title,
      description: raw.description || raw.summary || raw.answer || "",
      meta: extra.meta || meta.label,
      icon: extra.icon || meta.icon,
      action: extra.action || meta.action,
      rawUrl,
      url,
      page: extra.page || chunks[0]?.page || "",
      primary,
      content,
      normalizedPrimary: normalize(primary),
      normalizedTitle: normalize(title),
      normalizedContent: normalize(content),
      raw
    };
  }

  function staticResources(rootInfo) {
    const data = window.HUB_DATA || {};
    const resources = [];
    (data.apps || []).forEach(item => resources.push(makeResource(item, "app", rootInfo)));
    (data.usefulLinks || []).forEach(item => resources.push(makeResource(item, isContactResource(item) ? "contact" : "link", rootInfo)));
    (data.answers || []).forEach(item => resources.push(makeResource(item, "contact", rootInfo)));
    (data.workflows || []).forEach(item => resources.push(makeResource({ ...item, url: "#onde-resolvo" }, "answer", rootInfo, { icon: item.emoji || "🧭", meta: "Onde resolvo isso?" })));
    (window.HUB_WHERE_ITEMS || []).forEach(item => resources.push(makeResource({ ...item, description: item.summary, url: "#onde-resolvo", tags: [item.action, item.sector, ...(item.docs || [])] }, "answer", rootInfo, { icon: item.emoji || "🧭", meta: "Onde resolvo isso?" })));
    [
      { id: "section-home", title: "Início", url: "#inicio", icon: "🏠" },
      { id: "section-archive", title: "Acervo", url: "#acervo", icon: "🗂️" },
      { id: "section-apps", title: "Apps acadêmicos", url: "#apps", icon: "🧰" },
      { id: "section-links", title: "Links", url: "#links", icon: "🔗" }
    ].forEach(item => resources.push(makeResource(item, "section", rootInfo, { icon: item.icon })));
    return unique(resources);
  }

  async function loadDocumentResources(rootInfo) {
    if (documentResourcesPromise) return documentResourcesPromise;
    documentResourcesPromise = (async () => {
      let items = [];
      try {
        if (typeof documents !== "undefined" && Array.isArray(documents) && documents.length) items = documents;
      } catch (_) {}
      if (!items.length) {
        try {
          for (const path of ["documents/manifest-summary.json", "documents/manifest.json"]) {
            const response = await fetch(new URL(path, rootInfo.root), { cache: "no-cache" });
            if (!response.ok) continue;
            const manifest = await response.json();
            items = Array.isArray(manifest) ? manifest : (manifest.documents || []);
            if (items.length) break;
          }
        } catch (_) {}
      }
      return items.map(item => makeResource(item, "document", rootInfo));
    })();
    return documentResourcesPromise;
  }

  function parseQuery(rawQuery, selectedScope) {
    let query = String(rawQuery || "").trim();
    let scope = selectedScope;
    const prefix = query.match(/^([\p{L}]+):\s*/u);
    if (prefix && PREFIXES[normalize(prefix[1])]) {
      scope = PREFIXES[normalize(prefix[1])];
      query = query.slice(prefix[0].length).trim();
    }
    const exactPhrases = [...query.matchAll(/"([^"]+)"/g)].map(match => normalize(match[1])).filter(Boolean);
    const withoutPhrases = query.replace(/"[^"]+"/g, " ");
    const excluded = [...withoutPhrases.matchAll(/(?:^|\s)-([^\s]+)/g)].map(match => normalize(match[1])).filter(Boolean);
    const clean = withoutPhrases.replace(/(?:^|\s)-[^\s]+/g, " ").replace(/\b(?:AND|OR)\b/gi, " ").trim();
    const terms = clean.split(/\s+/).map(normalize).filter(Boolean);
    const hasOr = /\sOR\s/i.test(query);
    const hasAnd = /\sAND\s/i.test(query);
    return { raw: rawQuery, query, scope, exactPhrases, excluded, terms, hasOr, hasAnd };
  }

  function resourceMatchesScope(resource, scope) {
    if (scope === "all") return true;
    if (scope === "contact") return resource.kind === "contact" || resource.kind === "answer";
    return resource.kind === scope;
  }

  function scoreResource(resource, parsed) {
    if (!resourceMatchesScope(resource, parsed.scope)) return null;
    const whole = `${resource.normalizedPrimary} ${resource.normalizedContent}`;
    if (parsed.excluded.some(term => whole.includes(term))) return null;
    if (parsed.exactPhrases.some(phrase => !whole.includes(phrase))) return null;
    const matches = parsed.terms.map(term => whole.includes(term));
    if (parsed.terms.length) {
      if (parsed.hasOr ? !matches.some(Boolean) : !matches.every(Boolean)) return null;
    }
    if (!parsed.terms.length && !parsed.exactPhrases.length) return null;

    const phrase = normalize(parsed.query.replace(/"/g, " "));
    let score = 0;
    if (phrase && resource.normalizedTitle === phrase) score += 1200;
    else if (phrase && resource.normalizedTitle.startsWith(phrase)) score += 850;
    else if (phrase && resource.normalizedTitle.includes(phrase)) score += 620;
    parsed.exactPhrases.forEach(value => {
      if (resource.normalizedTitle.includes(value)) score += 460;
      else if (resource.normalizedPrimary.includes(value)) score += 260;
      else if (resource.normalizedContent.includes(value)) score += 90;
    });
    parsed.terms.forEach(term => {
      if (resource.normalizedTitle === term) score += 300;
      else if (resource.normalizedTitle.startsWith(term)) score += 220;
      else if (resource.normalizedTitle.includes(term)) score += 150;
      else if (resource.normalizedPrimary.includes(term)) score += 65;
      else if (resource.normalizedContent.includes(term)) score += 22;
    });
    const priority = { app: 70, document: 55, contact: 40, link: 30, answer: 22, section: 10 };
    score += priority[resource.kind] || 0;
    return { ...resource, score };
  }

  function highlightTitle(title, parsed) {
    const terms = [...parsed.exactPhrases, ...parsed.terms].filter(Boolean);
    if (!terms.length) return escapeHtml(title);
    const parts = String(title || "").split(/(\s+|[\-–—/(),.;:]+)/);
    return parts.map(part => {
      const normalizedPart = normalize(part);
      const matched = normalizedPart && terms.some(term => normalizedPart === term || normalizedPart.includes(term));
      return matched ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);
    }).join("");
  }

  function recentSearches() {
    const items = readJson(STORAGE.recentSearches, []);
    return Array.isArray(items) ? items.slice(0, MAX_RECENT_SEARCHES) : [];
  }

  function rememberSearch(query, scope) {
    const clean = String(query || "").trim();
    if (clean.length < 2) return;
    const key = `${scope}:${normalize(clean)}`;
    const next = [{ query: clean, scope, timestamp: Date.now() }, ...recentSearches().filter(item => `${item.scope}:${normalize(item.query)}` !== key)].slice(0, MAX_RECENT_SEARCHES);
    writeJson(STORAGE.recentSearches, next);
  }

  function savedSearches() {
    const items = readJson(STORAGE.savedSearches, []);
    return Array.isArray(items) ? items.slice(0, 10) : [];
  }

  function recentItems(limit = 8) {
    const items = readJson(STORAGE.recentItems, []);
    return Array.isArray(items) ? items.slice(0, limit) : [];
  }

  function savedLabel(item = {}) {
    if (item.query) return item.query;
    const values = Object.values(item.filters || {}).filter(value => value && value !== "all");
    return values.join(" · ") || "Pesquisa salva";
  }

  function renderEmptyState(instance) {
    const saved = savedSearches();
    instance.content.innerHTML = saved.length ? `
      <section class="sidebar-quick-section">
        <h3>Pesquisas salvas</h3>
        <div class="sidebar-quick-chips">${saved.slice(0, 5).map(item => `<button type="button" data-sidebar-saved-search="${escapeHtml(item.id)}"><span aria-hidden="true">⭐</span>${escapeHtml(savedLabel(item))}</button>`).join("")}</div>
      </section>` : `<div class="sidebar-quick-empty"><span aria-hidden="true">🔍</span><strong>Busca rápida</strong><p>Digite ao menos dois caracteres para encontrar documentos, apps, links e contatos.</p></div>`;
    instance.footer.hidden = true;
    instance.status.textContent = "";
    instance.activeIndex = -1;
  }

  function renderLoading(instance) {
    instance.status.textContent = "Carregando documentos…";
    instance.content.innerHTML = `<div class="sidebar-quick-loading" aria-live="polite"><span></span><span></span><span></span> Carregando resultados</div>`;
    instance.footer.hidden = true;
  }

  function renderNoResults(instance, parsed) {
    instance.status.textContent = "Nenhum resultado.";
    instance.content.innerHTML = `<div class="sidebar-quick-empty"><span aria-hidden="true">⌕</span><strong>Nenhum resultado rápido</strong><p>Pesquise “${escapeHtml(parsed.query)}” no Acervo para consultar todos os trechos e filtros.</p></div>`;
    instance.footer.hidden = false;
    instance.viewAll.textContent = "Pesquisar no Acervo →";
    instance.activeIndex = -1;
  }

  function renderResults(instance, results, parsed, total) {
    instance.results = results;
    instance.parsed = parsed;
    instance.activeIndex = results.length ? 0 : -1;
    instance.status.textContent = `${total} resultado${total === 1 ? "" : "s"}`;
    instance.content.innerHTML = `<div class="sidebar-quick-list" role="listbox" aria-label="Resultados rápidos">${results.map((item, index) => `
      <button type="button" class="sidebar-quick-row${index === 0 ? " active" : ""}" data-sidebar-result="${index}" role="option" aria-selected="${index === 0}">
        <span class="sidebar-quick-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <span class="sidebar-quick-copy"><strong>${highlightTitle(item.title, parsed)}</strong><small>${escapeHtml(item.meta)}</small></span>
        <span class="sidebar-quick-action">${escapeHtml(item.action)}</span>
      </button>`).join("")}</div>`;
    instance.footer.hidden = false;
    instance.viewAll.textContent = "Pesquisar no Acervo →";
  }

  function updateActive(instance, nextIndex) {
    const rows = [...instance.content.querySelectorAll("[data-sidebar-result]")];
    if (!rows.length) return;
    instance.activeIndex = Math.max(0, Math.min(rows.length - 1, nextIndex));
    rows.forEach((row, index) => {
      const active = index === instance.activeIndex;
      row.classList.toggle("active", active);
      row.setAttribute("aria-selected", active ? "true" : "false");
    });
    rows[instance.activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function recordRecentItem(resource) {
    if (!resource?.title || !resource?.url) return;
    if (window.HUB_RECENTS?.add) {
      window.HUB_RECENTS.add({ id: resource.id, kind: resource.kind, title: resource.title, url: resource.url, meta: resource.meta, emoji: resource.icon });
      return;
    }
    const items = recentItems(8);
    const key = `${resource.kind}:${resource.id || resource.url}`;
    const next = [{ id: resource.id, kind: resource.kind, title: resource.title, url: resource.url, meta: resource.meta, emoji: resource.icon, timestamp: Date.now() }, ...items.filter(item => `${item.kind}:${item.id || item.url}` !== key)].slice(0, 8);
    writeJson(STORAGE.recentItems, next);
  }

  function openResource(instance, resource, newTab = false) {
    if (!resource) return;
    rememberSearch(instance.input.value, instance.effectiveScope || "all");
    const destination = resource.kind === "document"
      ? (String(resource.url || "").includes("document-viewer.html") ? resource.url : documentViewerUrl(resource, instance.rootInfo))
      : resource.url;
    recordRecentItem({ ...resource, url: destination });
    if (String(destination || "").startsWith("#") && typeof window.HUB_NAVIGATE_TO_ANCHOR === "function") {
      window.HUB_NAVIGATE_TO_ANCHOR(destination);
    } else if (newTab || isExternal(destination) || resource.kind === "document") {
      window.open(destination, "_blank", "noopener");
    } else {
      location.href = destination;
    }
    closePanel(instance);
  }

  function applyFullSearch(instance, query, scope, saved = null) {
    rememberSearch(query, scope);
    if (instance.rootInfo.isApp) {
      if (saved) writeJson(STORAGE.pendingSaved, saved);
      const target = new URL(instance.rootInfo.home);
      target.searchParams.set("focus", "search");
      if (query) target.searchParams.set("q", query);
      if (scope && scope !== "all") target.searchParams.set("scope", scope);
      target.hash = "buscar";
      location.href = target.href;
      return;
    }
    const mainInput = document.getElementById("searchInput");
    if (mainInput) mainInput.value = query;
    const typeFilter = document.getElementById("typeFilter");
    if (typeFilter) typeFilter.value = SCOPES[scope]?.type || "all";
    if (saved?.filters) {
      const ids = { type: "typeFilter", docType: "docTypeFilter", correspondent: "correspondentFilter", format: "formatFilter" };
      Object.entries(ids).forEach(([key, id]) => {
        const element = document.getElementById(id);
        if (element) element.value = saved.filters[key] || "all";
      });
    }
    if (typeof runSearch === "function") runSearch(query, { historyMode: "push" });
    instance.input.value = "";
    instance.clear.hidden = true;
    instance.results = [];
    document.getElementById("buscar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => mainInput?.focus({ preventScroll: true }), 180);
    closePanel(instance);
  }

  function shouldPortal(instance) {
    if (matchMedia("(max-width:920px)").matches) return false;
    return instance.rootInfo.isApp
      ? document.body.classList.contains("hub-shell-icons-only")
      : document.body.classList.contains("sidebar-icons-only");
  }

  function portalInstance(instance) {
    if (instance.portaled || !shouldPortal(instance)) return;
    document.body.appendChild(instance.wrapper);
    instance.wrapper.classList.add("portaled");
    instance.portaled = true;
  }

  function restoreInstance(instance) {
    if (!instance.portaled) return;
    const parent = instance.marker.parentNode;
    if (parent) parent.insertBefore(instance.wrapper, instance.marker.nextSibling);
    instance.wrapper.classList.remove("portaled");
    instance.portaled = false;
  }

  function openPanel(instance) {
    portalInstance(instance);
    instance.panel.hidden = false;
    instance.wrapper.classList.add("open");
    if (instance.rootInfo.isApp) document.body.classList.add("hub-shell-search-expanded");
    else document.body.classList.add("sidebar-search-expanded");
    if (!instance.input.value.trim()) renderEmptyState(instance);
  }

  function closePanel(instance) {
    instance.panel.hidden = true;
    instance.wrapper.classList.remove("open");
    if (instance.rootInfo.isApp) document.body.classList.remove("hub-shell-search-expanded");
    else document.body.classList.remove("sidebar-search-expanded");
    restoreInstance(instance);
  }

  async function search(instance) {
    const raw = instance.input.value;
    instance.clear.hidden = !raw;
    const parsed = parseQuery(raw, "all");
    instance.effectiveScope = parsed.scope;
    if (parsed.query.length < 2) {
      renderEmptyState(instance);
      return;
    }
    const token = ++instance.searchToken;
    const loadingTimer = window.setTimeout(() => {
      if (token === instance.searchToken) renderLoading(instance);
    }, 180);
    const documentsList = await loadDocumentResources(instance.rootInfo);
    window.clearTimeout(loadingTimer);
    if (token !== instance.searchToken) return;
    const resources = unique([...instance.staticResources, ...documentsList]);
    const ranked = resources.map(resource => scoreResource(resource, parsed)).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pt-BR"));
    const seenTitles = new Set();
    const matches = ranked.filter(item => {
      const key = normalize(item.title);
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    if (!matches.length) renderNoResults(instance, parsed);
    else renderResults(instance, matches.slice(0, MAX_RESULTS), parsed, matches.length);
  }


  function buildPanel(form) {
    const rootInfo = currentRoot(form);
    const marker = document.createComment("sidebar-quick-search-position");
    form.parentNode.insertBefore(marker, form);
    const wrapper = document.createElement("div");
    wrapper.className = `sidebar-quick-search${rootInfo.isApp ? " sidebar-quick-search-app" : ""}`;
    wrapper.dataset.sidebarQuickSearch = "";
    form.parentNode.insertBefore(wrapper, form);
    wrapper.appendChild(form);
    form.dataset.sidebarQuickSearchForm = "";

    const input = form.querySelector('input[type="search"]');
    const submit = form.querySelector('button[type="submit"]');
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", `${form.id}Panel`);
    submit.title = "Pesquisar no Acervo";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "sidebar-quick-clear";
    clear.hidden = true;
    clear.setAttribute("aria-label", "Limpar busca");
    clear.title = "Limpar";
    clear.textContent = "×";

    form.append(clear);

    const panel = document.createElement("div");
    panel.id = `${form.id}Panel`;
    panel.className = "sidebar-quick-search-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <span class="sidebar-quick-live sr-only" aria-live="polite"></span>
      <div class="sidebar-quick-content"></div>
      <div class="sidebar-quick-footer" hidden><button type="button" class="sidebar-quick-view-all">Pesquisar no Acervo →</button></div>`;
    wrapper.appendChild(panel);

    const instance = {
      form, input, submit, clear, panel, wrapper, rootInfo,
      content: panel.querySelector(".sidebar-quick-content"),
      status: panel.querySelector(".sidebar-quick-live"),
      footer: panel.querySelector(".sidebar-quick-footer"),
      viewAll: panel.querySelector(".sidebar-quick-view-all"),
      scope: "all",
      effectiveScope: "all",
      activeIndex: -1,
      results: [],
      parsed: null,
      searchToken: 0,
      marker,
      portaled: false,
      staticResources: staticResources(rootInfo)
    };
    instances.push(instance);
    setupInstance(instance);
    return instance;
  }

  function setupInstance(instance) {
    const debouncedSearch = () => {
      window.clearTimeout(instance.timer);
      instance.timer = window.setTimeout(() => search(instance), 100);
    };

    instance.input.addEventListener("focus", () => {
      openPanel(instance);
      search(instance);
    });
    instance.input.addEventListener("input", () => {
      openPanel(instance);
      debouncedSearch();
      // A busca detalhada só recebe a consulta ao enviar o formulário ou usar “Pesquisar no Acervo”.
    });
    instance.submit.addEventListener("click", event => {
      if (instance.input.value.trim().length >= 2) return;
      event.preventDefault();
      openPanel(instance);
      instance.input.focus();
    });
    instance.form.addEventListener("submit", event => {
      event.preventDefault();
      const value = instance.input.value.trim();
      if (value.length >= 2) {
        const parsed = parseQuery(value, "all");
        applyFullSearch(instance, parsed.query, parsed.scope);
      } else {
        openPanel(instance);
        instance.input.focus();
      }
    });
    instance.clear.addEventListener("click", () => {
      instance.input.value = "";
      instance.clear.hidden = true;
      instance.results = [];
      renderEmptyState(instance);
      instance.input.focus();
      // Limpar a busca rápida não altera a busca detalhada até o usuário abrir todos os resultados.
    });
    instance.content.addEventListener("keydown", event => {
      const row = event.target.closest("[data-sidebar-result]");
      if (!row) return;
      const rows = [...instance.content.querySelectorAll("[data-sidebar-result]")];
      const current = rows.indexOf(row);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
        updateActive(instance, next);
        rows[next]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        instance.input.focus();
      }
    });

    instance.content.addEventListener("click", event => {
      const result = event.target.closest("[data-sidebar-result]");
      if (result) { openResource(instance, instance.results[Number(result.dataset.sidebarResult)], event.ctrlKey || event.metaKey); return; }
      const savedSearch = event.target.closest("[data-sidebar-saved-search]");
      if (savedSearch) {
        const item = savedSearches().find(searchItem => searchItem.id === savedSearch.dataset.sidebarSavedSearch);
        if (item) applyFullSearch(instance, item.query || "", item.filters?.type === "answer" ? "contact" : (item.filters?.type || "all"), item);
        return;
      }
    });
    instance.viewAll.addEventListener("click", () => {
      const parsed = parseQuery(instance.input.value, "all");
      applyFullSearch(instance, parsed.query, parsed.scope);
    });
    instance.input.addEventListener("keydown", event => {
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && instance.results.length) {
        event.preventDefault();
        const rows = [...instance.content.querySelectorAll("[data-sidebar-result]")];
        const index = event.key === "ArrowDown" ? 0 : rows.length - 1;
        updateActive(instance, index);
        rows[index]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (instance.input.value) {
          instance.input.value = "";
          instance.clear.hidden = true;
          renderEmptyState(instance);
        } else {
          closePanel(instance);
          instance.input.blur();
        }
      }
    });
  }

  function applyPendingSearch() {
    const pending = readJson(STORAGE.pendingSaved, null);
    if (pending && !location.pathname.includes("/apps/")) {
      try { localStorage.removeItem(STORAGE.pendingSaved); } catch (_) {}
      const instance = instances.find(item => !item.rootInfo.isApp);
      if (instance) applyFullSearch(instance, pending.query || "", pending.filters?.type === "answer" ? "contact" : (pending.filters?.type || "all"), pending);
      return;
    }
    if (location.pathname.includes("/apps/")) return;
    const parameters = new URLSearchParams(location.search);
    const query = parameters.get("q") || "";
    const scope = parameters.get("scope") || "all";
    const instance = instances.find(item => !item.rootInfo.isApp);
    if (instance && query) {
      const mainInput = document.getElementById("searchInput");
      if (mainInput) mainInput.value = query;
      const typeFilter = document.getElementById("typeFilter");
      if (typeFilter) typeFilter.value = SCOPES[scope]?.type || "all";
      if (typeof runSearch === "function") runSearch(query);
    }
  }

  function init() {
    const forms = [...document.querySelectorAll("#sidebarSearchForm, #hubShellSearchForm")];
    forms.forEach(buildPanel);
    if (!forms.length) return;

    const mainInput = document.getElementById("searchInput");
    document.getElementById("searchForm")?.addEventListener("submit", () => {
      const query = String(mainInput?.value || "").trim();
      const type = document.getElementById("typeFilter")?.value || "all";
      const scope = type === "answer" ? "contact" : (SCOPES[type] ? type : "all");
      rememberSearch(query, scope);
    });
    document.addEventListener("click", event => {
      if (!event.target.closest(".result-card, .search-directory-table tbody tr")) return;
      const query = String(mainInput?.value || "").trim();
      if (!query) return;
      const type = document.getElementById("typeFilter")?.value || "all";
      rememberSearch(query, type === "answer" ? "contact" : (SCOPES[type] ? type : "all"));
    }, true);

    document.addEventListener("pointerdown", event => {
      instances.forEach(instance => {
        if (!instance.wrapper.contains(event.target)) closePanel(instance);
      });
    });
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const visible = instances.find(instance => {
          const style = getComputedStyle(instance.form);
          return style.display !== "none" && style.visibility !== "hidden";
        }) || instances[0];
        openPanel(visible);
        visible.input.focus();
        visible.input.select();
      }
    }, true);
    window.addEventListener("storage", event => {
      if (event.key === STORAGE.savedSearches) {
        instances.forEach(instance => { if (!instance.panel.hidden && !instance.input.value.trim()) renderEmptyState(instance); });
      }
    });
    document.addEventListener("hub:saved-searches-changed", () => instances.forEach(instance => { if (!instance.panel.hidden && !instance.input.value.trim()) renderEmptyState(instance); }));
    window.setTimeout(applyPendingSearch, 120);
    window.HUB_SIDEBAR_SEARCH = { instances, open: () => { const instance = instances[0]; openPanel(instance); instance.input.focus(); }, refresh: () => instances.forEach(instance => renderEmptyState(instance)) };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
