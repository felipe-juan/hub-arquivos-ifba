(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  function abortError(reason = 'aborted') {
    const error = new Error(reason === 'timeout' ? 'Tempo de resposta esgotado.' : 'Requisição interrompida.');
    error.name = 'AbortError';
    error.reason = reason;
    return error;
  }

  class ChatController {
    constructor({ timeoutMs = 20000, onStateChange = null } = {}) {
      this.timeoutMs = Math.max(1000, Number(timeoutMs || 20000));
      this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
      this.active = null;
      this.serial = 0;
    }

    get sending() { return Boolean(this.active); }
    isCurrent(id) { return Boolean(this.active && this.active.id === id); }
    notify() {
      try { this.onStateChange(this.active); }
      catch (error) { console.error('Falha ao sincronizar estado visual do Assistente:', error); }
    }

    release(active, reason = 'cancelled') {
      if (!active) return false;
      active.reason = reason;
      clearTimeout(active.timer);
      try { active.controller.abort(reason); } catch {}
      if (this.isCurrent(active.id)) {
        this.active = null;
        this.notify();
      }
      return true;
    }

    abort(reason = 'cancelled') {
      return this.release(this.active, reason);
    }

    begin() {
      this.abort('superseded');
      const id = ++this.serial;
      const controller = new AbortController();
      const active = { id, controller, reason: '', timer: 0 };
      this.active = active;
      this.notify();
      active.timer = setTimeout(() => {
        if (!this.isCurrent(id)) return;
        // O watchdog libera a UI diretamente. Não dependemos de fetch, do
        // AbortController nem do backend para remover "Escrevendo...".
        this.release(active, 'timeout');
      }, this.timeoutMs);
      return active;
    }

    finish(id) {
      if (!this.isCurrent(id)) return false;
      clearTimeout(this.active.timer);
      this.active = null;
      this.notify();
      return true;
    }

    async run(executor, { onSuccess = null, onError = null, onFinally = null } = {}) {
      const active = this.begin();
      let abortListener = null;
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(abortError(active.reason || String(active.controller.signal.reason || 'aborted')));
        if (active.controller.signal.aborted) Promise.resolve().then(abortListener);
        else active.controller.signal.addEventListener('abort', abortListener, { once: true });
      });
      const execution = Promise.resolve().then(() => executor(active.controller.signal, active.id));
      try {
        const data = await Promise.race([execution, aborted]);
        if (!this.isCurrent(active.id)) return { ignored: true, id: active.id };
        await onSuccess?.(data, active);
        return { ok: true, data, id: active.id };
      } catch (error) {
        const signalReason = active.controller.signal.reason;
        const reason = active.reason || (typeof signalReason === 'string' ? signalReason : '') || error?.reason || (error?.name === 'AbortError' ? 'aborted' : 'error');
        const anotherRequestIsActive = Boolean(this.active && this.active.id !== active.id);

        // Timeout é especial: o watchdog já liberou a UI. Ainda exibimos a
        // mensagem de erro se nenhuma nova pergunta tomou o lugar desta.
        if (reason === 'timeout' && !anotherRequestIsActive) {
          await onError?.(error, reason, active);
          return { ok: false, error, reason, id: active.id };
        }
        if (!this.isCurrent(active.id)) return { ignored: true, error, reason, id: active.id };
        if (!['superseded', 'reset', 'unload', 'user-stop'].includes(reason)) await onError?.(error, reason, active);
        return { ok: false, error, reason, id: active.id };
      } finally {
        if (abortListener) active.controller.signal.removeEventListener('abort', abortListener);
        const finished = this.finish(active.id);
        if (finished) await onFinally?.(active);
      }
    }
  }

  root.chat = { ChatController };
})();
