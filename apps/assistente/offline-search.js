(() => {
  'use strict';
  const root = window.HUBAssistant = window.HUBAssistant || {};

  function normalize(value = '') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  class OfflineSearch {
    constructor(path = 'offline-data.json') {
      this.path = path;
      this.catalog = null;
    }

    async load() {
      try {
        const response = await fetch(this.path, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const data = await response.json();
        this.catalog = data && typeof data === 'object' ? data : null;
      } catch { this.catalog = null; }
      return this.catalog;
    }

    find(text) {
      if (!this.catalog) return null;
      const query = normalize(text);
      const terms = query.split(' ').filter(term => term.length > 2);
      let best = null;
      for (const item of this.catalog.items || []) {
        const hay = normalize([item.title, item.summary, item.description, item.category, ...(item.tags || [])].join(' '));
        let score = terms.reduce((sum, term) => sum + (hay.includes(term) ? 2 : 0), 0);
        if (query && hay.includes(query)) score += 8;
        if (score && (!best || score > best.score)) best = { item, score };
      }
      return best?.item || null;
    }

    answer(text) {
      const item = this.find(text);
      if (!item) return null;
      const updatedAt = this.catalog?.updatedAt || '';
      const source = item.kind === 'document' ? {
        title: item.title,
        page: Number(item.page || 0),
        snippet: String(item.snippet || ''),
        url: String(item.url || ''),
        verified: false
      } : null;
      const body = item.summary || item.description || `Encontrei “${item.title}” nos dados locais do HUB.`;
      return {
        text: `Modo offline — algumas informações podem não estar atualizadas.\n\n${body}${updatedAt ? `\n\nDados locais atualizados em ${updatedAt}.` : ''}`,
        components: [],
        sources: source ? [source] : [],
        knowledge: item.knowledge || null,
        citation: source ? { verified: false, level: 'related', confidence: 0 } : null,
        presentation: { progressive: false, summary: body, details: '', source: '', defaultExpanded: false }
      };
    }
  }

  root.offline = { OfflineSearch, normalize };
})();
