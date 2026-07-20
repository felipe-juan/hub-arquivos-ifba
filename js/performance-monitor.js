(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const storedMode = (() => { try { return localStorage.getItem("hubPerfMode") === "1"; } catch (_) { return false; } })();
  const enabled = params.get("perf") === "1" || storedMode;
  const setMode = active => {
    try {
      if (active) localStorage.setItem("hubPerfMode", "1");
      else localStorage.removeItem("hubPerfMode");
    } catch (_) {}
  };
  if (!enabled) {
    window.HUB_PERFORMANCE = {
      collect: () => null,
      save: () => {},
      enable() { setMode(true); location.reload(); },
      disable() { setMode(false); },
    };
    return;
  }
  const startedAt = performance.timeOrigin || Date.now();
  const metrics = {
    version: "0.2.36",
    capturedAt: new Date().toISOString(),
    device: {
      userAgent: navigator.userAgent,
      platform: navigator.platform || "",
      language: navigator.language || "",
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio: devicePixelRatio || 1,
      memoryApiAvailable: Boolean(performance.memory),
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType || "",
        downlink: navigator.connection.downlink || 0,
        rtt: navigator.connection.rtt || 0,
        saveData: Boolean(navigator.connection.saveData)
      } : null
    },
    navigation: {},
    webVitals: { lcp: 0, cls: 0, inp: 0, fcp: 0, ttfb: 0 },
    longTasks: { count: 0, totalMs: 0, worstMs: 0 },
    search: { count: 0, medianMs: 0, p95Ms: 0, worstMs: 0, samples: [] },
    resources: { count: 0, transferBytes: 0, decodedBytes: 0, byType: {} },
    memory: null,
    domNodes: 0
  };

  const round = value => Math.round((Number(value) || 0) * 100) / 100;
  const percentile = (values, p) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  };

  function observe(type, callback, options = {}) {
    if (!("PerformanceObserver" in window)) return;
    try {
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes(type)) return;
      const observer = new PerformanceObserver(list => list.getEntries().forEach(callback));
      observer.observe({ type, buffered: true, ...options });
    } catch (_) {}
  }

  observe("paint", entry => {
    if (entry.name === "first-contentful-paint") metrics.webVitals.fcp = round(entry.startTime);
  });
  observe("largest-contentful-paint", entry => { metrics.webVitals.lcp = round(entry.startTime); });
  observe("layout-shift", entry => {
    if (!entry.hadRecentInput) metrics.webVitals.cls = round(metrics.webVitals.cls + entry.value);
  });
  observe("event", entry => {
    if (entry.interactionId && entry.duration > metrics.webVitals.inp) metrics.webVitals.inp = round(entry.duration);
  }, { durationThreshold: 40 });
  observe("longtask", entry => {
    metrics.longTasks.count += 1;
    metrics.longTasks.totalMs = round(metrics.longTasks.totalMs + entry.duration);
    metrics.longTasks.worstMs = Math.max(metrics.longTasks.worstMs, round(entry.duration));
  });

  window.addEventListener("hub:search-performance", event => {
    const elapsed = round(event.detail?.elapsedMs || 0);
    metrics.search.samples.push(elapsed);
    if (metrics.search.samples.length > 100) metrics.search.samples.shift();
    metrics.search.count = metrics.search.samples.length;
    metrics.search.medianMs = round(percentile(metrics.search.samples, .5));
    metrics.search.p95Ms = round(percentile(metrics.search.samples, .95));
    metrics.search.worstMs = round(Math.max(0, ...metrics.search.samples));
    renderPanel();
  });

  function collect() {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (navigation) {
      metrics.navigation = {
        dnsMs: round(navigation.domainLookupEnd - navigation.domainLookupStart),
        connectMs: round(navigation.connectEnd - navigation.connectStart),
        ttfbMs: round(navigation.responseStart - navigation.requestStart),
        domInteractiveMs: round(navigation.domInteractive),
        domContentLoadedMs: round(navigation.domContentLoadedEventEnd),
        loadMs: round(navigation.loadEventEnd || performance.now())
      };
      metrics.webVitals.ttfb = metrics.navigation.ttfbMs;
    }
    const resources = performance.getEntriesByType("resource");
    const byType = {};
    let transfer = 0;
    let decoded = 0;
    resources.forEach(entry => {
      const type = entry.initiatorType || "other";
      const current = byType[type] || { count: 0, transferBytes: 0 };
      current.count += 1;
      current.transferBytes += Number(entry.transferSize || 0);
      byType[type] = current;
      transfer += Number(entry.transferSize || 0);
      decoded += Number(entry.decodedBodySize || 0);
    });
    metrics.resources = { count: resources.length, transferBytes: transfer, decodedBytes: decoded, byType };
    metrics.domNodes = document.getElementsByTagName("*").length;
    if (performance.memory) {
      metrics.memory = {
        usedJsHeapBytes: performance.memory.usedJSHeapSize,
        totalJsHeapBytes: performance.memory.totalJSHeapSize,
        jsHeapLimitBytes: performance.memory.jsHeapSizeLimit
      };
    }
    metrics.capturedAt = new Date().toISOString();
    return metrics;
  }

  function save() {
    try {
      const reports = JSON.parse(localStorage.getItem("hubPerformanceReportsV1") || "[]");
      reports.unshift(typeof structuredClone === "function" ? structuredClone(collect()) : JSON.parse(JSON.stringify(collect())));
      localStorage.setItem("hubPerformanceReportsV1", JSON.stringify(reports.slice(0, 20)));
    } catch (_) {}
  }

  let panel = null;
  function formatKb(value) { return `${round((Number(value) || 0) / 1024)} KiB`; }
  function renderPanel() {
    if (!enabled) return;
    const report = collect();
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "hubPerformancePanel";
      panel.setAttribute("aria-label", "Métricas locais de desempenho");
      panel.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:99999;width:min(360px,calc(100vw - 20px));max-height:60vh;overflow:auto;padding:12px;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:rgba(10,15,20,.94);color:#f5fbff;font:12px/1.45 system-ui;box-shadow:0 14px 44px rgba(0,0,0,.35)";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <strong style="font-size:14px">Desempenho local · v${report.version}</strong>
      <div>LCP: <b>${report.webVitals.lcp || "—"} ms</b> · INP: <b>${report.webVitals.inp || "—"} ms</b> · CLS: <b>${report.webVitals.cls}</b></div>
      <div>FCP: <b>${report.webVitals.fcp || "—"} ms</b> · TTFB: <b>${report.webVitals.ttfb || "—"} ms</b></div>
      <div>Busca mediana/p95: <b>${report.search.medianMs}/${report.search.p95Ms} ms</b></div>
      <div>Recursos: <b>${report.resources.count}</b> · transferência: <b>${formatKb(report.resources.transferBytes)}</b></div>
      <div>DOM: <b>${report.domNodes}</b> nós · long tasks: <b>${report.longTasks.count}</b></div>
      <div>Heap JS: <b>${report.memory ? formatKb(report.memory.usedJsHeapBytes) : "indisponível neste navegador"}</b></div>
      <div style="display:flex;gap:6px;margin-top:8px"><button data-perf-copy type="button">Copiar relatório</button><button data-perf-close type="button">Fechar</button></div>`;
    panel.querySelector("[data-perf-copy]")?.addEventListener("click", async () => {
      const text = JSON.stringify(collect(), null, 2);
      try { await navigator.clipboard.writeText(text); } catch (_) {}
    }, { once: true });
    panel.querySelector("[data-perf-close]")?.addEventListener("click", () => { panel?.remove(); panel = null; }, { once: true });
  }

  window.HUB_PERFORMANCE = { collect, save, enable() { setMode(true); location.reload(); }, disable() { setMode(false); } };
  addEventListener("load", () => setTimeout(() => { collect(); renderPanel(); }, 1200), { once: true });
  addEventListener("pagehide", save);
})();
