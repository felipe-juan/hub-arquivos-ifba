(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  function safeExternalUrl(value = '') {
    try {
      const url = new URL(String(value || ''), location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function createApiClient(config = {}) {
    const apiUrl = path => `${String(config.apiBaseUrl || '').replace(/\/$/, '')}${path}`;

    async function request(path, payload, options = {}) {
      if (!config.apiBaseUrl) throw new Error('A API do Assistente não está configurada nesta versão.');
      const normalized = typeof options === 'number' ? { timeoutMs: options } : (options || {});
      const timeoutMs = Math.max(1000, Number(normalized.timeoutMs || config.requestTimeoutMs || 25000));
      const controller = new AbortController();
      const externalSignal = normalized.signal || null;
      const forwardAbort = () => {
        try { controller.abort(externalSignal?.reason || 'cancelled'); } catch {}
      };
      if (externalSignal) {
        if (externalSignal.aborted) forwardAbort();
        else externalSignal.addEventListener('abort', forwardAbort, { once: true });
      }
      const timer = externalSignal ? 0 : setTimeout(() => {
        try { controller.abort('timeout'); } catch {}
      }, timeoutMs);
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
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener?.('abort', forwardAbort);
      }
    }

    async function checkHealth({ signal = null, timeoutMs = 7000 } = {}) {
      if (!config.apiBaseUrl) return { ok: false, reason: 'API não configurada' };
      if (location.protocol === 'https:' && String(config.apiBaseUrl).startsWith('http:')) {
        return { ok: false, reason: 'API HTTP bloqueada em página HTTPS' };
      }
      const controller = new AbortController();
      const forwardAbort = () => { try { controller.abort(signal?.reason || 'cancelled'); } catch {} };
      if (signal) {
        if (signal.aborted) forwardAbort();
        else signal.addEventListener('abort', forwardAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort('timeout'), Math.max(1000, timeoutMs));
      try {
        const response = await fetch(apiUrl(config.healthPath || '/health'), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { ok: true, payload: await response.json().catch(() => ({})) };
      } catch (error) {
        return { ok: false, reason: error?.name === 'AbortError' ? 'Tempo esgotado' : 'API indisponível' };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', forwardAbort);
      }
    }

    return { request, checkHealth, apiUrl };
  }

  root.api = { createApiClient, safeExternalUrl };
})();
