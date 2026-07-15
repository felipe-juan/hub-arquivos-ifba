(() => {
  "use strict";

  const PREF = {
    collapsed: "hubSidebarCollapsed",
    width: "hubSidebarWidth",
    apps: "hubSidebarAppsOpen",
    favorites: "hubSidebarFavoritesOpen",
    links: "hubSidebarLinksOpen",
    theme: "hubThemeMode",
    linkOrder: "hubLinksCustomOrderV1",
    favoritesData: "hubFavoritesV1"
  };
  const read = (key, fallback = "") => {
    try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const isExternal = url => /^(https?:|mailto:|tel:)/i.test(url || "");
  const rootUrl = url => {
    const value = String(url || "#");
    if (isExternal(value)) return value;
    if (value.startsWith("#")) return `../../index.html${value}`;
    return `../../${value.replace(/^\.\//, "")}`;
  };
  const currentPath = location.pathname;
  const currentApp = currentPath.includes("/calendario/") ? "calendar"
    : currentPath.includes("/fluxogramas/") ? "flux"
      : currentPath.includes("/barema/") ? "barema" : "";
  const apps = [
    { id: "media-final", icon: "🧮", title: "Média e Prova Final", url: "#media-final", internal: true },
    { id: "onde-resolvo", icon: "🧭", title: "Onde resolvo isso?", url: "#onde-resolvo", internal: true },
    { id: "barema", icon: "🎓", title: "Barema de Atividades Complementares", url: "../barema/" },
    { id: "calendar", icon: "📅", title: "Calendário Acadêmico 2026", url: "../calendario/" },
    { id: "flux", icon: "🗺️", title: "Fluxogramas Curriculares", url: "../fluxogramas/" }
  ];
  const linkIcon = item => {
    const text = `${item?.title || ""} ${item?.category || ""}`.toLowerCase();
    if (text.includes("protocolo")) return "📝";
    if (text.includes("horário") || text.includes("horario")) return "📋";
    if (text.includes("whatsapp")) return "💬";
    if (text.includes("instagram")) return "📷";
    if (text.includes("fluxograma")) return "🗺️";
    if (text.includes("calendário") || text.includes("calendario")) return "📅";
    if (text.includes("barema")) return "📊";
    return "🔗";
  };
  const sourceLinks = () => Array.isArray(window.HUB_DATA?.usefulLinks) ? window.HUB_DATA.usefulLinks : [];
  const orderedLinks = () => {
    let order = [];
    try { order = JSON.parse(read(PREF.linkOrder, "[]")); } catch (_) {}
    if (!Array.isArray(order)) order = [];
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...sourceLinks()].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : 9999;
      const rb = rank.has(b.id) ? rank.get(b.id) : 9999;
      return ra - rb;
    });
  };
  const favorites = () => {
    try {
      const value = JSON.parse(read(PREF.favoritesData, "[]"));
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  };

  function applyTheme(mode = read(PREF.theme, "auto")) {
    const clean = ["auto", "dark", "light"].includes(mode) ? mode : "auto";
    const resolved = clean === "auto"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : clean;
    document.documentElement.dataset.themeMode = clean;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll("[data-hub-shell-theme]").forEach(button => {
      button.classList.toggle("active", button.dataset.hubShellTheme === clean);
    });
    const mobile = document.getElementById("hubShellMobileTheme");
    if (mobile) mobile.textContent = clean === "dark" ? "☾" : clean === "light" ? "☀" : "◐";
    write(PREF.theme, clean);
  }

  function renderLinks() {
    const box = document.getElementById("hubShellLinks");
    if (!box) return;
    const items = orderedLinks();
    box.innerHTML = items.length ? items.map(item => {
      const url = rootUrl(item.url);
      return `<a href="${escapeHtml(url)}"${isExternal(url) ? ' target="_blank" rel="noopener"' : ""}><span>${linkIcon(item)}</span><span>${escapeHtml(item.title)}</span></a>`;
    }).join("") : '<p class="hub-shell-empty">Nenhum atalho cadastrado.</p>';
  }

  function renderFavorites() {
    const box = document.getElementById("hubShellFavorites");
    if (!box) return;
    const items = favorites();
    box.innerHTML = items.length ? items.slice(0, 30).map((item, index) => {
      const url = rootUrl(item.url || "#");
      const icon = item.kind === "document" ? "📄" : item.kind === "app" ? "🧰" : "🔗";
      return `<div class="hub-shell-favorite-row"><a href="${escapeHtml(url)}"${isExternal(url) || /\.(pdf|xlsx?|docx?)($|[?#])/i.test(url) ? ' target="_blank" rel="noopener"' : ""}><span>${icon}</span><span>${escapeHtml(item.title || "Favorito")}</span></a><button class="hub-shell-fav-remove" type="button" data-hub-remove-fav="${index}" aria-label="Remover favorito">×</button></div>`;
    }).join("") : '<p class="hub-shell-empty">Nenhum favorito ainda.</p>';
  }

  function setupGroup(buttonSelector, panelId, storageKey, defaultOpen) {
    const button = document.querySelector(buttonSelector);
    const panel = document.getElementById(panelId);
    if (!button || !panel) return;
    let open = read(storageKey, defaultOpen ? "1" : "0") === "1";
    const apply = (persist = true) => {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
      if (persist) write(storageKey, open ? "1" : "0");
    };
    button.addEventListener("click", () => { open = !open; apply(true); });
    apply(false);
  }

  function applySidebarWidth(value, persist = true) {
    const width = Math.min(420, Math.max(72, Math.round(Number(value) || 276)));
    document.documentElement.style.setProperty("--hub-shell-sidebar-w", `${width}px`);
    document.body.classList.toggle("hub-shell-icons-only", width <= 96);
    if (persist) write(PREF.width, String(width));
    return width;
  }

  function inject() {
    document.body.classList.add("hub-app-shell-ready");
    let width = applySidebarWidth(read(PREF.width, "276"), false);
    if (read(PREF.collapsed, "0") === "1") document.body.classList.add("hub-shell-collapsed");

    const appLinks = apps.map(app => {
      const href = app.internal ? rootUrl(app.url) : app.url;
      return `<a class="${app.id === currentApp ? "active" : ""}" href="${escapeHtml(href)}"><span>${app.icon}</span><span>${escapeHtml(app.title)}</span></a>`;
    }).join("");
    document.body.insertAdjacentHTML("afterbegin", `
      <header class="hub-shell-mobile">
        <a class="hub-shell-brand" href="../../index.html"><img src="../../assets/logo-pixel.png" alt=""><span><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a>
        <div class="hub-shell-mobile-actions"><button class="hub-shell-icon" id="hubShellMobileTheme" type="button" aria-label="Escolher tema" aria-expanded="false" aria-controls="hubShellMobileThemeMenu">◐</button><div class="hub-shell-mobile-theme-menu" id="hubShellMobileThemeMenu" hidden><button type="button" data-hub-shell-theme="auto" aria-label="Tema automático" title="Tema automático">◐</button><button type="button" data-hub-shell-theme="dark" aria-label="Modo escuro" title="Modo escuro">☾</button><button type="button" data-hub-shell-theme="light" aria-label="Modo claro" title="Modo claro">☀</button></div><button class="hub-shell-icon" id="hubShellMobileOpen" type="button" aria-label="Abrir menu">☰</button></div>
      </header>
      <aside class="hub-shell-sidebar" id="hubShellSidebar" aria-label="Menu principal">
        <div class="hub-shell-head"><a class="hub-shell-brand" href="../../index.html"><img src="../../assets/logo-pixel.png" alt=""><span><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a><button class="hub-shell-icon hub-shell-collapse" id="hubShellCollapse" type="button" aria-label="Ocultar menu">‹</button></div>
        <nav class="hub-shell-nav">
          <form class="hub-shell-search-form" id="hubShellSearchForm" role="search" aria-label="Buscar no HUB">
            <button class="hub-shell-search-submit" type="submit" aria-label="Buscar" title="Buscar"><span aria-hidden="true">🔍</span></button>
            <input id="hubShellSearchInput" type="search" autocomplete="off" placeholder="Buscar no HUB..." aria-label="Buscar documentos, apps, links e contatos" />
          </form>
          <a href="../../index.html#inicio"><span class="hub-shell-navicon">🏠</span><span>Início</span></a>
          <a href="../../index.html#acervo"><span class="hub-shell-navicon">🗂️</span><span>Acervo</span></a>
          <div class="hub-shell-group">
            <div class="hub-shell-menu-row"><a class="hub-shell-section-link" href="../../index.html#apps"><span class="hub-shell-navicon">🧰</span><span>Apps</span></a><button class="hub-shell-toggle hub-shell-chevron-button" data-hub-shell-toggle="apps" type="button" aria-label="Mostrar ou ocultar apps"><span class="hub-shell-chevron">⌄</span></button></div>
            <div class="hub-shell-submenu" id="hubShellApps">${appLinks}</div>
          </div>
          <div class="hub-shell-group">
            <div class="hub-shell-menu-row"><a class="hub-shell-section-link" href="../../index.html#links"><span class="hub-shell-navicon">🔗</span><span>Links</span></a><button class="hub-shell-toggle hub-shell-chevron-button" data-hub-shell-toggle="links" type="button" aria-label="Mostrar ou ocultar links"><span class="hub-shell-chevron">⌄</span></button></div>
            <div class="hub-shell-submenu" id="hubShellLinks"></div>
          </div>
          <div class="hub-shell-group">
            <button class="hub-shell-toggle" data-hub-shell-toggle="favorites" type="button"><span class="hub-shell-navicon">⭐</span><span>Favoritos</span><span class="hub-shell-chevron">⌄</span></button>
            <div class="hub-shell-submenu" id="hubShellFavorites"></div>
          </div>
        </nav>
        <div class="hub-shell-bottom">
          <button class="hub-shell-reset" id="hubShellReport" type="button" aria-label="Relatar problema" title="Relatar problema"><span class="hub-shell-reset-icon" aria-hidden="true">🐞</span><span class="hub-shell-label">Relatar problema</span></button>
          <button class="hub-shell-reset" id="hubShellReset" type="button" aria-label="Restaurar preferências" title="Restaurar preferências"><span class="hub-shell-reset-icon" aria-hidden="true">↺</span><span class="hub-shell-label">Restaurar preferências</span></button>
          <div class="hub-shell-theme" role="group" aria-label="Tema"><button type="button" data-hub-shell-theme="auto" aria-label="Tema automático" title="Tema automático">◐</button><button type="button" data-hub-shell-theme="dark" aria-label="Modo escuro" title="Modo escuro">☾</button><button type="button" data-hub-shell-theme="light" aria-label="Modo claro" title="Modo claro">☀</button></div>
          <div class="hub-shell-external-links" aria-label="Sistemas institucionais"><a class="hub-shell-portal" href="https://portal.ifba.edu.br/conquista" target="_blank" rel="noopener" title="Portal do Campus"><span class="hub-shell-navicon">🏫</span><span class="hub-shell-label">Portal</span></a><a class="hub-shell-portal" href="https://suap.ifba.edu.br" target="_blank" rel="noopener" title="SUAP"><span class="hub-shell-navicon">🔐</span><span class="hub-shell-label">SUAP</span></a></div>
        </div>
        <div class="hub-shell-resize" id="hubShellResize" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Redimensionar menu"></div>
      </aside>
      <button class="hub-shell-reopen" id="hubShellReopen" type="button" aria-label="Mostrar menu">›</button>
      <div class="hub-shell-overlay" id="hubShellOverlay"></div>
    `);

    renderLinks();
    renderFavorites();
    window.HUB_UI?.setupReportButton(document.getElementById("hubShellReport"), { title: document.title, context: currentApp || "app" });
    setupGroup('[data-hub-shell-toggle="apps"]', "hubShellApps", PREF.apps, true);
    setupGroup('[data-hub-shell-toggle="links"]', "hubShellLinks", PREF.links, false);
    setupGroup('[data-hub-shell-toggle="favorites"]', "hubShellFavorites", PREF.favorites, true);
    applyTheme();

    const collapse = document.getElementById("hubShellCollapse");
    const reopen = document.getElementById("hubShellReopen");
    const mobileOpen = document.getElementById("hubShellMobileOpen");
    const overlay = document.getElementById("hubShellOverlay");
    const setCollapsed = value => {
      document.body.classList.toggle("hub-shell-collapsed", value);
      write(PREF.collapsed, value ? "1" : "0");
    };
    collapse?.addEventListener("click", () => setCollapsed(true));
    reopen?.addEventListener("click", () => setCollapsed(false));
    mobileOpen?.addEventListener("click", () => document.body.classList.add("hub-shell-mobile-open"));
    overlay?.addEventListener("click", () => document.body.classList.remove("hub-shell-mobile-open"));
    document.getElementById("hubShellSidebar")?.addEventListener("click", event => {
      if (event.target.closest("a") && matchMedia("(max-width:920px)").matches) document.body.classList.remove("hub-shell-mobile-open");
    });

    const mobileThemeButton = document.getElementById("hubShellMobileTheme");
    const mobileThemeMenu = document.getElementById("hubShellMobileThemeMenu");
    mobileThemeButton?.addEventListener("click", event => {
      event.stopPropagation();
      const willOpen = Boolean(mobileThemeMenu?.hidden);
      if (mobileThemeMenu) mobileThemeMenu.hidden = !willOpen;
      mobileThemeButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    document.querySelectorAll("[data-hub-shell-theme]").forEach(button => button.addEventListener("click", () => {
      applyTheme(button.dataset.hubShellTheme);
      if (mobileThemeMenu) mobileThemeMenu.hidden = true;
      mobileThemeButton?.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("click", event => {
      if (!event.target.closest("#hubShellMobileThemeMenu, #hubShellMobileTheme")) {
        if (mobileThemeMenu) mobileThemeMenu.hidden = true;
        mobileThemeButton?.setAttribute("aria-expanded", "false");
      }
    });
    document.getElementById("hubShellReset")?.addEventListener("click", () => {
      if (!confirm("Restaurar todas as preferências do HUB e dos apps neste navegador?")) return;
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
      keys.filter(key => key && (key.startsWith("hub") || key.startsWith("barema") || key.startsWith("fluxapp:"))).forEach(key => localStorage.removeItem(key));
      location.reload();
    });
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-hub-remove-fav]");
      if (!button) return;
      const items = favorites();
      items.splice(Number(button.dataset.hubRemoveFav), 1);
      write(PREF.favoritesData, JSON.stringify(items));
      renderFavorites();
    });

    const resize = document.getElementById("hubShellResize");
    if (resize) {
      let dragging = false;
      resize.addEventListener("pointerdown", event => {
        if (matchMedia("(max-width:920px)").matches) return;
        dragging = true;
        resize.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      resize.addEventListener("pointermove", event => {
        if (!dragging) return;
        width = applySidebarWidth(event.clientX, false);
      });
      const finish = event => {
        if (!dragging) return;
        dragging = false;
        write(PREF.width, String(width));
        try { resize.releasePointerCapture(event.pointerId); } catch (_) {}
      };
      resize.addEventListener("pointerup", finish);
      resize.addEventListener("pointercancel", finish);
      resize.addEventListener("dblclick", () => { width = applySidebarWidth(276, true); });
      resize.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") width = applySidebarWidth(72, true);
        else if (event.key === "End") width = applySidebarWidth(420, true);
        else width = applySidebarWidth(width + (event.key === "ArrowRight" ? 10 : -10), true);
      });
    }

    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
      if (read(PREF.theme, "auto") === "auto") applyTheme("auto");
    });
    window.addEventListener("storage", event => {
      if (event.key === PREF.theme) applyTheme(event.newValue || "auto");
      if (event.key === PREF.favoritesData) renderFavorites();
      if (event.key === PREF.linkOrder) renderLinks();
      if (event.key === PREF.width) width = applySidebarWidth(event.newValue || 276, false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
  else inject();
})();

// Registro compartilhado: cache offline e aviso quando uma nova versão estiver disponível.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const root = new URL("../../", window.location.href);
    const url = new URL("service-worker.js", root).href;
    if (window.HUB_UI?.registerServiceWorker) {
      window.HUB_UI.registerServiceWorker({ url, scope: root.pathname });
      return;
    }
    navigator.serviceWorker.register(url, { scope: root.pathname })
      .catch(error => console.warn("Service worker não registrado no app:", error));
  }, { once: true });
}


