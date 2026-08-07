(() => {
  'use strict';

  if (window.HUB_SHARED_SIDEBAR?.active) return;

  const scriptUrl = new URL(document.currentScript?.src || 'sidebar/sidebar.js', location.href);
  const rootUrl = new URL('../', scriptUrl);
  const registryUrl = new URL('apps-registry.json', scriptUrl);
  const PREF = Object.freeze({
    collapsed: 'hubSidebarCollapsed',
    width: 'hubSidebarWidth',
    apps: 'hubSidebarAppsOpen',
    favorites: 'hubSidebarFavoritesOpen',
    links: 'hubSidebarLinksOpen',
    theme: 'hubThemeMode',
    favoritesData: 'hubFavoritesV1'
  });
  const DEFAULT_EXTERNAL_LINKS = Object.freeze([
    { id: 'portal', title: 'Portal', url: 'https://portal.ifba.edu.br/conquista', emoji: '🏫' },
    { id: 'suap', title: 'SUAP', url: 'https://suap.ifba.edu.br', emoji: '🔐' }
  ]);
  const FALLBACK_REGISTRY = Object.freeze({
    apps: [{ id: 'app-assistente-hub', title: 'Assistente do HUB', url: 'apps/assistente/', emoji: '🤖' }],
    links: [],
    externalLinks: DEFAULT_EXTERNAL_LINKS
  });
  const GENERIC_APP_ICONS = new Set(['', '💼', '🧰', '📦', '🗃️', '🗂️']);
  const FORCED_APP_EMOJI_RULES = Object.freeze([
    [['assistente', 'chatbot', 'bot do hub'], '🤖'],
    [['media final', 'prova final', 'calculadora', 'calculo da media'], '🧮'],
    [['barema', 'atividade complementar'], '🎓'],
    [['calendario'], '📅'],
    [['fluxograma', 'matriz curricular'], '🗺️'],
    [['doom', 'jogo'], '🎮']
  ]);
  const APP_EMOJI_RULES = Object.freeze([
    [['horario'], '🕒'],
    [['sala'], '🚪'],
    [['professor', 'docente'], '👨‍🏫'],
    [['biblioteca'], '📚'],
    [['documento', 'acervo', 'arquivo', 'leitor pdf'], '📄'],
    [['estagio'], '💼'],
    [['tcc', 'trabalho de conclusao'], '📝'],
    [['setor', 'contato'], '☎️'],
    [['mapa'], '🗺️'],
    [['acessibilidade'], '♿'],
    [['link'], '🔗']
  ]);

  const read = (key, fallback = '') => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const isExternal = value => /^(?:https?:|mailto:|tel:)/i.test(String(value || ''));
  const rootHref = value => {
    const raw = String(value || '#').trim();
    if (isExternal(raw)) return raw;
    if (raw.startsWith('#')) return new URL(`index.html${raw}`, rootUrl).href;
    return new URL(raw.replace(/^\.\//, ''), rootUrl).href;
  };
  const currentRelativePath = (() => {
    try { return decodeURIComponent(location.pathname).replace(decodeURIComponent(rootUrl.pathname), '').replace(/^\//, ''); }
    catch { return location.pathname; }
  })();

  let registry = FALLBACK_REGISTRY;
  let width = 276;

  function currentAppId() {
    const match = (registry.apps || []).find(app => {
      const target = String(app.url || '').split(/[?#]/)[0].replace(/^\.\//, '').replace(/\/$/, '');
      return target && currentRelativePath.replace(/\/$/, '').startsWith(target);
    });
    return match?.id || '';
  }

  function shellMarkup() {
    return `
      <header class="mobile-topbar">
        <a class="brand" href="${escapeHtml(rootHref('index.html#inicio'))}" aria-label="Ir para o início"><span class="brand-mark"><img src="${escapeHtml(rootHref('assets/logo-pixel.png'))}" alt="Logo HUB SI"></span><span class="brand-text"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a>
        <div class="mobile-header-actions"><button id="mobileThemeButton" class="mobile-icon-button" type="button" aria-label="Escolher tema" aria-expanded="false" aria-controls="mobileThemeMenu">◐</button><div id="mobileThemeMenu" class="mobile-theme-menu" hidden><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div><button id="mobileSidebarToggle" class="mobile-icon-button" type="button" aria-controls="siteSidebar" aria-expanded="false" aria-label="Abrir menu">☰</button></div>
      </header>
      <aside id="siteSidebar" class="site-sidebar" aria-label="Menu principal">
        <div class="sidebar-head"><a class="brand sidebar-brand" href="${escapeHtml(rootHref('index.html#inicio'))}" aria-label="Ir para o início"><span class="brand-mark"><img src="${escapeHtml(rootHref('assets/logo-pixel.png'))}" alt="Logo HUB SI"></span><span class="brand-text sidebar-label"><strong>HUB SI</strong><small>IFBA · Vitória da Conquista</small></span></a><button id="sidebarCollapseButton" class="sidebar-collapse" type="button" aria-label="Ocultar menu" title="Ocultar menu">‹</button><button id="mobileSidebarClose" class="sidebar-mobile-close" type="button" aria-label="Fechar menu">×</button></div>
        <nav class="sidebar-nav" aria-label="Navegação principal">
          <form id="sidebarSearchForm" class="sidebar-search-form" role="search" aria-label="Buscar no HUB"><button id="sidebarSearchButton" class="sidebar-search-submit" type="submit" aria-label="Buscar" title="Buscar"><span aria-hidden="true">🔍</span></button><input id="sidebarSearchInput" type="search" autocomplete="off" placeholder="Buscar no HUB..." aria-label="Buscar documentos, apps, links e contatos"></form>
          <a href="${escapeHtml(rootHref('index.html#inicio'))}"><span class="nav-icon" aria-hidden="true">🏠</span><span class="sidebar-label">Início</span></a>
          <a href="${escapeHtml(rootHref('index.html#acervo'))}"><span class="nav-icon" aria-hidden="true">🗂️</span><span class="sidebar-label">Acervo</span></a>
          <div class="sidebar-menu-group" data-sidebar-group="apps"><div class="sidebar-menu-row"><a id="appsSectionLink" class="sidebar-menu-link" href="${escapeHtml(rootHref('index.html#apps'))}"><span class="nav-icon" aria-hidden="true">🧰</span><span class="sidebar-label">Apps</span></a><button id="appsMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="true" aria-controls="appsMenu" aria-label="Mostrar ou ocultar apps"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="appsMenu" class="sidebar-submenu sidebar-apps-list" aria-label="Aplicativos"></div></div>
          <div class="sidebar-menu-group sidebar-links-group" data-sidebar-group="links"><div class="sidebar-menu-row"><a id="linksSectionLink" class="sidebar-menu-link" href="${escapeHtml(rootHref('index.html#links'))}"><span class="nav-icon" aria-hidden="true">🔗</span><span class="sidebar-label">Links</span></a><button id="linksMenuToggle" class="sidebar-submenu-toggle" type="button" aria-expanded="false" aria-controls="sidebarLinksList" aria-label="Mostrar ou ocultar links"><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button></div><div id="sidebarLinksList" class="sidebar-submenu sidebar-links-list" aria-label="Links externos"></div></div>
          <div class="sidebar-menu-group" data-sidebar-group="favorites"><button id="favoritesMenuToggle" class="sidebar-menu-toggle" type="button" aria-expanded="true" aria-controls="sidebarFavoritesList"><span class="nav-icon" aria-hidden="true">⭐</span><span class="sidebar-label">Favoritos</span><span id="sidebarFavoritesCount" class="sidebar-count" aria-label="0 favoritos">0</span><span class="sidebar-menu-chevron" aria-hidden="true">⌄</span></button><div id="sidebarFavoritesList" class="sidebar-submenu sidebar-favorites-list" aria-live="polite"></div></div>
        </nav>
        <div class="sidebar-bottom"><div class="sidebar-utility-actions"><button id="reportIssueButton" class="reset-preferences" type="button" aria-label="Relatar problema" title="Relatar problema"><span class="reset-preferences-icon" aria-hidden="true">🐞</span><span class="preference-label">Reportar</span></button><button id="resetPreferencesButton" class="reset-preferences" type="button" aria-label="Restaurar preferências" title="Restaurar preferências"><span class="reset-preferences-icon" aria-hidden="true">↺</span><span class="preference-label">Redefinir</span></button></div><div class="theme-panel"><span class="theme-label">Tema</span><div class="theme-switch" role="group" aria-label="Tema do site"><button type="button" data-theme-choice="auto" aria-label="Tema automático" title="Tema automático"><span aria-hidden="true">◐</span></button><button type="button" data-theme-choice="dark" aria-label="Modo escuro" title="Modo escuro"><span aria-hidden="true">☾</span></button><button type="button" data-theme-choice="light" aria-label="Modo claro" title="Modo claro"><span aria-hidden="true">☀</span></button></div></div><div id="sidebarExternalLinks" class="sidebar-external-links" aria-label="Sistemas institucionais"></div></div>
        <div id="sidebarResizeHandle" class="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Redimensionar menu lateral" tabindex="0"></div>
      </aside>
      <button id="sidebarReopenButton" class="sidebar-reopen" type="button" aria-label="Mostrar menu" title="Mostrar menu">›</button><div id="sidebarOverlay" class="sidebar-overlay" aria-hidden="true"></div>`;
  }

  function ensureMount() {
    let mount = document.getElementById('hubSidebarMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'hubSidebarMount';
      document.body.prepend(mount);
    }

    // A sidebar compartilhada é a única implementação autorizada. Qualquer shell
    // legado presente no HTML do app é removido antes de montar o componente comum.
    for (const node of document.querySelectorAll('.mobile-topbar, #siteSidebar, #sidebarReopenButton, #sidebarOverlay')) {
      if (!mount.contains(node)) node.remove();
    }
    mount.replaceChildren();
    mount.insertAdjacentHTML('afterbegin', shellMarkup());
    document.body.classList.add('hub-app-shell-ready');
    return mount;
  }

  function normalized(value = '') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function appIcon(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url, item.category].filter(Boolean).join(' '));
    for (const [keywords, emoji] of FORCED_APP_EMOJI_RULES) if (keywords.some(keyword => search.includes(keyword))) return emoji;
    const explicit = String(item.emoji || item.icon || '').trim();
    if (!GENERIC_APP_ICONS.has(explicit)) return explicit;
    for (const [keywords, emoji] of APP_EMOJI_RULES) if (keywords.some(keyword => search.includes(keyword))) return emoji;
    return '🧩';
  }

  function isObsoleteApp(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url].filter(Boolean).join(' '));
    return search.includes('onde resolvo');
  }

  function externalLinkKind(item = {}) {
    const search = normalized([item.id, item.title, item.name, item.url].filter(Boolean).join(' '));
    if (search.includes('suap')) return 'suap';
    if (search.includes('portal ifba') || search.includes('portal do ifba') || search.includes('portal ifba edu br')) return 'portal';
    return '';
  }

  function mergedExternalLinks() {
    const configured = Array.isArray(registry.externalLinks) ? registry.externalLinks : [];
    const byKind = new Map(configured.map(item => [externalLinkKind(item), item]).filter(([kind]) => kind));
    const result = DEFAULT_EXTERNAL_LINKS.map(item => ({ ...item, ...(byKind.get(item.id) || {}), id: item.id, emoji: item.emoji }));
    const known = new Set(result.map(item => normalized(item.url)));
    for (const item of configured) if (!externalLinkKind(item) && !known.has(normalized(item.url))) result.push(item);
    return result;
  }

  function renderApps() {
    const box = document.getElementById('appsMenu');
    if (!box) return;
    const current = currentAppId();
    const apps = (Array.isArray(registry.apps) ? registry.apps : []).filter(item => !isObsoleteApp(item));
    box.innerHTML = apps.map(item => {
      const href = rootHref(item.url);
      const active = item.id === current;
      return `<a class="${active ? 'active' : ''}" href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ''}><span aria-hidden="true">${escapeHtml(appIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'App')}</span></a>`;
    }).join('');
  }

  function linkIcon(item = {}) {
    return String(item.emoji || item.icon || '🔗');
  }

  function renderLinks() {
    const box = document.getElementById('sidebarLinksList');
    if (!box) return;
    const items = registry.links || [];
    box.innerHTML = items.length ? items.map(item => {
      const href = rootHref(item.url);
      return `<a href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ''}><span aria-hidden="true">${escapeHtml(linkIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'Link')}</span></a>`;
    }).join('') : '<p class="sidebar-empty">Nenhum atalho cadastrado.</p>';
  }

  function readFavorites() {
    try {
      const value = JSON.parse(read(PREF.favoritesData, '[]'));
      return Array.isArray(value) ? value.filter(item => item?.kind !== 'app' || !isObsoleteApp(item)) : [];
    } catch { return []; }
  }

  function renderFavorites() {
    const box = document.getElementById('sidebarFavoritesList');
    const count = document.getElementById('sidebarFavoritesCount');
    if (!box) return;
    const items = readFavorites();
    if (count) { count.textContent = String(items.length); count.setAttribute('aria-label', `${items.length} favoritos`); }
    box.innerHTML = items.length ? items.slice(0, 30).map((item, index) => {
      const href = rootHref(item.url || '#');
      const icon = item.kind === 'document' ? '📄' : item.kind === 'app' ? appIcon(item) : '🔗';
      return `<div class="sidebar-favorite-row"><a href="${escapeHtml(href)}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ''}><span aria-hidden="true">${escapeHtml(icon)}</span><span class="sidebar-label">${escapeHtml(item.title || 'Favorito')}</span></a><button class="sidebar-favorite-remove" type="button" data-remove-favorite="${index}" aria-label="Remover favorito">×</button></div>`;
    }).join('') : '<p class="sidebar-empty">Nenhum favorito salvo.</p>';
  }

  function renderExternalLinks() {
    const box = document.getElementById('sidebarExternalLinks');
    if (!box) return;
    box.innerHTML = mergedExternalLinks().map(item => `<a class="campus-portal sidebar-external-link" href="${escapeHtml(rootHref(item.url))}" target="_blank" rel="noopener" title="${escapeHtml(item.title || '')}"><span aria-hidden="true">${escapeHtml(linkIcon(item))}</span><span class="sidebar-label">${escapeHtml(item.title || 'Link')}</span></a>`).join('');
  }

  function setGroup(buttonId, panelId, key, defaultOpen) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    if (!button || !panel || button.dataset.sharedSidebarBound) return;
    button.dataset.sharedSidebarBound = '1';
    const apply = (open, persist = true) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.closest('.sidebar-menu-group')?.classList.toggle('is-open', open);
      if (persist) write(key, open ? '1' : '0');
    };
    apply(read(key, defaultOpen ? '1' : '0') === '1', false);
    button.addEventListener('click', () => apply(button.getAttribute('aria-expanded') !== 'true'));
  }

  function applyTheme(mode = read(PREF.theme, 'auto')) {
    const clean = ['auto', 'dark', 'light'].includes(mode) ? mode : 'auto';
    const resolved = clean === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : clean;
    document.documentElement.dataset.themeMode = clean;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === clean));
    const mobile = document.getElementById('mobileThemeButton');
    if (mobile) mobile.textContent = clean === 'dark' ? '☾' : clean === 'light' ? '☀' : '◐';
    write(PREF.theme, clean);
  }

  function applyWidth(value, persist = true) {
    width = Math.min(420, Math.max(72, Math.round(Number(value) || 276)));
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
    document.body.classList.toggle('sidebar-icons-only', width <= 96);
    document.documentElement.classList.toggle('sidebar-icons-only-preload', width <= 96);
    if (persist) write(PREF.width, String(width));
    return width;
  }

  function bind() {
    if (document.body.dataset.sharedSidebarBound) return;
    document.body.dataset.sharedSidebarBound = '1';
    applyWidth(read(PREF.width, '276'), false);
    document.body.classList.toggle('sidebar-collapsed', read(PREF.collapsed, '0') === '1');
    setGroup('appsMenuToggle', 'appsMenu', PREF.apps, true);
    setGroup('linksMenuToggle', 'sidebarLinksList', PREF.links, false);
    setGroup('favoritesMenuToggle', 'sidebarFavoritesList', PREF.favorites, true);
    applyTheme();

    const setCollapsed = value => { document.body.classList.toggle('sidebar-collapsed', value); write(PREF.collapsed, value ? '1' : '0'); };
    const setMobileOpen = open => {
      document.body.classList.toggle('mobile-sidebar-open', open);
      document.getElementById('mobileSidebarToggle')?.setAttribute('aria-expanded', String(open));
      document.getElementById('sidebarOverlay')?.setAttribute('aria-hidden', String(!open));
    };
    document.getElementById('sidebarCollapseButton')?.addEventListener('click', () => setCollapsed(true));
    document.getElementById('sidebarReopenButton')?.addEventListener('click', () => setCollapsed(false));
    document.getElementById('mobileSidebarToggle')?.addEventListener('click', () => setMobileOpen(!document.body.classList.contains('mobile-sidebar-open')));
    document.getElementById('mobileSidebarClose')?.addEventListener('click', () => setMobileOpen(false));
    document.getElementById('sidebarOverlay')?.addEventListener('click', () => setMobileOpen(false));
    document.getElementById('siteSidebar')?.addEventListener('click', event => { if (event.target.closest('a') && matchMedia('(max-width:920px)').matches) setMobileOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileOpen(false); });

    const mobileThemeButton = document.getElementById('mobileThemeButton');
    const mobileThemeMenu = document.getElementById('mobileThemeMenu');
    mobileThemeButton?.addEventListener('click', event => { event.stopPropagation(); const open = Boolean(mobileThemeMenu?.hidden); if (mobileThemeMenu) mobileThemeMenu.hidden = !open; mobileThemeButton.setAttribute('aria-expanded', String(open)); });
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => { applyTheme(button.dataset.themeChoice); if (mobileThemeMenu) mobileThemeMenu.hidden = true; mobileThemeButton?.setAttribute('aria-expanded', 'false'); }));
    document.addEventListener('click', event => { if (!event.target.closest('#mobileThemeMenu, #mobileThemeButton')) { if (mobileThemeMenu) mobileThemeMenu.hidden = true; mobileThemeButton?.setAttribute('aria-expanded', 'false'); } });

    document.getElementById('resetPreferencesButton')?.addEventListener('click', () => {
      if (!confirm('Restaurar todas as preferências do HUB e dos apps neste navegador?')) return;
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
      keys.filter(key => key && (key.startsWith('hub') || key.startsWith('barema') || key.startsWith('fluxapp:'))).forEach(key => localStorage.removeItem(key));
      location.reload();
    });
    window.HUB_UI?.setupReportButton?.(document.getElementById('reportIssueButton'), { title: document.title, context: currentAppId() || 'hub' });

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-favorite]');
      if (!button) return;
      const items = readFavorites();
      items.splice(Number(button.dataset.removeFavorite), 1);
      write(PREF.favoritesData, JSON.stringify(items));
      renderFavorites();
    });

    const resize = document.getElementById('sidebarResizeHandle');
    if (resize) {
      let dragging = false;
      resize.addEventListener('pointerdown', event => { if (matchMedia('(max-width:920px)').matches) return; dragging = true; resize.setPointerCapture(event.pointerId); document.body.classList.add('sidebar-resizing'); event.preventDefault(); });
      resize.addEventListener('pointermove', event => { if (dragging) applyWidth(event.clientX, false); });
      const finish = event => { if (!dragging) return; dragging = false; document.body.classList.remove('sidebar-resizing'); write(PREF.width, String(width)); try { resize.releasePointerCapture(event.pointerId); } catch {} };
      resize.addEventListener('pointerup', finish);
      resize.addEventListener('pointercancel', finish);
      resize.addEventListener('dblclick', () => applyWidth(276, true));
      resize.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') applyWidth(72, true); else if (event.key === 'End') applyWidth(420, true); else applyWidth(width + (event.key === 'ArrowRight' ? 10 : -10), true); });
    }

    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (read(PREF.theme, 'auto') === 'auto') applyTheme('auto'); });
    window.addEventListener('storage', event => { if (event.key === PREF.theme) applyTheme(event.newValue || 'auto'); if (event.key === PREF.favoritesData) renderFavorites(); if (event.key === PREF.width) applyWidth(event.newValue || 276, false); });
    window.addEventListener('hub:favorites-changed', renderFavorites);
  }

  function refresh() {
    renderApps();
    renderLinks();
    renderFavorites();
    renderExternalLinks();
    document.dispatchEvent(new CustomEvent('hub:sidebar-ready'));
  }

  async function loadRegistry() {
    try {
      const response = await fetch(registryUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      if (parsed && Array.isArray(parsed.apps)) registry = parsed;
    } catch (error) {
      console.warn('Registro compartilhado da sidebar indisponível:', error);
    }
    refresh();
  }

  function init() {
    ensureMount();
    bind();
    refresh();
    loadRegistry();
  }

  window.HUB_SHARED_SIDEBAR = { active: true, refresh, rootUrl: rootUrl.href };
  window.HUB_SHARED_SIDEBAR_ACTIVE = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
