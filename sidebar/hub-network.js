(() => {
  'use strict';

  if (window.HUB_NETWORK?.active) return;
  const scriptUrl = new URL(document.currentScript?.src || 'sidebar/hub-network.js', location.href);
  const offlineUrl = new URL('../apps/assistente/offline-data.json', scriptUrl);
  const UPDATED_KEY = 'hubOfflineContentUpdatedAtV1';
  let updatedAt = '';
  let previousOnline = navigator.onLine !== false;
  let toastTimer = 0;

  function readUpdated() {
    try { return localStorage.getItem(UPDATED_KEY) || ''; } catch { return ''; }
  }
  function saveUpdated(value) {
    updatedAt = String(value || '').trim();
    if (!updatedAt) return;
    try { localStorage.setItem(UPDATED_KEY, updatedAt); } catch {}
  }
  function displayDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/u.test(raw)) return raw.slice(0, 5);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/u);
    return match ? `${match[3]}/${match[2]}` : raw.slice(0, 10);
  }
  function connectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '');
    const downlink = Number(connection?.downlink || 0);
    const rtt = Number(connection?.rtt || 0);
    const slow = ['slow-2g', '2g'].includes(effectiveType) || (downlink > 0 && downlink < 1) || rtt >= 800;
    return { connection, effectiveType, downlink, rtt, slow };
  }
  function ensureToast() {
    let toast = document.getElementById('hubNetworkToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hubNetworkToast';
      toast.className = 'hub-network-toast';
      toast.hidden = true;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    return toast;
  }
  function showToast(text, tone = 'online', duration = 3800) {
    const toast = ensureToast();
    toast.dataset.tone = tone;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
  }
  function statusText() {
    const online = navigator.onLine !== false;
    if (!online) {
      const date = displayDate(updatedAt || readUpdated());
      return { visible: true, state: 'offline', text: date ? `Offline · Conteúdo salvo até ${date}` : 'Offline · Conteúdo local disponível' };
    }
    const info = connectionInfo();
    if (info.slow) return { visible: true, state: 'slow', text: 'Conexão lenta · Conteúdo local disponível' };
    return { visible: false, state: 'online', text: 'Online' };
  }
  function render() {
    const status = statusText();
    for (const id of ['hubNetworkStatus', 'hubMobileNetworkStatus']) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.hidden = !status.visible;
      element.dataset.state = status.state;
      element.textContent = status.text;
    }
    document.documentElement.dataset.hubNetwork = status.state;
  }
  async function refreshContentStamp({ announce = false } = {}) {
    try {
      const response = await fetch(offlineUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.updatedAt) saveUpdated(data.updatedAt);
      if (announce) showToast('HUB atualizado', 'online');
    } catch {
      // Falhar ao consultar a versão não muda a detecção física da conexão.
    }
    render();
  }
  function onOnline() {
    const wasOffline = previousOnline === false;
    previousOnline = true;
    render();
    refreshContentStamp({ announce: wasOffline });
  }
  function onOffline() {
    previousOnline = false;
    render();
    const date = displayDate(updatedAt || readUpdated());
    showToast(date ? `Offline · Conteúdo salvo até ${date}` : 'Offline · Conteúdo local disponível', 'offline', 5200);
  }
  function bindConnection() {
    const connection = connectionInfo().connection;
    connection?.addEventListener?.('change', render);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('hub:sidebar-ready', render);
  }
  function init() {
    updatedAt = readUpdated();
    bindConnection();
    render();
    refreshContentStamp({ announce: false });
  }

  window.HUB_NETWORK = Object.freeze({ active: true, render, refreshContentStamp, statusText });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
