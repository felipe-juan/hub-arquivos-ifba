(() => {
  'use strict';

  const CONFIG = window.HUB_ASSISTANT_CONFIG || {};
  const STORAGE_KEY = 'hubAssistantStateV1';
  const SETTINGS_KEY = 'hubAssistantSettingsV1';
  const DB_NAME = 'hubAssistantHistoryV1';
  const DB_STORE = 'state';
  const $ = id => document.getElementById(id);
  const state = {
    conversation: null,
    sending: false,
    requestSerial: 0,
    settings: loadSettings(),
    offlineCatalog: null,
    typingWatchdog: 0,
    toastTimer: 0
  };
  const composerGuard = {
    area: null,
    workspace: null,
    observer: null,
    resizeObserver: null,
    timer: 0
  };

  function uuid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function openHistoryDatabase() {
    if (!('indexedDB' in globalThis)) return Promise.resolve(null);
    return new Promise(resolve => {
      let request;
      let settled = false;
      const finish = value => {
        if (settled) {
          try { value?.close?.(); } catch {}
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value || null);
      };
      const timer = setTimeout(() => finish(null), 1500);
      try { request = indexedDB.open(DB_NAME, 1); } catch { finish(null); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    });
  }

  async function loadSavedState() {
    const database = await openHistoryDatabase();
    if (database) {
      const saved = await new Promise(resolve => {
        const transaction = database.transaction(DB_STORE, 'readonly');
        const request = transaction.objectStore(DB_STORE).get('main');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
      database.close();
      if (saved) return saved;
    }
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  async function persistSavedState(value) {
    const database = await openHistoryDatabase();
    if (database) {
      await new Promise(resolve => {
        const transaction = database.transaction(DB_STORE, 'readwrite');
        transaction.objectStore(DB_STORE).put(value, 'main');
        transaction.oncomplete = resolve;
        transaction.onerror = resolve;
        transaction.onabort = resolve;
      });
      database.close();
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
  }

  async function clearSavedState() {
    const database = await openHistoryDatabase();
    if (database) {
      await new Promise(resolve => {
        const transaction = database.transaction(DB_STORE, 'readwrite');
        transaction.objectStore(DB_STORE).delete('main');
        transaction.oncomplete = resolve;
        transaction.onerror = resolve;
        transaction.onabort = resolve;
      });
      database.close();
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
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

  function saveState() {
    if (!state.conversation) state.conversation = freshConversation();
    persistSavedState({ conversation: state.conversation });
  }

  function currentConversation() {
    if (!state.conversation) state.conversation = freshConversation();
    return state.conversation;
  }

  function apiUrl(path) {
    return `${String(CONFIG.apiBaseUrl || '').replace(/\/$/, '')}${path}`;
  }

  function safeText(value) { return String(value || ''); }


  function removeVisibilityBlockers(element) {
    if (!element) return;
    if (element.hidden) element.hidden = false;
    if (element.hasAttribute('hidden')) element.removeAttribute('hidden');
    if (element.hasAttribute('inert')) element.removeAttribute('inert');
    if (element.getAttribute('aria-hidden') === 'true') element.removeAttribute('aria-hidden');
    for (const property of ['display', 'visibility', 'opacity', 'transform', 'pointer-events']) {
      const value = element.style.getPropertyValue(property);
      if (value && /(?:none|hidden|^0$)/i.test(value)) element.style.removeProperty(property);
    }
  }

  function updateComposerMetrics() {
    const area = composerGuard.area || $('composerArea');
    if (!area?.isConnected) return;
    const height = Math.max(58, Math.ceil(area.getBoundingClientRect().height || area.offsetHeight || 0));
    document.documentElement.style.setProperty('--assistant-composer-height', `${height}px`);
  }

  function ensureComposerVisible() {
    const workspace = composerGuard.workspace || document.querySelector('.assistant-workspace');
    const area = composerGuard.area || $('composerArea');
    if (!workspace || !area) return false;
    composerGuard.workspace = workspace;
    composerGuard.area = area;
    if (!area.isConnected || area.parentElement !== workspace) workspace.append(area);
    removeVisibilityBlockers(area);
    removeVisibilityBlockers($('composer'));
    removeVisibilityBlockers($('messageInput'));
    removeVisibilityBlockers($('sendMessage'));
    area.classList.add('composer-always-visible');
    updateComposerMetrics();
    return true;
  }

  function scheduleComposerGuard(delay = 0) {
    clearTimeout(composerGuard.timer);
    composerGuard.timer = setTimeout(() => {
      ensureComposerVisible();
      requestAnimationFrame(updateComposerMetrics);
    }, delay);
  }

  function bindComposerGuard() {
    composerGuard.workspace = document.querySelector('.assistant-workspace');
    composerGuard.area = $('composerArea');
    ensureComposerVisible();
    if (typeof MutationObserver === 'function' && composerGuard.workspace) {
      composerGuard.observer = new MutationObserver(() => scheduleComposerGuard(0));
      composerGuard.observer.observe(composerGuard.workspace, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class']
      });
    }
    if (typeof ResizeObserver === 'function' && composerGuard.area) {
      composerGuard.resizeObserver = new ResizeObserver(() => updateComposerMetrics());
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

  function actionButton(action = {}) {
    const kind = escapeHtml(action.kind || (String(action.value || '').startsWith('http') ? 'open-url' : 'message'));
    const value = escapeHtml(action.value || '');
    const title = escapeHtml(action.title || '');
    const page = escapeHtml(action.page || '');
    const meta = escapeHtml(action.meta || '');
    const icon = escapeHtml(action.icon || '');
    return `<button type="button" data-hub-action data-action-kind="${kind}" data-action-value="${value}" data-action-title="${title}" data-action-page="${page}" data-action-meta="${meta}">${icon ? `<span aria-hidden="true">${icon}</span>` : ''}${escapeHtml(action.label || 'Abrir')}</button>`;
  }

  function renderComponents(message) {
    const components = Array.isArray(message.components) ? message.components : [];
    if (!components.length) return '';
    return `<div class="structured-components">${components.map(component => {
      const type = escapeHtml(component.type || 'information');
      if (component.type === 'sources') {
        const items = Array.isArray(component.items) ? component.items : [];
        return `<section class="structured-card sources-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Fontes no HUB')}</strong>${items.map(item => `<div class="source-row"><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer"><span>📄 ${escapeHtml(item.title || 'Documento')}</span><small>${escapeHtml(item.label || `Página ${item.page || 1}`)}</small>${item.snippet ? `<em>${escapeHtml(item.snippet)}</em>` : ''}</a><button type="button" data-hub-action data-action-kind="favorite-document" data-action-value="${escapeHtml(item.url || '#')}" data-action-title="${escapeHtml(item.title || 'Documento')}" data-action-page="${escapeHtml(item.page || 1)}" data-action-meta="${escapeHtml(item.label || 'Documento')}">☆</button></div>`).join('')}</section>`;
      }
      const rows = [];
      if (component.email) rows.push(`<a href="mailto:${escapeHtml(component.email)}">✉ ${escapeHtml(component.email)}</a>`);
      if (component.phone) rows.push(`<span>☎ ${escapeHtml(component.phone)}</span>`);
      if (Array.isArray(component.subjects) && component.subjects.length) rows.push(`<span>Disciplinas: ${escapeHtml(component.subjects.join(', '))}</span>`);
      if (Array.isArray(component.links)) rows.push(...component.links.map(link => `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Abrir link</a>`));
      const actions = Array.isArray(component.actions) ? component.actions : [];
      return `<section class="structured-card" data-component="${type}"><strong>${escapeHtml(component.title || 'Informação')}</strong>${rows.join('')}${actions.length ? `<div class="structured-actions">${actions.map(action => component.type === 'hub-actions' ? actionButton(action) : `<button type="button" data-option-value="${escapeHtml(action.value)}">${escapeHtml(action.label)}</button>`).join('')}</div>` : ''}</section>`;
    }).join('')}</div>`;
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

  function scrollToBottom(smooth = true) {
    const viewport = $('messageScroll');
    if (!viewport) return;
    const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    try {
      viewport.scrollTo({
        top,
        behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto'
      });
    } catch { viewport.scrollTop = top; }
  }

  function renderMessages() {
    ensureComposerVisible();
    const conversation = currentConversation();
    $('welcome').hidden = Boolean(conversation.messages.length);
    $('messages').innerHTML = conversation.messages.map(message => {
      if (message.role === 'user') {
        return `<article class="message-row user" data-message-id="${escapeHtml(message.id)}"><div class="message-content">${escapeHtml(message.text)}</div></article>`;
      }
      const attachment = message.attachment
        ? `<a class="attachment-link" href="${escapeHtml(message.attachment.url)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(message.attachment.fileName || 'Abrir anexo')}</a>`
        : '';
      const options = message.options?.length
        ? `<div class="message-actions">${message.options.map(option => `<button type="button" class="${option.kind === 'exit' ? 'exit-option' : ''}" data-option-kind="${escapeHtml(option.kind)}" data-option-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}</div>`
        : '';
      return `
        <article class="message-row assistant" data-message-id="${escapeHtml(message.id)}">
          <div class="assistant-avatar" aria-hidden="true">🤖</div>
          <div class="message-content ${message.error ? 'error-card' : ''}">
            ${renderMessageBody(message)}${renderAmbiguity(message)}${renderComponents(message)}${renderKnowledge(message)}${attachment}${options}${assistantActions(message)}
          </div>
        </article>`;
    }).join('');
    if (state.sending) showTyping();
    requestAnimationFrame(() => {
      ensureComposerVisible();
      scrollToBottom(false);
    });
  }

  function render() {
    ensureComposerVisible();
    renderMessages();
    setSending(state.sending);
    ensureComposerVisible();
  }

  function hideTyping() {
    document.querySelectorAll('[data-typing="true"]').forEach(element => element.remove());
    $('messageScroll')?.setAttribute('aria-busy', 'false');
  }

  function setSending(active) {
    ensureComposerVisible();
    state.sending = Boolean(active);
    clearTimeout(state.typingWatchdog);
    if (state.sending) state.typingWatchdog = setTimeout(() => {
      state.requestSerial += 1;
      state.sending = false;
      hideTyping();
      setConnection('offline', 'Resposta interrompida por tempo limite');
      renderMessages();
    }, Math.max(30000, Number(CONFIG.requestTimeoutMs || 25000) + 5000));
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
    scheduleComposerGuard(0);
  }

  function showTyping() {
    if (!state.sending || document.querySelector('[data-typing="true"]')) return;
    $('messages').append($('typingTemplate').content.cloneNode(true));
    $('messageScroll').setAttribute('aria-busy', 'true');
    scrollToBottom(false);
  }

  function setConnection(status, label) {
    const element = $('connectionState');
    element.dataset.state = status;
    const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${label}`;
    else element.append(document.createTextNode(` ${label}`));
  }

  async function request(path, payload, timeoutMs = Number(CONFIG.requestTimeoutMs || 25000)) {
    if (!CONFIG.apiBaseUrl) throw new Error('A API do Assistente não está configurada nesta versão.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
      return data;
    } finally { clearTimeout(timer); }
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
    const value = normalizeOffline(text);
    const hubRoot = new URL('../../', location.href).href;
    const updated = state.offlineCatalog?.updatedAt || '';
    const answer = (body, actions = [], extra = {}) => ({
      text: `Modo offline — algumas informações podem não estar atualizadas.\n\n${body}${updated ? `\n\nAtualizado em ${updated}.` : ''}`,
      components: actions.length ? [{ type: 'hub-actions', title: 'Ações disponíveis', actions }] : [],
      knowledge: extra.knowledge || null,
      presentation: { progressive: false, summary: body, details: '', source: updated ? `Dados locais atualizados em ${updated}.` : '', defaultExpanded: false }
    });
    const item = findOfflineItem(text);
    if (item) {
      const actions = [];
      if (item.url) actions.push({ label:'Abrir no HUB', kind:'open-url', value:item.url, icon:'↗' });
      if (item.kind === 'document' && item.url) actions.push({ label:'Favoritar documento', kind:'favorite-document', value:item.url, title:item.title, page:item.page || 1, meta:item.category || 'Documento', icon:'☆' });
      return answer(item.summary || item.description || `Encontrei “${item.title}” nos dados locais do HUB.`, actions, { knowledge: item.knowledge || null });
    }
    if (/suap/.test(value)) return answer('Acesse o SUAP pelo sistema institucional.', [{ label:'Abrir SUAP',kind:'open-url',value:'https://suap.ifba.edu.br',icon:'↗' }]);
    if (/portal|campus/.test(value)) return answer('O Portal do Campus Vitória da Conquista reúne notícias, setores e editais.', [{ label:'Abrir Portal',kind:'open-url',value:'https://portal.ifba.edu.br/conquista',icon:'↗' }]);
    if (/biblioteca/.test(value)) return answer('Contato local salvo: biblioteca.vdc@ifba.edu.br. A página da Biblioteca reúne catálogo e serviços.', [{ label:'Abrir Biblioteca',kind:'open-url',value:'https://portal.ifba.edu.br/conquista/ensino/biblioteca',icon:'📚' },{label:'Copiar e-mail',kind:'copy',value:'biblioteca.vdc@ifba.edu.br',icon:'✉'}]);
    if (/caens|estagio/.test(value)) return answer('Contato local salvo da CAENS: caens.vdc@ifba.edu.br. Para dados atualizados, confirme na página oficial do setor.', [{ label:'Abrir CAENS',kind:'open-url',value:'https://portal.ifba.edu.br/conquista/coordenacao-de-apoio-ao-ensino-caens',icon:'↗' },{label:'Copiar e-mail',kind:'copy',value:'caens.vdc@ifba.edu.br',icon:'✉'}]);
    if (/setor|contato|coordenacao|localizacao/.test(value)) return answer('A busca local do HUB pode localizar páginas, contatos e documentos de setores.', [{ label:'Buscar no HUB',kind:'open-url',value:`${hubRoot}?q=${encodeURIComponent(text)}`,icon:'⌕' }]);
    if (/calendario|feriado|recesso|data/.test(value)) return answer('Consulte o calendário acadêmico salvo no HUB.', [{ label:'Ver calendário',kind:'open-url',value:`${hubRoot}apps/calendario/`,icon:'📅' }]);
    if (/horario|aula|semestre/.test(value)) return answer('Os horários recentes podem ser localizados pela busca do HUB.', [{ label:'Ver horários',kind:'open-url',value:`${hubRoot}?q=${encodeURIComponent('horários '+text)}`,icon:'🕒' }]);
    if (/documento|regulamento|resolucao|ppc|matriz|trancamento|jubilamento/.test(value)) return answer('A busca do HUB continua disponível para localizar documentos oficiais armazenados no dispositivo.', [{ label:'Buscar documentos',kind:'open-url',value:`${hubRoot}?q=${encodeURIComponent(text)}`,icon:'📄' }]);
    if (/ajuda|o que voce|pode fazer/.test(value)) return answer('Posso ajudar offline com cards mais consultados, documentos recentes, calendário, contatos, setores, links e horários sincronizados.');
    return null;
  }

  const FAVORITES_KEY = 'hubFavoritesV1';
  function readFavorites() { try { const value=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } }
  function favoriteKey(item={}) { return `${item.kind||'document'}:${item.id||item.url||item.title}`; }
  function toggleDocumentFavorite({ value='', title='Documento', page='1', meta='Documento', button=null } = {}) {
    const item={ id:value, kind:'document', title, url:value, meta:meta || `Página ${page}` };
    const items=readFavorites(); const key=favoriteKey(item); const index=items.findIndex(saved=>favoriteKey(saved)===key);
    const active=index<0;
    if(active) items.unshift(item); else items.splice(index,1);
    try { localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,30))); } catch {}
    if(button){button.classList.toggle('is-favorite',active);button.textContent=active?'★':'☆';button.setAttribute('aria-pressed',String(active));}
    window.dispatchEvent(new CustomEvent('hub:favorites-changed'));
    showToast(active?'Documento adicionado aos favoritos':'Documento removido dos favoritos');
  }

  async function handleHubAction(button) {
    const kind=button.dataset.actionKind||'message'; const value=button.dataset.actionValue||'';
    if(kind==='favorite-document'){toggleDocumentFavorite({value,title:button.dataset.actionTitle||'Documento',page:button.dataset.actionPage||'1',meta:button.dataset.actionMeta||'Documento',button});return true;}
    if(kind==='copy'){try{await navigator.clipboard.writeText(value);}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove();}showToast('Copiado');return true;}
    if(kind==='open-url'||kind==='hub-search'||kind==='locate-sector'){window.open(new URL(value,location.href).href,'_blank','noopener,noreferrer');return true;}
    if(kind==='message'){if(!state.sending)send(value);return true;}
    return false;
  }

  function openOrSendAction(value) {
    if (/^(?:https?:\/\/|\.\.?\/|\/|#)/i.test(value)) { window.open(new URL(value, location.href).href, '_blank', 'noopener,noreferrer'); return true; }
    return false;
  }



  async function send(text) {
    text = safeText(text).trim();
    if (!text || state.sending) return;
    const serial = ++state.requestSerial;
    addMessage('user', text);
    const input = $('messageInput');
    if (input) input.value = '';
    resizeInput();
    setSending(true);
    renderMessages();
    try {
      const conversation = currentConversation();
      const data = await request(CONFIG.messagePath || '/api/assistant/message', {
        sessionId: conversation.sessionId,
        message: text,
        senderName: state.settings.senderName
      });
      if (serial !== state.requestSerial) return;
      if (data.sessionId) conversation.sessionId = data.sessionId;
      const replies = Array.isArray(data.replies) ? data.replies : [];
      if (!replies.length) {
        addMessage('assistant', 'Não encontrei uma resposta para essa mensagem. Tente reformular em uma frase curta.', { error: true });
      } else {
        replies.forEach((reply, index) => addMessage('assistant', reply.text, {
          serverId: reply.id,
          attachment: reply.attachment,
          options: index === replies.length - 1 ? (data.options || data.suggestions || []) : [],
          components: index === replies.length - 1 ? (data.components || []) : [],
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
      if (serial !== state.requestSerial) return;
      const offline = offlineAnswer(text);
      if (offline) addMessage('assistant', offline.text, { components: offline.components, knowledge: offline.knowledge, presentation: offline.presentation, error: false });
      else {
        const message = error.name === 'AbortError'
          ? 'A resposta demorou demais. Verifique a conexão e tente novamente.'
          : `Não foi possível falar com o assistente. ${error.message}`;
        addMessage('assistant', message, { error: true });
      }
      setConnection('offline', offline ? 'Modo offline' : 'API indisponível');
    } finally {
      if (serial === state.requestSerial) {
        setSending(false);
        saveState();
        renderMessages();
        if (matchMedia('(pointer: fine)').matches && document.activeElement !== $('messageInput')) {
          $('messageInput').focus({ preventScroll: true });
        }
      }
    }
  }

  function resizeInput() {
    ensureComposerVisible();
    const input = $('messageInput');
    if (!input) {
      scheduleComposerGuard(0);
      return;
    }
    input.style.height = 'auto';
    input.style.height = `${Math.min(180, input.scrollHeight)}px`;
    updateComposerMetrics();
    setSending(state.sending);
  }

  async function resetCurrent() {
    const previous = currentConversation();
    state.requestSerial += 1;
    setSending(false);
    try { await request(CONFIG.resetPath || '/api/assistant/reset', { sessionId: previous.sessionId }, 8000); } catch {}
    state.conversation = freshConversation();
    saveState();
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
    $('messageInput').addEventListener('input', resizeInput);
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
      const hubAction = event.target.closest('[data-hub-action]');
      const option = event.target.closest('[data-option-value]');
      const copy = event.target.closest('[data-copy-message]');
      const feedback = event.target.closest('[data-feedback]');
      const retry = event.target.closest('[data-retry-message]');
      if (hubAction) {
        handleHubAction(hubAction);
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
      ensureComposerVisible();
      setSending(false);
      renderMessages();
      scheduleComposerGuard(0);
    });
    document.addEventListener('focusin', event => {
      if (event.target === $('messageInput')) scheduleComposerGuard(0);
    });
    document.addEventListener('focusout', () => scheduleComposerGuard(80));
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
    ensureComposerVisible();
  }

  function scheduleViewportSync(delay = 0) {
    clearTimeout(viewportSyncTimer);
    viewportSyncTimer = setTimeout(() => {
      syncViewportHeight();
      ensureComposerVisible();
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
        ensureComposerVisible();
        setSending(false);
        scheduleViewportSync(0);
      }
    });
  }

  async function bootstrap() {
    bindComposerGuard();
    bindViewport();
    bind();
    await Promise.all([loadState(), loadOfflineCatalog()]);
    ensureComposerVisible();
    setSending(false);
    render();
    resizeInput();
    checkHealth();
    if (matchMedia('(pointer: fine)').matches) $('messageInput').focus({ preventScroll: true });
  }

  bootstrap().catch(error => {
    console.error('Falha ao iniciar o Assistente:', error);
    state.conversation = freshConversation();
    ensureComposerVisible();
    setSending(false);
    render();
    scheduleComposerGuard(0);
  });
})();
