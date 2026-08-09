(() => {
  'use strict';

  if (window.HUB_SEARCH?.active) return;

  const scriptUrl = new URL(document.currentScript?.src || 'sidebar/hub-search.js', location.href);
  const rootUrl = new URL('../', scriptUrl);
  const registryUrl = new URL('hub-registry.json', scriptUrl);
  const academicUrl = new URL('hub-academic-search.json', scriptUrl);
  const offlineUrl = new URL('../apps/assistente/offline-data.json', scriptUrl);
  const GROUPS = Object.freeze([
    ['document', 'Documentos', '📄'],
    ['app', 'Apps', '🧩'],
    ['professor', 'Professores', '👨‍🏫'],
    ['discipline', 'Disciplinas', '📚'],
    ['link', 'Links', '🔗']
  ]);
  const LIMITS = Object.freeze({ document: 5, app: 4, professor: 4, discipline: 4, link: 4 });
  const STOPWORDS = new Set(['a','as','o','os','de','da','das','do','dos','e','em','no','na','nos','nas','para','por','um','uma','ao','aos','me','quero','abrir','abre','mostrar','mostra']);
  const CORE_VOCABULARY = Object.freeze(['trancamento','matricula','calendario','fluxograma','calculo','barema','professor','disciplina','jubilamento','estagio','ppc']);

  let index = [];
  let vocabulary = [];
  let loading = null;
  let overlay = null;
  let overlayInput = null;
  let resultsRoot = null;
  let currentQuery = '';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function normalize(value = '') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\btranacamento\b/g, 'trancamento')
      .replace(/\btrancamneto\b/g, 'trancamento')
      .replace(/\bmatricual\b/g, 'matricula')
      .replace(/\bmatriucula\b/g, 'matricula')
      .replace(/\bcauculo\b/g, 'calculo')
      .replace(/\bcaledario\b/g, 'calendario')
      .replace(/\bfluxogama\b/g, 'fluxograma')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function tokens(value = '') {
    return normalize(value).split(' ').filter(token => token.length > 1 && !STOPWORDS.has(token));
  }

  function boundedDistance(a, b, max = 2) {
    a = String(a || ''); b = String(b || '');
    if (a === b) return 0;
    if (!a || !b) return Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowMin = current[0];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
        current[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > max) return max + 1;
      previous = current;
    }
    return previous[b.length];
  }

  function resolveHref(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (window.HUB_URLS?.resolve) return window.HUB_URLS.resolve(raw, { root: rootUrl });
    try {
      if (/^(?:https?:|mailto:|tel:)/iu.test(raw)) return raw;
      if (raw.startsWith('#')) return new URL(`index.html${raw}`, rootUrl).href;
      return new URL(raw.replace(/^\.\//, ''), rootUrl).href;
    } catch { return ''; }
  }

  function assistantHref(query) {
    const url = new URL('apps/assistente/', rootUrl);
    if (String(query || '').trim()) url.searchParams.set('q', String(query).trim());
    return url.href;
  }

  function searchAliases(item = {}, kind = '') {
    const key = normalize([item.id, item.title, item.name, item.url].filter(Boolean).join(' '));
    const aliases = [];
    if (kind === 'app' && (key.includes('media final') || key.includes('prova final'))) aliases.push('calculadora calculo nota media notas final prova');
    if (key.includes('calendario')) aliases.push('datas prazos feriados recesso letivo cronograma');
    if (key.includes('barema')) aliases.push('atividade complementar atividades complementares horas');
    if (key.includes('fluxograma')) aliases.push('matriz curricular grade curriculo');
    if (key.includes('suap')) aliases.push('sistema aluno login boletim matricula');
    if (key.includes('portal')) aliases.push('ifba site institucional campus conquista');
    return aliases.join(' ');
  }

  function normalizeItem(item = {}, kind = '') {
    const cleanKind = kind || item.kind || 'link';
    const title = String(item.title || item.name || '').trim();
    if (!title) return null;
    const summary = String(item.summary || item.description || '').trim();
    const tags = Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [];
    const snippets = Array.isArray(item.snippets) ? item.snippets.slice(0, 6) : [];
    const snippetText = snippets.map(chunk => `${chunk.heading || ''} ${chunk.text || ''}`).join(' ');
    const searchText = normalize([title, summary, item.category || '', ...tags, searchAliases(item, cleanKind), snippetText].join(' '));
    const titleNorm = normalize(title);
    const words = [...new Set(searchText.split(' ').filter(word => word.length > 2))];
    const url = cleanKind === 'professor' || cleanKind === 'discipline'
      ? assistantHref(item.query || `${cleanKind === 'professor' ? 'professor' : 'informações sobre'} ${title}`)
      : resolveHref(item.url || item.href || '');
    if (!url) return null;
    return {
      id: String(item.id || `${cleanKind}-${titleNorm}`).trim(),
      kind: cleanKind,
      title, summary, tags, url,
      titleNorm, searchText, words,
      query: String(item.query || '').trim()
    };
  }

  function dedupe(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      if (!item) continue;
      const key = `${item.kind}|${normalize(item.id || item.url || item.title)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key); result.push(item);
    }
    return result;
  }

  function fallbackFromDom() {
    const items = [];
    for (const anchor of document.querySelectorAll('#appsMenu a, #sidebarLinksList a, #sidebarExternalLinks a')) {
      const parent = anchor.closest('#appsMenu, #sidebarLinksList, #sidebarExternalLinks');
      const kind = parent?.id === 'appsMenu' ? 'app' : 'link';
      const title = anchor.textContent.trim();
      if (title) items.push(normalizeItem({ title, url: anchor.href }, kind));
    }
    return items;
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: 'default' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadIndex() {
    if (loading) return loading;
    loading = (async () => {
      const [registryResult, offlineResult, academicResult] = await Promise.allSettled([
        loadJson(registryUrl), loadJson(offlineUrl), loadJson(academicUrl)
      ]);
      const registry = registryResult.status === 'fulfilled' ? registryResult.value : {};
      const offline = offlineResult.status === 'fulfilled' ? offlineResult.value : {};
      const academic = academicResult.status === 'fulfilled' ? academicResult.value : {};
      const collected = [];
      for (const app of registry.apps || []) collected.push(normalizeItem(app, 'app'));
      for (const link of [...(registry.links || []), ...(registry.externalLinks || [])]) collected.push(normalizeItem(link, 'link'));
      for (const item of offline.items || []) collected.push(normalizeItem(item, item.kind));
      for (const item of academic.items || []) collected.push(normalizeItem(item, item.kind));
      collected.push(...fallbackFromDom());
      index = dedupe(collected);
      const frequencies = new Map(CORE_VOCABULARY.map(word => [word, 100]));
      for (const item of index) for (const word of item.words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
      vocabulary = [...frequencies].filter(([word]) => word.length >= 4).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word]) => word);
      return index;
    })().catch(error => {
      console.warn('Busca global: índice local indisponível:', error);
      index = dedupe(fallbackFromDom());
      return index;
    });
    return loading;
  }

  function scoreItem(item, query) {
    const q = normalize(query);
    if (!q) return 0;
    const qTokens = tokens(q);
    if (!qTokens.length) return 0;
    let score = 0;
    if (item.titleNorm === q) score += 220;
    else if (item.titleNorm.startsWith(q)) score += 150;
    else if (item.titleNorm.includes(q)) score += 110;
    else if (item.searchText.includes(q)) score += 80;

    let matched = 0;
    for (const token of qTokens) {
      let tokenScore = 0;
      if (item.titleNorm.split(' ').some(word => word === token)) tokenScore = 55;
      else if (item.titleNorm.split(' ').some(word => word.startsWith(token) || token.startsWith(word))) tokenScore = 44;
      else if (item.searchText.includes(token)) tokenScore = 30;
      else {
        const threshold = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;
        if (threshold) {
          let best = threshold + 1;
          for (const word of item.words) {
            if (Math.abs(word.length - token.length) > threshold) continue;
            const distance = boundedDistance(token, word, threshold);
            if (distance < best) best = distance;
            if (best === 1) break;
          }
          if (best <= threshold) tokenScore = 20 - (best * 4);
        }
      }
      if (tokenScore > 0) matched += 1;
      score += tokenScore;
    }
    if (!matched) return 0;
    if (matched === qTokens.length) score += 35;
    else if (matched / qTokens.length < .5) score -= 25;
    if (item.kind === 'app' && q.length <= 6) score += 5;
    return Math.max(0, score);
  }

  function search(query) {
    return index.map(item => ({ item, score: scoreItem(item, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'pt-BR'));
  }

  function bestWordSuggestion(token) {
    const q = normalize(token);
    if (q.length < 4 || vocabulary.includes(q)) return '';
    const max = q.length >= 9 ? 2 : 1;
    let best = ''; let bestDistance = max + 1;
    for (const word of vocabulary) {
      if (Math.abs(word.length - q.length) > max) continue;
      if (q.length >= 5 && word[0] !== q[0]) continue;
      const distance = boundedDistance(q, word, max);
      if (distance < bestDistance) { best = word; bestDistance = distance; if (distance === 1) break; }
    }
    return bestDistance <= max ? best : '';
  }

  function suggestionFor(query) {
    const rawTokens = normalize(query).split(' ').filter(Boolean);
    let changed = false;
    const corrected = rawTokens.map(token => {
      if (STOPWORDS.has(token) || token.length < 4) return token;
      const candidate = bestWordSuggestion(token);
      if (candidate && candidate !== token) { changed = true; return candidate; }
      return token;
    });
    return changed ? corrected.join(' ') : '';
  }

  function groupResults(entries) {
    const grouped = Object.fromEntries(GROUPS.map(([kind]) => [kind, []]));
    for (const entry of entries) {
      const group = grouped[entry.item.kind];
      if (!group || group.length >= (LIMITS[entry.item.kind] || 4)) continue;
      group.push(entry);
    }
    return grouped;
  }

  function resultRow(entry, icon) {
    const item = entry.item;
    let external = false;
    try {
      const target = new URL(item.url, rootUrl);
      external = /^https?:$/iu.test(target.protocol) && target.origin !== rootUrl.origin;
    } catch {}
    return `<a class="hub-search-result" href="${escapeHtml(item.url)}"${external ? ' target="_blank" rel="noopener"' : ''} data-search-kind="${escapeHtml(item.kind)}">
      <span class="hub-search-result-icon" aria-hidden="true">${icon}</span>
      <span class="hub-search-result-copy"><strong>${escapeHtml(item.title)}</strong>${item.summary ? `<small>${escapeHtml(item.summary)}</small>` : ''}</span>
      <span class="hub-search-result-arrow" aria-hidden="true">›</span>
    </a>`;
  }

  function render(query) {
    if (!resultsRoot) return;
    const q = String(query || '').trim();
    currentQuery = q;
    if (!q) {
      resultsRoot.innerHTML = `<div class="hub-search-empty hub-search-intro"><strong>Encontre qualquer coisa no HUB</strong><p>Digite o nome de um documento, app, professor, disciplina ou serviço.</p><span>Exemplos: cálculo, PPC, calendário, trancamento, Allan.</span></div>`;
      return;
    }
    const entries = search(q);
    const grouped = groupResults(entries);
    const suggestion = suggestionFor(q);
    const sections = [];
    for (const [kind, label, icon] of GROUPS) {
      const items = grouped[kind] || [];
      if (!items.length) continue;
      sections.push(`<section class="hub-search-group" data-search-group="${kind}"><h3>${icon} ${label}</h3>${items.map(entry => resultRow(entry, icon)).join('')}</section>`);
    }
    const ask = `<section class="hub-search-group hub-search-ask" data-search-group="assistant"><h3>🤖 Perguntar ao Assistente</h3><a class="hub-search-result hub-search-assistant" href="${escapeHtml(assistantHref(q))}"><span class="hub-search-result-icon" aria-hidden="true">🤖</span><span class="hub-search-result-copy"><strong>Perguntar “${escapeHtml(q)}”</strong><small>Abra o Assistente já com esta pergunta.</small></span><span class="hub-search-result-arrow" aria-hidden="true">›</span></a></section>`;
    const suggestionMarkup = suggestion && suggestion !== normalize(q)
      ? `<button class="hub-search-suggestion" type="button" data-search-suggestion="${escapeHtml(suggestion)}">Não encontrou exatamente “${escapeHtml(q)}”? <b>Você quis dizer “${escapeHtml(suggestion)}”?</b></button>`
      : '';
    if (!sections.length) {
      resultsRoot.innerHTML = `<div class="hub-search-empty"><strong>Não encontrei “${escapeHtml(q)}”.</strong>${suggestion ? `<button type="button" data-search-suggestion="${escapeHtml(suggestion)}">Você quis dizer <b>“${escapeHtml(suggestion)}”</b>?</button>` : '<p>Tente uma palavra mais curta, o nome da disciplina ou o tipo do documento.</p>'}</div>${ask}`;
      return;
    }
    resultsRoot.innerHTML = `${suggestionMarkup}<div class="hub-search-groups">${sections.join('')}</div>${ask}`;
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'hubGlobalSearch';
    overlay.className = 'hub-global-search';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="hub-search-backdrop" data-search-close></div><section class="hub-search-panel" role="dialog" aria-modal="true" aria-label="Busca no HUB">
      <header class="hub-search-header"><span aria-hidden="true">🔍</span><input id="hubGlobalSearchInput" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar documentos, apps, professores, disciplinas e links" aria-label="Buscar no HUB"><button type="button" data-search-close aria-label="Fechar busca">×</button></header>
      <div id="hubGlobalSearchResults" class="hub-search-results" aria-live="polite"></div>
      <footer><span>Busca local e tolerante a erros</span><kbd>Esc</kbd><span>fecha</span></footer>
    </section>`;
    document.body.append(overlay);
    overlayInput = overlay.querySelector('#hubGlobalSearchInput');
    resultsRoot = overlay.querySelector('#hubGlobalSearchResults');
    overlayInput.addEventListener('input', () => render(overlayInput.value));
    overlay.addEventListener('click', event => {
      const suggestion = event.target.closest('[data-search-suggestion]');
      if (suggestion) {
        overlayInput.value = suggestion.dataset.searchSuggestion || '';
        render(overlayInput.value);
        overlayInput.focus();
        return;
      }
      if (event.target.closest('[data-search-close]')) close();
    });
    return overlay;
  }

  async function open(initial = '') {
    ensureOverlay();
    overlay.hidden = false;
    document.body.classList.add('hub-search-open');
    overlayInput.value = String(initial || '').trim();
    resultsRoot.innerHTML = '<div class="hub-search-loading">Carregando busca local…</div>';
    await loadIndex();
    render(overlayInput.value);
    requestAnimationFrame(() => { overlayInput.focus({ preventScroll: true }); overlayInput.setSelectionRange(overlayInput.value.length, overlayInput.value.length); });
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('hub-search-open');
    const sidebarInput = document.getElementById('sidebarSearchInput');
    if (sidebarInput) sidebarInput.value = currentQuery;
  }

  function bindSidebar() {
    const form = document.getElementById('sidebarSearchForm');
    const input = document.getElementById('sidebarSearchInput');
    const button = document.getElementById('sidebarSearchButton');
    if (!form || !input || form.dataset.hubSearchBound) return;
    form.dataset.hubSearchBound = '1';
    const trigger = event => { event?.preventDefault?.(); event?.stopImmediatePropagation?.(); open(input.value); };
    form.addEventListener('submit', trigger, true);
    input.addEventListener('focus', trigger, { once: false });
    input.addEventListener('pointerdown', event => { if (document.activeElement !== input) { event.preventDefault(); trigger(event); } }, true);
    // Também cobre ativação sintética/acessível (element.click(), leitores de tela e labels).
    // Evita reabrir quando pointerdown/focus já exibiram o overlay.
    input.addEventListener('click', event => { if (!overlay || overlay.hidden) trigger(event); }, true);
    button?.addEventListener('click', trigger, true);
  }

  function bind() {
    bindSidebar();
    document.addEventListener('hub:sidebar-ready', bindSidebar);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) { event.preventDefault(); close(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(''); }
    });
  }

  window.HUB_SEARCH = Object.freeze({ active: true, open, close, loadIndex, normalize, search: query => search(query).map(entry => ({ ...entry.item, score: entry.score })), suggestionFor });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
