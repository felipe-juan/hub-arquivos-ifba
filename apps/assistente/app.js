(() => {
  'use strict';

  const CONFIG = window.HUB_ASSISTANT_CONFIG || {};
  const FRONTEND_RELEASE = '1.6.7-ux-federated-stream-v1';
  const STORAGE_KEY = 'hubAssistantStateV1';
  const SETTINGS_KEY = 'hubAssistantSettingsV1';
  const FAVORITES_KEY = 'hubAssistantFavoritesV1';
  const DB_NAME = 'hubAssistantHistoryV1';
  const DB_VERSION = 2;
  const DB_STORE = 'state';
  const $ = id => document.getElementById(id);
  const state = {
    conversation: null,
    sending: false,
    activeRequest: null,
    requestSerial: 0,
    settings: loadSettings(),
    favorites: loadFavorites(),
    popularQuestions: [],
    offlineCatalog: null,
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
    pendingDraft: ''
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

  async function loadSavedState() {
    const saved = await databaseGet('main');
    if (saved) return saved;
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  async function loadDraft() {
    const saved = await databaseGet('draft');
    if (typeof saved === 'string') return saved;
    try { return localStorage.getItem(`${STORAGE_KEY}:draft`) || ''; } catch { return ''; }
  }

  function persistSavedState(value, { immediate = false } = {}) {
    historyStore.pendingState = value;
    clearTimeout(historyStore.persistTimer);
    const flush = () => {
      const payload = historyStore.pendingState;
      historyStore.pendingState = null;
      return enqueueDatabaseWrite(store => store.put(payload, 'main'), () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
      });
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

  async function clearSavedState() {
    clearTimeout(historyStore.persistTimer);
    clearTimeout(historyStore.draftTimer);
    historyStore.pendingState = null;
    historyStore.pendingDraft = '';
    await enqueueDatabaseWrite(store => { store.delete('main'); store.delete('draft'); }, () => {});
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(`${STORAGE_KEY}:draft`); } catch {}
  }

  function defaultSettings() {
    return { senderName: 'Estudante', testMode:false };
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...defaultSettings(), senderName: String(stored.senderName || 'Estudante').slice(0, 80), testMode:Boolean(stored.testMode) };
    } catch { return defaultSettings(); }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
  }

  function syncTestModeUi() {
    const button = $('testModeToggle');
    if (!button) return;
    const active = Boolean(state.settings.testMode);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Desativar modo de teste neste dispositivo' : 'Ativar modo de teste neste dispositivo');
    button.title = active
      ? 'Modo de teste ativo: suas mensagens não entram nas estatísticas públicas'
      : 'Modo de teste: não contabilizar as mensagens deste dispositivo';
  }

  function toggleTestMode() {
    state.settings.testMode = !state.settings.testMode;
    saveSettings();
    syncTestModeUi();
    showToast(state.settings.testMode
      ? 'Modo de teste ativado: suas mensagens não serão contabilizadas'
      : 'Modo de teste desativado: suas próximas perguntas voltarão a ser contabilizadas');
  }

  function telemetryPayload(payload = {}) {
    return state.settings.testMode ? { ...payload, telemetryMode:'test' } : payload;
  }

  function loadFavorites() {
    try {
      const items = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(items) ? items.filter(Boolean).slice(0, 60) : [];
    } catch { return []; }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites.slice(0, 60))); } catch {}
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
      serverId: message.serverId || '',
      kind: documentCard ? 'document' : actionCard ? 'tool' : 'answer',
      title,
      summary: documentCard?.heading || summary.slice(0, 180),
      prompt,
      url: documentCard?.url || source?.url || '',
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
    list.innerHTML = state.favorites.slice(0, 8).map(item => `
      <article class="saved-item">
        <button type="button" data-favorite-prompt="${escapeHtml(item.prompt || '')}" data-favorite-message-id="${escapeHtml(item.messageId || '')}">
          <strong>${escapeHtml(item.title || 'Favorito')}</strong>
          <span>${escapeHtml(item.summary || 'Abrir item salvo')}</span>
        </button>
        ${item.url ? `<a href="${escapeHtml(safeExternalUrl(item.url) || item.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}
      </article>`).join('');
  }

  function renderPopularQuestions() {
    const panel = $('popularPanel');
    const list = $('popularList');
    if (!panel || !list) return;
    panel.hidden = false;
    if (!state.popularQuestions.length) {
      list.innerHTML = '<div class="saved-empty">Ainda não há perguntas suficientes hoje.</div>';
      return;
    }
    list.innerHTML = state.popularQuestions.slice(0, 8).map(item => `
      <button type="button" class="saved-item popular-item" data-popular-prompt="${escapeHtml(item.subject || item.title || '')}">
        <strong>${escapeHtml(item.subject || item.title || 'Assunto')}</strong>
        <span>${escapeHtml((item.count || 0) + ' consulta(s) hoje')}</span>
      </button>`).join('');
  }

  function renderPinnedAnswer() {
    const container = $('pinnedAnswer');
    if (!container) return;
    const pinnedId = currentConversation().pinnedMessageId || '';
    const message = pinnedId ? messageById(pinnedId) : null;
    container.hidden = !message;
    if (!message) { container.innerHTML = ''; return; }
    const text = safeText(message.text).replace(/\s+/g, ' ').trim();
    container.innerHTML = `<div class="pinned-answer-card"><span>📌 Resposta fixada</span><strong>${escapeHtml(text.slice(0, 180) || 'Resposta salva')}</strong><div class="pinned-answer-actions"><button type="button" data-scroll-message="${escapeHtml(message.id)}">Ir para a resposta</button><button type="button" data-pin-message="${escapeHtml(message.id)}">Desafixar</button></div></div>`;
  }

  async function loadPopularQuestions() {
    if (!CONFIG.apiBaseUrl) return;
    try {
      const response = await fetch(apiUrl('/api/assistant/popular'), { cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      state.popularQuestions = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
      renderPopularQuestions();
    } catch { state.popularQuestions = []; renderPopularQuestions(); }
  }

  function togglePinMessage(messageId) {
    const conversation = currentConversation();
    conversation.pinnedMessageId = conversation.pinnedMessageId === messageId ? '' : messageId;
    saveState({ immediate:true });
    render();
    showToast(conversation.pinnedMessageId ? 'Resposta fixada no topo da conversa' : 'Resposta desafixada');
  }

  async function sendCorrectionForMessage(messageId) {
    const note = prompt('Informe a correção em poucas palavras:');
    if (!note || !note.trim()) return;
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

  function freshConversation() {
    return {
      id: 'single-conversation',
      sessionId: uuid().replace(/-/g, ''),
      title: 'Assistente do HUB',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
  }

  function normalizeConversation(value) {
    if (!value || typeof value !== 'object') return freshConversation();
    return {
      id: 'single-conversation',
      sessionId: String(value.sessionId || uuid().replace(/-/g, '')),
      title: 'Assistente do HUB',
      createdAt: Number(value.createdAt || Date.now()),
      updatedAt: Number(value.updatedAt || Date.now()),
      pinnedMessageId: String(value.pinnedMessageId || ''),
      messages: Array.isArray(value.messages)
        ? value.messages.slice(-Number(CONFIG.maxMessagesPerConversation || 250)).map(message => ({
            ...message,
            options: normalizeOptions(message.options)
          }))
        : []
    };
  }

  async function loadState() {
    const saved = await loadSavedState();
    let source = saved?.conversation;
    if (!source && Array.isArray(saved?.conversations)) {
      source = saved.conversations.find(item => item.id === saved.currentId)
        || [...saved.conversations].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    }
    state.conversation = normalizeConversation(source);
  }

  function saveState(options = {}) {
    if (!state.conversation) state.conversation = freshConversation();
    return persistSavedState({ conversation: state.conversation }, options);
  }

  function currentConversation() {
    if (!state.conversation) state.conversation = freshConversation();
    return state.conversation;
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
    let value = escapeHtml(text);
    const emailLinks = [];
    value = value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, email => {
      const token = `\u0000HUBMAIL${emailLinks.length}\u0000`;
      emailLinks.push(`<a href="mailto:${email}">${email}</a>`);
      return token;
    });
    value = value
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
    value = value.replace(/(https?:\/\/[^\s<]+)/g, raw => {
      const clean = raw.replace(/[),.;!?]+$/, '');
      const suffix = raw.slice(clean.length);
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${suffix}`;
    });
    value = value.replace(/\u0000HUBMAIL(\d+)\u0000/g, (_, index) => emailLinks[Number(index)] || '');
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
      components: Array.isArray(extras.components) ? extras.components : [],
      sources: Array.isArray(extras.sources) ? extras.sources : [],
      context: extras.context && typeof extras.context === 'object' ? extras.context : null,
      ambiguity: extras.ambiguity && typeof extras.ambiguity === 'object' ? extras.ambiguity : null,
      knowledge: extras.knowledge && typeof extras.knowledge === 'object' ? extras.knowledge : null,
      citation: extras.citation && typeof extras.citation === 'object' ? extras.citation : null,
      presentation: extras.presentation && typeof extras.presentation === 'object' ? extras.presentation : null,
      meta: extras.meta && typeof extras.meta === 'object' ? extras.meta : null
    };
    conversation.messages.push(message);
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
      down: '<path d="M7 14V4H4v10h3Z"></path><path d="M7 6h9.2a2 2 0 0 1 1.9 1.4l1.6 5a2 2 0 0 1-1.9 2.6H14l.7 3.1a2.3 2.3 0 0 1-2.2 2.9L7 14V6Z"></path>'
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

  function showToast(text) {
    const toast = $('actionToast');
    if (!toast) return;
    clearTimeout(state.toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  function safeExternalUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function isAssistantSelfUrl(value = '') {
    const href = safeExternalUrl(value);
    if (!href) return false;
    try {
      const current = new URL(location.href);
      const candidate = new URL(href);
      return candidate.origin === current.origin && candidate.pathname === current.pathname;
    } catch { return false; }
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
    try {
      const viewer = new URL(String(source.url || source.pdfUrl || ''), location.href);
      if (!['http:', 'https:'].includes(viewer.protocol)) return '';
      const fromViewer = viewer.searchParams.get('file');
      const raw = fromViewer || source.pdfUrl || (viewer.pathname.toLowerCase().endsWith('.pdf') ? viewer.href : '');
      if (!raw) return '';
      const pdf = new URL(raw, location.href);
      return ['http:', 'https:'].includes(pdf.protocol) && pdf.pathname.toLowerCase().endsWith('.pdf') ? pdf.href : '';
    } catch { return ''; }
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
    try {
      const url = new URL(raw, location.href);
      if (url.pathname.toLowerCase().endsWith('.pdf')) {
        url.hash = `page=${page}`;
      } else if (/document-viewer\.html$/iu.test(url.pathname)) {
        url.searchParams.set('page', String(page));
      }
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
        verification:{ verified:Boolean(source.verified) }
      }];
    }
    sources = uniqueSources(sources);
    if (!sources.length) return '';
    const rows = sources.slice(0, 3).map(source => {
      const href = sourceHref(source);
      const label = `📄 ${escapeHtml(source.title || 'Documento')}${source.page ? ` · pág. ${escapeHtml(source.page)}` : ''}`;
      const verification = source.verification?.verified ? '<small class="source-verified">Fonte verificada</small>' : '';
      return href
        ? `<a class="integrated-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span>${label}</span>${verification}</a>`
        : `<span class="integrated-source"><span>${label}</span>${verification}</span>`;
    }).join('');
    const first = sources[0];
    const sourceKind = message.citation?.verified ? 'Fonte usada na resposta' : 'Fonte relacionada';
    const pdf = pdfFileFromSource(first);
    const preview = pdf && first.page ? `<a class="pdf-page-preview" href="${escapeHtml(sourceHref(first) || pdf)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHtml(first.title || 'documento')} na página ${escapeHtml(first.page)}"><iframe src="${escapeHtml(`${pdf}#page=${Number(first.page || 1)}&view=FitH&toolbar=0&navpanes=0`)}" loading="lazy" title="Prévia da página ${escapeHtml(first.page)}" tabindex="-1"></iframe><span>Prévia · página ${escapeHtml(first.page)}</span></a>` : '';
    return `<section class="integrated-sources"><small class="source-section-label">${sourceKind}</small><div class="source-list">${rows}</div>${preview}</section>`;
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
    const item = message.knowledge;
    if (!item) return '';
    const source = item.source || null;
    const warning = Boolean(item.warning) || (message.citation && !message.citation.verified);
    const rows = [];
    if (source?.title) rows.push(`<span><strong>Fonte:</strong> ${escapeHtml(source.title)}${source.page ? ` · página ${escapeHtml(source.page)}` : ''}</span>`);
    if (item.validity && item.validity !== 'não informada') rows.push(`<span><strong>Validade:</strong> ${escapeHtml(item.validity)}</span>`);
    if (source?.status) rows.push(`<span><strong>Status da fonte:</strong> ${escapeHtml(source.status)}</span>`);
    if (item.lastReviewedAt) rows.push(`<span><strong>Revisado:</strong> ${escapeHtml(item.lastReviewedAt)}${item.responsible ? ` · ${escapeHtml(item.responsible)}` : ''}</span>`);
    if (item.warning) rows.push(`<span class="freshness-warning">${escapeHtml(item.warning)}</span>`);
    if (item.conflictNotice) rows.push(`<span>${escapeHtml(item.conflictNotice)}</span>`);
    return rows.length ? `<section class="knowledge-meta ${warning ? 'knowledge-warning' : ''}">${rows.join('')}</section>` : '';
  }

  function renderMessageBody(message) {
    const presentation = message.presentation;
    if (!presentation?.progressive) return formatMessage(message.text);
    return `<section class="progressive-answer"><div class="progressive-summary">${formatMessage(presentation.summary || message.text)}</div>${presentation.details ? `<details><summary>Detalhes</summary><div class="progressive-details">${formatMessage(presentation.details)}</div></details>` : ''}${presentation.source ? `<details><summary>Fonte</summary><div class="progressive-source">${formatMessage(presentation.source)}</div></details>` : ''}</section>`;
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
      message.role, message.text, message.error, message.feedback, message.feedbackReason, message.copied, message.streaming,
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
    return `<article class="message-row assistant${streamingClass}" data-message-id="${escapeHtml(message.id)}"><div class="assistant-avatar" aria-hidden="true">🤖</div><div class="message-content ${message.error ? 'error-card' : ''}">${attachment}${renderContext(message)}${renderMessageBody(message)}${message.streaming ? '<span class="stream-caret" aria-hidden="true"></span>' : ''}${renderAmbiguity(message)}${renderComponents(message)}${renderSources(message)}${renderKnowledge(message)}${options}${assistantActions(message)}</div></article>`;
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
    $('welcome').hidden = Boolean(conversation.messages.length);
    renderFavoritesHome();
    renderPopularQuestions();
    renderPinnedAnswer();

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
    syncTestModeUi();
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
    state.offline = status === 'offline';
    const banner = $('offlineBanner');
    if (banner) banner.hidden = !state.offline;
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
      setConnection('offline', 'Modo offline disponível');
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

  function normalizeOffline(value = '') {
    return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\btranacamento\b/g,'trancamento').replace(/\btrancamneto\b/g,'trancamento')
      .replace(/\bmatricual\b/g,'matricula').replace(/\bmatriucula\b/g,'matricula')
      .replace(/\bcauculo\b/g,'calculo').replace(/\bcrecencio\b/g,'crescencio')
      .replace(/\bcaledario\b/g,'calendario').replace(/\bfluxogama\b/g,'fluxograma')
      .replace(/[^a-z0-9]+/g, ' ').trim();
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

  function offlineAnswer(text) {
    const updated = state.offlineCatalog?.updatedAt || '';
    const items = findOfflineItems(text, 3);
    if (!items.length) {
      return {
        text:`Estou offline. Não encontrei esse assunto no catálogo local, mas ainda posso abrir documentos, apps e links que já estão armazenados no HUB.${updated ? `\n\nCatálogo local atualizado em ${updated}.` : ''}`,
        components:[], knowledge:null, presentation:null
      };
    }
    const first = items[0];
    const snippet = first.kind === 'document' ? bestOfflineSnippet(first, text) : null;
    const page = Number(snippet?.page || first.page || 0);
    const pageUrl = first.url && page ? `${String(first.url).split('#')[0]}#page=${page}` : first.url;
    const components = [{ type:'hub-results', title:'Disponível offline no HUB', items:items.map(item => ({ title:item.title, summary:item.summary, url:item.url, kind:item.kind })) }];
    if (first.kind === 'document') components.unshift({ type:'document', title:first.title, page, url:pageUrl, heading:snippet?.heading || first.summary || '' });
    const excerpt = snippet?.text ? `\n\n${safeText(snippet.text).slice(0, 900)}` : (first.summary ? `\n\n${first.summary}` : '');
    return {
      text:`Estou offline, mas encontrei *${first.title}* no catálogo local do HUB.${excerpt}${page ? `\n\nTrecho local: página ${page}.` : ''}${updated ? `\n\nDados locais atualizados em ${updated}.` : ''}`,
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

  async function send(text, { appendUser = true } = {}) {
    text = safeText(text).trim();
    if (!text) return;
    if (state.activeRequest) abortMessageRequest('superseded');
    const active = beginMessageRequest();
    if (appendUser) addMessage('user', text);
    const input = $('messageInput');
    if (input) input.value = '';
    persistDraft('', { immediate:true });
    resizeInput();
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
            serverId:reply.id, attachment:reply.attachment, presentation:reply.presentation, streaming:true
          });
          streamedMessages.push(message);
          renderMessages();
        },
        onDelta:(serverId, delta) => {
          if (state.activeRequest?.id !== active.id) return;
          const message = streamedMessages.find(item => item.serverId === serverId) || streamedMessages.at(-1);
          if (!message) return;
          message.text += delta;
          renderMessages();
        },
        onReplyEnd:serverId => {
          const message = streamedMessages.find(item => item.serverId === serverId) || streamedMessages.at(-1);
          if (message) message.streaming = false;
          renderMessages();
        }
      });
      if (state.activeRequest?.id !== active.id) return;
      const data = result.data || {};
      if (data.sessionId) conversation.sessionId = data.sessionId;
      if (result.streamed) {
        if (!streamedMessages.length) appendJsonResponse(data);
        else applyEnvelopeToLastMessage(data, streamedMessages);
      } else appendJsonResponse(data);
      setConnection('online', 'Conectado');
    } catch (error) {
      if (state.activeRequest?.id !== active.id) return;
      const reason = active.reason || (error.name === 'AbortError' ? 'aborted' : 'error');
      if (reason === 'superseded' || reason === 'reset' || reason === 'unload' || reason === 'user-stop') return;
      for (const message of streamedMessages) message.streaming = false;
      const offline = offlineAnswer(text);
      addMessage('assistant', offline.text, { components:offline.components, knowledge:offline.knowledge, presentation:offline.presentation, error:false });
      setConnection('offline', 'Modo offline');
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
    state.conversation = freshConversation();
    state.renderLimit = 80;
    state.editingMessageId = '';
    state.feedbackMenuMessageId = '';
    state.messageFingerprints.clear();
    await clearSavedState();
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

  async function clearRemoteContext() {
    try {
      await request('/api/assistant/context/clear', { sessionId:currentConversation().sessionId }, 6000);
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
    if (!abortMessageRequest('user-stop')) return false;
    saveState({ immediate: true });
    renderMessages();
    hideTyping();
    showToast('Resposta interrompida.');
    requestAnimationFrame(() => $('messageInput')?.focus({ preventScroll: true }));
    return true;
  }

  function bind() {
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
      if (button && !state.sending) send(button.dataset.prompt);
      else if (favorite && !state.sending) {
        if (favorite.dataset.favoriteMessageId) {
          const node = document.querySelector(`[data-message-id="${CSS.escape(favorite.dataset.favoriteMessageId)}"]`);
          if (node) node.scrollIntoView({ behavior:'smooth', block:'center' });
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
      if (loadEarlier) {
        const viewport = $('messageScroll');
        const previousHeight = viewport?.scrollHeight || 0;
        state.renderLimit += 80;
        renderMessages();
        requestAnimationFrame(() => { if (viewport) viewport.scrollTop += viewport.scrollHeight - previousHeight; });
      } else if (option) {
        if (!state.sending && !openOrSendAction(option.dataset.optionValue)) send(option.dataset.optionValue);
      } else if (copy) copyMessage(copy.dataset.copyMessage);
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
        if (text) send(text);
      }
    });
    $('messages').addEventListener('keydown', event => {
      const editor = event.target.closest?.('[data-edit-input]');
      if (!editor) return;
      if (event.key === 'Escape') { event.preventDefault(); cancelEditMessage(); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveEditedMessage(editor.dataset.editInput); }
    });
    $('testModeToggle')?.addEventListener('click', toggleTestMode);
    $('clearConversation').addEventListener('click', () => {
      if (state.sending) return;
      if (confirm('Limpar a conversa e começar novamente?')) resetCurrent();
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
    const [, , draft] = await Promise.all([loadState(), loadOfflineCatalog(), loadDraft()]);
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
    if (matchMedia('(pointer: fine)').matches) input?.focus({ preventScroll: true });
  }

  bootstrap().catch(error => {
    console.error('Falha ao iniciar o Assistente:', error);
    state.conversation = freshConversation();
    ensureComposerAttached();
    syncSendingUi();
    render();
  });
})();
