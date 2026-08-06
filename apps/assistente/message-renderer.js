(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};
  const safeExternalUrl = (...args) => root.api.safeExternalUrl(...args);

  function safeText(value) { return String(value || ''); }
  function normalize(value = '') {
    return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
      return `<a href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">${escapeHtml(clean)}</a>${escapeHtml(suffix)}`;
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
      if (bullet) { list.push(`<li>${renderInline(bullet[1])}</li>`); continue; }
      flush();
      if (!line.trim()) out.push('<div class="message-break" aria-hidden="true"></div>');
      else out.push(`<p>${renderInline(line)}</p>`);
    }
    flush();
    return out.join('');
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
    return `<div class="message-toolbar" aria-label="Ações da resposta">
      <button type="button" data-copy-message="${escapeHtml(message.id)}" class="${copiedClass}" title="Copiar resposta" aria-label="Copiar resposta">${message.copied ? '✓' : '⧉'}</button>
      <button type="button" data-feedback="helpful" data-message="${escapeHtml(message.id)}" class="${helpfulClass}" title="Gostei / salvar como útil" aria-label="Gostei / salvar como útil" aria-pressed="${message.feedback === 'helpful'}">${message.feedback === 'helpful' ? '♥' : '♡'}</button>
      <button type="button" data-feedback="not-helpful" data-message="${escapeHtml(message.id)}" class="${negativeClass}" title="Não respondeu corretamente" aria-label="Não respondeu corretamente" aria-pressed="${message.feedback === 'not-helpful'}">!</button>
      ${message.error ? `<button type="button" data-retry-message="${escapeHtml(message.id)}">Tentar novamente</button>` : ''}
      ${feedbackLabel ? `<span class="message-action-status">${escapeHtml(feedbackLabel)}</span>` : ''}
    </div>`;
  }

  function renderAmbiguity(message) {
    const item = message.ambiguity;
    if (!item) return '';
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    return `<section class="ambiguity-card"><strong>${escapeHtml(item.title || 'Encontrei mais de uma possibilidade.')}</strong><p>${escapeHtml(item.explanation || '')}</p>${candidates.length ? `<ol>${candidates.map(candidate => `<li>${escapeHtml(candidate.label)}</li>`).join('')}</ol>` : ''}</section>`;
  }

  function visibleAnswer(message) {
    const presentation = message.presentation || {};
    return presentation.summary || presentation.answer || message.text || '';
  }

  function componentRows(component, answerText) {
    const rows = [];
    const answer = normalize(answerText);
    const add = (raw, html) => {
      const value = safeText(raw).trim();
      if (!value || answer.includes(normalize(value))) return;
      rows.push(html);
    };
    if (component.email) add(component.email, `<a href="mailto:${escapeHtml(component.email)}">✉ ${escapeHtml(component.email)}</a>`);
    if (component.phone) add(component.phone, `<span>☎ ${escapeHtml(component.phone)}</span>`);
    if (Array.isArray(component.subjects) && component.subjects.length) {
      const joined = component.subjects.join(', ');
      add(joined, `<span>Disciplinas: ${escapeHtml(joined)}</span>`);
    }
    for (const raw of Array.isArray(component.links) ? component.links : []) {
      const href = safeExternalUrl(raw);
      if (href && !answer.includes(normalize(href))) rows.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir link</a>`);
    }
    return rows;
  }

  function renderComponents(message) {
    const components = (Array.isArray(message.components) ? message.components : [])
      .filter(component => component && !['hub-actions', 'sources'].includes(component.type));
    const rendered = [];
    for (const component of components) {
      const rows = componentRows(component, visibleAnswer(message));
      if (!rows.length) continue;
      rendered.push(`<section class="structured-card" data-component="${escapeHtml(component.type || 'information')}"><strong>${escapeHtml(component.title || 'Informação complementar')}</strong>${rows.join('')}</section>`);
    }
    return rendered.length ? `<div class="structured-components">${rendered.slice(0, 1).join('')}</div>` : '';
  }

  function primarySource(message) {
    const sources = Array.isArray(message.sources) ? message.sources : [];
    return sources[0] || message.knowledge?.source || null;
  }

  function renderSource(message) {
    const source = primarySource(message);
    if (!source?.title) return '';
    const answer = normalize(visibleAnswer(message));
    const sourceText = normalize(source.title);
    const alreadyNamed = sourceText && answer.includes(sourceText);
    const label = message.citation?.verified ? 'Fonte verificada' : 'Fonte relacionada';
    const href = safeExternalUrl(source.url || '');
    const title = `${source.title}${source.page ? `, p. ${source.page}` : ''}`;
    const compact = alreadyNamed ? '' : `<div class="source-compact"><strong>${label}:</strong> ${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}</div>`;
    const snippet = safeText(source.snippet || source.excerpt || '').trim();
    const excerpt = snippet && !answer.includes(normalize(snippet))
      ? `<details class="source-excerpt"><summary>Ver trecho da fonte</summary><blockquote>${escapeHtml(snippet)}</blockquote></details>`
      : '';
    return compact || excerpt ? `<section class="source-block">${compact}${excerpt}</section>` : '';
  }

  function renderMessageBody(message) {
    const presentation = message.presentation || {};
    const main = presentation.summary || presentation.answer || message.text;
    const details = safeText(presentation.details || '').trim();
    const label = safeText(presentation.detailsLabel || 'Ver explicação completa');
    return `<section class="progressive-answer"><div class="progressive-summary">${formatMessage(main)}</div>${details ? `<details><summary>${escapeHtml(label)}</summary><div class="progressive-details">${formatMessage(details)}</div></details>` : ''}</section>`;
  }

  function messageFingerprint(message) {
    return JSON.stringify([
      message.role, message.text, message.error, message.feedback, message.copied,
      message.attachment, message.options, message.components, message.ambiguity,
      message.knowledge, message.citation, message.presentation, message.sources
    ]);
  }

  function createNodeFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function displayedOptions(message) {
    const all = Array.isArray(message.options) ? message.options : [];
    const isMenu = all.some(option => ['choice', 'menu', 'disambiguation', 'exit'].includes(option.kind));
    if (isMenu) return all;
    return all.slice(0, 2);
  }

  function messageHtml(message) {
    if (message.role === 'user') {
      return `<article class="message-row user" data-message-id="${escapeHtml(message.id)}"><div class="message-content">${escapeHtml(message.text)}</div></article>`;
    }
    const attachmentUrl = safeExternalUrl(message.attachment?.url || '');
    const attachment = attachmentUrl
      ? `<a class="attachment-link" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(message.attachment.fileName || 'Abrir anexo')}</a>`
      : '';
    const visibleOptions = displayedOptions(message);
    const options = visibleOptions.length
      ? `<div class="message-actions">${visibleOptions.map(option => `<button type="button" class="${option.kind === 'exit' ? 'exit-option' : ''}" data-option-kind="${escapeHtml(option.kind)}" data-option-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}</div>`
      : '';
    return `<article class="message-row assistant" data-message-id="${escapeHtml(message.id)}"><div class="assistant-avatar" aria-hidden="true">🤖</div><div class="message-content ${message.error ? 'error-card' : ''}">${renderMessageBody(message)}${renderAmbiguity(message)}${renderSource(message)}${renderComponents(message)}${attachment}${options}${assistantActions(message)}</div></article>`;
  }

  class MessageRenderer {
    constructor({ getConversation, getSending, renderLimit = 80 } = {}) {
      this.getConversation = getConversation;
      this.getSending = getSending;
      this.renderLimit = renderLimit;
      this.fingerprints = new Map();
    }
    isNearBottom(viewport = document.getElementById('messageScroll'), threshold = 120) {
      if (!viewport) return true;
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= threshold;
    }
    scrollToBottom(smooth = true) {
      const viewport = document.getElementById('messageScroll');
      if (!viewport) return;
      const top = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      try { viewport.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' }); }
      catch { viewport.scrollTop = top; }
    }
    showTyping() {
      if (!this.getSending() || document.querySelector('[data-typing="true"]')) return;
      const messages = document.getElementById('messages');
      const template = document.getElementById('typingTemplate');
      if (!messages || !template) return;
      messages.append(template.content.cloneNode(true));
      document.getElementById('messageScroll')?.setAttribute('aria-busy', 'true');
      if (this.isNearBottom()) this.scrollToBottom(false);
    }
    hideTyping() {
      document.querySelectorAll('[data-typing="true"]').forEach(element => element.remove());
      document.getElementById('messageScroll')?.setAttribute('aria-busy', 'false');
    }
    render() {
      const conversation = this.getConversation();
      const container = document.getElementById('messages');
      const viewport = document.getElementById('messageScroll');
      if (!container || !conversation) return;
      const keepBottom = this.isNearBottom(viewport);
      const welcome = document.getElementById('welcome');
      if (welcome) welcome.hidden = Boolean(conversation.messages.length);
      const visible = conversation.messages.slice(-this.renderLimit);
      const visibleIds = new Set(visible.map(message => message.id));
      container.querySelectorAll('[data-message-id]').forEach(node => {
        if (!visibleIds.has(node.dataset.messageId)) { this.fingerprints.delete(node.dataset.messageId); node.remove(); }
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
      } else loadEarlier?.remove();
      const typing = container.querySelector('[data-typing="true"]');
      for (const message of visible) {
        const fingerprint = messageFingerprint(message);
        let node = container.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
        if (!node) node = createNodeFromHtml(messageHtml(message));
        else if (this.fingerprints.get(message.id) !== fingerprint) {
          const replacement = createNodeFromHtml(messageHtml(message));
          node.replaceWith(replacement);
          node = replacement;
        }
        this.fingerprints.set(message.id, fingerprint);
        container.insertBefore(node, typing || null);
      }
      if (this.getSending()) this.showTyping(); else this.hideTyping();
      requestAnimationFrame(() => { if (keepBottom) this.scrollToBottom(false); });
    }
  }

  root.renderer = { MessageRenderer, escapeHtml, formatMessage, normalize };
})();
