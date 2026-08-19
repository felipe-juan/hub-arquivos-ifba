(() => {
  'use strict';

  const CONFIG = window.HUB_ASSISTANT_CONFIG || {};
  const FRONTEND_RELEASE = '2.0.14-ux-offline-history-v2';
  const STORAGE_KEY = 'hubAssistantStateV1';
  const SETTINGS_KEY = 'hubAssistantSettingsV1';
  const FAVORITES_KEY = 'hubFavoritesV2';
  const POPULAR_CACHE_KEY = 'hubAssistantPopularCacheV1';
  const DB_NAME = 'hubAssistantHistoryV1';
  const DB_VERSION = 3;
  const DB_STORE = 'state';
  const DB_CONVERSATIONS = 'conversations';
  const DB_MESSAGES = 'messages';
  const $ = id => document.getElementById(id);

  function loadPopularCache() {
    try {
      const value = JSON.parse(localStorage.getItem(POPULAR_CACHE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function savePopularCache(cache) {
    try { localStorage.setItem(POPULAR_CACHE_KEY, JSON.stringify(cache || {})); } catch {}
  }

  const initialPopularPeriod = localStorage.getItem('hubPopularPeriodV1') === 'week' ? 'week' : 'today';
  const initialPopularCache = loadPopularCache();
  const initialPopularItems = Array.isArray(initialPopularCache?.[initialPopularPeriod]?.items) ? initialPopularCache[initialPopularPeriod].items.slice(0, 8) : [];
  const state = {
    conversation: null,
    conversations: [],
    currentId: '',
    view: 'home',
    sending: false,
    activeRequest: null,
    requestSerial: 0,
    localSyncQueue: Promise.resolve(),
    settings: loadSettings(),
    favorites: loadFavorites(),
    popularQuestions: initialPopularItems,
    popularPeriod: initialPopularPeriod,
    popularCache: initialPopularCache,
    popularStale: Boolean(initialPopularItems.length),
    offlineCatalog: null,
    offlineAcademic: null,
    historyQuery: '',
    dialogState: null,
    toastTimer: 0,
    renderLimit: 80,
    messageFingerprints: new Map(),
    editingMessageId: '',
    feedbackMenuMessageId: '',
    offline: !navigator.onLine
  };
  const historyStore = {
    dbPromise: null,
    queue: Promise.resolve(),
    persistTimer: 0,
    pendingState: null,
    draftTimer: 0,
    pendingDraft: '',
    structuredReady: false
  };
  const composerGuard = {
    area: null,
    workspace: null,
    observer: null,
    resizeObserver: null
  };

  function uuid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function openHistoryDatabase() {
    if (!('indexedDB' in globalThis)) return Promise.resolve(null);
    if (historyStore.dbPromise) return historyStore.dbPromise;
    historyStore.dbPromise = new Promise(resolve => {
      let request;
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value || null);
      };
      const timer = setTimeout(() => finish(null), 1800);
      try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch { finish(null); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
        if (!database.objectStoreNames.contains(DB_CONVERSATIONS)) database.createObjectStore(DB_CONVERSATIONS, { keyPath:'id' });
        if (!database.objectStoreNames.contains(DB_MESSAGES)) {
          const messages = database.createObjectStore(DB_MESSAGES, { keyPath:'id' });
          messages.createIndex('conversationId', 'conversationId', { unique:false });
        } else {
          const messages = request.transaction.objectStore(DB_MESSAGES);
          if (!messages.indexNames.contains('conversationId')) messages.createIndex('conversationId', 'conversationId', { unique:false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { try { database.close(); } catch {} historyStore.dbPromise = null; };
        finish(database);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    });
    return historyStore.dbPromise;
  }

  async function databaseGet(key) {
    const database = await openHistoryDatabase();
    if (!database) return null;
    return new Promise(resolve => {
      try {
        const transaction = database.transaction(DB_STORE, 'readonly');
        const request = transaction.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  function enqueueDatabaseWrite(operation, fallback) {
    historyStore.queue = historyStore.queue.then(async () => {
      const database = await openHistoryDatabase();
      if (!database) { fallback?.(); return; }
      await new Promise(resolve => {
        try {
          const transaction = database.transaction(DB_STORE, 'readwrite');
          operation(transaction.objectStore(DB_STORE));
          transaction.oncomplete = resolve;
          transaction.onerror = resolve;
          transaction.onabort = resolve;
        } catch { fallback?.(); resolve(); }
      });
    }).catch(() => fallback?.());
    return historyStore.queue;
  }

  async function databaseGetAll(storeName) {
    const database = await openHistoryDatabase();
    if (!database || !database.objectStoreNames.contains(storeName)) return [];
    return new Promise(resolve => {
      try {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => resolve([]);
        transaction.onabort = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  async function loadStructuredState() {
    const database = await openHistoryDatabase();
    if (!database || !database.objectStoreNames.contains(DB_CONVERSATIONS) || !database.objectStoreNames.contains(DB_MESSAGES)) return null;
    const [meta, conversations, messages] = await Promise.all([
      databaseGet('main-v3'), databaseGetAll(DB_CONVERSATIONS), databaseGetAll(DB_MESSAGES)
    ]);
    if (!conversations.length) return null;
    const byConversation = new Map();
    for (const message of messages) {
      const id = String(message?.conversationId || '');
      if (!id) continue;
      if (!byConversation.has(id)) byConversation.set(id, []);
      byConversation.get(id).push({ ...message });
    }
    for (const list of byConversation.values()) list.sort((a,b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    historyStore.structuredReady = true;
    return {
      currentId:String(meta?.currentId || ''),
      view:meta?.view === 'home' ? 'home' : 'conversation',
      conversations:conversations.map(item => ({ ...item, messages:byConversation.get(String(item.id || '')) || [] }))
    };
  }

  async function loadSavedState() {
    const structured = await loadStructuredState();
    if (structured) return structured;
    const saved = await databaseGet('main');
    if (saved) return saved;
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  async function loadDraft() {
    const saved = await databaseGet('draft');
    if (typeof saved === 'string') return saved;
    try { return localStorage.getItem(`${STORAGE_KEY}:draft`) || ''; } catch { return ''; }
  }

  function conversationMetadata(conversation = {}) {
    const { messages, ...metadata } = conversation;
    return metadata;
  }

  function persistStructuredState(payload) {
    historyStore.queue = historyStore.queue.then(async () => {
      const database = await openHistoryDatabase();
      if (!database) throw new Error('IndexedDB indisponível');
      await new Promise(resolve => {
        try {
          const transaction = database.transaction([DB_STORE, DB_CONVERSATIONS, DB_MESSAGES], 'readwrite');
          const stateStore = transaction.objectStore(DB_STORE);
          const conversationStore = transaction.objectStore(DB_CONVERSATIONS);
          const messageStore = transaction.objectStore(DB_MESSAGES);
          stateStore.put({ currentId:String(payload.currentId || ''), view:payload.view === 'home' ? 'home' : 'conversation' }, 'main-v3');
          const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
          const keepConversationIds = new Set(conversations.map(item => String(item.id || '')).filter(Boolean));
          for (const conversation of conversations) conversationStore.put(conversationMetadata(conversation));
          const staleConversationCursor = conversationStore.openCursor();
          staleConversationCursor.onsuccess = event => {
            const cursor = event.target.result;
            if (!cursor) return;
            if (!keepConversationIds.has(String(cursor.key || ''))) cursor.delete();
            cursor.continue();
          };
          const staleMessageCursor = messageStore.openCursor();
          staleMessageCursor.onsuccess = event => {
            const cursor = event.target.result;
            if (!cursor) return;
            if (!keepConversationIds.has(String(cursor.value?.conversationId || ''))) cursor.delete();
            cursor.continue();
          };
          const targets = historyStore.structuredReady
            ? conversations.filter(item => item.id === payload.currentId)
            : conversations;
          for (const conversation of targets) {
            const keep = new Set((conversation.messages || []).map(message => String(message.id || '')));
            let cursorRequest = null;
            try { cursorRequest = messageStore.index('conversationId').openCursor(IDBKeyRange.only(conversation.id)); } catch {}
            if (cursorRequest) cursorRequest.onsuccess = event => {
              const cursor = event.target.result;
              if (!cursor) return;
              if (!keep.has(String(cursor.value?.id || ''))) cursor.delete();
              cursor.continue();
            };
            for (const message of conversation.messages || []) messageStore.put({ ...message, conversationId:conversation.id });
          }
          transaction.oncomplete = () => { historyStore.structuredReady = true; resolve(); };
          transaction.onerror = resolve;
          transaction.onabort = resolve;
        } catch { resolve(); }
      });
    }).catch(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
    });
    return historyStore.queue;
  }

  function persistSavedState(value, { immediate = false } = {}) {
    historyStore.pendingState = value;
    clearTimeout(historyStore.persistTimer);
    const flush = () => {
      const payload = historyStore.pendingState;
      historyStore.pendingState = null;
      if (!payload) return historyStore.queue;
      return persistStructuredState(payload);
    };
    if (immediate) return flush();
    historyStore.persistTimer = setTimeout(flush, 120);
    return historyStore.queue;
  }

  function persistDraft(value, { immediate = false } = {}) {
    historyStore.pendingDraft = String(value || '').slice(0, 3000);
    clearTimeout(historyStore.draftTimer);
    const flush = () => {
      const payload = historyStore.pendingDraft;
      return enqueueDatabaseWrite(store => store.put(payload, 'draft'), () => {
        try { localStorage.setItem(`${STORAGE_KEY}:draft`, payload); } catch {}
      });
    };
    if (immediate) return flush();
    historyStore.draftTimer = setTimeout(flush, 160);
    return historyStore.queue;
  }

  async function deleteConversationPersistence(conversationId) {
    const database = await openHistoryDatabase();
    if (!database || !conversationId) return;
    await new Promise(resolve => {
      try {
        const transaction = database.transaction([DB_CONVERSATIONS, DB_MESSAGES], 'readwrite');
        transaction.objectStore(DB_CONVERSATIONS).delete(conversationId);
        const messageStore = transaction.objectStore(DB_MESSAGES);
        const cursorRequest = messageStore.index('conversationId').openCursor(IDBKeyRange.only(conversationId));
        cursorRequest.onsuccess = event => { const cursor = event.target.result; if (!cursor) return; cursor.delete(); cursor.continue(); };
        transaction.oncomplete = resolve; transaction.onerror = resolve; transaction.onabort = resolve;
      } catch { resolve(); }
    });
  }

  async function clearSavedState() {
    clearTimeout(historyStore.persistTimer);
    clearTimeout(historyStore.draftTimer);
    historyStore.pendingState = null;
    historyStore.pendingDraft = '';
    const database = await openHistoryDatabase();
    if (database) {
      await new Promise(resolve => {
        try {
          const transaction = database.transaction([DB_STORE, DB_CONVERSATIONS, DB_MESSAGES], 'readwrite');
          transaction.objectStore(DB_STORE).clear();
          transaction.objectStore(DB_CONVERSATIONS).clear();
          transaction.objectStore(DB_MESSAGES).clear();
          transaction.oncomplete = resolve; transaction.onerror = resolve; transaction.onabort = resolve;
        } catch { resolve(); }
      });
    }
    historyStore.structuredReady = false;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(`${STORAGE_KEY}:draft`); } catch {}
  }

  function defaultSettings() {
    return { senderName: 'Estudante', anonymousMode:false };
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...defaultSettings(), senderName: String(stored.senderName || 'Estudante').slice(0, 80), anonymousMode:Boolean(stored.anonymousMode ?? stored.testMode) };
    } catch { return defaultSettings(); }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
  }

  function syncAnonymousModeUi() {
    const button = $('anonymousModeToggle');
    if (!button) return;
    const active = Boolean(state.settings.anonymousMode);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Desativar modo anônimo neste dispositivo' : 'Ativar modo anônimo neste dispositivo');
    button.title = active
      ? 'Modo anônimo ativo: suas perguntas não entram em Mais perguntadas'
      : 'Modo anônimo: não incluir suas perguntas nas estatísticas públicas';
  }

  function toggleAnonymousMode() {
    state.settings.anonymousMode = !state.settings.anonymousMode;
    saveSettings();
    syncAnonymousModeUi();
    showToast(state.settings.anonymousMode
      ? 'Modo anônimo ativado: suas perguntas não entrarão em Mais perguntadas'
      : 'Modo anônimo desativado: suas próximas perguntas poderão contribuir para Mais perguntadas');
  }

  function telemetryPayload(payload = {}) {
    return state.settings.anonymousMode ? { ...payload, telemetryMode:'anonymous' } : payload;
  }

  function loadFavorites() {
    const shared = window.HUB_USER_STATE?.getFavorites?.();
    if (Array.isArray(shared)) return shared.slice(0, 100);
    try {
      const items = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(items) ? items.filter(Boolean).slice(0, 100) : [];
    } catch { return []; }
  }

  function saveFavorites() {
    if (window.HUB_USER_STATE?.setFavorites) state.favorites = window.HUB_USER_STATE.setFavorites(state.favorites);
    else { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites.slice(0, 100))); } catch {} }
  }

  function isFavoriteMessage(message) {
    return state.favorites.some(item => item.messageId === message.id || (item.serverId && item.serverId === message.serverId));
  }

  function favoriteFromMessage(message) {
    const components = Array.isArray(message.components) ? message.components : [];
    const documentCard = components.find(item => item?.type === 'document');
    const actionCard = components.find(item => item?.type === 'hub-actions');
    const source = (Array.isArray(message.sources) ? message.sources : [])[0] || null;
    const prompt = priorUserText(message.id);
    const summary = safeText(message.text).replace(/\s+/g, ' ').trim();
    const title = documentCard?.title || actionCard?.title || summary.slice(0, 80) || 'Resposta salva';
    return {
      id: `fav-${message.serverId || message.id}` ,
      messageId: message.id,
      conversationId: currentConversation().id,
      serverId: message.serverId || '',
      kind: documentCard ? 'document' : actionCard ? 'tool' : 'answer',
      title,
      summary: documentCard?.heading || summary.slice(0, 180),
      prompt,
      url: documentCard?.url || source?.url || (actionCard?.actions || []).find(action => action?.url)?.url || `apps/assistente/?favorite=${encodeURIComponent(message.id)}`,
      createdAt: Date.now()
    };
  }

  function toggleFavoriteMessage(messageId) {
    const message = messageById(messageId);
    if (!message) return;
    const existingIndex = state.favorites.findIndex(item => item.messageId === message.id || (item.serverId && item.serverId === message.serverId));
    if (existingIndex >= 0) {
      state.favorites.splice(existingIndex, 1);
      showToast('Removido dos favoritos');
    } else {
      state.favorites.unshift(favoriteFromMessage(message));
      state.favorites = state.favorites.slice(0, 60);
      showToast('Salvo em Meus favoritos');
    }
    saveFavorites();
    render();
  }

  function renderFavoritesHome() {
    const panel = $('favoritesPanel');
    const list = $('favoritesList');
    if (!panel || !list) return;
    panel.hidden = false;
    if (!state.favorites.length) {
      list.innerHTML = '<div class="saved-empty">Você ainda não salvou nenhum favorito.</div>';
      return;
    }
    list.innerHTML = state.favorites.slice(0, 8).map(item => {
      const href = safeExternalUrl(item.url || '');
      return `
      <article class="saved-item">
        <button type="button" data-favorite-prompt="${escapeHtml(item.prompt || '')}" data-favorite-message-id="${escapeHtml(item.messageId || '')}">
          <strong>${escapeHtml(item.title || 'Favorito')}</strong>
          <span>${escapeHtml(item.summary || 'Abrir item salvo')}</span>
        </button>
        <div class="saved-item-actions">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}<button type="button" data-remove-home-favorite="${escapeHtml(item.id || '')}" aria-label="Remover ${escapeHtml(item.title || 'favorito')} dos favoritos">Remover</button></div>
      </article>`;
    }).join('');
  }

  function conversationSearchText(conversation = {}) {
    return normalizeOffline([
      conversation.title || '',
      ...(Array.isArray(conversation.messages) ? conversation.messages.map(message => message.text || '') : [])
    ].join(' '));
  }

  function renderHomeConversationPanels() {
    const current = currentConversation();
    const continueCard = $('continueConversationCard');
    const continueText = $('continueConversationText');
    if (continueCard) {
      continueCard.hidden = !current.messages.length;
      if (continueText && current.messages.length) continueText.textContent = conversationPreview(current);
    }
    const panel = $('conversationHistoryPanel');
    const list = $('conversationHistoryList');
    const search = $('conversationHistorySearch');
    if (!panel || !list) return;
    if (search && document.activeElement !== search && search.value !== state.historyQuery) search.value = state.historyQuery;
    const query = normalizeOffline(state.historyQuery);
    const history = state.conversations
      .filter(conversation => conversation.messages.length)
      .filter(conversation => !query || conversationSearchText(conversation).includes(query))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    panel.hidden = !state.conversations.some(conversation => conversation.messages.length);
    if (!history.length) {
      list.innerHTML = query
        ? `<div class="saved-empty">Não encontrei conversa com “${escapeHtml(state.historyQuery)}”. A busca verifica títulos e todas as mensagens salvas.</div>`
        : '<div class="saved-empty">Ainda não há conversas salvas.</div>';
      return;
    }
    list.innerHTML = history.map(conversation => {
      const isCurrent = conversation.id === current.id;
      const actionLabel = isCurrent ? 'Continuar' : 'Abrir';
      return `
      <article class="conversation-card${isCurrent ? ' current' : ''}" data-conversation-row="${escapeHtml(conversation.id)}">
        <div class="conversation-card-copy">
          <div class="conversation-card-title-row">
            <strong class="conversation-card-title">${escapeHtml(conversation.title || 'Conversa')}</strong>
            ${isCurrent ? '<span class="conversation-current-badge">Atual</span>' : ''}
          </div>
          <span class="conversation-card-preview">${escapeHtml(conversationPreview(conversation))}</span>
        </div>
        <div class="conversation-card-actions">
          <button type="button" class="conversation-open-button" data-conversation-id="${escapeHtml(conversation.id)}">${actionLabel}</button>
          <details class="conversation-actions-menu">
            <summary aria-label="Mais opções para ${escapeHtml(conversation.title || 'conversa')}" title="Mais opções"><span aria-hidden="true">⋯</span></summary>
            <div class="conversation-actions-popover">
              <button type="button" data-rename-conversation="${escapeHtml(conversation.id)}">Renomear</button>
              <button type="button" class="danger" data-delete-conversation="${escapeHtml(conversation.id)}">Excluir</button>
            </div>
          </details>
        </div>
      </article>`;
    }).join('');
  }

  async function renameConversation(conversationId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) return;
    const title = await askAssistantText({ title:'Renomear conversa', message:'Escolha um título curto para localizar esta conversa depois.', value:conversation.title || '', placeholder:'Título da conversa', confirmLabel:'Salvar' });
    if (!title) return;
    conversation.title = title.slice(0,100);
    conversation.updatedAt = Date.now();
    await saveState({ immediate:true });
    renderHomeConversationPanels();
    showToast('Conversa renomeada');
  }

  async function deleteConversation(conversationId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) return;
    const confirmed = await confirmAssistantAction({ title:'Excluir conversa', message:`Excluir “${conversation.title || 'Conversa'}”? Esta ação remove as mensagens salvas neste dispositivo.`, confirmLabel:'Excluir' });
    if (!confirmed) return;
    const wasCurrent = conversation.id === state.currentId;
    state.conversations = state.conversations.filter(item => item.id !== conversation.id);
    await deleteConversationPersistence(conversation.id);
    if (!state.conversations.length) state.conversations = [freshConversation()];
    if (wasCurrent) {
      const next = state.conversations[0];
      state.currentId = next.id;
      state.conversation = next;
      state.view = next.messages.length ? 'conversation' : 'home';
    }
    await saveState({ immediate:true });
    render();
    showToast('Conversa excluída');
  }

  function renderPopularQuestions() {
    const panel = $('popularPanel');
    const list = $('popularList');
    if (!panel || !list) return;
    panel.hidden = false;
    document.querySelectorAll('[data-popular-period]').forEach(button => {
      const active = button.dataset.popularPeriod === state.popularPeriod;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const periodLabel = state.popularPeriod === 'week' ? 'nesta semana' : 'hoje';
    const title = $('popularTitle');
    const subtitle = $('popularSubtitle');
    if (title) title.textContent = state.popularPeriod === 'week' ? '🔥 Mais perguntadas da semana' : '🔥 Mais perguntadas hoje';
    if (subtitle) subtitle.textContent = state.popularStale
      ? 'Exibindo o último resultado salvo; a atualização global será retomada quando a API responder.'
      : 'Perguntas acadêmicas agrupadas sem identificar usuários. Atualizações não apagam o histórico.';
    if (!state.popularQuestions.length) {
      list.innerHTML = state.popularPeriod === 'today'
        ? '<div class="saved-empty">Hoje ainda não há consultas classificadas. O histórico não foi apagado; <button type="button" class="inline-link-button" data-popular-period="week">ver a semana</button>.</div>'
        : '<div class="saved-empty">Ainda não há perguntas suficientes nesta semana. O histórico armazenado não é zerado por atualizações do HUB.</div>';
      return;
    }
    list.innerHTML = state.popularQuestions.slice(0, 8).map((item, index) => {
      const trend = Number(item.trend || 0);
      const trendClass = trend > 0 ? 'up' : trend < 0 ? 'down' : 'same';
      const trendArrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
      const trendValue = trend === 0 ? '' : String(Math.abs(trend));
      const trendLabel = trend > 0
        ? `${trend} a mais que no período anterior`
        : trend < 0
          ? `${Math.abs(trend)} a menos que no período anterior`
          : 'Mesmo número do período anterior';
      const count = Number(item.count || 0);
      const countLabel = count === 1 ? 'consulta' : 'consultas';
      const subject = item.subject || item.title || 'Pergunta';
      const prompt = item.prompt || item.subject || item.title || '';
      return `
      <button type="button" class="saved-item popular-item" data-popular-prompt="${escapeHtml(prompt)}" aria-label="${escapeHtml(`${index + 1}. ${subject}. ${count} ${countLabel} ${periodLabel}. ${trendLabel}.`)}">
        <span class="popular-rank" aria-hidden="true">${index + 1}</span>
        <span class="popular-item-content">
          <strong class="popular-item-title">${escapeHtml(subject)}</strong>
          <span class="popular-item-period">${escapeHtml(periodLabel)}</span>
        </span>
        <span class="popular-item-stats" aria-hidden="true">
          <span class="popular-count ${trendClass}" title="${escapeHtml(trendLabel)}"><b>${count}</b><span class="popular-count-label">${countLabel}</span>${trend !== 0 ? `<span class="popular-count-trend ${trendClass}">${trendArrow}</span>` : ''}</span>
        </span>
        <span class="popular-item-chevron" aria-hidden="true">›</span>
      </button>`;
    }).join('');
  }

  function setPopularPeriod(period) {
    const clean = period === 'week' ? 'week' : 'today';
    if (state.popularPeriod === clean) return;
    state.popularPeriod = clean;
    try { localStorage.setItem('hubPopularPeriodV1', clean); } catch {}
    const cached = state.popularCache?.[clean];
    state.popularQuestions = Array.isArray(cached?.items) ? cached.items.slice(0, 8) : [];
    state.popularStale = Boolean(state.popularQuestions.length);
    renderPopularQuestions();
    loadPopularQuestions();
  }

  function renderPinnedAnswer() {
    const container = $('pinnedAnswer');
    if (!container) return;
    if (state.view === 'home') { container.hidden = true; container.innerHTML = ''; return; }
    const pinnedId = currentConversation().pinnedMessageId || '';
    const message = pinnedId ? messageById(pinnedId) : null;
    container.hidden = !message;
    if (!message) { container.innerHTML = ''; return; }
    const text = safeText(message.text).replace(/\s+/g, ' ').trim();
    container.innerHTML = `<div class="pinned-answer-card"><span>📌 Resposta fixada</span><strong>${escapeHtml(text.slice(0, 180) || 'Resposta salva')}</strong><div class="pinned-answer-actions"><button type="button" data-scroll-message="${escapeHtml(message.id)}">Ir para a resposta</button><button type="button" data-pin-message="${escapeHtml(message.id)}">Desafixar</button></div></div>`;
  }

  async function loadPopularQuestions() {
    const period = state.popularPeriod;
    const cached = state.popularCache?.[period];
    if (!CONFIG.apiBaseUrl) {
      state.popularQuestions = Array.isArray(cached?.items) ? cached.items.slice(0, 8) : state.popularQuestions;
      state.popularStale = Boolean(state.popularQuestions.length);
      renderPopularQuestions();
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/assistant/popular?period=${encodeURIComponent(period)}`), { cache:'no-store' });
      if (!response.ok) throw new Error(`Popular HTTP ${response.status}`);
      const data = await response.json().catch(() => ({}));
      if (period !== state.popularPeriod) return;
      const items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
      state.popularQuestions = items;
      state.popularStale = false;
      state.popularCache = {
        ...(state.popularCache || {}),
        [period]: { items, fetchedAt: Date.now(), startIso:String(data.startIso || ''), series:String(data.series || 'human_question_v2') }
      };
      savePopularCache(state.popularCache);
      renderPopularQuestions();
    } catch {
      const fallback = state.popularCache?.[period];
      if (Array.isArray(fallback?.items)) state.popularQuestions = fallback.items.slice(0, 8);
      state.popularStale = Boolean(state.popularQuestions.length);
      renderPopularQuestions();
    }
  }

  function togglePinMessage(messageId) {
    const conversation = currentConversation();
    conversation.pinnedMessageId = conversation.pinnedMessageId === messageId ? '' : messageId;
    saveState({ immediate:true });
    render();
    showToast(conversation.pinnedMessageId ? 'Resposta fixada no topo da conversa' : 'Resposta desafixada');
  }

  async function sendCorrectionForMessage(messageId) {
    const note = await askAssistantText({ title:'Informar correção', message:'Descreva em poucas palavras o que deveria estar correto.', placeholder:'Ex.: a sala correta é H204', confirmLabel:'Enviar correção' });
    if (!note) return;
    await sendFeedback(messageId, 'not-helpful', `Correção sugerida: ${safeText(note).trim().slice(0, 280)}`);
  }

  function normalizeOptions(options) {
    const source = Array.isArray(options) ? options : [];
    const normalized = source
      .filter(option => option && typeof option === 'object')
      .map((option, index) => ({
        id: String(option.id || `option-${index + 1}`),
        label: String(option.label || `Opção ${index + 1}`),
        value: String(option.value ?? index + 1),
        kind: String(option.kind || 'choice')
      }));
    if (normalized.length && !normalized.some(option => option.kind === 'exit' || /^(?:sair|cancelar|0|n)$/i.test(option.value))) {
      normalized.push({ id: 'exit-menu', label: 'Sair e fazer outra pergunta', value: 'sair', kind: 'exit' });
    }
    return normalized;
  }

  const MAX_CONVERSATIONS = 30;

  function freshConversation() {
    return {
      id: `conversation-${uuid()}`,
      sessionId: uuid().replace(/-/g, ''),
      title: 'Nova conversa',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinnedMessageId: '',
      contextClearedAt: 0,
      messages: []
    };
  }

  function normalizeConversation(value) {
    if (!value || typeof value !== 'object') return freshConversation();
    return {
      id: String(value.id || `conversation-${uuid()}`),
      sessionId: String(value.sessionId || uuid().replace(/-/g, '')),
      title: String(value.title || 'Nova conversa').slice(0, 100),
      createdAt: Number(value.createdAt || Date.now()),
      updatedAt: Number(value.updatedAt || Date.now()),
      pinnedMessageId: String(value.pinnedMessageId || ''),
      contextClearedAt: Number(value.contextClearedAt || 0),
      messages: Array.isArray(value.messages)
        ? value.messages.slice(-Number(CONFIG.maxMessagesPerConversation || 250)).map(message => ({
            ...message,
            options: normalizeOptions(message.options)
          }))
        : []
    };
  }

  function trimConversations(items, currentId = '') {
    const normalized = [...items]
      .filter(Boolean)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const current = normalized.find(item => item.id === currentId);
    const kept = normalized.filter(item => item.id !== currentId).slice(0, Math.max(0, MAX_CONVERSATIONS - (current ? 1 : 0)));
    return current ? [current, ...kept] : kept.slice(0, MAX_CONVERSATIONS);
  }

  async function loadState() {
    const saved = await loadSavedState();
    const candidates = Array.isArray(saved?.conversations) && saved.conversations.length
      ? saved.conversations
      : (saved?.conversation ? [saved.conversation] : []);
    state.conversations = candidates.map(normalizeConversation);
    if (!state.conversations.length) state.conversations = [freshConversation()];
    const requestedId = String(saved?.currentId || saved?.conversation?.id || '');
    state.currentId = state.conversations.some(item => item.id === requestedId) ? requestedId : state.conversations[0].id;
    state.conversations = trimConversations(state.conversations, state.currentId);
    state.conversation = state.conversations.find(item => item.id === state.currentId) || state.conversations[0];
    const savedView = saved?.view === 'home' || saved?.view === 'conversation' ? saved.view : '';
    state.view = savedView || (state.conversation.messages.length ? 'conversation' : 'home');
    if (!historyStore.structuredReady && candidates.length) await saveState({ immediate:true });
  }

  function saveState(options = {}) {
    const current = currentConversation();
    state.conversation = current;
    state.conversations = trimConversations(state.conversations, current.id);
    return persistSavedState({
      conversation: current,
      conversations: state.conversations,
      currentId: current.id,
      view: state.view
    }, options);
  }

  function currentConversation() {
    let conversation = state.conversations.find(item => item.id === state.currentId);
    if (!conversation) {
      conversation = state.conversation ? normalizeConversation(state.conversation) : freshConversation();
      state.conversations.unshift(conversation);
      state.currentId = conversation.id;
    }
    state.conversation = conversation;
    return conversation;
  }

  function findConversationContainingMessage(messageId) {
    if (!messageId) return null;
    return state.conversations.find(conversation => conversation.messages.some(message => message.id === messageId || message.serverId === messageId)) || null;
  }

  function conversationPreview(conversation) {
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    const lastUser = [...messages].reverse().find(message => message.role === 'user');
    const lastAny = messages[messages.length - 1];
    return safeText(lastUser?.text || lastAny?.text || 'Conversa sem mensagens').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function smartConversationTitle(text, context = null) {
    const query = normalizeOffline(text);
    const ctx = context && typeof context === 'object' ? context : {};
    const discipline = String(ctx.discipline || ctx.lastDiscipline || '').trim();
    const professor = String(ctx.professor || ctx.lastProfessor || '').trim();
    const semester = Number(ctx.semester || 0);
    if (/\b(?:auxilio|auxilios|paae|assistencia estudantil)\b/u.test(query)) return 'Auxílios estudantis';
    if (/\bcalendario\b/u.test(query)) return 'Calendário acadêmico';
    if (/\bbarema\b/u.test(query)) return 'Barema de atividades complementares';
    if (/\bppc\b|projeto pedagogico/u.test(query)) return 'PPC do BSI';
    if (/\bsuap\b/u.test(query)) return 'SUAP';
    if (professor) return `Professor ${professor.split(' ').slice(0,2).join(' ')}`.slice(0,100);
    if (discipline && /\bsala\b/u.test(query)) return `Sala de ${discipline}`.slice(0,100);
    if (discipline && /\b(?:professor|professora|quem da)\b/u.test(query)) return `Professor de ${discipline}`.slice(0,100);
    if (discipline) return `Horários de ${discipline}`.slice(0,100);
    if (semester) return `Horários do ${semester}º semestre`;
    const localProfessor = state.offlineAcademic ? localProfessorFor(query) : null;
    if (localProfessor) return `Professor ${localProfessor.name.split(' ').slice(0,2).join(' ')}`.slice(0,100);
    const localDiscipline = state.offlineAcademic ? localDisciplineFor(query) : null;
    if (localDiscipline) return (/\bsala\b/u.test(query) ? `Sala de ${localDiscipline}` : `Horários de ${localDiscipline}`).slice(0,100);
    const localSemester = localSemesterFor(query);
    if (localSemester && /\b(?:horario|horarios|aula|aulas|semestre)\b/u.test(query)) return `Horários do ${localSemester}º semestre`;
    return safeText(text).replace(/\s+/g,' ').trim().slice(0,72) || 'Nova conversa';
  }

  function refineConversationTitle(text, context = null, hint = '') {
    const conversation = currentConversation();
    if (!conversation.messages.some(message => message.role === 'user')) return;
    const next = String(hint || smartConversationTitle(text, context)).trim().slice(0,100);
    if (next && (conversation.title === 'Nova conversa' || conversation.messages.filter(message=>message.role==='user').length <= 1 || conversation.title.length <= 12)) {
      conversation.title = next;
      conversation.updatedAt = Date.now();
    }
  }

  function activeContextFromConversation() {
    const conversation = currentConversation();
    const clearedAt = Number(conversation.contextClearedAt || 0);
    for (let index=conversation.messages.length-1; index>=0; index-=1) {
      const message=conversation.messages[index];
      if (Number(message.createdAt || 0) <= clearedAt) break;
      const context=message.context;
      if (!context || typeof context !== 'object') continue;
      const label=String(context.discipline || context.lastDiscipline || context.professor || context.lastProfessor || context.title || context.summary || '').trim();
      if (label) return { label, context };
    }
    return null;
  }

  function syncActiveContextUi() {
    const bar=$('activeContextBar');
    const text=$('activeContextText');
    if (!bar || !text) return;
    const active=state.view === 'conversation' ? activeContextFromConversation() : null;
    bar.hidden=!active;
    text.textContent=active ? `Contexto: ${active.label}` : '';
  }

  async function clearActiveContext() {
    const conversation=currentConversation();
    conversation.contextClearedAt=Date.now();
    await clearRemoteContext(conversation.sessionId);
    await saveState({immediate:true});
    syncActiveContextUi();
    showToast('Contexto limpo; a conversa foi preservada');
  }

  function syncViewUi() {
    const home = state.view === 'home';
    $('homeViewButton')?.classList.toggle('selected', home);
    $('homeViewButton')?.setAttribute('aria-pressed', String(home));
    document.querySelectorAll('[data-assistant-home]').forEach(button => button.classList.toggle('active', home));
  }

  function showHome({ persist = true } = {}) {
    state.view = 'home';
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    if (persist) saveState();
    render();
    requestAnimationFrame(() => { if ($('messageScroll')) $('messageScroll').scrollTop = 0; });
  }

  function showConversation(conversationId = state.currentId, { persist = true, messageId = '' } = {}) {
    const target = state.conversations.find(item => item.id === conversationId) || currentConversation();
    state.currentId = target.id;
    state.conversation = target;
    state.view = target.messages.length ? 'conversation' : 'home';
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    if (persist) saveState();
    render();
    requestAnimationFrame(() => {
      if (messageId) document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' });
      else if (state.view === 'conversation') scrollToBottom(false);
    });
  }

  async function startNewConversation() {
    if (state.sending) return;
    const conversation = freshConversation();
    state.conversations.unshift(conversation);
    state.currentId = conversation.id;
    state.conversation = conversation;
    state.view = 'home';
    state.renderLimit = 80;
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    state.messageFingerprints.clear();
    const input = $('messageInput');
    if (input) input.value = '';
    await persistDraft('', { immediate:true });
    await saveState({ immediate:true });
    render();
    showToast('Nova conversa criada');
    requestAnimationFrame(() => $('messageInput')?.focus({ preventScroll:true }));
  }

  function apiUrl(path) {
    return `${String(CONFIG.apiBaseUrl || '').replace(/\/$/, '')}${path}`;
  }

  function safeText(value) { return String(value || ''); }


  function updateComposerMetrics() {
    const area = composerGuard.area || $('composerArea');
    if (!area?.isConnected) return;
    const height = Math.max(58, Math.ceil(area.getBoundingClientRect().height || area.offsetHeight || 0));
    document.documentElement.style.setProperty('--assistant-composer-height', `${height}px`);
  }

  function ensureComposerAttached() {
    const workspace = composerGuard.workspace || document.querySelector('.assistant-workspace');
    const area = composerGuard.area || $('composerArea');
    if (!workspace || !area) return false;
    composerGuard.workspace = workspace;
    composerGuard.area = area;
    if (!area.isConnected || area.parentElement !== workspace) workspace.append(area);
    updateComposerMetrics();
    return true;
  }

  function bindComposerGuard() {
    composerGuard.workspace = document.querySelector('.assistant-workspace');
    composerGuard.area = $('composerArea');
    ensureComposerAttached();
    if (typeof MutationObserver === 'function' && composerGuard.workspace) {
      composerGuard.observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'childList' && !composerGuard.area?.isConnected)) {
          ensureComposerAttached();
        }
      });
      composerGuard.observer.observe(composerGuard.workspace, { childList: true });
    }
    if (typeof ResizeObserver === 'function' && composerGuard.area) {
      composerGuard.resizeObserver = new ResizeObserver(updateComposerMetrics);
      composerGuard.resizeObserver.observe(composerGuard.area);
    }
  }

  function escapeHtml(value) {
    return safeText(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function renderInline(text) {
    // URLs precisam ser protegidas ANTES do parser de ênfase. Caso contrário,
    // underscores em nomes reais de arquivos (ex.: calendario_2026.pdf) são
    // interpretados como <em> e o endereço exibido/destino fica corrompido.
    const urlLinks = [];
    let rawValue = safeText(text).replace(/https?:\/\/[^\s<]+/g, raw => {
      const clean = raw.replace(/[),.;!?]+$/, '');
      const suffix = raw.slice(clean.length);
      const token = `HUBURLTOKEN${urlLinks.length}END`;
      urlLinks.push(clean);
      return `${token}${suffix}`;
    });

    let value = escapeHtml(rawValue);
    const emailLinks = [];
    value = value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, email => {
      const token = `HUBMAILTOKEN${emailLinks.length}END`;
      emailLinks.push(`<a href="mailto:${email}">${email}</a>`);
      return token;
    });
    value = value
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
    value = value.replace(/HUBURLTOKEN(\d+)END/g, (_, index) => {
      const url = urlLinks[Number(index)] || '';
      if (!url) return '';
      const escaped = escapeHtml(url);
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a>`;
    });
    value = value.replace(/HUBMAILTOKEN(\d+)END/g, (_, index) => emailLinks[Number(index)] || '');
    return value;
  }

  function formatMessage(text) {
    const lines = safeText(text).split(/\r?\n/);
    const out = [];
    let list = [];
    const flush = () => {
      if (!list.length) return;
      out.push(`<ul>${list.join('')}</ul>`);
      list = [];
    };
    for (const line of lines) {
      const bullet = line.match(/^\s*[•*-]\s+(.+)/);
      if (bullet) {
        list.push(`<li>${renderInline(bullet[1])}</li>`);
        continue;
      }
      flush();
      if (!line.trim()) out.push('<div class="message-break" aria-hidden="true"></div>');
      else out.push(`<p>${renderInline(line)}</p>`);
    }
    flush();
    return out.join('');
  }

  function addMessage(role, text, extras = {}) {
    const conversation = currentConversation();
    const message = {
      id: uuid(),
      serverId: String(extras.serverId || ''),
      role,
      text: safeText(text),
      createdAt: Date.now(),
      options: normalizeOptions(extras.options),
      attachment: extras.attachment || null,
      error: Boolean(extras.error),
      feedback: String(extras.feedback || ''),
      feedbackReason: String(extras.feedbackReason || ''),
      copied: Boolean(extras.copied),
      streaming: Boolean(extras.streaming),
      interrupted: Boolean(extras.interrupted),
      interruptedPrompt: String(extras.interruptedPrompt || ''),
      components: Array.isArray(extras.components) ? extras.components : [],
      sources: Array.isArray(extras.sources) ? extras.sources : [],
      context: extras.context && typeof extras.context === 'object' ? extras.context : null,
      ambiguity: extras.ambiguity && typeof extras.ambiguity === 'object' ? extras.ambiguity : null,
      knowledge: extras.knowledge && typeof extras.knowledge === 'object' ? extras.knowledge : null,
      citation: extras.citation && typeof extras.citation === 'object' ? extras.citation : null,
      presentation: extras.presentation && typeof extras.presentation === 'object' ? extras.presentation : null,
      meta: extras.meta && typeof extras.meta === 'object' ? extras.meta : null
    };
    const firstUserMessage = role === 'user' && !conversation.messages.some(item => item.role === 'user');
    conversation.messages.push(message);
    if (firstUserMessage) conversation.title = smartConversationTitle(text);
    conversation.messages = conversation.messages.slice(-Number(CONFIG.maxMessagesPerConversation || 250));
    conversation.updatedAt = Date.now();
    saveState();
    return message;
  }

  function toolbarIcon(name) {
    const common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
    const paths = {
      copy: '<rect x="4" y="4" width="10" height="10" rx="1.5"></rect><rect x="10" y="10" width="10" height="10" rx="1.5"></rect>',
      retry: '<path d="M20 6v5h-5"></path><path d="M19 11a7 7 0 1 0 1.2 5.2"></path>',
      star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3Z"></path>',
      pin: '<path d="M9 3h6l-.8 4 3.3 3.3-3.2 1.2-1.1 6.5-2.4-5.2-4.3-1.3 3.3-3.3L9 3Z"></path><path d="M7.5 19.5 11 16"></path>',
      up: '<path d="M7 10v10H4V10h3Z"></path><path d="M7 18h9.2a2 2 0 0 0 1.9-1.4l1.6-5A2 2 0 0 0 17.8 9H14l.7-3.1A2.3 2.3 0 0 0 12.5 3L7 10v8Z"></path>',
      down: '<path d="M7 14V4H4v10h3Z"></path><path d="M7 6h9.2a2 2 0 0 1 1.9 1.4l1.6 5a2 2 0 0 1-1.9 2.6H14l.7 3.1a2.3 2.3 0 0 1-2.2 2.9L7 14V6Z"></path>',
      document: '<path d="M6 3h8l4 4v14H6V3Z"></path><path d="M14 3v5h5"></path><path d="M9 12h6M9 16h6"></path>'
    };
    return `<svg ${common}>${paths[name] || ''}</svg>`;
  }

  function assistantActions(message) {
    const feedbackLabel = message.copied
      ? 'Resposta copiada'
      : message.feedback === 'helpful'
        ? 'Marcada como útil'
        : message.feedback === 'not-helpful'
          ? (message.feedbackReason || 'Problema registrado')
          : '';
    const copiedClass = message.copied ? 'selected copied' : '';
    const helpfulClass = message.feedback === 'helpful' ? 'selected helpful' : '';
    const negativeClass = message.feedback === 'not-helpful' ? 'selected negative' : '';
    const favoriteClass = isFavoriteMessage(message) ? 'selected favorite' : '';
    const pinnedClass = currentConversation().pinnedMessageId === message.id ? 'selected pinned' : '';
    const feedbackMenu = state.feedbackMenuMessageId === message.id ? `
      <div class="feedback-reasons" role="menu" aria-label="O que deu errado?">
        <strong>O que deu errado?</strong>
        ${[
          ['wrong-information','Informação errada'],
          ['misunderstood','Não entendeu a pergunta'],
          ['wrong-source','Fonte errada'],
          ['confusing','Resposta confusa']
        ].map(([value,label]) => `<button type="button" role="menuitem" data-feedback-reason="${value}" data-message="${escapeHtml(message.id)}">${label}</button>`).join('')}
        <button type="button" role="menuitem" data-correction-message="${escapeHtml(message.id)}">Informar correção</button>
      </div>` : '';
    return `
      <div class="message-toolbar" aria-label="Ações da resposta">
        <button type="button" data-copy-message="${escapeHtml(message.id)}" class="${copiedClass}" title="Copiar resposta" aria-label="Copiar resposta">${toolbarIcon('copy')}</button>
        <button type="button" data-regenerate-message="${escapeHtml(message.id)}" title="Gerar a resposta novamente" aria-label="Tentar novamente">${toolbarIcon('retry')}</button>
        <button type="button" data-favorite-message="${escapeHtml(message.id)}" class="favorite ${favoriteClass}" title="Salvar em Meus favoritos" aria-label="Salvar em Meus favoritos" aria-pressed="${isFavoriteMessage(message)}">${toolbarIcon('star')}</button>
        <button type="button" data-pin-message="${escapeHtml(message.id)}" class="pinned ${pinnedClass}" title="Fixar no topo desta conversa" aria-label="Fixar no topo desta conversa" aria-pressed="${currentConversation().pinnedMessageId === message.id}">${toolbarIcon('pin')}</button>
        <button type="button" data-feedback="helpful" data-message="${escapeHtml(message.id)}" class="${helpfulClass}" title="Resposta útil" aria-label="Resposta útil" aria-pressed="${message.feedback === 'helpful'}">${toolbarIcon('up')}</button>
        <button type="button" data-feedback="not-helpful" data-message="${escapeHtml(message.id)}" class="${negativeClass}" title="Há um problema nesta resposta" aria-label="Há um problema nesta resposta" aria-pressed="${message.feedback === 'not-helpful'}">${toolbarIcon('down')}</button>
        ${message.error ? `<button type="button" data-retry-message="${escapeHtml(message.id)}">Tentar novamente</button>` : ''}
        ${feedbackLabel ? `<span class="message-action-status">${escapeHtml(feedbackLabel)}</span>` : ''}
      </div>${feedbackMenu}`;
  }

  function showToast(text, { duration = 2200 } = {}) {
    const toast = $('actionToast');
    if (!toast) return;
    clearTimeout(state.toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, Math.max(800, Number(duration || 2200)));
  }

  function closeAssistantDialog(result = null) {
    const overlay = $('assistantDialog');
    const pending = state.dialogState;
    state.dialogState = null;
    if (overlay) overlay.hidden = true;
    pending?.resolve?.(result);
  }

  function openAssistantDialog({ title = 'Confirmar', message = '', input = false, value = '', placeholder = '', confirmLabel = 'Confirmar' } = {}) {
    if (state.dialogState) closeAssistantDialog(null);
    const overlay = $('assistantDialog');
    const titleEl = $('assistantDialogTitle');
    const messageEl = $('assistantDialogMessage');
    const inputEl = $('assistantDialogInput');
    const confirm = $('assistantDialogConfirm');
    if (!overlay || !titleEl || !messageEl || !inputEl || !confirm) return Promise.resolve(null);
    titleEl.textContent = title;
    messageEl.textContent = message;
    inputEl.hidden = !input;
    inputEl.value = input ? String(value || '').slice(0,280) : '';
    inputEl.placeholder = placeholder;
    confirm.textContent = confirmLabel;
    overlay.hidden = false;
    return new Promise(resolve => {
      state.dialogState = { resolve, input };
      requestAnimationFrame(() => (input ? inputEl : confirm)?.focus());
    });
  }

  async function confirmAssistantAction(options = {}) {
    return Boolean(await openAssistantDialog({ ...options, input:false }));
  }

  async function askAssistantText(options = {}) {
    const result = await openAssistantDialog({ ...options, input:true });
    return typeof result === 'string' ? result.trim() : '';
  }

  function safeExternalUrl(value = '') {
    const resolved = window.HUB_URLS?.resolve?.(value, { root:window.HUB_URLS.root });
    if (resolved) return resolved;
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function isAssistantSelfUrl(value = '') {
    const href = safeExternalUrl(value);
    return Boolean(href && (window.HUB_URLS?.sameDocument?.(href, location.href) || (() => {
      try { const current = new URL(location.href); const candidate = new URL(href); return candidate.origin === current.origin && candidate.pathname === current.pathname; }
      catch { return false; }
    })()));
  }

  function actionHtml(action = {}) {
    const label = escapeHtml(action.label || action.title || 'Abrir');
    const icon = escapeHtml(action.icon || '↗');
    if (action.kind === 'open-url' && action.url) {
      const href = safeExternalUrl(action.url);
      return href ? `<a class="hub-action-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${icon} ${label}</a>` : '';
    }
    const value = action.value || action.message || '';
    return value ? `<button type="button" data-option-value="${escapeHtml(value)}">${icon} ${label}</button>` : '';
  }

  function renderComponents(message) {
    const components = Array.isArray(message.components) ? message.components.filter(Boolean) : [];
    if (!components.length) return '';
    const rendered = components.map(component => {
      const type = escapeHtml(component.type || 'information');
      if (component.type === 'hub-actions') {
        const actions = (Array.isArray(component.actions) ? component.actions : []).map(actionHtml).filter(Boolean).join('');
        return actions ? `<section class="structured-card hub-actions-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Abrir no HUB')}</strong><div class="hub-action-grid">${actions}</div></section>` : '';
      }
      if (component.type === 'hub-results') {
        const items = (Array.isArray(component.items) ? component.items : []).map(item => {
          const href = safeExternalUrl(item.url || '');
          if (!href) return '';
          return `<a class="hub-result-row" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span>${item.kind === 'app' ? '↗' : '🔗'} ${escapeHtml(item.title || 'Recurso')}</span>${item.summary ? `<small>${escapeHtml(item.summary)}</small>` : ''}</a>`;
        }).filter(Boolean).join('');
        return items ? `<section class="structured-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Encontrado no HUB')}</strong>${items}</section>` : '';
      }
      if (component.type === 'document') {
        const candidateSources = Array.isArray(message.sources) ? message.sources : [];
        const matchingSource = candidateSources.find(source => {
          if (!source) return false;
          if (component.docId && source.docId && component.docId === source.docId) return true;
          return String(source.title || '').trim() === String(component.title || '').trim() && Number(source.page || 0) === Number(component.page || 0);
        }) || candidateSources[0] || null;
        const href = sourceHref({ ...(matchingSource || {}), ...component, url:component.url || matchingSource?.url || '', pdfUrl:component.pdfUrl || matchingSource?.pdfUrl || '' });
        return `<section class="structured-card document-card" data-component="${type}"><div class="document-card-body"><span class="document-card-label">Documento</span><strong class="document-card-title">${escapeHtml(component.title || matchingSource?.title || 'Documento')}</strong>${component.heading ? `<span class="document-card-heading">${escapeHtml(component.heading)}</span>` : ''}${component.page ? `<small class="document-card-page">Página ${escapeHtml(component.page)}</small>` : ''}</div>${href ? `<div class="document-card-actions"><a class="inline-open-button" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir PDF</a></div>` : ''}</section>`;
      }
      if (component.type === 'composite-summary' || component.type === 'summary') {
        const rows = (Array.isArray(component.rows) ? component.rows : []).map(row => `<li>${escapeHtml(row)}</li>`).join('');
        return `<section class="structured-card summary-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Resumo')}</strong>${component.professor ? `<span><b>Professor:</b> ${escapeHtml(component.professor)}</span>` : ''}${component.room ? `<span><b>Sala:</b> ${escapeHtml(component.room)}</span>` : ''}${component.date ? `<span><b>Data:</b> ${escapeHtml(component.date)}</span>` : ''}${rows ? `<ul class="summary-list">${rows}</ul>` : ''}</section>`;
      }
      return '';
    }).filter(Boolean);
    return rendered.length ? `<div class="structured-components">${rendered.join('')}</div>` : '';
  }

  function pdfFileFromSource(source = {}) {
    return window.HUB_URLS?.pdfFrom?.(source.pdfUrl || source.url || '', { root:window.HUB_URLS.root }) || (() => {
      try {
        const viewer = new URL(String(source.url || source.pdfUrl || ''), location.href);
        const raw = viewer.searchParams.get('file') || source.pdfUrl || (viewer.pathname.toLowerCase().endsWith('.pdf') ? viewer.href : '');
        if (!raw) return '';
        const pdf = new URL(raw, location.href);
        return ['http:', 'https:'].includes(pdf.protocol) && pdf.pathname.toLowerCase().endsWith('.pdf') ? pdf.href : '';
      } catch { return ''; }
    })();
  }

  function sourceHref(source = {}) {
    const candidates = [source.url, source.pdfUrl].map(value => String(value || '').trim()).filter(Boolean);
    let raw = '';
    for (const candidate of candidates) {
      const href = safeExternalUrl(candidate);
      if (!href || isAssistantSelfUrl(href)) continue;
      raw = href;
      break;
    }
    if (!raw) return '';
    const page = Number(source.page || 0);
    if (!page) return raw;
    if (window.HUB_URLS?.withPage) return window.HUB_URLS.withPage(raw, page, { root:window.HUB_URLS.root });
    try {
      const url = new URL(raw, location.href);
      if (url.pathname.toLowerCase().endsWith('.pdf')) url.hash = `page=${page}`;
      else if (/document-viewer\.html$/iu.test(url.pathname)) url.searchParams.set('page', String(page));
      return url.href;
    } catch { return raw; }
  }

  function uniqueSources(sources = []) {
    const seen = new Set();
    const unique = [];
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!source) continue;
      const href = sourceHref(source);
      const title = String(source.title || 'Documento').trim();
      const page = Number(source.page || 0);
      const key = `${href || ''}|${title.toLocaleLowerCase('pt-BR')}|${page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(source);
    }
    return unique;
  }

  function renderSources(message) {
    let sources = uniqueSources(Array.isArray(message.sources) ? message.sources.filter(Boolean) : []);
    if (!sources.length && message.knowledge?.source?.title) {
      const source = message.knowledge.source;
      sources = [{
        title:source.title, page:Number(source.page || 1), url:source.url || '', pdfUrl:source.url || '',
        status:source.status || '', verification:{ verified:Boolean(source.verified) }
      }];
    }
    sources = uniqueSources(sources);
    if (!sources.length) return '';
    const rows = sources.slice(0, 3).map(source => {
      const href = sourceHref(source);
      const verified = Boolean(source.verification?.verified || (message.citation?.verified && source === sources[0]) || message.knowledge?.source?.verified);
      const label = `${verified ? '✓ Fonte verificada' : 'Fonte'} · ${escapeHtml(source.title || 'Documento')}${source.page ? ` · pág. ${escapeHtml(source.page)}` : ''}`;
      return href
        ? `<a class="integrated-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span>${label}</span></a>`
        : `<span class="integrated-source"><span>${label}</span></span>`;
    }).join('');
    const first = sources[0];
    const pdf = pdfFileFromSource(first);
    const page = Number(first.page || 0);
    const openHref = sourceHref(first) || pdf;
    const attachmentName = String(message.attachment?.fileName || message.attachment?.url || '');
    const hasImageAttachment = Boolean(message.attachment && (
      message.attachment.kind === 'image' || message.attachment.kind === 'gif' ||
      /^image\//iu.test(message.attachment.mime || '') || /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/iu.test(attachmentName)
    ));
    let embeddedPreview = '';
    if (pdf && page && !hasImageAttachment) {
      try {
        const pdfUrl = new URL(pdf, location.href);
        if (pdfUrl.origin === location.origin) {
          embeddedPreview = `<a class="pdf-page-preview" href="${escapeHtml(openHref)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHtml(first.title || 'documento')} na página ${escapeHtml(page)}"><iframe src="${escapeHtml(`${pdfUrl.href}#page=${page}&view=FitH&toolbar=0&navpanes=0`)}" loading="lazy" title="Prévia da página ${escapeHtml(page)}" tabindex="-1"></iframe><span>Prévia · página ${escapeHtml(page)}</span></a>`;
        } else if (openHref) {
          embeddedPreview = `<a class="pdf-preview-fallback" href="${escapeHtml(openHref)}" target="_blank" rel="noopener noreferrer"><span class="pdf-preview-fallback-icon" aria-hidden="true">${toolbarIcon('document')}</span><span><strong>Abrir página ${escapeHtml(page)}</strong><small>Este PDF é externo ao HUB e não permite prévia embutida confiável.</small></span></a>`;
        }
      } catch {}
    }
    const knowledge = message.knowledge || {};
    const sourceMeta = knowledge.source || first || {};
    const details = [];
    if (knowledge.validity && knowledge.validity !== 'não informada') details.push(`<span><strong>Validade:</strong> ${escapeHtml(knowledge.validity)}</span>`);
    if (sourceMeta.status) details.push(`<span><strong>Status:</strong> ${escapeHtml(sourceMeta.status)}</span>`);
    if (knowledge.lastReviewedAt) details.push(`<span><strong>Revisado:</strong> ${escapeHtml(knowledge.lastReviewedAt)}${knowledge.responsible ? ` · ${escapeHtml(knowledge.responsible)}` : ''}</span>`);
    if (knowledge.warning) details.push(`<span class="freshness-warning">${escapeHtml(knowledge.warning)}</span>`);
    if (knowledge.conflictNotice) details.push(`<span>${escapeHtml(knowledge.conflictNotice)}</span>`);
    const detailsHtml = details.length ? `<details class="source-details"><summary>Detalhes da fonte</summary><div class="source-details-body">${details.join('')}</div></details>` : '';
    return `<section class="integrated-sources"><div class="source-list">${rows}</div>${detailsHtml}${embeddedPreview}</section>`;
  }

  function renderContext(message) {
    const context = message.context;
    if (!context?.usedPrior) return '';
    const label = context.discipline || context.lastDiscipline || context.professor || context.lastProfessor || context.title || context.summary || '';
    return label ? `<div class="context-chip">↳ sobre ${escapeHtml(label)}</div>` : '';
  }

  function renderAmbiguity(message) {
    const item = message.ambiguity;
    if (!item) return '';
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    return `<section class="ambiguity-card"><strong>${escapeHtml(item.title || 'Encontrei mais de uma possibilidade.')}</strong><p>${escapeHtml(item.explanation || '')}</p>${candidates.length ? `<ol>${candidates.map(candidate => `<li>${escapeHtml(candidate.label)}</li>`).join('')}</ol>` : ''}</section>`;
  }

  function renderKnowledge(message) {
    // Metadados de fonte ficam consolidados em renderSources(). Este bloco só
    // aparece quando existe um aviso sem nenhuma fonte renderizável.
    if (uniqueSources(message.sources || []).length || message.knowledge?.source?.title) return '';
    const item = message.knowledge;
    if (!item) return '';
    const rows = [];
    if (item.warning) rows.push(`<span class="freshness-warning">${escapeHtml(item.warning)}</span>`);
    if (item.conflictNotice) rows.push(`<span>${escapeHtml(item.conflictNotice)}</span>`);
    return rows.length ? `<section class="knowledge-meta knowledge-warning">${rows.join('')}</section>` : '';
  }

  function renderMessageBody(message) {
    const presentation = message.presentation;
    if (!presentation?.progressive) return formatMessage(message.text);
    const hasIntegratedSource = uniqueSources(message.sources || []).length > 0 || Boolean(message.knowledge?.source?.title);
    const sourceDetails = !hasIntegratedSource && presentation.source
      ? `<details><summary>Fonte</summary><div class="progressive-source">${formatMessage(presentation.source)}</div></details>`
      : '';
    return `<section class="progressive-answer"><div class="progressive-summary">${formatMessage(presentation.summary || message.text)}</div>${presentation.details ? `<details><summary>Detalhes</summary><div class="progressive-details">${formatMessage(presentation.details)}</div></details>` : ''}${sourceDetails}</section>`;
  }

  function renderInterrupted(message) {
    if (!message.interrupted) return '';
    return `<section class="interrupted-state"><strong>Resposta interrompida</strong><span>A conexão ou a geração terminou antes da resposta ser concluída.</span><div class="interrupted-actions"><button type="button" data-continue-interrupted="${escapeHtml(message.id)}">Continuar resposta</button><button type="button" data-retry-message="${escapeHtml(message.id)}">Tentar novamente</button></div></section>`;
  }

  function patchStreamingMessage(message) {
    const article = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (!article) { renderMessages(); return; }
    const body = article.querySelector('[data-assistant-text]');
    if (body) body.innerHTML = renderMessageBody(message);
    article.classList.toggle('streaming-message', Boolean(message.streaming));
    let caret = article.querySelector('.stream-caret');
    if (message.streaming && !caret) {
      caret = document.createElement('span'); caret.className='stream-caret'; caret.setAttribute('aria-hidden','true');
      body?.insertAdjacentElement('afterend', caret);
    } else if (!message.streaming && caret) caret.remove();
    if (isNearBottom()) scrollToBottom(false);
  }

  function isNearBottom(viewport = $('messageScroll'), threshold = 120) {
    if (!viewport) return true;
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= threshold;
  }

  function scrollToBottom(smooth = true) {
    const viewport = $('messageScroll');
    if (!viewport) return;
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    try {
      viewport.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    } catch { viewport.scrollTop = top; }
  }

  function messageFingerprint(message) {
    return JSON.stringify([
      message.role, message.text, message.error, message.feedback, message.feedbackReason, message.copied, message.streaming, message.interrupted, message.interruptedPrompt,
      message.attachment, message.options, message.components, message.sources, message.context, message.ambiguity,
      message.knowledge, message.citation, message.presentation, message.meta, state.editingMessageId, state.feedbackMenuMessageId,
      currentConversation().pinnedMessageId, state.favorites.map(item => item.messageId || item.serverId || '').join('|')
    ]);
  }

  function messageHtml(message) {
    if (message.role === 'user') {
      if (state.editingMessageId === message.id) {
        return `<article class="message-row user editing" data-message-id="${escapeHtml(message.id)}"><div class="message-content user-edit-card"><textarea data-edit-input="${escapeHtml(message.id)}" maxlength="3000">${escapeHtml(message.text)}</textarea><div class="user-edit-actions"><button type="button" data-edit-cancel="${escapeHtml(message.id)}">Cancelar</button><button type="button" data-edit-save="${escapeHtml(message.id)}">Salvar e reenviar</button></div></div></article>`;
      }
      return `<article class="message-row user" data-message-id="${escapeHtml(message.id)}"><div class="message-content">${escapeHtml(message.text)}<div class="user-message-toolbar"><button type="button" data-edit-message="${escapeHtml(message.id)}" title="Editar pergunta" aria-label="Editar pergunta">✏ Editar</button></div></div></article>`;
    }
    const attachmentUrl = message.attachment ? safeExternalUrl(message.attachment.url) : '';
    const attachmentName = String(message.attachment?.fileName || message.attachment?.url || '');
    const attachmentIsImage = Boolean(message.attachment && (
      message.attachment.kind === 'image' ||
      message.attachment.kind === 'gif' ||
      /^image\//i.test(message.attachment.mime || '') ||
      /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(attachmentName)
    ));
    const attachment = message.attachment && attachmentUrl
      ? (attachmentIsImage
          ? `<figure class="attachment-preview"><a href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(attachmentUrl)}" alt="${escapeHtml(message.attachment.fileName || 'Imagem anexada à resposta')}" loading="eager"></a></figure>`
          : `<a class="attachment-link" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(message.attachment.fileName || 'Abrir anexo')}</a>`)
      : '';
    const options = message.options?.length
      ? `<div class="message-actions">${message.options.map(option => `<button type="button" class="${option.kind === 'exit' ? 'exit-option' : ''}" data-option-kind="${escapeHtml(option.kind)}" data-option-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}</div>`
      : '';
    const streamingClass = message.streaming ? ' streaming-message' : '';
    return `<article class="message-row assistant${streamingClass}" data-message-id="${escapeHtml(message.id)}"><div class="assistant-avatar" aria-hidden="true">🤖</div><div class="message-content ${message.error ? 'error-card' : ''}">${attachment}${renderContext(message)}<div class="assistant-response-text" data-assistant-text>${renderMessageBody(message)}</div>${message.streaming ? '<span class="stream-caret" aria-hidden="true"></span>' : ''}${renderInterrupted(message)}${renderAmbiguity(message)}${renderComponents(message)}${renderSources(message)}${renderKnowledge(message)}${options}${assistantActions(message)}</div></article>`;
  }

  function createNodeFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function renderMessages() {
    ensureComposerAttached();
    const conversation = currentConversation();
    const container = $('messages');
    const viewport = $('messageScroll');
    const keepBottom = isNearBottom(viewport);
    const home = state.view === 'home';
    $('welcome').hidden = !home;
    container.hidden = home;
    renderFavoritesHome();
    renderPopularQuestions();
    renderHomeConversationPanels();
    renderPinnedAnswer();
    syncViewUi();
    syncActiveContextUi();

    const visible = conversation.messages.slice(-state.renderLimit);
    const visibleIds = new Set(visible.map(message => message.id));
    container.querySelectorAll('[data-message-id]').forEach(node => {
      if (!visibleIds.has(node.dataset.messageId)) {
        state.messageFingerprints.delete(node.dataset.messageId);
        node.remove();
      }
    });

    let loadEarlier = container.querySelector('[data-load-earlier]');
    const hiddenCount = Math.max(0, conversation.messages.length - visible.length);
    if (hiddenCount > 0) {
      if (!loadEarlier) {
        loadEarlier = document.createElement('button');
        loadEarlier.type = 'button';
        loadEarlier.className = 'load-earlier-messages';
        loadEarlier.dataset.loadEarlier = 'true';
        container.prepend(loadEarlier);
      }
      loadEarlier.textContent = `Mostrar ${Math.min(80, hiddenCount)} mensagem(ns) anterior(es)`;
    } else if (loadEarlier) loadEarlier.remove();

    const typing = container.querySelector('[data-typing="true"]');
    for (const message of visible) {
      const fingerprint = messageFingerprint(message);
      let node = container.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
      if (!node) {
        node = createNodeFromHtml(messageHtml(message));
      } else if (state.messageFingerprints.get(message.id) !== fingerprint) {
        const replacement = createNodeFromHtml(messageHtml(message));
        node.replaceWith(replacement);
        node = replacement;
      }
      state.messageFingerprints.set(message.id, fingerprint);
      container.insertBefore(node, typing || null);
    }

    if (state.sending) showTyping();
    else hideTyping();
    requestAnimationFrame(() => {
      ensureComposerAttached();
      if (keepBottom) scrollToBottom(false);
    });
  }

  function render() {
    ensureComposerAttached();
    syncAnonymousModeUi();
    ensureAssistantSidebarNav();
    renderMessages();
    syncSendingUi();
    ensureComposerAttached();
  }

  function hideTyping() {
    document.querySelectorAll('[data-typing="true"]').forEach(element => element.remove());
    $('messageScroll')?.setAttribute('aria-busy', 'false');
  }

  function syncSendingUi() {
    state.sending = Boolean(state.activeRequest);
    const input = $('messageInput');
    const sendButton = $('sendMessage');
    if (!state.sending) hideTyping();
    if (input && sendButton) {
      const hasDraft = Boolean(input.value.trim());
      const stopping = state.sending && !hasDraft;
      const replacing = state.sending && hasDraft;
      sendButton.disabled = !state.sending && !hasDraft;
      sendButton.dataset.mode = replacing ? 'replace' : (stopping ? 'stop' : 'send');
      sendButton.setAttribute('aria-busy', state.sending ? 'true' : 'false');
      sendButton.setAttribute('aria-label', replacing ? 'Interromper e enviar nova mensagem' : (stopping ? 'Interromper resposta' : 'Enviar mensagem'));
      sendButton.title = replacing ? 'Interromper resposta atual e enviar' : (stopping ? 'Interromper resposta' : 'Enviar');
      const icon = sendButton.querySelector('[aria-hidden="true"]');
      if (icon) icon.textContent = stopping ? '■' : '↑';
    }
    $('messageScroll')?.setAttribute('aria-busy', state.sending ? 'true' : 'false');
    const hint = $('composerHint');
    if (hint) hint.textContent = state.sending
      ? 'Digite outra pergunta e envie para substituir a resposta atual, ou deixe o campo vazio e use ■ para interromper.'
      : 'Enter envia · Shift + Enter quebra a linha';
    document.querySelectorAll('[data-prompt], [data-option-value]').forEach(button => { button.disabled = state.sending; });
    ensureComposerAttached();
  }

  function showTyping() {
    if (!state.activeRequest || document.querySelector('[data-typing="true"]')) return;
    $('messages').append($('typingTemplate').content.cloneNode(true));
    $('messageScroll')?.setAttribute('aria-busy', 'true');
    if (isNearBottom()) scrollToBottom(false);
  }

  function beginMessageRequest(timeoutMs = Number(CONFIG.requestTimeoutMs || 25000)) {
    abortMessageRequest('superseded');
    const id = ++state.requestSerial;
    const controller = new AbortController();
    const active = { id, controller, reason: '', timer: 0 };
    active.timer = setTimeout(() => {
      if (state.activeRequest?.id !== id) return;
      active.reason = 'timeout';
      controller.abort('timeout');
    }, Math.max(1000, Number(timeoutMs || 25000)));
    state.activeRequest = active;
    syncSendingUi();
    showTyping();
    return active;
  }

  function finishMessageRequest(id) {
    const active = state.activeRequest;
    if (!active || active.id !== id) return false;
    clearTimeout(active.timer);
    state.activeRequest = null;
    syncSendingUi();
    return true;
  }

  function abortMessageRequest(reason = 'cancelled') {
    const active = state.activeRequest;
    if (!active) return false;
    active.reason = reason;
    clearTimeout(active.timer);
    try { active.controller.abort(reason); } catch {}
    state.activeRequest = null;
    syncSendingUi();
    return true;
  }

  function setConnection(status, label) {
    state.offline = status !== 'online';
    const banner = $('offlineBanner');
    if (banner) {
      banner.hidden = status === 'online' || status === 'checking';
      if (status === 'degraded') banner.textContent = '⚠️ O Assistente está temporariamente indisponível, mas documentos e ferramentas do HUB continuam funcionando.';
      else if (status === 'offline') banner.textContent = '📴 Você está offline. Ainda consigo responder consultas acadêmicas essenciais e abrir conteúdo salvo localmente no HUB.';
    }
    const element = $('connectionState');
    if (!element) return;
    element.dataset.state = status;
    const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${label}`;
    else element.append(document.createTextNode(` ${label}`));
  }

  async function request(path, payload, options = {}) {
    if (!CONFIG.apiBaseUrl) throw new Error('A API do Assistente não está configurada nesta versão.');
    const normalized = typeof options === 'number' ? { timeoutMs: options } : (options || {});
    const timeoutMs = Number(normalized.timeoutMs || CONFIG.requestTimeoutMs || 25000);
    const ownController = normalized.signal ? null : new AbortController();
    const signal = normalized.signal || ownController.signal;
    const timer = ownController ? setTimeout(() => ownController.abort('timeout'), timeoutMs) : 0;
    try {
      const response = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(telemetryPayload(payload)),
        signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
      return data;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function requestStream(path, payload, { signal, onEnvelope, onReplyStart, onDelta, onReplyEnd } = {}) {
    if (!CONFIG.apiBaseUrl) throw new Error('A API do Assistente não está configurada nesta versão.');
    const response = await fetch(apiUrl(path), {
      method:'POST',
      headers:{ 'content-type':'application/json', 'accept':'application/x-ndjson, application/json' },
      body:JSON.stringify(telemetryPayload(payload)),
      signal
    });
    const contentType = String(response.headers.get('content-type') || '');
    if (!response.ok) {
      const errorPayload = /json/iu.test(contentType) ? await response.json().catch(() => ({})) : {};
      throw new Error(errorPayload.error || `Erro HTTP ${response.status}`);
    }
    if (!/application\/x-ndjson/iu.test(contentType) || !response.body?.getReader) {
      return { streamed:false, data:await response.json() };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let envelope = null;
    const consume = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'envelope') { envelope = event.payload || {}; onEnvelope?.(envelope); }
      else if (event.type === 'reply-start') onReplyStart?.(event.reply || {});
      else if (event.type === 'reply-delta') onDelta?.(String(event.id || ''), String(event.delta || ''));
      else if (event.type === 'reply-end') onReplyEnd?.(String(event.id || ''));
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream:!done });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); consume(line);
        newline = buffer.indexOf('\n');
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    return { streamed:true, data:envelope || {} };
  }

  async function checkHealth() {
    if (!CONFIG.apiBaseUrl) {
      setConnection('offline', 'API não configurada');
      return false;
    }
    if (location.protocol === 'https:' && String(CONFIG.apiBaseUrl).startsWith('http:')) {
      setConnection('offline', 'API HTTP bloqueada em página HTTPS');
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(apiUrl(CONFIG.healthPath || '/health'), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error();
      setConnection('online', 'Conectado');
      return true;
    } catch {
      if (navigator.onLine === false) setConnection('offline', 'Modo offline disponível');
      else setConnection('degraded', 'Assistente indisponível');
      return false;
    } finally { clearTimeout(timer); }
  }

  async function loadOfflineCatalog() {
    try {
      const response = await fetch(CONFIG.offlineCatalogPath || 'offline-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      state.offlineCatalog = data && typeof data === 'object' ? data : null;
    } catch { state.offlineCatalog = null; }
  }

  async function loadOfflineAcademic() {
    try {
      const response = await fetch(CONFIG.offlineAcademicPath || 'offline-academic.json', { cache:'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      state.offlineAcademic = data && typeof data === 'object' ? data : null;
    } catch { state.offlineAcademic = null; }
  }

  function normalizeOffline(value = '') {
    return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\btranacamento\b/g,'trancamento').replace(/\btrancamneto\b/g,'trancamento')
      .replace(/\bmatricual\b/g,'matricula').replace(/\bmatriucula\b/g,'matricula')
      .replace(/\bcauculo\b/g,'calculo').replace(/\bcrecencio\b/g,'crescencio')
      .replace(/\bcaledario\b/g,'calendario').replace(/\bfluxogama\b/g,'fluxograma')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function containsNormalizedPhrase(query, phrase) {
    const clean = normalizeOffline(phrase);
    if (!clean) return false;
    return (` ${query} `).includes(` ${clean} `);
  }

  function localProfessorFor(query) {
    const data = state.offlineAcademic;
    if (!data) return null;
    let best = null;
    for (const professor of data.professors || []) {
      const aliases = [professor.identifier, professor.name, ...(data.professorAliases?.[professor.name] || [])]
        .map(normalizeOffline).filter(Boolean).sort((a,b) => b.length-a.length);
      const matched = aliases.find(alias => containsNormalizedPhrase(query, alias));
      if (matched && (!best || matched.length > best.alias.length)) best = { professor, alias:matched };
    }
    return best?.professor || null;
  }

  function localDisciplineFor(query) {
    const data = state.offlineAcademic;
    if (!data) return null;
    let best = null;
    const aliasesMap = data.disciplineAliases || {};
    for (const discipline of Object.keys(aliasesMap)) {
      const aliases = [discipline, data.disciplineCodes?.[discipline], ...(aliasesMap[discipline] || [])]
        .map(normalizeOffline).filter(Boolean).sort((a,b) => b.length-a.length);
      const matched = aliases.find(alias => containsNormalizedPhrase(query, alias));
      if (matched && (!best || matched.length > best.alias.length)) best = { discipline, alias:matched };
    }
    return best?.discipline || null;
  }

  function localSemesterFor(query) {
    const direct = query.match(/(?:semestre\s*)?(\d)\s*(?:o|º)?(?:\s*semestre)?\b/u);
    if (direct && Number(direct[1]) >= 1 && Number(direct[1]) <= 8) return Number(direct[1]);
    const words = { primeiro:1, segundo:2, terceiro:3, quarto:4, quinto:5, sexto:6, setimo:7, oitavo:8, i:1, ii:2, iii:3, iv:4, v:5, vi:6, vii:7, viii:8 };
    for (const [word, number] of Object.entries(words)) if (containsNormalizedPhrase(query, `${word} semestre`) || containsNormalizedPhrase(query, `semestre ${word}`)) return number;
    return 0;
  }

  function localDayFor(query) {
    const days = [['segunda','segunda-feira'],['terca','terça-feira'],['quarta','quarta-feira'],['quinta','quinta-feira'],['sexta','sexta-feira'],['sabado','sábado'],['domingo','domingo']];
    const explicit = days.find(([key]) => containsNormalizedPhrase(query, key) || containsNormalizedPhrase(query, `${key} feira`))?.[1] || '';
    if (explicit) return explicit;
    const offset = containsNormalizedPhrase(query, 'amanha') ? 1 : containsNormalizedPhrase(query, 'hoje') ? 0 : null;
    if (offset === null) return '';
    try {
      const target = new Date(Date.now() + offset * 86400000);
      const weekday = normalizeOffline(new Intl.DateTimeFormat('pt-BR', { weekday:'long', timeZone:'America/Bahia' }).format(target));
      return days.find(([key]) => weekday.startsWith(key))?.[1] || '';
    } catch { return ''; }
  }

  function formatLocalScheduleRows(rows = []) {
    return rows.map(row => `• *${row.discipline}* — ${row.day}, ${row.hours}\n  Professor: ${row.professor}\n  Sala: *${row.room || 'não informada'}*`).join('\n\n');
  }

  function localSourceKnowledge({ title = '', url = '', verifiedAt = '', status = 'vigente' } = {}) {
    if (!title) return null;
    return { source:{ title, url, verified:true, status }, lastReviewedAt:verifiedAt || state.offlineAcademic?.updatedAt || '', validity:'vigente' };
  }

  function localAcademicAnswer(text, { allowShortcuts = true } = {}) {
    const data = state.offlineAcademic;
    if (!data) return null;
    const query = normalizeOffline(text);
    if (!query || query.length > 220 || /\b(?:compare|analise|explique por que|opiniao|interprete|resuma detalhadamente)\b/u.test(query)) return null;
    const has = (...terms) => terms.some(term => containsNormalizedPhrase(query, term));
    const localAction = (title, url, label = 'Abrir') => ({ type:'hub-actions', title, actions:[{ id:`local-${normalizeOffline(title).replace(/\s+/g,'-')}`, label, kind:'open-url', url }] });

    if (allowShortcuts && has('auxilio','auxilios','assistencia estudantil','paae')) {
      const a = data.assistance || {};
      return { text:a.text || 'Consulte o PAAE e o Serviço Social do campus.', components:a.sourceUrl ? [localAction('Assistência estudantil', a.sourceUrl, 'Abrir página oficial')] : [], knowledge:localSourceKnowledge({title:a.sourceTitle,url:a.sourceUrl,verifiedAt:a.verifiedAt}), context:{kind:'student-assistance',title:'Auxílios estudantis'}, titleHint:'Auxílios estudantis', sync:true, subject:'Auxílios estudantis' };
    }
    if (allowShortcuts && has('suap')) {
      const item=data.shortcuts?.suap || {};
      const suapUrl=String(item.url || '').trim();
      return { text:'O SUAP é o sistema acadêmico do IFBA. Você pode abrir o portal diretamente pelo botão abaixo.', components:suapUrl ? [localAction('SUAP', suapUrl, 'Abrir SUAP')] : [], context:{kind:'app',title:'SUAP'}, titleHint:'SUAP', sync:true, subject:'SUAP' };
    }
    if (allowShortcuts && has('barema')) {
      const item=data.shortcuts?.barema || {};
      const baremaUrl=String(item.url || '').trim();
      const officialUrl=String(item.officialUrl || '').trim();
      const spreadsheetUrl=String(item.officialSpreadsheetUrl || '').trim();
      const components=[];
      if (baremaUrl) components.push(localAction('Barema de Atividades Complementares', baremaUrl, 'Abrir Barema'));
      if (spreadsheetUrl) components.push(localAction('Planilha oficial do Barema', spreadsheetUrl, 'Abrir planilha oficial'));
      else if (officialUrl) components.push(localAction('Regulamento oficial de Atividades Complementares', officialUrl, 'Abrir regulamento oficial'));
      const text=spreadsheetUrl
        ? 'Você pode abrir o app do Barema no HUB e também a planilha oficial.'
        : 'Você pode abrir o app do Barema no HUB. A URL de uma planilha oficial separada ainda não está cadastrada neste pacote; por isso, o Assistente mostra o regulamento oficial da matriz atual em vez de inventar um link.';
      return { text, components, context:{kind:'document',title:'Barema'}, titleHint:'Barema de atividades complementares', sync:true, subject:'Barema' };
    }
    if (allowShortcuts && (has('ppc') || has('projeto pedagogico'))) {
      const matches=findOfflineItems('PPC BSI',3).filter(item=>item.kind==='document');
      const first=matches[0];
      if (first) return { text:`Encontrei *${first.title}* no conteúdo local do HUB.`, components:[{type:'document',title:first.title,url:first.url,page:Number(first.page||0),heading:first.summary||''}], context:{kind:'document',title:first.title}, titleHint:'PPC do BSI', sync:true, subject:`Documento — ${first.title}` };
    }
    if (allowShortcuts && has('calendario','calendário')) {
      const item=data.shortcuts?.calendar || {};
      const pdfUrl=String(item.pdfUrl || '').trim();
      const appUrl=String(item.url || '').trim();
      const sourceTitle=String(item.sourceTitle || 'Calendário Acadêmico IFBA VCA 2026').trim();
      const source=pdfUrl ? { title:sourceTitle, page:1, url:pdfUrl, pdfUrl, status:'vigente', verification:{verified:true} } : null;
      const components=[];
      if (source) components.push({type:'document',docId:'canonical-calendar',title:source.title,url:pdfUrl,pdfUrl,page:1,heading:'Calendário acadêmico 2026'});
      if (appUrl) components.push(localAction('Calendário Acadêmico', appUrl, 'Abrir Calendário'));
      return {
        text:`📅 *Calendário acadêmico*

O calendário de 2026 está disponível no conteúdo local do HUB. Você pode abrir o PDF oficial ou usar o app de calendário para procurar datas específicas.`,
        attachment:{ kind:'image', mime:'image/png', mimeType:'image/png', fileName:'calendario-academico-2026.png', url:'assets/calendario-academico-2026.png' },
        components,
        sources:source ? [source] : [], knowledge:source ? localSourceKnowledge({title:source.title,url:pdfUrl,verifiedAt:item.verifiedAt || data.updatedAt}) : null,
        context:{kind:'calendar',title:'Calendário Acadêmico'}, titleHint:'Calendário acadêmico', sync:true, subject:'Calendário acadêmico'
      };
    }

    let professor=localProfessorFor(query);
    let discipline=localDisciplineFor(query);
    let semester=localSemesterFor(query);
    const day=localDayFor(query);
    const wantsRoom=has('sala','onde fica','localizacao','localização');
    const wantsSchedule=has('horario','horarios','aula','aulas','dias');
    const wantsProfessor=has('professor','professora','quem da','quem ensina');
    const wantsContact=has('email','e mail','contato');
    const localFollowup = query.length <= 80 && /^(?:e\s+)?(?:(?:qual|quais)\s+)?(?:a\s+|o\s+|os\s+|as\s+)?(?:sala|salas|horario|horarios|professor|professora|email|contato|hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u.test(query);
    if (localFollowup && !professor && !discipline && !semester) {
      const active=activeContextFromConversation()?.context || {};
      const activeProfessor=String(active.professor || active.lastProfessor || '').trim();
      const activeDiscipline=String(active.discipline || active.lastDiscipline || '').trim();
      if (activeProfessor) professor=(data.professors || []).find(item=>item.name===activeProfessor) || null;
      if (!professor && activeDiscipline && (data.disciplineAliases || {})[activeDiscipline]) discipline=activeDiscipline;
      if (!professor && !discipline && Number(active.semester || 0)) semester=Number(active.semester || 0);
    }
    const rows=data.scheduleEntries || [];

    if (professor) {
      const professorRows=rows.filter(row => row.professor === professor.name && (!day || row.day === day));
      let body='';
      if (wantsContact) body=`*${professor.name}*\n\n📧 ${professor.email || 'E-mail não informado.'}`;
      else if (wantsRoom) body=`*Salas de ${professor.name} — ${data.period || 'período atual'}*\n\n${formatLocalScheduleRows(professorRows) || 'Não encontrei aulas cadastradas para esse filtro.'}`;
      else if (wantsSchedule || day) body=`*Horários de ${professor.name} — ${data.period || 'período atual'}*\n\n${formatLocalScheduleRows(professorRows) || 'Não encontrei aulas cadastradas para esse filtro.'}`;
      else body=`*${professor.name}*\n\n📧 ${professor.email || 'E-mail não informado.'}\n\n${formatLocalScheduleRows(professorRows)}`;
      return { text:body, context:{kind:'professor',professor:professor.name,lastProfessor:professor.name,title:professor.name}, titleHint:`Professor ${professor.name.split(' ')[0]}`, sync:true, subject:`Professor — ${professor.name}` };
    }

    if (discipline) {
      const disciplineRows=rows.filter(row => row.discipline === discipline && (!day || row.day === day));
      if (!disciplineRows.length) return null;
      let body='';
      if (wantsProfessor) {
        const names=[...new Set(disciplineRows.map(row=>row.professor))];
        body=`*Professor${names.length>1?'es':''} de ${discipline}*\n\n${names.map(name=>`• ${name}`).join('\n')}`;
      } else if (wantsRoom) body=`*Sala de ${discipline}*\n\n${formatLocalScheduleRows(disciplineRows)}`;
      else body=`*Horários de ${discipline} — ${data.period || 'período atual'}*\n\n${formatLocalScheduleRows(disciplineRows)}`;
      return { text:body, context:{kind:'discipline',discipline,lastDiscipline:discipline,title:discipline}, titleHint:wantsRoom?`Sala de ${discipline}`:wantsProfessor?`Professor de ${discipline}`:`Horários de ${discipline}`, sync:true, subject:wantsRoom?`Sala — ${discipline}`:`Horários — ${discipline}` };
    }

    if (semester && (wantsSchedule || has('semestre'))) {
      const semesterRows=rows.filter(row => Number(row.semesterNumber)===semester && (!day || row.day===day));
      if (!semesterRows.length) return null;
      const title=day ? `Aulas de ${day} — ${semester}º semestre` : `Horários — ${semester}º semestre`;
      return { text:`*${day ? `Aulas de ${day}` : `Aulas e horários`} do ${semester}º semestre — ${data.period || 'período atual'}*\n\n${formatLocalScheduleRows(semesterRows)}`, context:{kind:'semester',semester,title:`${semester}º semestre`}, titleHint:day?`Aulas de ${day} — ${semester}º semestre`:`Horários do ${semester}º semestre`, sync:true, subject:title };
    }
    return null;
  }

  function syncLocalAnswerWithServer(text, local) {
    if (!local?.sync || navigator.onLine === false || !CONFIG.apiBaseUrl) return Promise.resolve();
    const conversationId=currentConversation().id;
    state.localSyncQueue = state.localSyncQueue.then(async () => {
      if (navigator.onLine === false || !CONFIG.apiBaseUrl) return;
      const conversation=state.conversations.find(item=>item.id===conversationId);
      if (!conversation) return;
      const startedAt=Date.now();
      try {
        const data=await request(CONFIG.messagePath || '/api/assistant/message', { sessionId:conversation.sessionId, message:text, senderName:state.settings.senderName }, { timeoutMs:12000 });
        if (data?.sessionId) conversation.sessionId=data.sessionId;
        const last=[...conversation.messages].reverse().find(message=>message.role==='assistant' && message.meta?.localInstant && !message.meta?.localSynced);
        const clearedDuringSync=Number(conversation.contextClearedAt || 0) >= startedAt;
        if (clearedDuringSync) await clearRemoteContext(conversation.sessionId);
        else if (last && data?.context) last.context=data.context;
        if (last) last.meta={...(last.meta||{}), localSynced:true};
        saveState();
        if (conversation.id===state.currentId) syncActiveContextUi();
      } catch {}
    }).catch(() => {});
    return state.localSyncQueue;
  }

  function findOfflineItems(text, limit = 3) {
    const catalog = state.offlineCatalog;
    if (!catalog) return [];
    const query = normalizeOffline(text);
    const terms = query.split(' ').filter(term => term.length > 2 && !['quero','manda','abre','mostra','qual','como','onde','para'].includes(term));
    return (catalog.items || []).map(item => {
      const snippetText = (item.snippets || []).map(chunk => `${chunk.heading || ''} ${chunk.text || ''}`).join(' ');
      const hay = normalizeOffline([item.title,item.summary,item.category,...(item.tags||[]),snippetText].join(' '));
      let score = terms.reduce((sum, term) => sum + (hay.includes(term) ? 3 : 0), 0);
      if (query && hay.includes(query)) score += 10;
      if (normalizeOffline(item.title).split(' ').some(term => terms.includes(term))) score += 2;
      return { ...item, score };
    }).filter(item => item.score > 0).sort((a,b) => b.score - a.score).slice(0, limit);
  }

  function bestOfflineSnippet(item, text) {
    const queryTerms = normalizeOffline(text).split(' ').filter(term => term.length > 2);
    return (item?.snippets || []).map(chunk => {
      const hay = normalizeOffline(`${chunk.heading || ''} ${chunk.text || ''}`);
      const score = queryTerms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    }).sort((a,b) => b.score - a.score)[0] || null;
  }

  function offlineAnswer(text, { apiUnavailable = false } = {}) {
    const updated = state.offlineCatalog?.updatedAt || '';
    const items = findOfflineItems(text, 3);
    const unavailableLead = 'O Assistente está temporariamente indisponível, mas documentos e ferramentas do HUB continuam funcionando.';
    if (!items.length) {
      return {
        text: apiUnavailable
          ? `${unavailableLead} Não encontrei esse assunto no conteúdo local.${updated ? `\n\nConteúdo local atualizado em ${updated}.` : ''}`
          : `Estou offline. Não encontrei esse assunto no catálogo local, mas ainda posso abrir documentos, apps e links que já estão armazenados no HUB.${updated ? `\n\nCatálogo local atualizado em ${updated}.` : ''}`,
        components:[], knowledge:null, presentation:null
      };
    }
    const first = items[0];
    const snippet = first.kind === 'document' ? bestOfflineSnippet(first, text) : null;
    const page = Number(snippet?.page || first.page || 0);
    const pageUrl = first.url && page ? `${String(first.url).split('#')[0]}#page=${page}` : first.url;
    const components = [{ type:'hub-results', title:apiUnavailable ? 'Enquanto isso, disponível no HUB' : 'Disponível offline no HUB', items:items.map(item => ({ title:item.title, summary:item.summary, url:item.url, kind:item.kind })) }];
    if (first.kind === 'document') components.unshift({ type:'document', title:first.title, page, url:pageUrl, heading:snippet?.heading || first.summary || '' });
    const excerpt = snippet?.text ? `\n\n${safeText(snippet.text).slice(0, 900)}` : (first.summary ? `\n\n${first.summary}` : '');
    return {
      text: apiUnavailable
        ? `${unavailableLead}\n\nEnquanto isso, encontrei *${first.title}* no conteúdo local do HUB.${excerpt}${page ? `\n\nTrecho local: página ${page}.` : ''}${updated ? `\n\nDados locais atualizados em ${updated}.` : ''}`
        : `Estou offline, mas encontrei *${first.title}* no catálogo local do HUB.${excerpt}${page ? `\n\nTrecho local: página ${page}.` : ''}${updated ? `\n\nDados locais atualizados em ${updated}.` : ''}`,
      components, knowledge:first.knowledge || null, presentation:null
    };
  }

  function openOrSendAction(value) {
    const raw = String(value || '').trim();
    if (!/^(?:https?:\/\/|mailto:)/i.test(raw)) return false;
    const href = safeExternalUrl(raw);
    if (!href) return false;
    window.open(href, '_blank', 'noopener,noreferrer');
    return true;
  }

  function applyEnvelopeToLastMessage(data, streamedMessages = []) {
    const last = streamedMessages.at(-1);
    if (!last) return;
    last.options = normalizeOptions(data.options || data.suggestions || []);
    last.components = Array.isArray(data.components) ? data.components : [];
    last.sources = Array.isArray(data.sources) ? data.sources : [];
    last.context = data.context && typeof data.context === 'object' ? data.context : null;
    last.ambiguity = data.ambiguity && typeof data.ambiguity === 'object' ? data.ambiguity : null;
    last.knowledge = data.knowledge && typeof data.knowledge === 'object' ? data.knowledge : null;
    last.citation = data.citation && typeof data.citation === 'object' ? data.citation : null;
    last.meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
  }

  function appendJsonResponse(data) {
    const replies = Array.isArray(data.replies) ? data.replies : [];
    if (!replies.length) {
      addMessage('assistant', 'Não encontrei uma resposta para essa mensagem. Tente reformular em uma frase curta.', { error:true });
      return [];
    }
    return replies.map((reply, index) => addMessage('assistant', reply.text, {
      serverId:reply.id,
      attachment:reply.attachment,
      options:index === replies.length - 1 ? (data.options || data.suggestions || []) : [],
      components:index === replies.length - 1 ? (data.components || []) : [],
      sources:index === replies.length - 1 ? (data.sources || []) : [],
      context:index === replies.length - 1 ? data.context : null,
      ambiguity:index === replies.length - 1 ? data.ambiguity : null,
      knowledge:index === replies.length - 1 ? data.knowledge : null,
      citation:index === replies.length - 1 ? data.citation : null,
      presentation:reply.presentation || (index === replies.length - 1 ? data.presentation : null),
      meta:index === replies.length - 1 ? data.meta : null
    }));
  }

  async function send(text, { appendUser = true, bypassLocal = false } = {}) {
    text = safeText(text).trim();
    if (!text) return;
    state.view = 'conversation';
    if (state.activeRequest) abortMessageRequest('superseded');
    if (appendUser) addMessage('user', text);
    const input = $('messageInput');
    if (input) input.value = '';
    persistDraft('', { immediate:true });
    resizeInput();

    const local = bypassLocal ? null : localAcademicAnswer(text);
    if (local) {
      const message = addMessage('assistant', local.text, {
        components:local.components || [], sources:local.sources || [], context:local.context || null,
        knowledge:local.knowledge || null, presentation:local.presentation || null,
        meta:{ localInstant:true, localSynced:false, subject:local.subject || '' }
      });
      refineConversationTitle(text, local.context, local.titleHint);
      saveState({ immediate:true });
      renderMessages();
      setConnection(navigator.onLine === false ? 'offline' : 'online', navigator.onLine === false ? 'Resposta local · offline' : 'Resposta local instantânea');
      syncLocalAnswerWithServer(text, local).then(() => {
        if (message.context) { refineConversationTitle(text, message.context, local.titleHint); saveState(); }
      });
      return;
    }

    const active = beginMessageRequest();
    renderMessages();
    const streamedMessages = [];
    try {
      const conversation = currentConversation();
      const result = await requestStream(CONFIG.messagePath || '/api/assistant/message', {
        sessionId:conversation.sessionId,
        message:text,
        senderName:state.settings.senderName
      }, {
        signal:active.controller.signal,
        onEnvelope:data => { if (data.sessionId) conversation.sessionId = data.sessionId; },
        onReplyStart:reply => {
          if (state.activeRequest?.id !== active.id) return;
          hideTyping();
          const message = addMessage('assistant', '', {
            serverId:reply.id, attachment:reply.attachment, presentation:reply.presentation, streaming:true,
            interruptedPrompt:text
          });
          streamedMessages.push(message);
          renderMessages();
        },
        onDelta:(serverId, delta) => {
          if (state.activeRequest?.id !== active.id) return;
          const message = streamedMessages.find(item => item.serverId === serverId) || streamedMessages.at(-1);
          if (!message) return;
          message.text += delta;
          patchStreamingMessage(message);
        },
        onReplyEnd:serverId => {
          const message = streamedMessages.find(item => item.serverId === serverId) || streamedMessages.at(-1);
          if (message) { message.streaming = false; message.interrupted = false; }
          if (message) patchStreamingMessage(message);
        }
      });
      if (state.activeRequest?.id !== active.id) return;
      const data = result.data || {};
      if (data.sessionId) conversation.sessionId = data.sessionId;
      if (result.streamed) {
        if (!streamedMessages.length) appendJsonResponse(data);
        else applyEnvelopeToLastMessage(data, streamedMessages);
      } else appendJsonResponse(data);
      refineConversationTitle(text, data.context || streamedMessages.at(-1)?.context || null);
      syncActiveContextUi();
      setConnection('online', 'Conectado');
    } catch (error) {
      if (state.activeRequest?.id !== active.id) return;
      const reason = active.reason || (error.name === 'AbortError' ? 'aborted' : 'error');
      if (reason === 'superseded' || reason === 'reset' || reason === 'unload') return;
      const partial = streamedMessages.filter(message => safeText(message.text).trim());
      for (const message of streamedMessages) {
        message.streaming = false;
        if (safeText(message.text).trim()) { message.interrupted = true; message.interruptedPrompt = text; }
      }
      if (!partial.length) {
        const academic = localAcademicAnswer(text);
        if (academic) addMessage('assistant', academic.text, { components:academic.components || [], sources:academic.sources || [], context:academic.context || null, knowledge:academic.knowledge || null, meta:{ localInstant:true, fallback:true } });
        else {
          const apiUnavailable = navigator.onLine !== false;
          const offline = offlineAnswer(text, { apiUnavailable });
          addMessage('assistant', offline.text, { components:offline.components, knowledge:offline.knowledge, presentation:offline.presentation, error:false });
        }
      }
      const apiUnavailable = navigator.onLine !== false;
      setConnection(apiUnavailable ? 'degraded' : 'offline', apiUnavailable ? 'Assistente indisponível' : 'Modo offline');
    } finally {
      for (const message of streamedMessages) message.streaming = false;
      const finishedHere = finishMessageRequest(active.id);
      if (finishedHere || streamedMessages.length) {
        saveState({ immediate:true });
        renderMessages();
      }
      if (finishedHere && matchMedia('(pointer: fine)').matches && document.activeElement !== $('messageInput')) $('messageInput')?.focus({ preventScroll:true });
    }
  }

  async function continueInterruptedResponse(messageId) {
    const message = messageById(messageId);
    const prompt = safeText(message?.interruptedPrompt || priorUserText(messageId)).trim();
    if (!prompt || state.sending) return;
    message.interrupted = false;
    saveState();
    renderMessages();
    await send(prompt, { appendUser:false, bypassLocal:true });
  }

  function resizeInput() {
    ensureComposerAttached();
    const input = $('messageInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(180, input.scrollHeight)}px`;
    updateComposerMetrics();
    syncSendingUi();
  }

  async function resetCurrent() {
    const previous = currentConversation();
    abortMessageRequest('reset');
    try { await request(CONFIG.resetPath || '/api/assistant/reset', { sessionId: previous.sessionId }, 8000); } catch {}
    const cleared = freshConversation();
    cleared.id = previous.id;
    cleared.createdAt = previous.createdAt;
    state.conversations = state.conversations.map(item => item.id === previous.id ? cleared : item);
    state.currentId = cleared.id;
    state.conversation = cleared;
    state.view = 'home';
    state.renderLimit = 80;
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    state.messageFingerprints.clear();
    const input = $('messageInput');
    if (input) input.value = '';
    await persistDraft('', { immediate:true });
    await saveState({ immediate:true });
    render();
  }


  function messageById(id) {
    return currentConversation().messages.find(message => message.id === id) || null;
  }

  function priorUserText(messageId) {
    const messages = currentConversation().messages;
    const index = messages.findIndex(message => message.id === messageId);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor].role === 'user') return messages[cursor].text;
    }
    return '';
  }

  async function copyMessage(id) {
    const message = messageById(id);
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text);
      message.copied = true;
      saveState();
      renderMessages();
      showToast('Resposta copiada');
      setTimeout(() => { message.copied = false; saveState(); renderMessages(); }, 1800);
    } catch {
      const area = document.createElement('textarea');
      area.value = message.text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      message.copied = true;
      saveState();
      renderMessages();
      showToast('Resposta copiada');
      setTimeout(() => { message.copied = false; saveState(); renderMessages(); }, 1800);
    }
  }

  const FEEDBACK_REASONS = Object.freeze({
    'wrong-information':'Informação errada',
    'misunderstood':'Não entendeu a pergunta',
    'wrong-source':'Fonte errada',
    'confusing':'Resposta confusa'
  });

  async function sendFeedback(messageId, value, reason = '') {
    const message = messageById(messageId);
    if (!message) return;
    const reasonLabel = reason ? (FEEDBACK_REASONS[reason] || safeText(reason).slice(0, 120)) : '';
    const nextValue = message.feedback === value && (!reason || message.feedbackReason === reasonLabel) ? '' : value;
    message.feedback = nextValue;
    message.feedbackReason = nextValue === 'not-helpful' ? reasonLabel : '';
    state.feedbackMenuMessageId = '';
    saveState();
    renderMessages();
    showToast(nextValue === 'helpful' ? 'Salvo como útil' : nextValue === 'not-helpful' ? `${reasonLabel || 'Problema'} registrado` : 'Feedback removido');
    if (!nextValue) return;
    try {
      await request(CONFIG.feedbackPath || '/api/assistant/feedback', {
        sessionId: currentConversation().sessionId,
        messageId: message.serverId || message.id,
        value: nextValue,
        comment: reasonLabel
      }, 8000);
    } catch {
      showToast('Feedback salvo neste dispositivo');
    }
  }

  function toggleNegativeFeedbackMenu(messageId) {
    const message = messageById(messageId);
    if (!message) return;
    const opening = state.feedbackMenuMessageId !== messageId;
    if (opening && message.feedback !== 'not-helpful') {
      // O primeiro clique no thumbs down já representa a seleção visual.
      // O motivo é um refinamento opcional e pode ser escolhido em seguida.
      message.feedback = 'not-helpful';
      message.feedbackReason = '';
      saveState();
    }
    state.feedbackMenuMessageId = opening ? messageId : '';
    renderMessages();
  }

  function startEditMessage(messageId) {
    const message = messageById(messageId);
    if (!message || message.role !== 'user' || state.sending) return;
    state.editingMessageId = messageId;
    state.feedbackMenuMessageId = '';
    renderMessages();
    requestAnimationFrame(() => {
      const editor = document.querySelector(`[data-edit-input="${CSS.escape(messageId)}"]`);
      editor?.focus();
      if (editor) editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  function cancelEditMessage() {
    state.editingMessageId = '';
    renderMessages();
  }

  async function clearRemoteContext(sessionId = currentConversation().sessionId) {
    try {
      await request('/api/assistant/context/clear', { sessionId }, 6000);
    } catch {}
  }

  async function saveEditedMessage(messageId) {
    if (state.sending) return;
    const editor = document.querySelector(`[data-edit-input="${CSS.escape(messageId)}"]`);
    const text = safeText(editor?.value).trim();
    if (!text) { showToast('A pergunta não pode ficar vazia.'); return; }
    const conversation = currentConversation();
    const index = conversation.messages.findIndex(message => message.id === messageId && message.role === 'user');
    if (index < 0) return;
    abortMessageRequest('superseded');
    conversation.messages.splice(index);
    conversation.updatedAt = Date.now();
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    await saveState({ immediate:true });
    renderMessages();
    await clearRemoteContext();
    await send(text, { appendUser:true });
  }

  async function regenerateMessage(messageId) {
    if (state.sending) return;
    const conversation = currentConversation();
    const assistantIndex = conversation.messages.findIndex(message => message.id === messageId && message.role === 'assistant');
    if (assistantIndex < 0) return;
    let userIndex = -1;
    for (let cursor = assistantIndex - 1; cursor >= 0; cursor -= 1) {
      if (conversation.messages[cursor].role === 'user') { userIndex = cursor; break; }
    }
    if (userIndex < 0) return;
    const text = safeText(conversation.messages[userIndex].text).trim();
    if (!text) return;
    conversation.messages.splice(userIndex + 1);
    conversation.updatedAt = Date.now();
    state.feedbackMenuMessageId = '';
    await saveState({ immediate:true });
    renderMessages();
    await clearRemoteContext();
    await send(text, { appendUser:false });
  }


  function stopCurrentResponse() {
    const conversation = currentConversation();
    const activeStreaming = [...conversation.messages].reverse().find(message => message.role === 'assistant' && message.streaming);
    if (activeStreaming && safeText(activeStreaming.text).trim()) {
      activeStreaming.streaming = false;
      activeStreaming.interrupted = true;
      activeStreaming.interruptedPrompt = activeStreaming.interruptedPrompt || priorUserText(activeStreaming.id);
    }
    if (!abortMessageRequest('user-stop')) return false;
    saveState({ immediate: true });
    renderMessages();
    hideTyping();
    showToast('Resposta interrompida. Você pode continuar ou tentar novamente.');
    requestAnimationFrame(() => $('messageInput')?.focus({ preventScroll: true }));
    return true;
  }

  function ensureAssistantSidebarNav() {
    if ($('assistantSidebarNav')) return;
    const search = $('sidebarSearchForm');
    const nav = search?.parentElement;
    if (!search || !nav) return;
    const group = document.createElement('div');
    group.id = 'assistantSidebarNav';
    group.className = 'assistant-local-nav';
    group.setAttribute('aria-label', 'Navegação do Assistente');
    group.innerHTML = `
      <button type="button" data-assistant-home><span class="nav-icon" aria-hidden="true">⌂</span><span class="sidebar-label">Início do Assistente</span></button>
      <button type="button" data-assistant-new><span class="nav-icon" aria-hidden="true">＋</span><span class="sidebar-label">Nova conversa</span></button>`;
    search.insertAdjacentElement('afterend', group);
    syncViewUi();
  }

  function bind() {
    document.addEventListener('click', event => {
      const homeButton = event.target.closest('[data-assistant-home]');
      const newButton = event.target.closest('[data-assistant-new]');
      if (homeButton) { event.preventDefault(); showHome(); }
      else if (newButton) { event.preventDefault(); startNewConversation(); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.dialogState) { event.preventDefault(); closeAssistantDialog(null); return; }
      if (event.altKey && !event.ctrlKey && !event.metaKey && String(event.key).toLowerCase() === 'h') {
        event.preventDefault();
        showHome();
      }
    });
    $('sendMessage').addEventListener('click', () => {
      const draft = $('messageInput').value;
      if (state.activeRequest && !draft.trim()) stopCurrentResponse();
      else send(draft);
    });
    $('messageInput').addEventListener('input', event => { resizeInput(); persistDraft(event.currentTarget.value); });
    $('messageInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(event.currentTarget.value);
      }
    });
    $('welcome')?.addEventListener('click', event => {
      const button = event.target.closest('[data-prompt]');
      const favorite = event.target.closest('[data-favorite-prompt]');
      const popular = event.target.closest('[data-popular-prompt]');
      const popularPeriod = event.target.closest('[data-popular-period]');
      const removeFavorite = event.target.closest('[data-remove-home-favorite]');
      const continueConversation = event.target.closest('[data-continue-conversation]');
      const historyConversation = event.target.closest('[data-conversation-id]');
      const renameHistory = event.target.closest('[data-rename-conversation]');
      const deleteHistory = event.target.closest('[data-delete-conversation]');
      if (popularPeriod) setPopularPeriod(popularPeriod.dataset.popularPeriod);
      else if (removeFavorite) {
        const id = removeFavorite.dataset.removeHomeFavorite;
        if (window.HUB_USER_STATE?.removeFavorite) window.HUB_USER_STATE.removeFavorite(id);
        else { state.favorites = state.favorites.filter(item => String(item.id || '') !== id); saveFavorites(); render(); }
        showToast('Removido dos favoritos');
      } else if (continueConversation) showConversation(state.currentId);
      else if (renameHistory) renameConversation(renameHistory.dataset.renameConversation);
      else if (deleteHistory) deleteConversation(deleteHistory.dataset.deleteConversation);
      else if (historyConversation) showConversation(historyConversation.dataset.conversationId);
      else if (button && !state.sending) send(button.dataset.prompt);
      else if (favorite && !state.sending) {
        if (favorite.dataset.favoriteMessageId) {
          const conversation = findConversationContainingMessage(favorite.dataset.favoriteMessageId);
          if (conversation) showConversation(conversation.id, { messageId:favorite.dataset.favoriteMessageId });
          else if (favorite.dataset.favoritePrompt) send(favorite.dataset.favoritePrompt);
        } else if (favorite.dataset.favoritePrompt) send(favorite.dataset.favoritePrompt);
      } else if (popular && !state.sending) send(popular.dataset.popularPrompt);
    });
    $('messages').addEventListener('click', event => {
      const option = event.target.closest('[data-option-value]');
      const copy = event.target.closest('[data-copy-message]');
      const feedback = event.target.closest('[data-feedback]');
      const feedbackReason = event.target.closest('[data-feedback-reason]');
      const regenerate = event.target.closest('[data-regenerate-message]');
      const favorite = event.target.closest('[data-favorite-message]');
      const pin = event.target.closest('[data-pin-message]');
      const correction = event.target.closest('[data-correction-message]');
      const scrollMessage = event.target.closest('[data-scroll-message]');
      const retry = event.target.closest('[data-retry-message]');
      const edit = event.target.closest('[data-edit-message]');
      const editSave = event.target.closest('[data-edit-save]');
      const editCancel = event.target.closest('[data-edit-cancel]');
      const loadEarlier = event.target.closest('[data-load-earlier]');
      const continueInterrupted = event.target.closest('[data-continue-interrupted]');
      if (loadEarlier) {
        const viewport = $('messageScroll');
        const previousHeight = viewport?.scrollHeight || 0;
        state.renderLimit += 80;
        renderMessages();
        requestAnimationFrame(() => { if (viewport) viewport.scrollTop += viewport.scrollHeight - previousHeight; });
      } else if (option) {
        if (!state.sending && !openOrSendAction(option.dataset.optionValue)) send(option.dataset.optionValue);
      } else if (continueInterrupted) continueInterruptedResponse(continueInterrupted.dataset.continueInterrupted);
      else if (copy) copyMessage(copy.dataset.copyMessage);
      else if (feedbackReason) sendFeedback(feedbackReason.dataset.message, 'not-helpful', feedbackReason.dataset.feedbackReason);
      else if (correction) sendCorrectionForMessage(correction.dataset.correctionMessage);
      else if (favorite) toggleFavoriteMessage(favorite.dataset.favoriteMessage);
      else if (pin) togglePinMessage(pin.dataset.pinMessage);
      else if (scrollMessage) { document.querySelector(`[data-message-id="${CSS.escape(scrollMessage.dataset.scrollMessage)}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' }); }
      else if (feedback?.dataset.feedback === 'not-helpful') toggleNegativeFeedbackMenu(feedback.dataset.message);
      else if (feedback) sendFeedback(feedback.dataset.message, feedback.dataset.feedback);
      else if (regenerate) regenerateMessage(regenerate.dataset.regenerateMessage);
      else if (edit) startEditMessage(edit.dataset.editMessage);
      else if (editSave) saveEditedMessage(editSave.dataset.editSave);
      else if (editCancel) cancelEditMessage();
      else if (retry) {
        const text = priorUserText(retry.dataset.retryMessage);
        if (text) send(text, { appendUser:false, bypassLocal:true });
      }
    });
    $('messages').addEventListener('keydown', event => {
      const editor = event.target.closest?.('[data-edit-input]');
      if (!editor) return;
      if (event.key === 'Escape') { event.preventDefault(); cancelEditMessage(); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEditedMessage(editor.dataset.editInput); }
    });
    $('anonymousModeToggle')?.addEventListener('click', toggleAnonymousMode);
    $('clearActiveContext')?.addEventListener('click', clearActiveContext);
    $('conversationHistorySearch')?.addEventListener('input', event => { state.historyQuery = String(event.currentTarget.value || '').slice(0,120); renderHomeConversationPanels(); });
    $('assistantDialogClose')?.addEventListener('click', () => closeAssistantDialog(null));
    $('assistantDialogCancel')?.addEventListener('click', () => closeAssistantDialog(null));
    $('assistantDialogConfirm')?.addEventListener('click', () => {
      const value = state.dialogState?.input ? String($('assistantDialogInput')?.value || '').trim() : true;
      if (state.dialogState?.input && !value) { showToast('Preencha o campo antes de continuar.'); return; }
      closeAssistantDialog(value);
    });
    $('assistantDialog')?.addEventListener('click', event => { if (event.target === $('assistantDialog')) closeAssistantDialog(null); });
    $('assistantDialogInput')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeAssistantDialog(null); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('assistantDialogConfirm')?.click(); }
    });
    window.addEventListener('hub:favorites-changed', () => { state.favorites = loadFavorites(); render(); });
    document.addEventListener('hub:sidebar-ready', ensureAssistantSidebarNav);
    $('clearConversation').addEventListener('click', async () => {
      if (state.sending) return;
      const confirmed = await confirmAssistantAction({ title:'Limpar conversa', message:'Remover todas as mensagens desta conversa? Favoritos globais e outras conversas serão preservados.', confirmLabel:'Limpar conversa' });
      if (confirmed) resetCurrent();
    });
    window.addEventListener('online', checkHealth);
    window.addEventListener('offline', () => setConnection('offline', 'Sem internet'));
    window.addEventListener('pageshow', () => {
      ensureComposerAttached();
      syncSendingUi();
      renderMessages();
    });
    document.addEventListener('focusin', event => {
      if (event.target === $('messageInput')) ensureComposerAttached();
    });
    document.addEventListener('focusout', () => setTimeout(ensureComposerAttached, 80));
  }

  let viewportSyncTimer = 0;
  let viewportBaselineHeight = 0;

  function syncViewportHeight() {
    const viewport = globalThis.visualViewport;
    const layoutHeight = Number(globalThis.innerHeight || document.documentElement.clientHeight || 0);
    const visualHeight = Number(viewport?.height || 0);
    const visualTop = Math.max(0, Number(viewport?.offsetTop || 0));
    // Samsung Internet pode "panear" o visual viewport durante a animação do
    // teclado. Mover o body por offsetTop cria um vão branco abaixo do composer.
    // Mantemos o app ancorado no topo e usamos o fundo visível real
    // (height + offsetTop) como altura disponível.
    const visibleBottom = visualHeight > 0 ? visualHeight + visualTop : layoutHeight;
    const height = Math.max(180, Math.round(visibleBottom || layoutHeight));
    const inputFocused = document.activeElement === $('messageInput');
    if (!inputFocused && height > viewportBaselineHeight) viewportBaselineHeight = height;
    const keyboardOpen = inputFocused && viewportBaselineHeight > 0 && height < viewportBaselineHeight - 120;
    document.documentElement.style.setProperty('--assistant-window-height', `${height}px`);
    document.body?.classList.toggle('assistant-compact-height', height < 300);
    document.body?.classList.toggle('assistant-keyboard-open', keyboardOpen);
    if (inputFocused && visualTop > 0 && (globalThis.scrollX || globalThis.scrollY)) {
      globalThis.scrollTo(0, 0);
    }
    ensureComposerAttached();
  }

  function scheduleViewportSync(delay = 0) {
    clearTimeout(viewportSyncTimer);
    viewportSyncTimer = setTimeout(() => {
      syncViewportHeight();
      ensureComposerAttached();
      requestAnimationFrame(() => {
        updateComposerMetrics();
        scrollToBottom(false);
      });
    }, delay);
  }

  function settleKeyboardViewport() {
    for (const delay of (0, 60, 180, 360)) setTimeout(() => scheduleViewportSync(0), delay);
  }

  function bindViewport() {
    syncViewportHeight();
    globalThis.visualViewport?.addEventListener('resize', () => scheduleViewportSync(16));
    globalThis.visualViewport?.addEventListener('scroll', () => scheduleViewportSync(16));
    globalThis.addEventListener('resize', () => scheduleViewportSync(16));
    globalThis.addEventListener('orientationchange', () => { viewportBaselineHeight = 0; scheduleViewportSync(160); });
    $('messageInput')?.addEventListener('focus', settleKeyboardViewport);
    $('messageInput')?.addEventListener('blur', () => {
      for (const delay of (0, 100, 260)) setTimeout(() => scheduleViewportSync(0), delay);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        ensureComposerAttached();
        syncSendingUi();
        scheduleViewportSync(0);
      }
    });
    window.addEventListener('pagehide', () => { persistDraft($('messageInput')?.value || '', { immediate: true }); });
  }

  async function bootstrap() {
    bindComposerGuard();
    bindViewport();
    bind();
    const [, , , draft] = await Promise.all([loadState(), loadOfflineCatalog(), loadOfflineAcademic(), loadDraft()]);
    loadPopularQuestions();
    if (!state.popularRefreshTimer) {
      state.popularRefreshTimer = setInterval(() => { if (!document.hidden) loadPopularQuestions(); }, 60_000);
    }
    const input = $('messageInput');
    if (input && draft) input.value = String(draft).slice(0, 3000);
    ensureComposerAttached();
    syncSendingUi();
    render();
    resizeInput();
    checkHealth();
    const searchParams = new URLSearchParams(location.search);
    const favoriteMessageId = searchParams.get('favorite');
    if (favoriteMessageId) {
      const conversation = findConversationContainingMessage(favoriteMessageId);
      if (conversation) showConversation(conversation.id, { persist:false, messageId:favoriteMessageId });
    }
    const sharedSearchPrompt = safeText(searchParams.get('q') || '').trim().slice(0, 3000);
    if (sharedSearchPrompt && !state.sending) {
      searchParams.delete('q');
      const cleanQuery = searchParams.toString();
      history.replaceState(null, '', `${location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${location.hash}`);
      requestAnimationFrame(() => send(sharedSearchPrompt));
    } else if (matchMedia('(pointer: fine)').matches) input?.focus({ preventScroll: true });
  }

  bootstrap().catch(error => {
    console.error('Falha ao iniciar o Assistente:', error);
    state.conversation = freshConversation();
    ensureComposerAttached();
    syncSendingUi();
    render();
  });
})();
