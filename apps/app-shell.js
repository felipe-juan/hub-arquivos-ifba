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
  const currentApp = currentPath.includes("/assistente/") ? "assistente"
    : currentPath.includes("/calendario/") ? "calendar"
      : currentPath.includes("/fluxogramas/") ? "flux"
        : currentPath.includes("/barema/") ? "barema"
          : currentPath.includes("/doom/") ? "doom" : "";
  const apps = [
    { id: "assistente", icon: "🤖", title: "Assistente do HUB", url: "../assistente/" },
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
    return [...sourceLinks()].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
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
    document.querySelectorAll("[data-theme-choice]").forEach(button => {
      button.classList.toggle("active", button.dataset.themeChoice === clean);
    });
    const mobile = document.getElementById("mobileThemeButton");
    if (mobile) mobile.textContent = clean === "dark" ? "☾" : clean === "light" ? "☀" : "◐";
    write(PREF.theme, clean);
  }

  function renderApps() {
    const box = document.getElementById("appsMenu");
    if (!box) return;
    box.innerHTML = apps.map(app => {
      const href = app.internal ? rootUrl(app.url) : app.url;
      return `<a class="${app.id === currentApp ? "active" : ""}" href="${escapeHtml(href)}"><span aria-hidden="true">${app.icon}</span><span class="sidebar-label">${escapeHtml(app.title)}</span></a>`;
    }).join("");
  }

  function renderLinks() {
    const box = document.getElementById("sidebarLinksList");
    if (!box) return;
    const items = orderedLinks();
    box.innerHTML = items.length ? items.map(item => {
      const url = rootUrl(item.url);
      return `<a href="${escapeHtml(url)}"${isExternal(url) ? ' target="_blank" rel="noopener"' : ""}><span aria-hidden="true">${linkIcon(item)}</span><span class="sidebar-label">${escapeHtml(item.title)}</span></a>`;
    }).join("") : '<p class="sidebar-empty">Nenhum atalho cadastrado.</p>';
  }

  function renderFavorites() {
    const box = document.getElementById("sidebarFavoritesList");
    const count = document.getElementById("sidebarFavoritesCount");
    if (!box) return;
    const items = favorites();
    if (count) {
      count.textContent = String(items.length);
      count.setAttribute("aria-label", `${items.length} favorito${items.length === 1 ? "" : "s"}`);
    }
    box.innerHTML = items.length ? items.slice(0, 30).map((item, index) => {
      const url = rootUrl(item.url || "#");
      const icon = item.kind === "document" ? "📄" : item.kind === "app" ? (item.emoji || "🧰") : "🔗";
      return `<div class="sidebar-favorite-row"><a href="${escapeHtml(url)}"${isExternal(url) || /\.(pdf|xlsx?|docx?)($|[?#])/i.test(url) ? ' target="_blank" rel="noopener"' : ""}><span aria-hidden="true">${icon}</span><span class="sidebar-label">${escapeHtml(item.title || "Favorito")}</span></a><button class="sidebar-favorite-remove" type="button" data-remove-favorite="${index}" aria-label="Remover favorito">×</button></div>`;
    }).join("") : '<p class="sidebar-empty">Nenhum favorito salvo.</p>';
  }

  function setupGroup(buttonId, panelId, key, defaultOpen) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    if (!button || !panel) return;
    const setOpen = (open, persist = true) => {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.closest(".sidebar-menu-group")?.classList.toggle("is-open", open);
      if (persist) write(key, open ? "1" : "0");
    };
    setOpen(read(key, defaultOpen ? "1" : "0") === "1", false);
    button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  }

  function applySidebarWidth(value, persist = true) {
    const width = Math.min(420, Math.max(72, Math.round(Number(value) || 276)));
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
    document.body.classList.toggle("sidebar-icons-only", width <= 96);
    if (persist) write(PREF.width, String(width));
    return width;
  }

  function inject() {
    if (document.getElementById("siteSidebar")) return;
    document.body.classList.add("hub-app-shell-ready");
    let width = applySidebarWidth(read(PREF.width, "276"), false);
    if (read(PREF.collapsed, "0") === "1") document.body.classList.add("sidebar-collapsed");

    document.body.insertAdjacentHTML("afterbegin", `
      <header class="mobile-topbar">
        <a class="brand" href="../../index.html" aria-label="Ir para o início"><span class="brand-mark"><img src="../../assets/logo-pixel.png" alt="Logo HUB SI"></span><span class="brand-text"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a>
        <div class="mobile-header-actions"><button id="mobileThemeButton" class="mobile-icon-button" type="button" aria-label="Escolher tema" aria-expanded="false" aria-controls="mobileThemeMenu">◐</button><div id="mobileThemeMenu" class="mobile-theme-menu" hidden><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div><button id="mobileSidebarToggle" class="mobile-icon-button" type="button" aria-controls="siteSidebar" aria-expanded="false" aria-label="Abrir menu">☰</button></div>
      </header>
      <aside id="siteSidebar" class="site-sidebar" aria-label="Menu principal">
        <div class="sidebar-head">
          <a class="brand sidebar-brand" href="../../index.html" aria-label="Ir para o início"><span class="brand-mark"><img src="../../assets/logo-pixel.png" alt="Logo HUB SI"></span><span class="brand-text sidebar-label"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a>
          <button id="sidebarCollapseButton" class="sidebar-collapse" type="button" aria-label="Ocultar menu" title="Ocultar menu">‹</button>
          <button id="mobileSidebarClose" class="sidebar-mobile-close" type="button" aria-label="Fechar menu">×</button>
        </div>
        <nav class="sidebar-nav" aria-label="Navegação principal">
          <form id="sidebarSearchForm" class="sidebar-search-form" role="search" aria-label="Buscar no HUB"><button id="sidebarSearchButton" class="sidebar-search-submit" type="submit" aria-label="Buscar" title="Buscar"><span aria-hidden="true">🔍</span></button><input id="sidebarSearchInput" type="search" autocomplete="off" placeholder="Buscar no HUB..." aria-label="Buscar documentos, apps, links e contatos"></form>
          <a href="../../index.html#inicio"><span class="nav-icon" aria-hidden="true">🏠</span><span class="sidebar-label">Início</span></a>
          <a href="../../index.html#acervo"><span class="nav-icon" aria-hidden="true">🗂️</span><span class="sidebar-label">Acervo</span></a>
          <div class="sidebar-menu-group" data-sidebar-group="apps"><div class="sidebar-menu-row"><a id="appsSectionLink" class="sidebar-menu-link" href="../../index.html#apps"><span class="nav-icon" aria-hidden="true">🧰</span><span class="sidebar-label">Apps</span></a><button id="appsMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="true" aria-controls="appsMenu" aria-label="Mostrar ou ocultar apps"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="appsMenu" class="sidebar-submenu sidebar-apps-list" aria-label="Aplicativos"></div></div>
          <div class="sidebar-menu-group sidebar-links-group" data-sidebar-group="links"><div class="sidebar-menu-row"><a id="linksSectionLink" class="sidebar-menu-link" href="../../index.html#links"><span class="nav-icon" aria-hidden="true">🔗</span><span class="sidebar-label">Links</span></a><button id="linksMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="false" aria-controls="sidebarLinksList" aria-label="Mostrar ou ocultar links"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="sidebarLinksList" class="sidebar-submenu sidebar-links-list" aria-label="Links externos"></div></div>
          <div class="sidebar-menu-group" data-sidebar-group="favorites"><button id="favoritesMenuToggle" class="sidebar-menu-toggle" type="button" aria-expanded="true" aria-controls="sidebarFavoritesList"><span class="nav-icon" aria-hidden="true">⭐</span><span class="sidebar-label">Favoritos</span><span id="sidebarFavoritesCount" class="sidebar-count" aria-label="0 favoritos">0</span><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button><div id="sidebarFavoritesList" class="sidebar-submenu sidebar-favorites-list" aria-live="polite"></div></div>
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-utility-actions"><button id="reportIssueButton" class="reset-preferences" type="button" aria-label="Relatar problema" title="Relatar problema"><span class="reset-preferences-icon" aria-hidden="true">🐞</span><span class="preference-label">Reportar</span></button><button id="resetPreferencesButton" class="reset-preferences" type="button" aria-label="Restaurar preferências" title="Restaurar preferências"><span class="reset-preferences-icon" aria-hidden="true">↺</span><span class="preference-label">Redefinir</span></button></div>
          <div class="theme-panel"><span class="theme-label">Tema</span><div class="theme-switch" role="group" aria-label="Tema do site"><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div></div>
          <div class="sidebar-external-links" aria-label="Sistemas institucionais"><a class="campus-portal sidebar-external-link" href="https://portal.ifba.edu.br/conquista" target="_blank" rel="noopener" title="Portal do Campus"><span aria-hidden="true">🏫</span><span class="sidebar-label">Portal</span></a><a class="campus-portal sidebar-external-link" href="https://suap.ifba.edu.br" target="_blank" rel="noopener" title="SUAP"><span aria-hidden="true">🔐</span><span class="sidebar-label">SUAP</span></a></div>
        </div>
        <div id="sidebarResizeHandle" class="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Redimensionar menu lateral" tabindex="0"></div>
      </aside>
      <button id="sidebarReopenButton" class="sidebar-reopen" type="button" aria-label="Mostrar menu" title="Mostrar menu">›</button>
      <div id="sidebarOverlay" class="sidebar-overlay" aria-hidden="true"></div>
    `);

    renderApps();
    renderLinks();
    renderFavorites();
    window.HUB_UI?.setupReportButton(document.getElementById("reportIssueButton"), { title: document.title, context: currentApp || "app" });
    setupGroup("appsMenuToggle", "appsMenu", PREF.apps, true);
    setupGroup("linksMenuToggle", "sidebarLinksList", PREF.links, false);
    setupGroup("favoritesMenuToggle", "sidebarFavoritesList", PREF.favorites, true);
    applyTheme();

    const setCollapsed = value => {
      document.body.classList.toggle("sidebar-collapsed", value);
      write(PREF.collapsed, value ? "1" : "0");
    };
    const setMobileOpen = open => {
      document.body.classList.toggle("mobile-sidebar-open", open);
      document.getElementById("mobileSidebarToggle")?.setAttribute("aria-expanded", open ? "true" : "false");
      document.getElementById("sidebarOverlay")?.setAttribute("aria-hidden", open ? "false" : "true");
    };
    document.getElementById("sidebarCollapseButton")?.addEventListener("click", () => setCollapsed(true));
    document.getElementById("sidebarReopenButton")?.addEventListener("click", () => setCollapsed(false));
    document.getElementById("mobileSidebarToggle")?.addEventListener("click", () => setMobileOpen(!document.body.classList.contains("mobile-sidebar-open")));
    document.getElementById("mobileSidebarClose")?.addEventListener("click", () => setMobileOpen(false));
    document.getElementById("sidebarOverlay")?.addEventListener("click", () => setMobileOpen(false));
    document.getElementById("siteSidebar")?.addEventListener("click", event => {
      if (event.target.closest("a") && matchMedia("(max-width:920px)").matches) setMobileOpen(false);
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") setMobileOpen(false); });

    const mobileThemeButton = document.getElementById("mobileThemeButton");
    const mobileThemeMenu = document.getElementById("mobileThemeMenu");
    mobileThemeButton?.addEventListener("click", event => {
      event.stopPropagation();
      const open = Boolean(mobileThemeMenu?.hidden);
      if (mobileThemeMenu) mobileThemeMenu.hidden = !open;
      mobileThemeButton.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll("[data-theme-choice]").forEach(button => button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      if (mobileThemeMenu) mobileThemeMenu.hidden = true;
      mobileThemeButton?.setAttribute("aria-expanded", "false");
    }));
    document.addEventListener("click", event => {
      if (!event.target.closest("#mobileThemeMenu, #mobileThemeButton")) {
        if (mobileThemeMenu) mobileThemeMenu.hidden = true;
        mobileThemeButton?.setAttribute("aria-expanded", "false");
      }
    });

    document.getElementById("resetPreferencesButton")?.addEventListener("click", () => {
      if (!confirm("Restaurar todas as preferências do HUB e dos apps neste navegador?")) return;
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
      keys.filter(key => key && (key.startsWith("hub") || key.startsWith("barema") || key.startsWith("fluxapp:"))).forEach(key => localStorage.removeItem(key));
      location.reload();
    });
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-favorite]");
      if (!button) return;
      const items = favorites();
      items.splice(Number(button.dataset.removeFavorite), 1);
      write(PREF.favoritesData, JSON.stringify(items));
      renderFavorites();
    });

    const resize = document.getElementById("sidebarResizeHandle");
    if (resize) {
      let dragging = false;
      resize.addEventListener("pointerdown", event => {
        if (matchMedia("(max-width:920px)").matches) return;
        dragging = true;
        resize.setPointerCapture(event.pointerId);
        document.body.classList.add("sidebar-resizing");
        event.preventDefault();
      });
      resize.addEventListener("pointermove", event => {
        if (!dragging) return;
        width = applySidebarWidth(event.clientX, false);
      });
      const finish = event => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove("sidebar-resizing");
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
    window.addEventListener("hub:favorites-changed", renderFavorites);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
  else inject();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const root = new URL("../../", window.location.href);
    const url = new URL("service-worker.js", root).href;
    if (window.HUB_UI?.registerServiceWorker) {
      window.HUB_UI.registerServiceWorker({ url, scope: root.pathname });
      return;
    }
    navigator.serviceWorker.register(url, { scope: root.pathname }).catch(error => console.warn("Service worker não registrado no app:", error));
  }, { once: true });
}

(() => {
  "use strict";
  const KEY = "hubRecentItemsV1";
  const readItems = () => {
    try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch (_) { return []; }
  };
  const add = item => {
    if (!item?.title || !item?.url) return;
    const clean = { ...item, timestamp: Date.now() };
    const key = `${clean.kind || "item"}:${clean.id || clean.url || clean.title}`;
    const next = [clean, ...readItems().filter(entry => `${entry.kind || "item"}:${entry.id || entry.url || entry.title}` !== key)].slice(0, 8);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
  };
  window.HUB_RECORD_RECENT = add;
  if (location.pathname.includes("/assistente/")) add({ id: "app-assistente", kind: "app", title: "Assistente do HUB", url: "apps/assistente/", meta: "Assistente", emoji: "🤖" });
})();
