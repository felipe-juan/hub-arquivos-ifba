(() => {
  'use strict';

  const CONFIG = window.HUB_ASSISTANT_CONFIG || {};
  const STORAGE_KEY = 'hubAssistantStateV1';
  const SETTINGS_KEY = 'hubAssistantSettingsV1';
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
    offlineCatalog: null,
    toastTimer: 0,
    renderLimit: 80,
    messageFingerprints: new Map()
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
    return { senderName: 'Estudante' };
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...defaultSettings(), senderName: String(stored.senderName || 'Estudante').slice(0, 80) };
    } catch { return defaultSettings(); }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
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
    value = value
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
    value = value.replace(/(https?:\/\/[^\s<]+)/g, raw => {
      const clean = raw.replace(/[),.;!?]+$/, '');
      const suffix = raw.slice(clean.length);
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${suffix}`;
    });
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
      copied: Boolean(extras.copied),
      components: Array.isArray(extras.components) ? extras.components : [],
      sources: Array.isArray(extras.sources) ? extras.sources : [],
      context: extras.context && typeof extras.context === 'object' ? extras.context : null,
      ambiguity: extras.ambiguity && typeof extras.ambiguity === 'object' ? extras.ambiguity : null,
      knowledge: extras.knowledge && typeof extras.knowledge === 'object' ? extras.knowledge : null,
      citation: extras.citation && typeof extras.citation === 'object' ? extras.citation : null,
      presentation: extras.presentation && typeof extras.presentation === 'object' ? extras.presentation : null
    };
    conversation.messages.push(message);
    conversation.messages = conversation.messages.slice(-Number(CONFIG.maxMessagesPerConversation || 250));
    conversation.updatedAt = Date.now();
    saveState();
    return message;
  }

  function assistantActions(message) {
    const feedbackLabel = message.copied
      ? 'Resposta copiada'
      : message.feedback === 'helpful'
        ? 'Resposta salva como útil'
        : message.feedback === 'not-helpful'
          ? 'Problema registrado'
          : '';
    const copiedClass = message.copied ? 'selected copied' : '';
    const helpfulClass = message.feedback === 'helpful' ? 'selected helpful' : '';
    const negativeClass = message.feedback === 'not-helpful' ? 'selected negative' : '';
    return `
      <div class="message-toolbar" aria-label="Ações da resposta">
        <button type="button" data-copy-message="${escapeHtml(message.id)}" class="${copiedClass}" title="Copiar resposta" aria-label="Copiar resposta">${message.copied ? '✓' : '⧉'}</button>
        <button type="button" data-feedback="helpful" data-message="${escapeHtml(message.id)}" class="${helpfulClass}" title="Gostei / salvar como útil" aria-label="Gostei / salvar como útil" aria-pressed="${message.feedback === 'helpful'}">${message.feedback === 'helpful' ? '♥' : '♡'}</button>
        <button type="button" data-feedback="not-helpful" data-message="${escapeHtml(message.id)}" class="${negativeClass}" title="Não respondeu corretamente" aria-label="Não respondeu corretamente" aria-pressed="${message.feedback === 'not-helpful'}">!</button>
        ${message.error ? `<button type="button" data-retry-message="${escapeHtml(message.id)}">Tentar novamente</button>` : ''}
        ${feedbackLabel ? `<span class="message-action-status">${escapeHtml(feedbackLabel)}</span>` : ''}
      </div>`;
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
    try {
      const url = new URL(String(value || ''), location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function renderComponents(message) {
    const components = (Array.isArray(message.components) ? message.components : [])
      .filter(component => component && component.type !== 'hub-actions');
    if (!components.length) return '';
    const rendered = components.map(component => {
      const type = escapeHtml(component.type || 'information');
      if (component.type === 'sources') {
        const items = Array.isArray(component.items) ? component.items : [];
        const rows = items.map(item => {
          const href = safeExternalUrl(item.url || '');
          const body = `<span>📄 ${escapeHtml(item.title || 'Documento')}</span><small>${escapeHtml(item.label || `Página ${item.page || 1}`)}</small>${item.snippet ? `<em>${escapeHtml(item.snippet)}</em>` : ''}`;
          return href ? `<div class="source-row"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a></div>` : `<div class="source-row source-row-static">${body}</div>`;
        }).join('');
        return rows ? `<section class="structured-card sources-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Fontes')}</strong>${rows}</section>` : '';
      }
      const rows = [];
      if (component.email) rows.push(`<a href="mailto:${escapeHtml(component.email)}">✉ ${escapeHtml(component.email)}</a>`);
      if (component.phone) rows.push(`<span>☎ ${escapeHtml(component.phone)}</span>`);
      if (Array.isArray(component.subjects) && component.subjects.length) rows.push(`<span>Disciplinas: ${escapeHtml(component.subjects.join(', '))}</span>`);
      if (Array.isArray(component.links)) {
        for (const raw of component.links) {
          const href = safeExternalUrl(raw);
          if (href) rows.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir link</a>`);
        }
      }
      const actions = Array.isArray(component.actions) ? component.actions.filter(action => action?.value && action.kind !== 'open-url' && action.kind !== 'hub-search' && action.kind !== 'locate-sector' && action.kind !== 'favorite-document') : [];
      return `<section class="structured-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Informação')}</strong>${rows.join('')}${actions.length ? `<div class="structured-actions">${actions.map(action => `<button type="button" data-option-value="${escapeHtml(action.value)}">${escapeHtml(action.label || 'Continuar')}</button>`).join('')}</div>` : ''}</section>`;
    }).filter(Boolean);
    return rendered.length ? `<div class="structured-components">${rendered.join('')}</div>` : '';
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
    const warning = message.citation && !message.citation.verified;
    const rows = [];
    if (source?.title) rows.push(`<span><strong>Fonte:</strong> ${escapeHtml(source.title)}${source.page ? ` · página ${escapeHtml(source.page)}` : ''}</span>`);
    if (item.validity && item.validity !== 'não informada') rows.push(`<span><strong>Validade:</strong> ${escapeHtml(item.validity)}</span>`);
    if (item.lastReviewedAt) rows.push(`<span><strong>Revisado:</strong> ${escapeHtml(item.lastReviewedAt)}${item.responsible ? ` · ${escapeHtml(item.responsible)}` : ''}</span>`);
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
      message.role, message.text, message.error, message.feedback, message.copied,
      message.attachment, message.options, message.components, message.ambiguity,
      message.knowledge, message.citation, message.presentation
    ]);
  }

  function messageHtml(message) {
    if (message.role === 'user') {
      return `<article class="message-row user" data-message-id="${escapeHtml(message.id)}"><div class="message-content">${escapeHtml(message.text)}</div></article>`;
    }
    const attachment = message.attachment
      ? `<a class="attachment-link" href="${escapeHtml(safeExternalUrl(message.attachment.url) || '#')}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(message.attachment.fileName || 'Abrir anexo')}</a>`
      : '';
    const options = message.options?.length
      ? `<div class="message-actions">${message.options.map(option => `<button type="button" class="${option.kind === 'exit' ? 'exit-option' : ''}" data-option-kind="${escapeHtml(option.kind)}" data-option-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}</div>`
      : '';
    return `<article class="message-row assistant" data-message-id="${escapeHtml(message.id)}"><div class="assistant-avatar" aria-hidden="true">🤖</div><div class="message-content ${message.error ? 'error-card' : ''}">${renderMessageBody(message)}${renderAmbiguity(message)}${renderComponents(message)}${renderKnowledge(message)}${attachment}${options}${assistantActions(message)}</div></article>`;
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
      sendButton.disabled = state.sending || !input.value.trim();
      sendButton.setAttribute('aria-busy', state.sending ? 'true' : 'false');
      sendButton.title = state.sending ? 'Aguarde o assistente responder' : 'Enviar';
    }
    $('messageScroll')?.setAttribute('aria-busy', state.sending ? 'true' : 'false');
    const hint = $('composerHint');
    if (hint) hint.textContent = state.sending
      ? 'O assistente está escrevendo. Você pode continuar digitando; o envio será liberado após a resposta.'
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
        body: JSON.stringify(payload),
        signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
      return data;
    } finally { if (timer) clearTimeout(timer); }
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
      setConnection('offline', 'API indisponível');
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
    return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function findOfflineItem(text) {
    const catalog = state.offlineCatalog;
    if (!catalog) return null;
    const query = normalizeOffline(text);
    const terms = query.split(' ').filter(term => term.length > 2);
    let best = null;
    for (const item of catalog.items || []) {
      const hay = normalizeOffline([item.title,item.summary,item.category,...(item.tags||[])].join(' '));
      let score = terms.reduce((sum, term) => sum + (hay.includes(term) ? 2 : 0), 0);
      if (query && hay.includes(query)) score += 8;
      if (score && (!best || score > best.score)) best = { item, score };
    }
    return best?.item || null;
  }

  function offlineAnswer(text) {
    const updated = state.offlineCatalog?.updatedAt || '';
    const item = findOfflineItem(text);
    if (!item) return null;
    const sourceLabel = item.kind === 'document' && item.page ? `\n\nFonte relacionada: ${item.title}, página ${item.page}.` : '';
    return {
      text: `Modo offline — algumas informações podem não estar atualizadas.\n\n${item.summary || item.description || `Encontrei “${item.title}” nos dados locais do HUB.`}${sourceLabel}${updated ? `\n\nDados locais atualizados em ${updated}.` : ''}`,
      components: [],
      knowledge: item.knowledge || null,
      presentation: { progressive: false, summary: item.summary || item.description || item.title, details: '', source: sourceLabel.trim(), defaultExpanded: false }
    };
  }

  function openOrSendAction(value) {
    const href = safeExternalUrl(value);
    if (!href) return false;
    window.open(href, '_blank', 'noopener,noreferrer');
    return true;
  }


  async function send(text) {
    text = safeText(text).trim();
    if (!text) return;
    if (state.activeRequest) abortMessageRequest('superseded');
    const active = beginMessageRequest();
    addMessage('user', text);
    const input = $('messageInput');
    if (input) input.value = '';
    persistDraft('', { immediate: true });
    resizeInput();
    renderMessages();
    try {
      const conversation = currentConversation();
      const data = await request(CONFIG.messagePath || '/api/assistant/message', {
        sessionId: conversation.sessionId,
        message: text,
        senderName: state.settings.senderName
      }, { signal: active.controller.signal });
      if (state.activeRequest?.id !== active.id) return;
      if (data.sessionId) conversation.sessionId = data.sessionId;
      const replies = Array.isArray(data.replies) ? data.replies : [];
      if (!replies.length) {
        addMessage('assistant', 'Não encontrei uma resposta para essa mensagem. Tente reformular em uma frase curta.', { error: true });
      } else {
        replies.forEach((reply, index) => addMessage('assistant', reply.text, {
          serverId: reply.id,
          attachment: reply.attachment,
          options: index === replies.length - 1 ? (data.options || data.suggestions || []) : [],
          components: index === replies.length - 1 ? (data.components || []).filter(component => component?.type !== 'hub-actions') : [],
          sources: index === replies.length - 1 ? (data.sources || []) : [],
          context: null,
          ambiguity: index === replies.length - 1 ? data.ambiguity : null,
          knowledge: index === replies.length - 1 ? data.knowledge : null,
          citation: index === replies.length - 1 ? data.citation : null,
          presentation: reply.presentation || (index === replies.length - 1 ? data.presentation : null)
        }));
      }
      setConnection('online', 'Conectado');
    } catch (error) {
      if (state.activeRequest?.id !== active.id) return;
      const reason = active.reason || (error.name === 'AbortError' ? 'aborted' : 'error');
      if (reason === 'superseded' || reason === 'reset' || reason === 'unload') return;
      const offline = offlineAnswer(text);
      if (offline) addMessage('assistant', offline.text, { components: [], knowledge: offline.knowledge, presentation: offline.presentation, error: false });
      else {
        const message = reason === 'timeout' || error.name === 'AbortError'
          ? 'A resposta demorou demais. Verifique a conexão e tente novamente.'
          : `Não foi possível falar com o assistente. ${error.message}`;
        addMessage('assistant', message, { error: true });
      }
      setConnection('offline', offline ? 'Modo offline' : 'API indisponível');
    } finally {
      if (finishMessageRequest(active.id)) {
        saveState({ immediate: true });
        renderMessages();
        if (matchMedia('(pointer: fine)').matches && document.activeElement !== $('messageInput')) {
          $('messageInput')?.focus({ preventScroll: true });
        }
      }
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

  async function sendFeedback(messageId, value) {
    const message = messageById(messageId);
    if (!message) return;
    const nextValue = message.feedback === value ? '' : value;
    message.feedback = nextValue;
    saveState();
    renderMessages();
    showToast(nextValue === 'helpful' ? 'Salvo como útil' : nextValue === 'not-helpful' ? 'Problema registrado' : 'Feedback removido');
    if (!nextValue) return;
    try {
      await request(CONFIG.feedbackPath || '/api/assistant/feedback', {
        sessionId: currentConversation().sessionId,
        messageId: message.serverId || message.id,
        value: nextValue
      }, 8000);
    } catch {
      showToast('Feedback salvo neste dispositivo');
    }
  }


  function bind() {
    $('sendMessage').addEventListener('click', () => send($('messageInput').value));
    $('messageInput').addEventListener('input', event => { resizeInput(); persistDraft(event.currentTarget.value); });
    $('messageInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(event.currentTarget.value);
      }
    });
    $('promptGrid').addEventListener('click', event => {
      const button = event.target.closest('[data-prompt]');
      if (button) send(button.dataset.prompt);
    });
    $('messages').addEventListener('click', event => {
      const option = event.target.closest('[data-option-value]');
      const copy = event.target.closest('[data-copy-message]');
      const feedback = event.target.closest('[data-feedback]');
      const retry = event.target.closest('[data-retry-message]');
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
      else if (feedback) sendFeedback(feedback.dataset.message, feedback.dataset.feedback);
      else if (retry) {
        const text = priorUserText(retry.dataset.retryMessage);
        if (text) send(text);
      }
    });
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
  function syncViewportHeight() {
    const visualHeight = Number(globalThis.visualViewport?.height || 0);
    const visualTop = Number(globalThis.visualViewport?.offsetTop || 0);
    const layoutHeight = Number(globalThis.innerHeight || document.documentElement.clientHeight || 0);
    const height = Math.max(180, Math.round(visualHeight > 0 ? visualHeight : layoutHeight));
    document.documentElement.style.setProperty('--assistant-window-height', `${height}px`);
    document.documentElement.style.setProperty('--assistant-viewport-top', `${Math.max(0, Math.round(visualTop))}px`);
    document.body?.classList.toggle('assistant-compact-height', height < 300);
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

  function bindViewport() {
    syncViewportHeight();
    globalThis.visualViewport?.addEventListener('resize', () => scheduleViewportSync(20));
    globalThis.addEventListener('resize', () => scheduleViewportSync(20));
    globalThis.addEventListener('orientationchange', () => scheduleViewportSync(140));
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
