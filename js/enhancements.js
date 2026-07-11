(() => {
  "use strict";
  const FAVORITES_KEY = "hubFavoritesV1";

  const readFavorites = () => {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  };
  const saveFavorites = items => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(items)); } catch (_) {}
  };
  const favoriteKey = item => `${item.kind || "item"}:${item.id || item.url || item.title}`;
  const escapeHtmlLocal = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[char]));
  const snapshotFromButton = button => ({
    id: button.dataset.favoriteId || button.dataset.favoriteUrl || button.dataset.favoriteTitle,
    kind: button.dataset.favoriteKind || "item",
    title: button.dataset.favoriteTitle || "Item",
    url: button.dataset.favoriteUrl || "#",
    meta: button.dataset.favoriteMeta || "Favorito"
  });
  const isExternal = url => /^(https?:|mailto:|tel:)/i.test(url || "");

  function syncFavoriteButtons() {
    const keys = new Set(readFavorites().map(favoriteKey));
    document.querySelectorAll("[data-favorite-toggle]").forEach(button => {
      const active = keys.has(favoriteKey(snapshotFromButton(button)));
      button.classList.toggle("active", active);
      const symbol = active ? "★" : "☆";
      if (button.textContent !== symbol) button.textContent = symbol;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-label", active ? "Remover dos favoritos" : "Adicionar aos favoritos");
      button.title = active ? "Remover dos favoritos" : "Adicionar aos favoritos";
    });
  }

  function renderFavorites() {
    const list = document.getElementById("sidebarFavoritesList");
    const count = document.getElementById("sidebarFavoritesCount");
    if (!list) return;
    const items = readFavorites();
    if (count) {
      count.textContent = String(items.length);
      count.setAttribute("aria-label", `${items.length} favorito${items.length === 1 ? "" : "s"}`);
    }
    if (!items.length) {
      list.innerHTML = '<p class="sidebar-empty-message">Nenhum favorito ainda. Use a estrela nos documentos, apps e resultados.</p>';
      syncFavoriteButtons();
      return;
    }
    list.innerHTML = items.map(item => `
      <article class="sidebar-favorite-item">
        <a href="${escapeHtmlLocal(item.url || "#")}"${isExternal(item.url) || /\.(pdf|xlsx?|docx?)($|[?#])/i.test(item.url || "") ? ' target="_blank" rel="noopener"' : ""}>
          <span aria-hidden="true">${item.kind === "document" ? "📄" : item.kind === "app" ? "🧰" : "🔗"}</span>
          <span><strong>${escapeHtmlLocal(item.title)}</strong><small>${escapeHtmlLocal(item.meta || "Favorito")}</small></span>
        </a>
        <button type="button" class="sidebar-favorite-remove" data-favorite-remove="${escapeHtmlLocal(favoriteKey(item))}" aria-label="Remover ${escapeHtmlLocal(item.title)} dos favoritos" title="Remover dos favoritos">×</button>
      </article>
    `).join("");
    syncFavoriteButtons();
  }


  document.addEventListener("click", event => {
    const toggle = event.target.closest("[data-favorite-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const item = snapshotFromButton(toggle);
      const key = favoriteKey(item);
      const items = readFavorites();
      const index = items.findIndex(saved => favoriteKey(saved) === key);
      if (index >= 0) items.splice(index, 1);
      else items.unshift(item);
      saveFavorites(items.slice(0, 30));
      renderFavorites();
      return;
    }
    const remove = event.target.closest("[data-favorite-remove]");
    if (remove) {
      const items = readFavorites().filter(item => favoriteKey(item) !== remove.dataset.favoriteRemove);
      saveFavorites(items);
      renderFavorites();
    }
  });

  const observer = new MutationObserver(() => syncFavoriteButtons());
  observer.observe(document.body, { childList: true, subtree: true });

  const typeFilter = document.getElementById("typeFilter");
  const scopeButtons = [...document.querySelectorAll("[data-search-scope]")];
  const syncSearchScopes = () => {
    const current = typeFilter?.value || "all";
    scopeButtons.forEach(button => {
      const active = button.dataset.searchScope === current;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };
  scopeButtons.forEach(button => button.addEventListener("click", () => {
    if (!typeFilter) return;
    typeFilter.value = button.dataset.searchScope || "all";
    typeFilter.dispatchEvent(new Event("change", { bubbles: true }));
    syncSearchScopes();
  }));
  typeFilter?.addEventListener("change", syncSearchScopes);
  document.getElementById("clearSearch")?.addEventListener("click", () => window.setTimeout(syncSearchScopes, 0));
  syncSearchScopes();

  const searchHelp = document.getElementById("searchHelpDialog");
  document.getElementById("searchHelpButton")?.addEventListener("click", () => {
    if (typeof searchHelp?.showModal === "function") searchHelp.showModal();
    else searchHelp?.setAttribute("open", "");
  });
  searchHelp?.addEventListener("click", event => {
    if (event.target === searchHelp) searchHelp.close?.();
  });

  document.getElementById("resetPreferencesButton")?.addEventListener("click", () => {
    const confirmed = window.confirm("Restaurar todas as preferências do HUB e dos apps neste navegador?");
    if (!confirmed) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    keys.filter(key => key && (key.startsWith("hub") || key.startsWith("barema") || key.startsWith("fluxapp:"))).forEach(key => localStorage.removeItem(key));
    window.location.reload();
  });

  // Focus trap and focus return for the mobile sidebar.
  const sidebar = document.getElementById("siteSidebar");
  const openButton = document.getElementById("mobileSidebarToggle");
  let lastFocus = null;
  const focusables = () => [...(sidebar?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])].filter(el => !el.hidden && el.offsetParent !== null);
  openButton?.addEventListener("click", () => {
    window.setTimeout(() => {
      if (document.body.classList.contains("mobile-sidebar-open")) {
        lastFocus = openButton;
        focusables()[0]?.focus();
      }
    }, 30);
  });
  document.addEventListener("keydown", event => {
    if (!document.body.classList.contains("mobile-sidebar-open") || event.key !== "Tab") return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  new MutationObserver(() => {
    if (!document.body.classList.contains("mobile-sidebar-open") && lastFocus) {
      lastFocus.focus();
      lastFocus = null;
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  renderFavorites();
})();
