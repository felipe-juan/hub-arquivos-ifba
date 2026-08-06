(() => {
  'use strict';

  const CONFIG = window.HUB_ASSISTANT_CONFIG || {};
  const modules = window.HUBAssistant || {};
  const { createApiClient, safeExternalUrl } = modules.api || {};
  const { HistoryStore } = modules.history || {};
  const { OfflineSearch } = modules.offline || {};
  const { ChatController } = modules.chat || {};
  const { ComposerController } = modules.composer || {};
  const { MessageRenderer } = modules.renderer || {};
  const { ResponseActions } = modules.actions || {};
  if (![createApiClient, HistoryStore, OfflineSearch, ChatController, ComposerController, MessageRenderer, ResponseActions].every(Boolean)) {
    throw new Error('Módulos do Assistente incompletos. Atualize o cache da página.');
  }

  const $ = id => document.getElementById(id);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeText = value => String(value || '');
  const storage = new HistoryStore();
  const api = createApiClient(CONFIG);
  const offline = new OfflineSearch(CONFIG.offlineCatalogPath || 'offline-data.json');
  const composer = new ComposerController();
  const state = {
    conversation: null,
    settings: loadSettings(),
    toastTimer: 0
  };

  function defaultSettings() { return { senderName: 'Estudante' }; }
  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem('hubAssistantSettingsV1') || '{}');
      return { ...defaultSettings(), senderName: safeText(stored.senderName || 'Estudante').slice(0, 80) };
    } catch { return defaultSettings(); }
  }

  function normalizeOptions(options, { menu = null } = {}) {
    const normalized = (Array.isArray(options) ? options : [])
      .filter(option => option && typeof option === 'object')
      .map((option, index) => ({
        id: safeText(option.id || `option-${index + 1}`),
        label: safeText(option.label || `Opção ${index + 1}`),
        value: safeText(option.value ?? index + 1),
        kind: safeText(option.kind || 'choice')
      }));
    const isMenu = menu ?? normalized.some(option => ['choice', 'menu', 'disambiguation', 'exit'].includes(option.kind));
    if (isMenu && normalized.length && !normalized.some(option => option.kind === 'exit' || /^(?:sair|cancelar|0|n)$/i.test(option.value))) {
      normalized.push({ id: 'exit-menu', label: 'Sair e fazer outra pergunta', value: 'sair', kind: 'exit' });
    }
    return isMenu ? normalized : normalized.slice(0, 2);
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
      sessionId: safeText(value.sessionId || uuid().replace(/-/g, '')),
      title: 'Assistente do HUB',
      createdAt: Number(value.createdAt || Date.now()),
      updatedAt: Number(value.updatedAt || Date.now()),
      messages: Array.isArray(value.messages)
        ? value.messages.slice(-Number(CONFIG.maxMessagesPerConversation || 250)).map(message => ({ ...message, options: normalizeOptions(message.options, { menu: message.optionMode === 'menu' }) }))
        : []
    };
  }

  function currentConversation() {
    if (!state.conversation) state.conversation = freshConversation();
    return state.conversation;
  }

  function saveState(options = {}) {
    return storage.saveState({ conversation: currentConversation() }, options);
  }

  function addMessage(role, text, extras = {}) {
    const conversation = currentConversation();
    const message = {
      id: uuid(),
      serverId: safeText(extras.serverId || ''),
      role,
      text: safeText(text),
      createdAt: Date.now(),
      optionMode: extras.optionMode || '',
      options: normalizeOptions(extras.options, { menu: extras.optionMode === 'menu' }),
      attachment: extras.attachment || null,
      error: Boolean(extras.error),
      feedback: safeText(extras.feedback || ''),
      copied: Boolean(extras.copied),
      components: Array.isArray(extras.components) ? extras.components : [],
      sources: Array.isArray(extras.sources) ? extras.sources : [],
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

  const renderer = new MessageRenderer({
    getConversation: currentConversation,
    getSending: () => chat.sending,
    renderLimit: 80
  });

  function showToast(text) {
    const toast = $('actionToast');
    if (!toast) return;
    clearTimeout(state.toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  function syncSendingUi() {
    const input = $('messageInput');
    const sendButton = $('sendMessage');
    if (input && sendButton) {
      const stopping = chat.sending;
      sendButton.disabled = stopping ? false : !input.value.trim();
      sendButton.dataset.mode = stopping ? 'stop' : 'send';
      sendButton.setAttribute('aria-label', stopping ? 'Interromper resposta' : 'Enviar mensagem');
      sendButton.setAttribute('aria-busy', 'false');
      sendButton.title = stopping ? 'Interromper resposta' : 'Enviar';
      const icon = sendButton.querySelector('[aria-hidden="true"]');
      if (icon) icon.textContent = stopping ? '■' : '↑';
    }
    $('messageScroll')?.setAttribute('aria-busy', chat.sending ? 'true' : 'false');
    const hint = $('composerHint');
    if (hint) hint.textContent = chat.sending
      ? 'O assistente está escrevendo. Use o botão quadrado para interromper; o texto digitado será preservado.'
      : 'Enter envia · Shift + Enter quebra a linha';
    document.querySelectorAll('[data-prompt], [data-option-value]').forEach(button => { button.disabled = chat.sending; });
    composer.ensure();
  }

  const chat = new ChatController({
    timeoutMs: Number(CONFIG.requestTimeoutMs || 25000),
    onStateChange: () => {
      syncSendingUi();
      renderer.render();
    }
  });

  const responseActions = new ResponseActions({
    api,
    config: CONFIG,
    getConversation: currentConversation,
    getMessage: id => currentConversation().messages.find(message => message.id === id) || null,
    saveState,
    render: () => renderer.render(),
    showToast
  });

  function setConnection(status, label) {
    const element = $('connectionState');
    if (!element) return;
    element.dataset.state = status;
    const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${label}`;
    else element.append(document.createTextNode(` ${label}`));
  }

  async function checkHealth() {
    const result = await api.checkHealth();
    setConnection(result.ok ? 'online' : 'offline', result.ok ? 'Conectado' : result.reason || 'API indisponível');
    return result.ok;
  }

  function priorUserText(messageId) {
    const messages = currentConversation().messages;
    const index = messages.findIndex(message => message.id === messageId);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) if (messages[cursor].role === 'user') return messages[cursor].text;
    return '';
  }

  function responseOptions(data) {
    const menu = Array.isArray(data.options) && data.options.length > 0;
    return {
      mode: menu ? 'menu' : 'suggestion',
      values: menu ? data.options : (Array.isArray(data.suggestions) ? data.suggestions.slice(0, 2) : [])
    };
  }

  async function send(rawText) {
    const text = safeText(rawText).trim();
    if (!text || chat.sending) return;
    addMessage('user', text);
    const input = $('messageInput');
    if (input) input.value = '';
    storage.saveDraft('', { immediate: true });
    composer.resizeInput();
    renderer.render();

    const conversation = currentConversation();
    await chat.run(
      signal => api.request(CONFIG.messagePath || '/api/assistant/message', {
        sessionId: conversation.sessionId,
        message: text,
        senderName: state.settings.senderName
      }, { signal, timeoutMs: Number(CONFIG.requestTimeoutMs || 25000) + 1000 }),
      {
        onSuccess: data => {
          if (data.sessionId) conversation.sessionId = data.sessionId;
          const replies = Array.isArray(data.replies) ? data.replies : [];
          if (!replies.length) {
            addMessage('assistant', 'Não encontrei uma resposta para essa mensagem. Tente reformular em uma frase curta.', { error: true });
          } else {
            const choices = responseOptions(data);
            replies.forEach((reply, index) => addMessage('assistant', reply.text, {
              serverId: reply.id,
              attachment: reply.attachment,
              options: index === replies.length - 1 ? choices.values : [],
              optionMode: index === replies.length - 1 ? choices.mode : '',
              components: index === replies.length - 1 ? (data.components || []).filter(component => !['hub-actions', 'sources'].includes(component?.type)) : [],
              sources: index === replies.length - 1 ? (data.sources || []) : [],
              ambiguity: index === replies.length - 1 ? data.ambiguity : null,
              knowledge: index === replies.length - 1 ? data.knowledge : null,
              citation: index === replies.length - 1 ? data.citation : null,
              presentation: reply.presentation || (index === replies.length - 1 ? data.presentation : null)
            }));
          }
          setConnection('online', 'Conectado');
        },
        onError: (error, reason) => {
          const fallback = offline.answer(text);
          if (fallback) {
            addMessage('assistant', fallback.text, fallback);
            setConnection('offline', 'Modo offline');
            return;
          }
          const timedOut = ['timeout', 'aborted'].includes(reason)
            || error?.name === 'AbortError'
            || error?.code === 'ASSISTANT_RESPONSE_TIMEOUT'
            || error?.status === 504;
          const message = timedOut
            ? (error?.message || 'A resposta demorou demais e foi interrompida. Tente novamente.')
            : `Não foi possível falar com o assistente. ${error?.message || 'Erro desconhecido.'}`;
          addMessage('assistant', message, { error: true });
          setConnection(timedOut ? 'online' : 'offline', timedOut ? 'Conectado' : 'API indisponível');
        },
        onFinally: () => {
          saveState({ immediate: true });
          renderer.render();
          if (matchMedia('(pointer: fine)').matches && document.activeElement !== $('messageInput')) $('messageInput')?.focus({ preventScroll: true });
        }
      }
    );
  }

  function stopCurrentResponse() {
    if (!chat.abort('user-stop')) return false;
    saveState({ immediate: true });
    renderer.render();
    showToast('Resposta interrompida.');
    requestAnimationFrame(() => $('messageInput')?.focus({ preventScroll: true }));
    return true;
  }

  async function resetCurrent() {
    if (chat.sending) chat.abort('reset');
    const previous = currentConversation();
    try { await api.request(CONFIG.resetPath || '/api/assistant/reset', { sessionId: previous.sessionId }, { timeoutMs: 8000 }); } catch {}
    state.conversation = freshConversation();
    renderer.renderLimit = 80;
    renderer.fingerprints.clear();
    await storage.clear();
    renderer.render();
    syncSendingUi();
  }

  function openOrSendAction(value) {
    const href = safeExternalUrl(value);
    if (!href) return false;
    window.open(href, '_blank', 'noopener,noreferrer');
    return true;
  }

  function bind() {
    $('sendMessage')?.addEventListener('click', () => {
      if (chat.sending) stopCurrentResponse();
      else send($('messageInput')?.value);
    });
    $('messageInput')?.addEventListener('input', event => {
      composer.resizeInput();
      storage.saveDraft(event.currentTarget.value);
      syncSendingUi();
    });
    $('messageInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(event.currentTarget.value);
      }
    });
    $('promptGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-prompt]');
      if (button) send(button.dataset.prompt);
    });
    $('messages')?.addEventListener('click', event => {
      const option = event.target.closest('[data-option-value]');
      const copy = event.target.closest('[data-copy-message]');
      const feedback = event.target.closest('[data-feedback]');
      const retry = event.target.closest('[data-retry-message]');
      const loadEarlier = event.target.closest('[data-load-earlier]');
      if (loadEarlier) {
        const viewport = $('messageScroll');
        const previousHeight = viewport?.scrollHeight || 0;
        renderer.renderLimit += 80;
        renderer.render();
        requestAnimationFrame(() => { if (viewport) viewport.scrollTop += viewport.scrollHeight - previousHeight; });
      } else if (option && !chat.sending) {
        if (!openOrSendAction(option.dataset.optionValue)) send(option.dataset.optionValue);
      } else if (copy) responseActions.copy(copy.dataset.copyMessage);
      else if (feedback) responseActions.feedback(feedback.dataset.message, feedback.dataset.feedback);
      else if (retry) {
        const text = priorUserText(retry.dataset.retryMessage);
        if (text) send(text);
      }
    });
    $('clearConversation')?.addEventListener('click', () => {
      if (confirm('Limpar a conversa e começar novamente?')) resetCurrent();
    });
    window.addEventListener('online', checkHealth);
    window.addEventListener('offline', () => setConnection('offline', 'Sem internet'));
    window.addEventListener('pageshow', () => { composer.ensure(); syncSendingUi(); renderer.render(); });
    window.addEventListener('pagehide', () => storage.saveDraft($('messageInput')?.value || '', { immediate: true }));
  }

  async function bootstrap() {
    composer.bind();
    bind();
    const [saved, , draft] = await Promise.all([storage.loadState(), offline.load(), storage.loadDraft()]);
    let source = saved?.conversation;
    if (!source && Array.isArray(saved?.conversations)) {
      source = saved.conversations.find(item => item.id === saved.currentId)
        || [...saved.conversations].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    }
    state.conversation = normalizeConversation(source);
    const input = $('messageInput');
    if (input && draft) input.value = safeText(draft).slice(0, 3000);
    composer.ensure();
    composer.resizeInput();
    syncSendingUi();
    renderer.render();
    checkHealth();
    if (matchMedia('(pointer: fine)').matches) input?.focus({ preventScroll: true });
  }

  bootstrap().catch(error => {
    console.error('Falha ao iniciar o Assistente:', error);
    state.conversation = freshConversation();
    composer.ensure();
    syncSendingUi();
    renderer.render();
  });
})();
