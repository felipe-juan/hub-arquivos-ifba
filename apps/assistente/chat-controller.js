(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  class ChatController {
    constructor({ timeoutMs = 25000, onStateChange = null } = {}) {
      this.timeoutMs = Math.max(1000, Number(timeoutMs || 25000));
      this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
      this.active = null;
      this.serial = 0;
    }

    get sending() { return Boolean(this.active); }

    isCurrent(id) { return Boolean(this.active && this.active.id === id); }

    notify() { this.onStateChange(this.active); }

    abort(reason = 'cancelled') {
      const active = this.active;
      if (!active) return false;
      active.reason = reason;
      clearTimeout(active.timer);
      try { active.controller.abort(reason); } catch {}
      this.active = null;
      this.notify();
      return true;
    }

    begin() {
      this.abort('superseded');
      const id = ++this.serial;
      const controller = new AbortController();
      const active = { id, controller, reason: '', timer: 0 };
      active.timer = setTimeout(() => {
        if (!this.isCurrent(id)) return;
        active.reason = 'timeout';
        try { controller.abort('timeout'); } catch {}
      }, this.timeoutMs);
      this.active = active;
      this.notify();
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
      try {
        const data = await executor(active.controller.signal, active.id);
        if (!this.isCurrent(active.id)) return { ignored: true, id: active.id };
        await onSuccess?.(data, active);
        return { ok: true, data, id: active.id };
      } catch (error) {
        if (!this.isCurrent(active.id)) return { ignored: true, error, id: active.id };
        const reason = active.reason || (error?.name === 'AbortError' ? 'aborted' : 'error');
        if (!['superseded', 'reset', 'unload'].includes(reason)) await onError?.(error, reason, active);
        return { ok: false, error, reason, id: active.id };
      } finally {
        const finished = this.finish(active.id);
        if (finished) await onFinally?.(active);
      }
    }
  }

  root.chat = { ChatController };
})();
