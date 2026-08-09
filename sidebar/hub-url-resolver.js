(() => {
  'use strict';
  if (window.HUB_URLS?.version >= 2) return;

  function clean(raw) { return String(raw ?? '').trim(); }
  function isAllowedProtocol(protocol = '') { return ['http:', 'https:', 'mailto:', 'tel:'].includes(String(protocol).toLowerCase()); }
  function isExternal(raw = '') { return /^(?:https?:|mailto:|tel:)/i.test(clean(raw)); }
  function rootFromScript() {
    try {
      const current = [...document.scripts].find(script => /(?:^|\/)hub-url-resolver\.js(?:[?#]|$)/.test(script.src || ''));
      return current ? new URL('../', current.src) : new URL('./', location.href);
    } catch { return new URL('./', location.href); }
  }
  const defaultRoot = rootFromScript();

  function resolve(raw, { root = defaultRoot, base = location.href, allowHash = true } = {}) {
    const value = clean(raw);
    if (!value) return '';
    if (/^(?:javascript|data|vbscript):/i.test(value)) return '';
    try {
      if (value.startsWith('#')) return allowHash ? new URL(`index.html${value}`, root).href : '';
      if (isExternal(value)) {
        const parsed = new URL(value);
        return isAllowedProtocol(parsed.protocol) ? parsed.href : '';
      }
      const anchor = value.startsWith('/') ? new URL(value, location.origin) : new URL(value.replace(/^\.\//, ''), root || base);
      return isAllowedProtocol(anchor.protocol) ? anchor.href : '';
    } catch { return ''; }
  }

  function sameDocument(left, right = location.href) {
    try {
      const a = new URL(left, location.href); const b = new URL(right, location.href);
      return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') && a.search === b.search;
    } catch { return false; }
  }

  function withPage(raw, page = 0, options = {}) {
    const href = resolve(raw, options);
    const number = Math.max(0, Number(page || 0));
    if (!href || !number) return href;
    try {
      const url = new URL(href);
      if (/\.pdf$/i.test(url.pathname)) url.hash = `page=${number}`;
      else if (url.searchParams.has('file')) url.searchParams.set('page', String(number));
      else url.hash = `page=${number}`;
      return url.href;
    } catch { return href; }
  }

  function pdfFrom(raw, options = {}) {
    const href = resolve(raw, options);
    if (!href) return '';
    try {
      const url = new URL(href);
      if (/\.pdf$/i.test(url.pathname)) return url.href;
      const file = clean(url.searchParams.get('file'));
      if (!file) return '';
      const nested = new URL(file, options.root || defaultRoot);
      return /\.pdf$/i.test(nested.pathname) && isAllowedProtocol(nested.protocol) ? nested.href : '';
    } catch { return ''; }
  }

  function unique(items = [], key = item => item?.url || item?.href || '') {
    const result = []; const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (!item) continue;
      const raw = key(item);
      const href = resolve(raw) || clean(raw);
      const marker = `${href}|${clean(item.title || item.name).toLowerCase()}|${Number(item.page || 0)}`;
      if (!marker || seen.has(marker)) continue;
      seen.add(marker); result.push(item);
    }
    return result;
  }

  window.HUB_URLS = Object.freeze({ version: 2, root: defaultRoot.href, resolve, withPage, pdfFrom, sameDocument, isExternal, unique });
})();