// v0.2.10 — itens recentes compartilhados entre a página principal e os apps.
(() => {
  "use strict";
  const KEY = "hubRecentItemsV1";
  const max = 8;
  const read = () => {
    try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch (_) { return []; }
  };
  const add = item => {
    if (!item?.title || !item?.url) return;
    const clean = { ...item, timestamp: Date.now() };
    const key = `${clean.kind || "item"}:${clean.id || clean.url || clean.title}`;
    const next = [clean, ...read().filter(entry => `${entry.kind || "item"}:${entry.id || entry.url || entry.title}` !== key)].slice(0, max);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
  };
  window.HUB_RECORD_RECENT = add;
  const path = location.pathname;
  const current = path.includes("/calendario/")
    ? { id: "app-calendario", kind: "app", title: "Calendário Acadêmico 2026", url: "apps/calendario/", meta: "Calendário", emoji: "📅" }
    : path.includes("/fluxogramas/")
      ? { id: "app-fluxogramas", kind: "app", title: "Fluxogramas Curriculares", url: "apps/fluxogramas/", meta: "Fluxogramas", emoji: "🧭" }
      : path.includes("/barema/")
        ? { id: "app-barema", kind: "app", title: "Barema de Atividades Complementares", url: "apps/barema/", meta: "Barema", emoji: "📊" }
        : null;
  if (current) add(current);
})();
