(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  class HistoryStore {
    constructor({ storageKey = 'hubAssistantStateV1', dbName = 'hubAssistantHistoryV1', dbVersion = 3, storeName = 'state' } = {}) {
      this.storageKey = storageKey;
      this.dbName = dbName;
      this.dbVersion = dbVersion;
      this.storeName = storeName;
      this.dbPromise = null;
      this.queue = Promise.resolve();
      this.stateTimer = 0;
      this.draftTimer = 0;
      this.pendingState = null;
      this.pendingDraft = '';
    }

    open() {
      if (!('indexedDB' in globalThis)) return Promise.resolve(null);
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise(resolve => {
        let request;
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value || null);
        };
        const timer = setTimeout(() => finish(null), 1800);
        try { request = indexedDB.open(this.dbName, this.dbVersion); } catch { finish(null); return; }
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.storeName)) database.createObjectStore(this.storeName);
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            try { database.close(); } catch {}
            this.dbPromise = null;
          };
          finish(database);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      });
      return this.dbPromise;
    }

    async get(key) {
      const database = await this.open();
      if (!database) return null;
      return new Promise(resolve => {
        try {
          const transaction = database.transaction(this.storeName, 'readonly');
          const request = transaction.objectStore(this.storeName).get(key);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
          transaction.onabort = () => resolve(null);
        } catch { resolve(null); }
      });
    }

    enqueue(operation, fallback) {
      this.queue = this.queue.then(async () => {
        const database = await this.open();
        if (!database) { fallback?.(); return; }
        await new Promise(resolve => {
          try {
            const transaction = database.transaction(this.storeName, 'readwrite');
            operation(transaction.objectStore(this.storeName));
            transaction.oncomplete = resolve;
            transaction.onerror = resolve;
            transaction.onabort = resolve;
          } catch { fallback?.(); resolve(); }
        });
      }).catch(() => fallback?.());
      return this.queue;
    }

    async loadState() {
      const saved = await this.get('main');
      if (saved) return saved;
      try { return JSON.parse(localStorage.getItem(this.storageKey) || '{}'); } catch { return {}; }
    }

    async loadDraft() {
      const saved = await this.get('draft');
      if (typeof saved === 'string') return saved;
      try { return localStorage.getItem(`${this.storageKey}:draft`) || ''; } catch { return ''; }
    }

    saveState(value, { immediate = false } = {}) {
      this.pendingState = value;
      clearTimeout(this.stateTimer);
      const flush = () => {
        const payload = this.pendingState;
        this.pendingState = null;
        return this.enqueue(store => store.put(payload, 'main'), () => {
          try { localStorage.setItem(this.storageKey, JSON.stringify(payload)); } catch {}
        });
      };
      if (immediate) return flush();
      this.stateTimer = setTimeout(flush, 120);
      return this.queue;
    }

    saveDraft(value, { immediate = false } = {}) {
      this.pendingDraft = String(value || '').slice(0, 3000);
      clearTimeout(this.draftTimer);
      const flush = () => {
        const payload = this.pendingDraft;
        return this.enqueue(store => store.put(payload, 'draft'), () => {
          try { localStorage.setItem(`${this.storageKey}:draft`, payload); } catch {}
        });
      };
      if (immediate) return flush();
      this.draftTimer = setTimeout(flush, 160);
      return this.queue;
    }

    async clear() {
      clearTimeout(this.stateTimer);
      clearTimeout(this.draftTimer);
      this.pendingState = null;
      this.pendingDraft = '';
      await this.enqueue(store => { store.delete('main'); store.delete('draft'); }, () => {});
      try {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(`${this.storageKey}:draft`);
      } catch {}
    }
  }

  root.history = { HistoryStore };
})();
