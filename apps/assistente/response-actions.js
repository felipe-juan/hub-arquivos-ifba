(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  class ResponseActions {
    constructor({ api, config, getConversation, getMessage, saveState, render, showToast } = {}) {
      this.api = api;
      this.config = config || {};
      this.getConversation = getConversation;
      this.getMessage = getMessage;
      this.saveState = saveState;
      this.render = render;
      this.showToast = showToast;
    }

    async copy(messageId) {
      const message = this.getMessage(messageId);
      if (!message) return;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(message.text);
        else throw new Error('clipboard indisponível');
      } catch {
        const area = document.createElement('textarea');
        area.value = message.text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      message.copied = true;
      this.saveState();
      this.render();
      this.showToast('Resposta copiada');
      setTimeout(() => { message.copied = false; this.saveState(); this.render(); }, 1800);
    }

    async feedback(messageId, value) {
      const message = this.getMessage(messageId);
      if (!message) return;
      const next = message.feedback === value ? '' : value;
      message.feedback = next;
      this.saveState();
      this.render();
      this.showToast(next === 'helpful' ? 'Salvo como útil' : next === 'not-helpful' ? 'Problema registrado' : 'Feedback removido');
      if (!next) return;
      try {
        await this.api.request(this.config.feedbackPath || '/api/assistant/feedback', {
          sessionId: this.getConversation().sessionId,
          messageId: message.serverId || message.id,
          value: next
        }, { timeoutMs: 8000 });
      } catch { this.showToast('Feedback salvo neste dispositivo'); }
    }
  }

  root.actions = { ResponseActions };
})();
