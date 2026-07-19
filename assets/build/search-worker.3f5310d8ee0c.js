"use strict";
importScripts("search-engine.0e4132201f8a.js");
let engine = new self.HubSearchEngine();
self.onmessage = event => {
  const message = event.data || {};
  try {
    if (message.type === "init" || message.type === "update") {
      engine.update(message.payload || {});
      self.postMessage({ type: "ready", id: message.id || 0 });
      return;
    }
    if (message.type === "search") {
      const started = performance.now();
      const payload = engine.search(message.query || "", message.filters || {});
      self.postMessage({ type: "result", id: message.id, elapsedMs: performance.now() - started, ...payload });
    }
  } catch (error) {
    self.postMessage({ type: "error", id: message.id || 0, message: error?.message || String(error) });
  }
};
