const hubData = window.HUB_DATA || {};
const rawDocuments = hubData.documents || [];
const usefulLinks = hubData.usefulLinks || [];
const apps = hubData.apps || [];
const answerCards = hubData.answers || [];
const workflows = []; // Guias rápidos removidos da interface e da busca
const guides = []; // seção de informações removida da interface
const directoryGroups = hubData.directoryGroups || [];
const conceptMap = hubData.conceptMap || {};

const state = {
  lastQuery: "",
  lastResults: [],
  archiveView: "grid",
  desktopColumns: "auto",
  linksView: null,
  linksColumnsQuick: "auto",
  linksColumnsCards: "auto",
  linksEditMode: false,
  linkDragId: null,
  archiveVisibleCount: null,
  linksExpanded: false,
  appsExpanded: false,
  whereExpanded: false,
  whereSectionOpen: true,
  directorySort: "name-asc",
  directoryRows: 10,
  directoryPage: 1,
  searchResultsView: "cards",
  searchDirectorySort: "relevance",
  searchDirectoryRows: 10,
  searchDirectoryPage: 1,
  searchColumns: "auto",
  selectedSearchIndex: -1,
  previewDocId: "",
  previewPage: "",
  previewHistoryPushed: false,
  effectiveSearchQuery: "",
  searchCorrection: null,
  expandedSearchResults: [],
  sidebarWidth: 276,
  themeMode: "auto"
};

const HUB_PREF_KEYS = {
  desktopColumns: "hubDesktopColumns",
  archiveView: "hubArchiveView",
  searchFilters: "hubSearchFilters",
  filtersOpen: "hubFiltersOpen",
  sidebarCollapsed: "hubSidebarCollapsed",
  sidebarWidth: "hubSidebarWidth",
  appsMenuOpen: "hubSidebarAppsOpen",
  favoritesMenuOpen: "hubSidebarFavoritesOpen",
  linksMenuOpen: "hubSidebarLinksOpen",
  linksColumnsQuick: "hubLinksColumnsQuick",
  linksColumnsCards: "hubLinksColumnsCards",
  searchResultsView: "hubSearchResultsView",
  searchDirectorySort: "hubSearchDirectorySort",
  searchDirectoryRows: "hubSearchDirectoryRows",
  searchDirectoryPage: "hubSearchDirectoryPage",
  searchColumns: "hubSearchColumns",
  themeMode: "hubThemeMode",
  appsExpanded: "hubAppsExpanded",
  whereExpanded: "hubWhereExpanded",
  whereSectionOpen: "hubWhereSectionOpen",
  directorySort: "hubDirectorySort",
  directoryRows: "hubDirectoryRows",
  directoryPage: "hubDirectoryPage",
  directoryColumnWidths: "hubDirectoryColumnWidths",
  searchDirectoryColumnWidths: "hubSearchDirectoryColumnWidths"
};

const LINKS_ORDER_STORAGE_KEY = "hubLinksCustomOrderV1";
const SAVED_SEARCHES_STORAGE_KEY = "hubSavedSearchesV1";
const DOOM_RETURN_CONTEXT_KEY = "hubDoomReturnContextV1";
const DOOM_DISCOVERED_KEY = "hubDoomDiscoveredV1";
const SEARCH_HISTORY_MARKER = "hubSearchNavigationV1";
const SEARCH_FILTER_IDS = Object.freeze({
  type: "typeFilter",
  docType: "docTypeFilter",
  correspondent: "correspondentFilter",
  format: "formatFilter"
});
const SEARCH_URL_FILTER_PARAMS = Object.freeze({
  type: "type",
  docType: "docType",
  correspondent: "correspondent",
  format: "format"
});
const PDF_THUMBNAIL_BUDGET = Object.freeze({
  maxCssWidth: 260,
  maxDevicePixelRatio: 2,
  maxCanvasWidth: 520,
  maxCanvasHeight: 760
});
let searchHistoryReady = false;
let restoringSearchHistory = false;
let searchRestoreGeneration = 0;
let liveSearchHistoryEntry = false;
let searchScrollHistoryTimer = 0;
let latestSearchRunGeneration = 0;
let previewOpenGeneration = 0;
let previewReturnFocus = null;
let pendingFocusDocumentId = new URLSearchParams(location.search).get("focusDoc") || "";
let searchIndexUrl = "documents/search-index.json";
let deferredSearchIndex = null;
let deferredSearchIndexPromise = null;
let deferredSearchIndexLoaded = false;
let deferredSearchIndexRetryAt = 0;
const SEARCH_INDEX_RETRY_DELAY_MS = 30000;
const DEFAULT_LINK_ORDER = [
  "link-protocolo",
  "link-fluxograma-atual",
  "link-fluxograma-antigo",
  "link-quadro-horario-2026-2",
  "link-calendario-app",
  "link-calculadora-media-app",
  "link-barema-app",
  "link-barema-atual-planilha",
  "link-barema-antigo-planilha"
];

function setLoadingStatus(message = "", kind = "info") {
  const box = document.getElementById("loadingStatus");
  if (!box) return;
  box.textContent = message;
  box.dataset.kind = kind;
  box.hidden = !message;
}

function applyDesktopColumns(value = "auto") {
  const allowed = new Set(["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  const clean = allowed.has(String(value)) ? String(value) : "auto";
  state.desktopColumns = clean;
  document.body.dataset.desktopColumns = clean;
}

function setupDesktopColumnsControl() {
  const select = document.getElementById("desktopColumnsSelect");
  const saved = prefGet(HUB_PREF_KEYS.desktopColumns, "auto");
  applyDesktopColumns(saved);
  if (!select) return;
  select.value = state.desktopColumns;
  select.addEventListener("change", () => {
    applyDesktopColumns(select.value);
    resetArchiveLimit();
    renderDocuments();
    prefSet(HUB_PREF_KEYS.desktopColumns, state.desktopColumns);
  });
}

function isMobileViewport() {
  return window.matchMedia && window.matchMedia("(max-width: 920px)").matches;
}

function getArchiveColumnCount() {
  if (isMobileViewport()) return 1;
  const selected = Number(state.desktopColumns);
  if (Number.isFinite(selected) && selected >= 2) return selected;
  const grid = document.getElementById("documentGrid");
  const width = grid?.clientWidth || window.innerWidth || 0;
  return Math.max(2, Math.min(12, Math.floor(width / 260) || 4));
}

function getArchiveBatchSize() {
  if (isMobileViewport()) return 8;
  const columns = getArchiveColumnCount();
  return Math.max(2, Math.min(12, columns));
}

function resetArchiveLimit() {
  state.archiveVisibleCount = getArchiveBatchSize();
}

function ensureArchiveLimit() {
  if (!Number.isFinite(state.archiveVisibleCount) || state.archiveVisibleCount < 1) {
    resetArchiveLimit();
  }
  return state.archiveVisibleCount;
}

const statusLabel = {
  verified: "",
  review: "",
  archived: ""
};

const typeLabel = {
  document: "Documento",
  link: "Link",
  app: "App",
  answer: "Resposta",
  workflow: "Guia",
  doom: "Arquivo desconhecido",
};

const typeIcon = {
  document: "PDF",
  link: "🔗",
  app: "🧮",
  answer: "💡",
  workflow: "🧭",
  doom: "?",
};

const stopWords = new Set([
  "para", "com", "das", "dos", "uma", "por", "que", "seu", "sua", "de", "do", "da", "e", "o", "a", "as", "os", "em", "no", "na", "nos", "nas", "ao", "aos", "à", "às", "the", "and", "for"
]);

const normalize = (text = "") => text
  .toString()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const tokenize = (text = "") => normalize(text)
  .replace(/[^a-z0-9ç\s]/g, " ")
  .split(/\s+/)
  .filter(token => token.length > 2 && !stopWords.has(token));

const unique = array => [...new Set((array || []).filter(Boolean))];

function escapeHtml(text = "") {
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inferCorrespondent(doc) {
  const haystack = normalize(`${doc.title} ${doc.kind} ${doc.group} ${(doc.tags || []).join(" ")}`);
  if (haystack.includes("consepe")) return "CONSEPE";
  if (haystack.includes("consup")) return "CONSUP";
  if (haystack.includes("concam")) return "CONCAM";
  if (haystack.includes("nde")) return "NDE";
  if (haystack.includes("colegiado")) return "Colegiado de Curso";
  if (haystack.includes("ldb") || haystack.includes("sinaes") || haystack.includes("pne") || haystack.includes("diretrizes")) return "MEC/CNE";
  if (haystack.includes("naes") || haystack.includes("assistencia") || haystack.includes("inclusao") || haystack.includes("nome social")) return "IFBA";
  if (haystack.includes("tcc") || haystack.includes("estagio") || haystack.includes("atividades complementares") || haystack.includes("barema") || haystack.includes("ppc") || haystack.includes("matriz")) return "Coordenação de Sistemas de Informação";
  return "A definir";
}

function inferFormat(resource) {
  const url = (resource.fileUrl || resource.pdfUrl || resource.sourceUrl || resource.url || "").toLowerCase();
  const title = normalize(`${resource.title} ${resource.kind || ""} ${resource.category || ""}`);
  if (/\.pdf($|[?#])/.test(url) || resource.pdfUrl || title.includes("ppc") || title.includes("regulamento") || title.includes("resolucao")) return "PDF";
  if (/\.(png|jpe?g|webp|gif|tif?f)($|[?#])/.test(url)) return "Imagem";
  if (/\.(txt|md|csv)($|[?#])/.test(url)) return "Texto";
  if (/\.(docx?|odt|rtf)($|[?#])/.test(url)) return "Word/Writer";
  if (url.includes("powerbi.com") || title.includes("power bi")) return "Power BI";
  if (url.includes("docs.google.com/spreadsheets") || /\.(xlsx?|ods)($|[?#])/.test(url) || title.includes("planilha") || title.includes("horarios") || title.includes("horários")) return "Planilha";
  if (url.includes("drive.google.com/drive/folders")) return "Drive";
  if (title.includes("fluxograma") || title.includes("flowchart") || title.includes("grade atual") || title.includes("grade antiga")) return "Fluxograma";
  if (/\.(pptx?|odp)($|[?#])/.test(url)) return "PowerPoint/Impress";
  if ((resource.category || "").toLowerCase().includes("form")) return "Formulário";
  return resource.type === "link" ? "Link" : "Arquivo";
}

function inferTagsFromText(text) {
  const normalized = normalize(text);
  const rules = [
    ["PPC", ["ppc", "projeto pedagogico", "perfil do egresso"]],
    ["matriz", ["matriz", "curriculo", "disciplinas", "semestre"]],
    ["TCC", ["tcc", "conclusao de curso", "banca", "orientacao"]],
    ["estágio", ["estagio", "supervisionado", "termo de compromisso"]],
    ["atividades complementares", ["atividades complementares", "barema", "certificado", "horas"]],
    ["extensão", ["extensao", "ace", "curricularizacao"]],
    ["coordenação", ["coordenacao", "coordenador", "portaria"]],
    ["colegiado", ["colegiado", "regimento"]],
    ["NDE", ["nucleo docente estruturante", "nde"]],
    ["acessibilidade", ["libras", "tea", "deficiencia", "inclusao"]],
    ["horários", ["horarios", "quadro de horarios", "aulas"]],
    ["protocolo", ["protocolo", "requerimento", "solicitacao"]]
  ];
  return rules.filter(([, terms]) => terms.some(term => normalized.includes(term))).map(([tag]) => tag);
}

function provisionalDoc(doc) {
  const allText = `${doc.title || ""} ${doc.kind || ""} ${doc.summary || ""} ${(doc.tags || []).join(" ")} ${(doc.chunks || []).map(c => `${c.heading || ""} ${c.text || ""} ${(c.semanticTags || []).join(" ")}`).join(" ")}`;
  return {
    ...doc,
    documentType: doc.documentType || doc.kind || "Documento",
    correspondent: doc.correspondent || inferCorrespondent(doc),
    fileFormat: doc.fileFormat || inferFormat(doc),
    _indexText: allText
  };
}

function trainClassifier(docs) {
  const models = { type: {}, correspondent: {}, tags: {} };

  function add(labelGroup, label, text) {
    if (!label) return;
    const key = label.toString();
    if (!models[labelGroup][key]) models[labelGroup][key] = { total: 0, tokens: {} };
    tokenize(text).forEach(token => {
      models[labelGroup][key].tokens[token] = (models[labelGroup][key].tokens[token] || 0) + 1;
      models[labelGroup][key].total += 1;
    });
  }

  docs.forEach(doc => {
    const text = doc._indexText || "";
    add("type", doc.documentType, text);
    add("correspondent", doc.correspondent, text);
    (doc.tags || []).forEach(tag => add("tags", tag, text));
  });

  return models;
}

function predictFromModel(model, text, limit = 5) {
  const tokens = tokenize(text);
  return Object.entries(model)
    .map(([label, data]) => {
      let score = 0;
      tokens.forEach(token => {
        score += data.tokens[token] || 0;
      });
      score += Math.min(2, data.total / 300);
      return { label, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const provisionalDocuments = rawDocuments.map(provisionalDoc);
const classifier = trainClassifier(provisionalDocuments);

function enrichDocument(doc) {
  const base = provisionalDoc(doc);
  const predictedType = predictFromModel(classifier.type, base._indexText, 1)[0]?.label;
  const predictedCorrespondent = predictFromModel(classifier.correspondent, base._indexText, 1)[0]?.label;
  const predictedTags = predictFromModel(classifier.tags, base._indexText, 8).map(item => item.label);
  const ruleTags = inferTagsFromText(base._indexText);
  const enriched = {
    ...base,
    documentType: base.documentType || predictedType || "Documento",
    correspondent: base.correspondent || predictedCorrespondent || "A definir",
    fileFormat: base.fileFormat || "PDF",
    tags: unique([...(base.tags || []), ...ruleTags, ...predictedTags]),
    chunks: base.chunks || [],
    autoMetadata: {
      documentType: predictedType || base.documentType,
      correspondent: predictedCorrespondent || base.correspondent,
      tags: unique([...ruleTags, ...predictedTags]).slice(0, 8)
    }
  };
  return enriched;
}

let documents = rawDocuments.map(enrichDocument);


function refreshDocuments() {
  documents = rawDocuments.map(enrichDocument);
  scheduleSearchWorkerUpdate();
}

function expandedTerms(query) {
  const base = tokenize(query);
  const extra = [];

  for (const token of base) {
    if (conceptMap[token]) extra.push(...conceptMap[token]);
    const originalKey = Object.keys(conceptMap).find(key => normalize(key) === token);
    if (originalKey) extra.push(...conceptMap[originalKey]);
  }

  return {
    exact: unique(base),
    semantic: unique(extra.flatMap(item => tokenize(item)))
  };
}



function escapeRegExp(text = "") {
  return text.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSearchQuery(query = "") {
  const raw = (query || "").toString();
  const exactPhrases = [];
  const withoutQuotes = raw.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_, phrase) => {
    const clean = phrase.replace(/\\"/g, '"').trim();
    if (clean.length > 0) exactPhrases.push(clean);
    return " ";
  });

  const tokens = withoutQuotes.match(/\S+/g) || [];
  const excludes = [];
  const visibleTokens = [];
  const hasExplicitAnd = tokens.some(token => normalize(token) === "and");
  const hasExplicitOr = tokens.some(token => normalize(token) === "or");

  tokens.forEach(token => {
    const normalizedToken = normalize(token);
    if (normalizedToken === "and" || normalizedToken === "or") return;
    if (token.startsWith("-") && token.length > 1) {
      excludes.push(token.slice(1));
      return;
    }
    visibleTokens.push(token);
  });

  const flexQuery = visibleTokens.join(" ").trim();
  const flexTerms = expandedTerms(flexQuery);
  const excludeTerms = unique(excludes.flatMap(tokenize));
  const andTerms = hasExplicitAnd ? flexTerms.exact : [];
  const orTerms = hasExplicitOr ? flexTerms.exact : [];
  const displayQuery = [flexQuery, ...exactPhrases.map(term => `"${term}"`)].filter(Boolean).join(" ").trim();

  return {
    raw,
    flexQuery,
    displayQuery,
    exactPhrases: unique(exactPhrases),
    flexTerms,
    excludeTerms,
    andTerms,
    orTerms,
    hasExplicitAnd,
    hasExplicitOr
  };
}

function rawSearchText(text = "") {
  return (text || "").toString().toLowerCase();
}

function isWordLikeTerm(term = "") {
  return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+$/.test(term.trim());
}

function containsStrictTerm(text = "", term = "") {
  const cleanTerm = rawSearchText(term).trim();
  if (!cleanTerm) return false;
  const haystack = rawSearchText(text);
  const escaped = escapeRegExp(cleanTerm);
  if (isWordLikeTerm(cleanTerm)) {
    const wordChars = "A-Za-zÀ-ÖØ-öø-ÿ0-9_";
    return new RegExp(`(^|[^${wordChars}])${escaped}(?=[^${wordChars}]|$)`, "i").test(haystack);
  }
  return haystack.includes(cleanTerm);
}

function strictTermIndex(text = "", term = "") {
  const clean = (text || "").toString();
  const cleanTerm = (term || "").toString().trim();
  if (!clean || !cleanTerm) return -1;
  const haystack = clean.toLowerCase();
  const needle = cleanTerm.toLowerCase();
  if (!isWordLikeTerm(cleanTerm)) return haystack.indexOf(needle);
  const wordChars = "A-Za-zÀ-ÖØ-öø-ÿ0-9_";
  const regex = new RegExp(`(^|[^${wordChars}])(${escapeRegExp(needle)})(?=[^${wordChars}]|$)`, "i");
  const match = regex.exec(haystack);
  return match ? match.index + (match[1] ? match[1].length : 0) : -1;
}

function resourceSearchFields(resource = {}) {
  const title = resource.title || "";
  const text = `${resource.chunk?.heading || ""} ${resource.text || ""}`;
  const tags = (resource.tags || []).join(" ");
  const meta = `${resource.subtitle || ""} ${resource.correspondent || ""} ${resource.documentType || ""} ${resource.fileFormat || ""} ${resource.status || ""}`;
  return { title, text, tags, meta, all: `${title} ${text} ${tags} ${meta}` };
}

function containsFlexibleTerm(haystackNorm = "", term = "") {
  return !!term && haystackNorm.includes(normalize(term));
}

function detectSearchIntent(query = "") {
  const normalized = normalize(query);
  const tokens = new Set(tokenize(query));
  const has = (...terms) => terms.some(term => normalized.includes(normalize(term)) || tokens.has(normalize(term)));

  const intent = {
    primary: "mixed",
    app: 0,
    link: 0,
    document: 0
  };

  if (!normalized.trim()) return intent;

  // App/tool intent: the user wants to calculate, simulate, or use an internal tool.
  if (has("calcular", "calcule", "calculo", "cálculo", "calculadora", "simular", "simule", "quanto preciso", "preciso tirar", "nota necessária", "nota necessaria", "média final", "media final", "média", "media", "nota", "prova final", "tabela da final", "tabela final", "tabela", "consulta rápida", "consulta rapida", "barema", "atividades complementares", "atividade complementar", "horas complementares", "certificados", "certificado", "doação de sangue", "doacao de sangue", "monitoria", "curso de idioma", "onde resolvo", "resolver", "setor", "problema", "dúvida", "duvida")) {
    intent.app += 18;
  }

  // Link intent: the user wants to open an external system/page rather than read a PDF.
  if (has("abrir", "acessar", "acesso", "entrar", "link", "site", "página", "pagina", "sistema", "formulário", "formulario", "instagram", "email", "e-mail", "contato", "protocolo", "horário", "horario", "horários", "horarios", "quadro de horários", "quadro de horarios", "provas passadas", "atividades passadas", "lattes")) {
    intent.link += 16;
  }

  // Document intent: the user is probably looking for a formal file/rule/source.
  if (has("documento", "pdf", "arquivo", "regulamento", "resolução", "resolucao", "lei", "norma", "diretriz", "ppc", "matriz", "ementário", "ementario", "barema", "portaria", "regimento", "projeto pedagógico", "projeto pedagogico")) {
    intent.document += 14;
  }

  const scored = [
    ["app", intent.app],
    ["link", intent.link],
    ["document", intent.document]
  ].sort((a, b) => b[1] - a[1]);

  if (scored[0][1] > 0 && scored[0][1] >= scored[1][1] + 4) {
    intent.primary = scored[0][0];
  }

  return intent;
}



function regexAccentPattern(term = "") {
  const escaped = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const map = {
    a: "[aàáâãäå]", e: "[eèéêë]", i: "[iìíîï]", o: "[oòóôõö]", u: "[uùúûü]", c: "[cç]",
    A: "[AÀÁÂÃÄÅ]", E: "[EÈÉÊË]", I: "[IÌÍÎÏ]", O: "[OÒÓÔÕÖ]", U: "[UÙÚÛÜ]", C: "[CÇ]"
  };
  return escaped.replace(/[aeioucAEIOUC]/g, char => map[char] || char);
}

function regexStrictPattern(term = "") {
  const escaped = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!isWordLikeTerm(term)) return { regex: new RegExp(`(${escaped})`, "gi"), strictWord: false };
  const wordChars = "A-Za-zÀ-ÖØ-öø-ÿ0-9_";
  return {
    regex: new RegExp(`(^|[^${wordChars}])(${escaped})(?=[^${wordChars}]|$)`, "gi"),
    strictWord: true
  };
}

function highlight(text, exactTerms = [], semanticTerms = [], strictTerms = []) {
  let safe = escapeHtml(text || "");
  const seen = new Set();
  const strictItems = (strictTerms || [])
    .map(term => ({ term, key: `strict:${rawSearchText(term).trim()}` }))
    .filter(item => item.term && item.term.length > 1 && item.key && !seen.has(item.key) && (seen.add(item.key) || true))
    .sort((a, b) => b.term.length - a.term.length);

  const allTerms = [
    ...exactTerms.map(term => ({ term, cls: "" }))
  ]
    .map(item => ({ ...item, key: normalize(item.term) }))
    .filter(item => item.term && item.term.length > 2 && item.key && !seen.has(item.key) && (seen.add(item.key) || true))
    .sort((a, b) => b.term.length - a.term.length);

  const placeholders = [];
  const hold = html => {
    const token = `${placeholders.length}`;
    placeholders.push(html);
    return token;
  };

  for (const { term } of strictItems) {
    const { regex, strictWord } = regexStrictPattern(term);
    safe = safe.replace(regex, (...args) => {
      const match = strictWord ? args[2] : args[1];
      const prefix = strictWord ? args[1] : "";
      return `${prefix}${hold(`<mark class="exact">${match}</mark>`)}`;
    });
  }

  for (const { term, cls } of allTerms) {
    const regex = new RegExp(`(${regexAccentPattern(term)})`, "gi");
    safe = safe.replace(regex, match => hold(`<mark${cls ? ` class="${cls}"` : ""}>${match}</mark>`));
  }

  placeholders.forEach((html, index) => {
    safe = safe.replaceAll(`${index}`, html);
  });
  return safe;
}

function plainSnippet(text = "", exactTerms = [], semanticTerms = [], strictTerms = [], limit = 220) {
  const clean = (text || "").toString().replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const terms = [...exactTerms, ...semanticTerms].map(normalize).filter(Boolean);
  const normalized = normalize(clean);
  let hit = -1;

  for (const term of strictTerms || []) {
    hit = strictTermIndex(clean, term);
    if (hit >= 0) break;
  }
  if (hit < 0) {
    for (const term of terms) {
      hit = normalized.indexOf(term);
      if (hit >= 0) break;
    }
  }

  if (hit < 0 || clean.length <= limit) return compactText(clean, limit);
  const start = Math.max(0, hit - Math.floor(limit / 3));
  const end = Math.min(clean.length, start + limit);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

function literalMatchIndex(text = "", exactTerms = [], semanticTerms = [], strictTerms = []) {
  const source = String(text || "");
  let best = -1;
  for (const term of strictTerms || []) {
    const index = strictTermIndex(source, term);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  for (const term of [...(exactTerms || [])]) {
    if (!term) continue;
    try {
      const match = new RegExp(regexAccentPattern(term), "i").exec(source);
      if (match && (best < 0 || match.index < best)) best = match.index;
    } catch (_) {}
  }
  return best;
}

function snippetAroundLiteral(text = "", exactTerms = [], semanticTerms = [], strictTerms = [], limit = 340) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const hit = literalMatchIndex(clean, exactTerms, semanticTerms, strictTerms);
  if (hit < 0) return "";
  if (clean.length <= limit) return clean;
  const start = Math.max(0, hit - Math.floor(limit * .34));
  const end = Math.min(clean.length, start + limit);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

function resultCandidateTexts(result = {}) {
  const candidates = [];
  const add = (text, label = "trecho") => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean && !candidates.some(item => item.text === clean)) candidates.push({ text: clean, label });
  };
  (result.matchedChunks || []).forEach(chunk => add(`${chunk.heading || ""}. ${chunk.text || ""}`, chunk.page ? `trecho da página ${chunk.page}` : "trecho do documento"));
  if (result.chunk) add(`${result.chunk.heading || ""}. ${result.chunk.text || ""}`, result.chunk.page ? `trecho da página ${result.chunk.page}` : "trecho do documento");
  add(result.text, result.type === "document" ? "trecho do documento" : "conteúdo");
  add(result.title, "título");
  add(result.subtitle, "metadados");
  add(result.doc?.summary, "resumo do documento");
  add(`${result.correspondent || ""} ${result.documentType || ""} ${result.fileFormat || ""} ${(result.tags || []).join(" ")}`, "metadados");
  return candidates;
}

function resultSnippet(result) {
  const exactTerms = result.exactTerms || [];
  const strictTerms = result.strictTerms || [];
  const candidates = resultCandidateTexts(result);

  for (const candidate of candidates) {
    const snippet = snippetAroundLiteral(candidate.text, exactTerms, [], strictTerms, 620);
    if (!snippet) continue;
    const highlighted = highlight(snippet, exactTerms, [], strictTerms);
    if (/<mark\b/i.test(highlighted)) return highlighted;
  }

  const fallback = compactText(result.doc?.summary || result.text || result.subtitle || result.title || "Resultado encontrado.", 520);
  return `<span class="match-reason">Resultado relacionado.</span> ${escapeHtml(fallback)}`;
}

function statusBadge(status) {
  // Status badges were intentionally removed from the public UI.
  return "";
}

function typeBadge(type) {
  if (type === "answer") return "";
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(typeLabel[type] || type)}</span>`;
}

function metaBadge(text, cls = "") {
  return `<span class="badge ${cls}">${escapeHtml(text || "—")}</span>`;
}

function itemInfoBadges(type, secondary = "") {
  if (type === "answer") return "";
  const primary = typeLabel[type] || type || "Item";
  const cleanSecondary = (secondary || "").toString().trim();
  if (!cleanSecondary || normalize(cleanSecondary) === normalize(primary)) return typeBadge(type);
  // For links/apps, show one useful badge instead of duplicated labels like "Link Link".
  if (type === "link" || type === "app") return metaBadge(cleanSecondary);
  return `${typeBadge(type)} ${metaBadge(cleanSecondary)}`;
}

function compactText(text = "", limit = 110) {
  const clean = text.toString().replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function resourceFormat(resource, type = "document") {
  if (type === "document") return resource.fileFormat || inferFormat(resource) || "PDF";
  if (type === "app") return "APP";
  if (type === "link") return inferFormat({ ...resource, type: "link" }) || "LINK";
  if (type === "answer") return "INFO";
  if (type === "workflow") return "GUIA";
  return "ITEM";
}



function emojiForResource(resource = {}, type = "link") {
  const haystack = normalize(`${resource.title || ""} ${resource.description || ""} ${resource.category || ""} ${(resource.tags || []).join(" ")} ${resource.url || ""}`);
  const url = (resource.url || "").toLowerCase();

  if (type === "workflow") return resource.emoji || "🧭";
  if (type === "answer") {
    if (haystack.includes("coordenador") || haystack.includes("coordenacao")) return "👤";
    if (haystack.includes("caens") || haystack.includes("estagio")) return "🧭";
    if (haystack.includes("media") || haystack.includes("nota")) return "🧮";
    return "💡";
  }
  if (type === "app") {
    if (haystack.includes("fluxograma") || haystack.includes("grade curricular") || haystack.includes("matriz curricular")) return "🗺️";
    if (haystack.includes("calendario") || haystack.includes("calendário") || haystack.includes("datas academicas") || haystack.includes("datas acadêmicas")) return "📅";
    if (haystack.includes("onde resolvo") || haystack.includes("setor") || haystack.includes("problema")) return "🧭";
    if (haystack.includes("barema") || haystack.includes("atividades complementares") || haystack.includes("horas complementares") || haystack.includes("certificado")) return "🎓";
    if (haystack.includes("media") || haystack.includes("nota") || haystack.includes("calculadora")) return "🧮";
    if (haystack.includes("tabela") || haystack.includes("consulta rapida") || haystack.includes("prova final")) return "📊";
    return "⚙️";
  }
  if (url.includes("linktr.ee") || url.includes("linkme.bio") || haystack.includes("linktree")) return "🌳";
  if (url.startsWith("mailto:") || haystack.includes("email") || haystack.includes("e-mail")) return "✉️";
  if (url.includes("wa.me") || haystack.includes("whatsapp")) return "💬";
  if (url.includes("instagram.com") || haystack.includes("instagram")) return "📸";
  if (url.includes("powerbi.com") || haystack.includes("power bi") || haystack.includes("ensalamento")) return "📊";
  if (url.includes("docs.google.com/spreadsheets") || haystack.includes("planilha")) return "📗";
  if (url.includes("drive.google.com") || haystack.includes("drive") || haystack.includes("provas passadas")) return "📂";
  if (haystack.includes("fluxograma") || haystack.includes("grade atual") || haystack.includes("grade antiga")) return "🗺️";
  if (url.includes("forms.gle") || url.includes("docs.google.com/forms") || haystack.includes("protocolo") || haystack.includes("formulario")) return "📝";
  if (haystack.includes("estagio") || haystack.includes("caens")) return "🧭";
  if (haystack.includes("assistencia") || haystack.includes("servicos sociais")) return "🤝";
  if (haystack.includes("capne") || haystack.includes("acessibilidade")) return "♿";
  return "🔗";
}

const PT_BR_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

function formatDateDisplay(value = "") {
  if (!value) return "Data não disponível";
  const raw = value.toString().trim();
  if (!raw || raw === "—") return "Data não disponível";

  let year, month, day;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    [, year, month, day] = iso;
  } else {
    const compactPdf = raw.match(/^D?[:]?\s*(\d{4})(\d{2})(\d{2})/i);
    if (compactPdf) [, year, month, day] = compactPdf;
  }

  if (year && month && day) {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime())) return PT_BR_DATE.format(date);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return PT_BR_DATE.format(parsed);
  return raw;
}

function pageCountText(resource = {}) {
  const value = resource.pageCount ?? resource.pagesCount ?? resource.pages ?? resource.page_count ?? "";
  if (value === null || value === undefined || value === "") return "Páginas não disponíveis";
  if (typeof value === "number") return `${value} ${value === 1 ? "página" : "páginas"}`;
  const clean = value.toString().trim();
  if (!clean || clean === "—") return "Páginas não disponíveis";
  if (/^\d+$/.test(clean)) {
    const count = Number(clean);
    return `${count} ${count === 1 ? "página" : "páginas"}`;
  }
  return `${clean} páginas`;
}

function createdDateText(resource = {}) {
  return formatDateDisplay(resource.createdDate || resource.creationDate || resource.createdAt || resource.docDate || resource.date || "");
}

function documentInfoBadges(resource = {}) {
  return `${metaBadge(createdDateText(resource), "doc-info")} ${metaBadge(pageCountText(resource), "doc-info")}`;
}

function documentInfoInline(resource = {}) {
  return `${createdDateText(resource)} · ${pageCountText(resource)}`;
}

function linkTargetAttrs(resource = {}) {
  const url = resource.url || resource.sourceUrl || resource.pdfUrl || resource.fileUrl || "";
  const cleanUrl = String(url || "").trim();
  // Same-page anchors must always stay in the current tab. Opening #media-final
  // or #onde-resolvo in a new tab makes the initial history restoration fight
  // the browser's native anchor scroll and sends the user back to the top.
  if (cleanUrl.startsWith("#")) return "";
  const webUrl = /^https?:\/\//i.test(cleanUrl);
  const mailOrPhone = /^(mailto:|tel:)/i.test(cleanUrl);
  const newTab = resource.openMode === "new-tab" || resource.target === "_blank" || resource.newTab === true;

  if (mailOrPhone && !newTab) return "";
  if (newTab || webUrl) return ' target="_blank" rel="noopener"';
  return "";
}


function thumbnailHtml(resource, type = "document", options = {}) {
  const title = resource?.title || "Item";
  const format = resourceFormat(resource || {}, type);
  const page = options.page ? `<span class="thumb-page">p. ${escapeHtml(options.page)}</span>` : "";
  const image = resource?.thumbnailUrl || resource?.coverUrl;
  const href = resource?.pdfUrl || resource?.fileUrl || resource?.sourceUrl || resource?.url || "#";
  const kindClass = `thumb-${type}`;
  const isPdf = type === "document" && /\.pdf($|[?#])/i.test(href || "");

  if (type !== "document") {
    const emoji = emojiForResource(resource, type);
    return `
      <div class="doc-thumb ${kindClass} thumb-emoji" aria-label="Miniatura de ${escapeHtml(title)}">
        <span class="emoji-thumb" aria-hidden="true">${emoji}</span>
        <span class="doc-format">${escapeHtml(format)}</span>
      </div>
    `;
  }

  if (image) {
    const srcset = resource?.thumbnailSrcset ? ` srcset="${escapeHtml(resource.thumbnailSrcset)}" sizes="(max-width: 600px) 96px, 160px"` : "";
    const width = Number(resource?.thumbnailWidth || 0);
    const height = Number(resource?.thumbnailHeight || 0);
    const dimensions = width && height ? ` width="${width}" height="${height}"` : "";
    return `
      <div class="doc-thumb ${kindClass} thumb-image" data-static-thumbnail="true" aria-label="Miniatura de ${escapeHtml(title)}">
        <img src="${escapeHtml(image)}"${srcset}${dimensions} loading="lazy" decoding="async" alt="" aria-hidden="true" />
        <span class="doc-format">${escapeHtml(format)}</span>
        ${page}
      </div>
    `;
  }

  const pdfAttrs = isPdf ? `data-pdf-url="${escapeHtml(href)}"` : "";
  return `
    <div class="doc-thumb ${kindClass} ${isPdf ? "thumb-pdf" : ""}" ${pdfAttrs} aria-label="Miniatura de ${escapeHtml(title)}">
      <div class="doc-sheet">
        <span class="doc-format">${escapeHtml(format)}</span>
        ${page}
        <strong>${escapeHtml(compactText(title, 48))}</strong>
        <i></i><i></i><i></i>
      </div>
    </div>
  `;
}


let pdfRuntimePromise = null;
function getPdfRuntime() {
  if (!pdfRuntimePromise) pdfRuntimePromise = import("./js/pdf-runtime.js?v=0.2.36");
  return pdfRuntimePromise;
}
async function renderSinglePdfThumbnail(el) {
  const runtime = await getPdfRuntime();
  return runtime.renderSinglePdfThumbnail(el, PDF_THUMBNAIL_BUDGET);
}
function renderPdfThumbnails() {
  getPdfRuntime().then(runtime => runtime.renderPdfThumbnails(PDF_THUMBNAIL_BUDGET)).catch(error => console.warn("Miniaturas indisponíveis:", error));
}
function schedulePdfThumbnailRender() {
  getPdfRuntime().then(runtime => runtime.schedulePdfThumbnailRender(PDF_THUMBNAIL_BUDGET)).catch(error => console.warn("Miniaturas indisponíveis:", error));
}
async function hasRealIndexedText(doc = {}) {
  const runtime = await getPdfRuntime();
  return runtime.hasRealIndexedText(doc);
}
async function extractPdfTextInBrowser(doc) {
  const runtime = await getPdfRuntime();
  return runtime.extractPdfTextInBrowser(doc);
}
function applyExtractedPayload(docId, payload) {
  const update = doc => {
    if (!doc || doc.id !== docId) return doc;
    doc.chunks = payload.chunks;
    doc.summary = payload.summary || doc.summary;
    doc.contentLength = payload.contentLength || doc.contentLength;
    doc.indexed = true;
    doc.extractionMethod = payload.extractionMethod || doc.extractionMethod;
    return doc;
  };
  rawDocuments.forEach(update);
  documents.forEach(update);
  scheduleSearchWorkerUpdate();
}
async function backgroundIndexMissingPdfText(maxDocuments = 3) {
  const runtime = await getPdfRuntime();
  const checks = await Promise.all(documents.map(async doc => ({ doc, indexed: await runtime.hasRealIndexedText(doc) })));
  const candidates = checks.filter(item => {
    const url = item.doc.pdfUrl || item.doc.sourceUrl || "";
    return /\.pdf($|[?#])/i.test(url) && !item.indexed;
  }).map(item => item.doc);
  if (!candidates.length) return;
  const summary = document.getElementById("resultsSummary");
  if (summary && !state.lastQuery) summary.textContent = `Indexando até ${Math.min(candidates.length, Math.max(0, maxDocuments))} PDF(s) em segundo plano...`;
  let changed = false;
  for (const doc of candidates.slice(0, Math.max(0, maxDocuments))) {
    const payload = await runtime.extractPdfTextInBrowser(doc);
    if (payload) { applyExtractedPayload(doc.id, payload); changed = true; }
  }
  if (changed) {
    refreshDocuments(); populateFilters(); renderDocuments(); renderDirectory();
    if (state.lastQuery) runSearch(state.lastQuery); else renderResults([], "");
  } else if (summary && !state.lastQuery) summary.textContent = "Documentos carregados. Alguns PDFs parecem escaneados ou sem texto extraível.";
}

function getAllTags() {
  return unique([
    ...documents.flatMap(doc => doc.tags || []),
    ...usefulLinks.flatMap(link => link.tags || []),
    ...apps.flatMap(app => app.tags || [])
  ]).sort((a, b) => a.localeCompare(b));
}

function getAllDocumentTypes() {
  return unique(documents.map(doc => doc.documentType || doc.kind)).sort((a, b) => a.localeCompare(b));
}

function getAllCorrespondents() {
  return unique(documents.map(doc => doc.correspondent)).sort((a, b) => a.localeCompare(b));
}

function getAllFormats() {
  return unique([
    ...documents.map(doc => doc.fileFormat),
    ...usefulLinks.map(link => inferFormat({ ...link, type: "link" })),
    ...apps.map(app => "App")
  ]).sort((a, b) => a.localeCompare(b));
}


function slugify(text = "item") {
  const slug = normalize(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || "item";
}

function titleFromFilename(path = "") {
  const file = path.split("/").pop().replace(/\.[^.]+$/, "");
  const words = file
    .replace(/[_-]+/g, " ")
    .replace(/\b(ppc|nde|cne|ces|consepe|consup|concam|ifba|bsi|si|vca|ldb|sinaes|pne|tea|libras|tcc)\b/gi, match => match.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function categoryFromPath(path = "") {
  const clean = path.replace(/^\.?\/?documents\//, "");
  const first = clean.split("/")[0] || "documentos";
  const map = {
    "ppcs": "PPCs",
    "ppc": "PPCs",
    "matrizes-curriculares": "Matrizes curriculares",
    "matrizes": "Matrizes curriculares",
    "regulamentos-bsi": "Regulamentos BSI",
    "regulamentos": "Regulamentos",
    "portarias": "Portarias",
    "normas-ifba": "Normas IFBA",
    "normas": "Normas IFBA",
    "diretrizes-cne": "Diretrizes CNE/MEC",
    "diretrizes": "Diretrizes CNE/MEC",
    "resolucoes": "Resoluções",
    "resoluções": "Resoluções",
    "documentos": "Documentos"
  };
  return map[normalize(first)] || first.replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function inferDocumentKindFromText(text = "") {
  const haystack = normalize(text);
  if (haystack.includes("ppc") || haystack.includes("projeto pedagogico")) return "PPC";
  if (haystack.includes("matriz")) return "Matriz curricular";
  if (haystack.includes("ementario") || haystack.includes("bibliografia")) return "Ementário";
  if (haystack.includes("regulamento") || haystack.includes("regimento")) return "Regulamento";
  if (haystack.includes("resolucao")) return "Resolução";
  if (haystack.includes("portaria")) return "Portaria";
  if (haystack.includes("lei")) return "Lei";
  if (haystack.includes("diretriz")) return "Diretriz";
  if (haystack.includes("barema")) return "Barema";
  if (haystack.includes("formulario") || haystack.includes("formulário")) return "Formulário";
  return "Documento";
}

function splitManifestTags(value = "") {
  if (Array.isArray(value)) return value;
  return value.toString().split(/[;,|]/).map(item => item.trim()).filter(Boolean);
}

function normalizeManifestPath(path = "") {
  const raw = path.toString().trim();
  if (!raw) return "#";
  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return raw;

  // Accept the common forms produced by manual manifests/scripts without
  // accidentally turning "./documents/a.pdf" into "documents/documents/a.pdf".
  const clean = raw
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "");

  if (clean.startsWith("documents/")) return clean;
  return `documents/${clean.replace(/^\.?\/?/, "")}`;
}

function normalizeManifestDocument(entry = {}, index = 0) {
  const originalPath = entry.path || entry.file || entry.filename || entry.fileName || entry.pdfUrl || entry.url || entry.sourceUrl || "";
  const fileUrl = normalizeManifestPath(originalPath);
  const title = entry.title || entry.name || titleFromFilename(originalPath || `documento-${index + 1}`);
  const category = entry.category || entry.group || entry.folder || categoryFromPath(fileUrl);
  const kind = entry.kind || entry.documentType || entry.type || inferDocumentKindFromText(`${title} ${category} ${fileUrl}`);
  const format = entry.fileFormat || entry.format || inferFormat({ pdfUrl: fileUrl, title, kind });
  const tags = unique([
    ...splitManifestTags(entry.tags),
    category,
    kind,
    format,
    ...inferTagsFromText(`${title} ${category} ${kind} ${fileUrl}`)
  ]).slice(0, 14);
  const id = entry.id || `doc-${slugify(`${category}-${title}-${index}`)}`;
  const summary = entry.summary || entry.description || `${kind} em ${category}.`;
  const text = entry.text || entry.content || summary;
  const page = entry.page || entry.pageNumber || entry.pagina || "—";

  return {
    id,
    sha256: entry.sha256 || entry.hash || "",
    hash: entry.hash || entry.sha256 || "",
    title,
    kind,
    documentType: kind,
    status: entry.status || "verified",
    trust: entry.trust || "Documento carregado a partir do manifesto local.",
    course: entry.course || "Sistemas de Informação",
    year: entry.year || entry.ano || "",
    docDate: entry.docDate || entry.date || entry.data || "",
    createdDate: entry.createdDate || entry.creationDate || entry.createdAt || entry.created || entry.docDate || entry.date || entry.data || "",
    pageCount: entry.pageCount || entry.pagesCount || entry.page_count || entry.pages || "",
    fileSize: Number(entry.fileSize || entry.sizeBytes || entry.size || 0) || 0,
    collectedDate: entry.collectedDate || entry.collected || "",
    sourceLabel: entry.sourceLabel || entry.source || entry.correspondent || "IFBA / fonte institucional",
    reviewedDate: entry.reviewedDate || entry.lastReviewed || entry.collectedDate || entry.collected || "",
    validityStatus: entry.validityStatus || entry.validity || entry.statusLabel || "A conferir",
    supersededBy: entry.supersededBy || "",
    sourceUrl: normalizeManifestPath(entry.sourceUrl || entry.officialUrl || originalPath),
    pdfUrl: normalizeManifestPath(entry.pdfUrl || entry.path || originalPath),
    thumbnailUrl: entry.thumbnailUrl || entry.coverUrl || "",
    thumbnailSrcset: entry.thumbnailSrcset || "",
    thumbnailWidth: Number(entry.thumbnailWidth || 0),
    thumbnailHeight: Number(entry.thumbnailHeight || 0),
    group: category,
    category,
    correspondent: entry.correspondent || inferCorrespondent({ title, kind, group: category, tags }),
    fileFormat: format,
    tags,
    summary,
    normalized: entry.normalized || null,
    hasPassages: Boolean(entry.hasPassages || entry.passageCount || (Array.isArray(entry.chunks) && entry.chunks.length)),
    passageCount: Number(entry.passageCount || entry.chunks?.length || 0),
    chunks: Array.isArray(entry.chunks) && entry.chunks.length ? entry.chunks : (entry.hasPassages || entry.passageCount ? [] : [
      {
        id: `${id}-manifesto`,
        page,
        heading: entry.heading || title,
        semanticTags: tags,
        text
      }
    ])
  };
}

function csvRows(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(value => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(value => value.length)) rows.push(row);
  return rows;
}

function parseManifestCsv(text = "") {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map(header => normalize(header).replace(/[^a-z0-9]/g, ""));
  return rows.slice(1).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });
    return {
      id: item.id,
      title: item.title || item.titulo || item.nome || item.name,
      path: item.path || item.caminho || item.file || item.filename || item.arquivo || item.pdfurl || item.url,
      sourceUrl: item.sourceurl || item.fonte || item.officialurl || item.linkoficial,
      category: item.category || item.categoria || item.group || item.grupo || item.folder || item.pasta,
      kind: item.kind || item.tipo || item.documenttype || item.tipodocumento,
      correspondent: item.correspondent || item.correspondente || item.orgao || item.origem,
      tags: item.tags || item.etiquetas,
      summary: item.summary || item.resumo || item.description || item.descricao,
      text: item.text || item.trecho || item.conteudo,
      page: item.page || item.pagina,
      year: item.year || item.ano,
      docDate: item.docdate || item.data,
      createdDate: item.createddate || item.creationdate || item.created || item.docdate || item.data,
      pageCount: item.pagecount || item.pagescount || item.page_count || item.pages,
      fileFormat: item.fileformat || item.formato,
      thumbnailUrl: item.thumbnailurl || item.thumbnail || item.coverurl || item.capa,
      thumbnailSrcset: item.thumbnailsrcset || item.srcset || "",
      thumbnailWidth: item.thumbnailwidth || "",
      thumbnailHeight: item.thumbnailheight || ""
    };
  }).filter(item => item.title || item.path || item.sourceUrl);
}

async function fetchOptionalText(url, timeoutMs = 10000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs)) : 0;
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller?.signal });
    if (!response.ok) return null;
    const text = await response.text();
    if (/^\s*</.test(text) && text.includes("<html")) return null;
    return text;
  } catch (error) {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function registerManifestGroups(docs = []) {
  const existingGroups = new Map(directoryGroups.map(group => [group.title, group]));
  docs.forEach(doc => {
    const title = doc.group || doc.category || categoryFromPath(doc.pdfUrl || doc.sourceUrl || "");
    let group = existingGroups.get(title);
    if (!group) {
      group = {
        id: `group-${slugify(title)}`,
        title,
        description: `Documentos em ${title}.`,
        items: []
      };
      directoryGroups.push(group);
      existingGroups.set(title, group);
    }
    if (!group.items.some(item => item.type === "document" && item.id === doc.id)) {
      group.items.push({ type: "document", id: doc.id });
    }
  });
}

function canonicalDocumentKey(doc = {}) {
  const hash = (doc.sha256 || doc.hash || "").toString().trim().toLowerCase();
  if (hash) return `sha:${hash}`;
  const path = normalizeManifestPath(doc.pdfUrl || doc.fileUrl || doc.path || doc.sourceUrl || doc.url || "");
  const cleanPath = normalize(path || "");
  if (cleanPath && cleanPath !== "#") return `path:${cleanPath}`;
  return `title:${normalize(doc.title || doc.id || "documento")}`;
}

async function loadManifestDocuments() {
  const loaded = [];
  let loadedFromJson = false;

  if (Array.isArray(window.HUB_MANIFEST?.documents)) {
    loaded.push(...window.HUB_MANIFEST.documents);
    loadedFromJson = true;
  }

  const jsonText = await fetchOptionalText("documents/manifest-summary.json")
    || await fetchOptionalText("documents/manifest.json")
    || await fetchOptionalText("documents/documents-manifest.json");
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed?.searchIndexUrl) searchIndexUrl = parsed.searchIndexUrl;
      loaded.push(...(Array.isArray(parsed) ? parsed : (parsed.documents || [])));
      loadedFromJson = true;
    } catch (error) {
      console.warn("Manifest JSON inválido:", error);
    }
  }

  // CSV is only a fallback. If JSON exists, do not load CSV too, otherwise
  // every document appears duplicated.
  if (!loadedFromJson) {
    const csvText = await fetchOptionalText("documents/manifest.csv") || await fetchOptionalText("documents/documents-manifest.csv");
    if (csvText) {
      loaded.push(...parseManifestCsv(csvText));
    }
  }

  const existingIds = new Set(rawDocuments.map(doc => doc.id));
  const existingKeys = new Set(rawDocuments.map(canonicalDocumentKey));
  const normalizedDocs = [];

  loaded.map(normalizeManifestDocument).forEach(doc => {
    const key = canonicalDocumentKey(doc);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);

    let id = doc.id;
    let counter = 2;
    while (existingIds.has(id)) {
      id = `${doc.id}-${counter}`;
      counter += 1;
    }
    doc.id = id;
    existingIds.add(id);
    normalizedDocs.push(doc);
    rawDocuments.push(doc);
  });

  if (normalizedDocs.length) {
    registerManifestGroups(normalizedDocs);
    refreshDocuments();
  }

  return normalizedDocs.length;
}

function linkResource(link) {
  return {
    type: "link",
    id: link.id,
    title: link.title,
    subtitle: `${link.category} · atalho externo`,
    text: link.description,
    tags: link.tags || [],
    status: link.status || "review",
    url: link.url,
    scoreBase: 4,
    fileFormat: inferFormat({ ...link, type: "link" }),
    correspondent: link.correspondent || "Link externo",
    link
  };
}

function appResource(app) {
  return {
    type: "app",
    id: app.id,
    title: app.title,
    subtitle: `${app.category} · ferramenta do hub`,
    text: app.description,
    tags: app.tags || [],
    status: app.status || "verified",
    url: app.url,
    scoreBase: 5,
    fileFormat: "App",
    correspondent: "HUB SI",
    app
  };
}

function answerResource(answer) {
  return {
    type: "answer",
    id: answer.id,
    title: answer.title,
    subtitle: answer.category || "Resposta direta",
    text: `${answer.answer || ""}. ${answer.description || ""}`,
    tags: answer.tags || [],
    status: "verified",
    url: answer.url || "#",
    scoreBase: 7,
    fileFormat: "Info",
    correspondent: answer.sourceLabel || "HUB SI",
    answer
  };
}

function workflowResource(flow) {
  return {
    type: "workflow",
    id: flow.id,
    title: flow.title,
    subtitle: "Guia rápido · passo a passo",
    text: `${flow.summary || ""} ${(flow.steps || []).join(" ")} ${(flow.documents || []).join(" ")} ${(flow.checklist || []).join(" ")}`,
    tags: unique([...(flow.documents || []), ...(flow.links || []), ...(flow.checklist || [])]),
    status: "verified",
    url: `#${flow.id}`,
    scoreBase: 6,
    fileFormat: "Guia",
    correspondent: "HUB SI",
    workflow: flow,
    emoji: flow.emoji || "🧭"
  };
}

function guideResource(guide) {
  return {
    type: "guide",
    id: guide.id,
    title: guide.title,
    subtitle: "Informação rápida",
    text: guide.body,
    tags: guide.tags || [],
    status: guide.status || "verified",
    url: `#${guide.id}`,
    scoreBase: 3,
    fileFormat: "Info",
    correspondent: "HUB SI",
    guide
  };
}

function buildResources() {
  const docResources = documents.flatMap(doc => {
    const chunks = (doc.chunks || []).length
      ? doc.chunks
      : [{ id: "main", page: 1, heading: doc.documentType || doc.kind || "Documento", text: doc.summary || doc.title || "" }];

    return chunks.map((chunk, chunkIndex) => ({
      type: "document",
      id: `${doc.id}:${chunk.id}`,
      title: doc.title,
      subtitle: `${doc.documentType || doc.kind} · ${doc.correspondent} · página ${chunk.page} · ${chunk.heading}`,
      text: chunk.text,
      tags: unique([...(doc.tags || []), ...(chunk.semanticTags || [])]),
      status: doc.status,
      url: doc.sourceUrl,
      scoreBase: doc.status === "verified" ? 6 : 3,
      fileFormat: doc.fileFormat,
      correspondent: doc.correspondent,
      documentType: doc.documentType || doc.kind,
      doc,
      chunk,
      chunkIndex
    }));
  });

  return [
    ...docResources,
    ...usefulLinks.map(linkResource),
    ...apps.map(appResource),
    ...answerCards.map(answerResource)
  ];
}

function buildBrowseResources() {
  const docResources = documents.map(doc => {
    const firstChunk = (doc.chunks || [])[0] || { id: "main", page: 1, heading: doc.documentType || doc.kind || "Documento", text: doc.summary || "" };
    return {
      type: "document",
      id: doc.id,
      title: doc.title,
      subtitle: `${doc.documentType || doc.kind || "Documento"} · ${doc.correspondent || ""}`.replace(/ · $/, ""),
      text: doc.summary || firstChunk.text || doc.title,
      tags: unique([...(doc.tags || []), ...(firstChunk.semanticTags || [])]),
      status: doc.status,
      url: doc.sourceUrl || doc.pdfUrl,
      scoreBase: doc.status === "verified" ? 6 : 3,
      fileFormat: doc.fileFormat,
      correspondent: doc.correspondent,
      documentType: doc.documentType || doc.kind,
      doc,
      chunk: firstChunk,
      chunkIndex: 0
    };
  });

  return [
    ...docResources,
    ...usefulLinks.map(linkResource),
    ...apps.map(appResource),
    ...answerCards.map(answerResource)
  ];
}

function getFilters() {
  const valueOf = (id, fallback = "all") => document.getElementById(id)?.value || fallback;
  return {
    type: valueOf("typeFilter"),
    tag: "all",
    status: "all",
    docType: valueOf("docTypeFilter"),
    correspondent: valueOf("correspondentFilter"),
    format: valueOf("formatFilter")
  };
}

function filtersAreActive(filters = getFilters()) {
  return [filters.type, filters.tag, filters.status, filters.docType, filters.correspondent, filters.format]
    .some(value => value && value !== "all");
}

function applySearchFilters(filters = {}) {
  Object.entries(SEARCH_FILTER_IDS).forEach(([key, id]) => {
    const element = document.getElementById(id);
    const value = filters?.[key] || "all";
    if (!element) return;
    const valid = [...(element.options || [])].some(option => option.value === value);
    element.value = valid ? value : "all";
  });
}

const LOCAL_HASH_ALIASES = Object.freeze({
  "#resolver": "#onde-resolvo",
});

function normalizeLocalRouteHash(hash = location.hash) {
  const raw = String(hash || "").trim();
  if (!raw || raw === "#") return "";
  const aliased = LOCAL_HASH_ALIASES[raw] || raw;
  if (!aliased.startsWith("#")) return "";
  let id = aliased.slice(1);
  try { id = decodeURIComponent(id); } catch (_) {}
  return document.getElementById(id) ? `#${id}` : "";
}

function localAnchorTarget(hash = location.hash) {
  const normalized = normalizeLocalRouteHash(hash);
  return normalized ? document.getElementById(normalized.slice(1)) : null;
}

function navigateToLocalAnchor(hash, { behavior = "smooth", focus = false, replace = false } = {}) {
  const normalized = normalizeLocalRouteHash(hash);
  const target = localAnchorTarget(normalized);
  if (!normalized || !target) return false;

  if (searchHistoryReady && history.state?.marker === SEARCH_HISTORY_MARKER) {
    const currentState = {
      ...history.state,
      scrollY: Math.max(0, Math.round(window.scrollY || 0)),
      routeHash: normalizeLocalRouteHash(location.hash),
    };
    history.replaceState(currentState, "", location.href);
  }

  const url = new URL(location.href);
  url.hash = normalized;
  const nextState = currentSearchNavigationSnapshot({
    routeHash: normalized,
    scrollY: Math.max(0, Math.round(target.offsetTop || 0)),
  });
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replace || location.hash === normalized) history.replaceState(nextState, "", nextUrl);
  else history.pushState(nextState, "", nextUrl);

  target.scrollIntoView({ behavior, block: "start" });
  if (focus) {
    const hadTabIndex = target.hasAttribute("tabindex");
    if (!hadTabIndex) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (!hadTabIndex) target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  window.dispatchEvent(new CustomEvent("hub:route-changed", { detail: { hash: normalized, id: target.id } }));
  return true;
}

function setupInternalAnchorNavigation() {
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!localAnchorTarget(href)) return;
    event.preventDefault();
    navigateToLocalAnchor(href, { focus: anchor.classList.contains("skip-link") });
  });
}

window.HUB_NAVIGATE_TO_ANCHOR = navigateToLocalAnchor;

function currentSearchNavigationSnapshot(overrides = {}) {
  const input = document.getElementById("searchInput");
  return {
    marker: SEARCH_HISTORY_MARKER,
    query: input?.value?.trim() || "",
    filters: getFilters(),
    resultsView: state.searchResultsView || "cards",
    directorySort: state.searchDirectorySort || "relevance",
    directoryRows: state.searchDirectoryRows || 10,
    directoryPage: state.searchDirectoryPage || 1,
    selectedResultIndex: Number.isFinite(state.selectedSearchIndex) ? state.selectedSearchIndex : -1,
    previewDocId: state.previewDocId || "",
    previewPage: state.previewPage || "",
    previewHistoryPushed: Boolean(state.previewHistoryPushed),
    expandedResults: [...(state.expandedSearchResults || [])],
    scrollY: Math.max(0, Math.round(window.scrollY || 0)),
    routeHash: normalizeLocalRouteHash(location.hash),
    ...overrides,
  };
}

function searchNavigationSnapshotFromLocation(candidate = history.state) {
  const params = new URLSearchParams(location.search);
  const stored = candidate?.marker === SEARCH_HISTORY_MARKER ? candidate : {};
  const currentFilters = getFilters();
  const hasUrlSearchState = params.has("q")
    || params.has("scope")
    || Object.values(SEARCH_URL_FILTER_PARAMS).some(parameter => params.has(parameter));
  const filters = stored.filters
    ? { ...currentFilters, ...stored.filters }
    : (hasUrlSearchState
      ? { type: "all", tag: "all", status: "all", docType: "all", correspondent: "all", format: "all" }
      : { ...currentFilters });
  Object.entries(SEARCH_URL_FILTER_PARAMS).forEach(([key, parameter]) => {
    const fromStored = stored.filters?.[key];
    const fromUrl = params.get(parameter);
    filters[key] = fromStored || fromUrl || filters[key] || "all";
  });
  if (!stored.filters?.type && !params.get(SEARCH_URL_FILTER_PARAMS.type)) {
    const legacyScope = params.get("scope");
    const scopeTypes = {
      document: "document", documents: "document",
      app: "app", apps: "app",
      link: "link", links: "link",
      contact: "answer", contacts: "answer",
    };
    if (scopeTypes[legacyScope]) filters.type = scopeTypes[legacyScope];
  }
  return {
    marker: SEARCH_HISTORY_MARKER,
    query: typeof stored.query === "string"
      ? stored.query
      : String(params.get("q") || document.getElementById("searchInput")?.value || "").trim(),
    filters,
    resultsView: stored.resultsView || state.searchResultsView || "cards",
    directorySort: stored.directorySort || state.searchDirectorySort || "relevance",
    directoryRows: Math.max(1, Number(stored.directoryRows) || state.searchDirectoryRows || 10),
    directoryPage: Math.max(1, Number(stored.directoryPage) || 1),
    selectedResultIndex: Number.isFinite(Number(stored.selectedResultIndex)) ? Number(stored.selectedResultIndex) : -1,
    previewDocId: stored.previewDocId || "",
    previewPage: stored.previewPage || "",
    previewHistoryPushed: Boolean(stored.previewHistoryPushed),
    expandedResults: Array.isArray(stored.expandedResults) ? stored.expandedResults : [],
    scrollY: Math.max(0, Number(stored.scrollY) || 0),
    routeHash: normalizeLocalRouteHash(location.hash || stored.routeHash || ""),
  };
}

function buildShareableSearchUrl(snapshot = currentSearchNavigationSnapshot()) {
  const url = new URL(location.href);
  url.searchParams.delete("focus");
  url.searchParams.delete("doomReturn");
  url.searchParams.delete("scope");
  url.searchParams.delete("share");
  url.searchParams.delete("doc");
  url.searchParams.delete("expires");
  url.searchParams.delete("focusDoc");
  url.searchParams.delete("focusPage");
  if (snapshot.query) url.searchParams.set("q", snapshot.query);
  else url.searchParams.delete("q");
  Object.entries(SEARCH_URL_FILTER_PARAMS).forEach(([key, parameter]) => {
    const value = snapshot.filters?.[key] || "all";
    if (value && value !== "all") url.searchParams.set(parameter, value);
    else url.searchParams.delete(parameter);
  });
  const routeHash = normalizeLocalRouteHash(snapshot.routeHash || "");
  if (routeHash) url.hash = routeHash;
  else if (snapshot.query || filtersAreActive(snapshot.filters)) url.hash = "buscar";
  else url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}

function syncSearchHistory(mode = "replace", overrides = {}) {
  if (!searchHistoryReady || restoringSearchHistory || mode === "none") return;
  const snapshot = currentSearchNavigationSnapshot(overrides);
  const url = buildShareableSearchUrl(snapshot);
  if (mode === "push") history.pushState(snapshot, "", url);
  else history.replaceState(snapshot, "", url);
}

function scheduleSearchScrollHistoryUpdate() {
  if (!searchHistoryReady || restoringSearchHistory) return;
  window.clearTimeout(searchScrollHistoryTimer);
  searchScrollHistoryTimer = window.setTimeout(() => syncSearchHistory("replace"), 160);
}

function applySearchNavigationSnapshot(snapshot, { replaceEntry = false } = {}) {
  const input = document.getElementById("searchInput");
  if (!input) return false;
  const restoreGeneration = ++searchRestoreGeneration;
  restoringSearchHistory = true;
  applySearchFilters(snapshot.filters || {});
  input.value = snapshot.query || "";
  state.searchResultsView = snapshot.resultsView === "directory" ? "directory" : "cards";
  state.searchDirectorySort = snapshot.directorySort || state.searchDirectorySort || "relevance";
  state.searchDirectoryRows = Math.max(1, Number(snapshot.directoryRows) || state.searchDirectoryRows || 10);
  const desiredDirectoryPage = Math.max(1, Number(snapshot.directoryPage) || 1);
  state.searchDirectoryPage = desiredDirectoryPage;
  state.selectedSearchIndex = Number.isFinite(Number(snapshot.selectedResultIndex)) ? Number(snapshot.selectedResultIndex) : -1;
  state.previewDocId = "";
  state.previewPage = "";
  state.previewHistoryPushed = Boolean(snapshot.previewHistoryPushed);
  state.expandedSearchResults = Array.isArray(snapshot.expandedResults) ? [...snapshot.expandedResults] : [];
  const restorePromise = runSearch(input.value, { historyMode: "none", navigationRestoreGeneration: restoreGeneration });

  const finishRestore = () => {
    if (restoreGeneration !== searchRestoreGeneration) return false;
    state.searchDirectoryPage = desiredDirectoryPage;
    applySearchResultsView(state.searchResultsView, { persist: false });
    renderSearchDirectory();
    const doc = snapshot.previewDocId ? documents.find(item => item.id === snapshot.previewDocId) : null;
    if (doc) {
      const chunk = (doc.chunks || []).find(item => String(item.page || "") === String(snapshot.previewPage || ""));
      openPreviewFromDoc(doc, { chunk, historyMode: "none", restorePage: snapshot.previewPage || "" });
    } else {
      state.previewDocId = "";
      state.previewPage = "";
      state.previewHistoryPushed = false;
      setPreviewModalOpen(false);
    }
    document.querySelectorAll("details[data-result-passages]").forEach(details => {
      details.open = state.expandedSearchResults.includes(details.dataset.resultPassages || "");
    });
    if (snapshot.selectedResultIndex >= 0 && state.lastResults?.length) {
      state.selectedSearchIndex = Math.min(state.lastResults.length - 1, snapshot.selectedResultIndex);
      if (!doc) document.querySelector(`.result-card[data-result-index="${state.selectedSearchIndex}"]`)?.focus?.({ preventScroll: true });
    }
    const routeTarget = snapshot.routeHash && snapshot.routeHash !== "#buscar"
      ? localAnchorTarget(snapshot.routeHash)
      : null;
    if (routeTarget) routeTarget.scrollIntoView({ block: "start", behavior: "auto" });
    else window.scrollTo({ top: Math.max(0, Number(snapshot.scrollY) || 0), behavior: "auto" });
    restoringSearchHistory = false;
    if (replaceEntry) syncSearchHistory("replace");
    return true;
  };
  return Promise.resolve(restorePromise).then(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve(finishRestore());
    }));
  }));
}

function initializeSearchHistoryNavigation() {
  const snapshot = searchNavigationSnapshotFromLocation(history.state);
  searchHistoryReady = true;
  return applySearchNavigationSnapshot(snapshot, { replaceEntry: true });
}

function setupSearchHistoryNavigation() {
  window.addEventListener("popstate", event => {
    if (!searchHistoryReady) return;
    liveSearchHistoryEntry = false;
    applySearchNavigationSnapshot(searchNavigationSnapshotFromLocation(event.state));
  });
  window.addEventListener("scroll", scheduleSearchScrollHistoryUpdate, { passive: true });
}


function searchOperatorSummary(query = "") {
  const parsed = parseSearchQuery(query);
  const parts = [];
  if (parsed.exactPhrases.length) parts.push(`busca exata: ${parsed.exactPhrases.map(term => `“${escapeHtml(term)}”`).join(", ")}`);
  if (parsed.hasExplicitAnd) parts.push("AND ativo");
  if (parsed.hasExplicitOr) parts.push("OR ativo");
  if (parsed.excludeTerms.length) parts.push(`excluindo: ${parsed.excludeTerms.map(escapeHtml).join(", ")}`);
  return parts.join(" · ");
}

function matchSourceLabel(result = {}) {
  const sources = result.matchSources || {};
  if (sources.browse) return "";
  const labels = [];
  if (sources.strict) labels.push("termo exato");
  if (sources.title) labels.push("título");
  if (sources.text) labels.push(result.type === "document" ? "trecho do documento" : "conteúdo");
  if (sources.semantic && !sources.text) labels.push("conteúdo relacionado");
  if (sources.tag) labels.push("tag");
  if (sources.meta) labels.push("metadados");
  const page = result.type === "document" && result.chunk?.page ? ` · página ${escapeHtml(result.chunk.page)}` : "";
  const prefix = labels.length ? `Encontrado em: ${labels.join(", ")}` : "Encontrado no item";
  return `${prefix}${page}`;
}

function renderMatchLine(result = {}) {
  const label = matchSourceLabel(result);
  if (!label) return "";
  const exact = (result.strictTerms || []).length
    ? ` <span class="exact-query-chip">"${escapeHtml((result.strictTerms || [])[0])}"</span>`
    : "";
  return `<p class="result-match-line">${escapeHtml(label)}${exact}</p>`;
}

const EMPTY_SEARCH_RECOMMENDATION_RULES = [
  {
    terms: ["ru", "restaurante universitario", "auxilio alimentacao", "alimentacao estudantil"],
    suggestions: ["assistência estudantil", "auxílio alimentação", "CAENS"],
  },
  {
    terms: ["matricula", "rematricula", "renovacao de matricula"],
    suggestions: ["calendário acadêmico", "registro acadêmico", "CORES"],
  },
  {
    terms: ["estagio", "estagiario"],
    suggestions: ["estágio supervisionado", "documentos de estágio", "coordenação de estágio"],
  },
  {
    terms: ["tcc", "trabalho de conclusao"],
    suggestions: ["Trabalho de Conclusão de Curso", "regulamento de TCC", "barema"],
  },
  {
    terms: ["prova final", "media final", "recuperacao"],
    suggestions: ["calculadora de média", "tabela da final", "regulamento acadêmico"],
  },
  {
    terms: ["calendario", "feriado", "inicio das aulas"],
    suggestions: ["calendário acadêmico", "calendário letivo", "datas acadêmicas"],
  },
];

function emptySearchSuggestions(query = "") {
  const clean = normalize(query);
  const matched = EMPTY_SEARCH_RECOMMENDATION_RULES.find(rule => rule.terms.some(term => clean.includes(normalize(term))));
  if (matched) return matched.suggestions;
  const queryTokens = new Set(clean.split(/\s+/).filter(token => token.length > 2));
  const scored = CURATED_SEARCH_SUGGESTIONS.map(term => {
    const normalizedTerm = normalize(term);
    const tokens = normalizedTerm.split(/\s+/).filter(Boolean);
    const overlap = tokens.filter(token => queryTokens.has(token)).length;
    const partial = [...queryTokens].some(token => normalizedTerm.includes(token)) ? 1 : 0;
    return { term, score: overlap * 10 + partial };
  }).sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, "pt-BR"));
  const relevant = scored.filter(item => item.score > 0).map(item => item.term);
  return unique([...relevant, "calendário acadêmico", "assistência estudantil", "CAENS"]).slice(0, 3);
}

function searchEmptyStateHtml(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return emptyStateHtml("Nenhum item corresponde aos filtros selecionados.", "Remova um ou mais filtros para ampliar a busca.");
  const suggestions = emptySearchSuggestions(cleanQuery);
  return `
    <article class="empty-state search-empty-state">
      <strong>Nenhum documento encontrado para “${escapeHtml(cleanQuery)}”.</strong>
      <span>Talvez você esteja procurando:</span>
      <ul class="search-empty-suggestions">
        ${suggestions.map(term => `<li><button type="button" data-empty-suggest="${escapeHtml(term)}">${escapeHtml(term)}</button></li>`).join("")}
      </ul>
    </article>
  `;
}

function focusPendingDocumentResult() {
  if (!pendingFocusDocumentId || !state.lastResults?.length) return;
  const index = state.lastResults.findIndex(result => result.type === "document" && (result.doc?.id || result.id) === pendingFocusDocumentId);
  if (index < 0) return;
  state.selectedSearchIndex = index;
  const docId = pendingFocusDocumentId;
  pendingFocusDocumentId = "";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = state.searchResultsView === "directory"
      ? document.querySelector(`[data-directory-doc="${CSS.escape(docId)}"]`)?.closest("tr")
      : document.querySelector(`.result-card[data-result-index="${index}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus?.({ preventScroll: true });
  }));
}

const VIEWPORT_VIRTUALIZATION_THRESHOLD = 48;

function nodeFromHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = String(html).trim();
  return template.content.firstElementChild;
}

function resultRenderKey(result = {}, index = 0) {
  return `${result.type || "item"}:${result.id || result.docId || result.title || index}`;
}

function reconcileKeyedChildren(container, nodes = []) {
  const desired = new Set(nodes);
  let cursor = container.firstElementChild;
  nodes.forEach(node => {
    if (node === cursor) {
      cursor = cursor.nextElementSibling;
      return;
    }
    container.insertBefore(node, cursor);
  });
  [...container.children].forEach(node => {
    if (!desired.has(node)) node.remove();
  });
}

function resultRenderSignature(result = {}, index = 0) {
  const passageKey = (result.matchedChunks || []).map(chunk => `${chunk.id || ""}:${chunk.page || ""}:${chunk.heading || ""}:${compactText(chunk.text || "", 180)}`).join("|");
  const expanded = (state.expandedSearchResults || []).includes(String(result.id || result.doc?.id || index));
  return JSON.stringify([
    index, result.type, result.id, result.title, result.subtitle, result.text, result.score, result.matchCount,
    result.chunk?.id, result.chunk?.page, result.chunk?.heading, compactText(result.chunk?.text || "", 220),
    result.fileFormat, result.correspondent, result.status, result.url,
    result.exactTerms || [], result.strictTerms || [], result.semanticTerms || [], result.matchSources || {},
    passageKey, expanded, state.effectiveSearchQuery
  ]);
}

function patchResultCards(container, results = []) {
  const existing = new Map([...container.children].filter(node => node.matches?.(".result-card[data-render-key]")).map(node => [node.dataset.renderKey, node]));
  const nodes = [];
  results.forEach((result, index) => {
    const key = resultRenderKey(result, index);
    const signature = resultRenderSignature(result, index);
    let node = existing.get(key);
    if (!node || node.dataset.renderSignature !== signature) node = nodeFromHtml(renderResultCard(result, index));
    if (!node) return;
    node.dataset.renderKey = key;
    node.dataset.renderSignature = signature;
    nodes.push(node);
  });
  reconcileKeyedChildren(container, nodes);
  container.classList.toggle("virtualized-collection", results.length >= VIEWPORT_VIRTUALIZATION_THRESHOLD);
}

function patchDirectoryRows(tbody, rows = []) {
  const existing = new Map([...tbody.children].filter(node => node.dataset?.renderKey).map(node => [node.dataset.renderKey, node]));
  const nodes = [];
  rows.forEach(({ key, signature, html }) => {
    let node = existing.get(key);
    if (!node || node.dataset.renderSignature !== signature) node = nodeFromHtml(html);
    if (!node) return;
    node.dataset.renderKey = key;
    node.dataset.renderSignature = signature;
    nodes.push(node);
  });
  reconcileKeyedChildren(tbody, nodes);
  tbody.classList.toggle("virtualized-table-body", rows.length >= 40);
}

function patchResourceCards(container, docs = []) {
  const existing = new Map([...container.children].filter(node => node.dataset?.renderKey).map(node => [node.dataset.renderKey, node]));
  const nodes = [];
  docs.forEach(doc => {
    const key = `document:${doc.id}`;
    const signature = JSON.stringify([
      doc.id, doc.title, doc.summary, doc.status, doc.thumbnailUrl, doc.thumbnailSrcset,
      doc.createdDate, doc.pageCount, doc.fileSize, doc.validityStatus, doc.sourceLabel,
      doc.pdfUrl, doc.sourceUrl, doc.documentType || doc.kind, doc.group || doc.category
    ]);
    let node = existing.get(key);
    if (!node || node.dataset.renderSignature !== signature) node = nodeFromHtml(renderResourceCard(doc, "document"));
    if (!node) return;
    node.dataset.renderKey = key;
    node.dataset.renderSignature = signature;
    nodes.push(node);
  });
  reconcileKeyedChildren(container, nodes);
  container.classList.toggle("virtualized-collection", docs.length >= VIEWPORT_VIRTUALIZATION_THRESHOLD);
}

function renderResults(results, query, { effectiveQuery = query, correction = null } = {}) {
  updateSavedSearchControls();
  const container = document.getElementById("searchResults");
  const summary = document.getElementById("resultsSummary");
  const cleanQuery = (query || "").trim();
  const activeFilter = filtersAreActive(getFilters());
  state.lastResults = (cleanQuery || activeFilter) ? results : [];
  state.lastQuery = query;
  state.effectiveSearchQuery = effectiveQuery || query || "";
  state.searchCorrection = correction?.changed ? correction : null;
  if (!state.lastResults.length) state.selectedSearchIndex = -1;
  else if (state.selectedSearchIndex >= state.lastResults.length) state.selectedSearchIndex = state.lastResults.length - 1;

  const viewToggle = document.getElementById("searchResultsViewToggle");
  const directory = document.getElementById("searchDirectory");
  const columnsControl = document.getElementById("searchColumnsControl");
  const doomOnly = results.length === 1 && results[0]?.type === "doom";

  if (doomOnly) {
    summary.textContent = "1 resultado anômalo encontrado. A classificação do arquivo falhou.";
    container.hidden = false;
    container.style.display = "";
    patchResultCards(container, results);
    if (directory) {
      directory.hidden = true;
      directory.style.display = "none";
    }
    if (viewToggle) viewToggle.hidden = true;
    if (columnsControl) columnsControl.hidden = true;
    schedulePdfThumbnailRender();
    return;
  }

  if (!cleanQuery && !activeFilter) {
    summary.textContent = "Pesquise documentos, regulamentos, contatos, links ou ferramentas.";
    container.hidden = false;
    container.innerHTML = "";
    if (directory) directory.hidden = true;
    if (viewToggle) viewToggle.hidden = true;
    if (columnsControl) columnsControl.hidden = true;
    return;
  }

  if (!results.length) {
    summary.textContent = cleanQuery
      ? `Nenhum documento encontrado para “${cleanQuery}”.`
      : "Nenhum item corresponde aos filtros selecionados.";
    container.hidden = false;
    container.innerHTML = searchEmptyStateHtml(cleanQuery);
    state.selectedSearchIndex = -1;
    if (directory) directory.hidden = true;
    if (viewToggle) viewToggle.hidden = true;
    if (columnsControl) columnsControl.hidden = true;
    return;
  }

  const counts = results.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const countText = Object.entries(counts)
    .map(([type, count]) => {
      const label = (typeLabel[type] || type || "item").toLowerCase();
      return `${count} ${label}${count > 1 ? "s" : ""}`;
    })
    .join(" · ");
  const operatorSummary = searchOperatorSummary(effectiveQuery || cleanQuery);
  const resultSummaryText = cleanQuery
    ? `${results.length} resultado(s): ${countText}. Ordenado por relevância.${operatorSummary ? ` ${operatorSummary}.` : ""}`
    : `${results.length} item(ns) encontrado(s) com os filtros selecionados: ${countText}.`;
  if (correction?.changed) {
    summary.innerHTML = `<span class="search-correction">Resultados para <strong>“${escapeHtml(correction.effective)}”</strong>.</span> ${escapeHtml(resultSummaryText)}`;
  } else {
    summary.textContent = resultSummaryText;
  }

  patchResultCards(container, results);
  if (viewToggle) viewToggle.hidden = false;
  if (columnsControl) columnsControl.hidden = state.searchResultsView !== "cards";
  renderSearchDirectory(results);
  applySearchResultsView(state.searchResultsView, { persist: false });
  focusPendingDocumentResult();
  schedulePdfThumbnailRender();
}


function viewerReturnUrl(doc = {}, page = "") {
  const relative = buildShareableSearchUrl(currentSearchNavigationSnapshot({ previewDocId: "", previewPage: "" }));
  const target = new URL(relative, location.href);
  if (doc.id) target.searchParams.set("focusDoc", doc.id);
  const cleanPage = String(page || "").match(/\d+/)?.[0];
  if (cleanPage) target.searchParams.set("focusPage", cleanPage);
  return `${target.pathname}${target.search}${target.hash}`;
}

function openPdfAtPage(doc = {}, page = "", options = {}) {
  const base = doc.pdfUrl || doc.sourceUrl || "#";
  if (!base || base === "#") return "#";
  const cleanPage = String(page || "").match(/\d+/)?.[0] || "";
  const title = doc.title || documentDownloadName(doc) || "Documento";
  const params = new URLSearchParams({ file: base, title });
  if (cleanPage) params.set("page", cleanPage);
  const query = String(options.query ?? state.effectiveSearchQuery ?? state.lastQuery ?? "").trim();
  if (query) params.set("q", query);
  if (options.section) params.set("section", options.section);
  if (doc.id) params.set("doc", doc.id);
  params.set("returnTo", viewerReturnUrl(doc, cleanPage));
  return `document-viewer.html?${params.toString()}`;
}

function documentDownloadName(doc = {}) {
  const source = doc.pdfUrl || doc.sourceUrl || "documento.pdf";
  const raw = String(source).split(/[?#]/)[0].split("/").pop() || "documento.pdf";
  try { return decodeURIComponent(raw); } catch (_) { return raw; }
}

function documentDownloadLink(doc = {}, label = "Baixar", className = "secondary-button") {
  const url = doc.pdfUrl || doc.sourceUrl || "#";
  return `<a class="${className}" href="${escapeHtml(url)}" download="${escapeHtml(documentDownloadName(doc))}">${escapeHtml(label)}</a>`;
}

function renderDoomResultCard(result, index) {
  return `
    <article class="result-card result-doom doom-secret-result" tabindex="0" data-result-index="${index}" aria-label="Resultado anômalo: ${escapeHtml(result.title)}">
      <div class="result-thumb">
        <div class="doom-secret-thumb" aria-hidden="true"><span>?</span><small>???</small></div>
      </div>
      <div class="result-meta-actions">
        <div class="result-head">
          <span class="badge doom-secret-badge">Tipo desconhecido</span>
        </div>
        <div class="result-actions">
          <button type="button" class="small-action doom-secret-open" data-doom-launch>Examinar arquivo</button>
        </div>
      </div>
      <div class="result-body">
        <h3>${highlight(result.title, ["doom"], [], ["doom"])}</h3>
        <p class="result-subtitle">${escapeHtml(result.subtitle)}</p>
      </div>
      <div class="result-details">
        <p class="result-match-line">Encontrado em: setor não indexado</p>
        <p class="snippet result-snippet">Tipo de arquivo desconhecido. <strong>Abrir por sua conta e risco.</strong></p>
      </div>
    </article>
  `;
}

function resultPassagesHtml(result, index) {
  if (result.type !== "document") return "";
  const chunks = (result.matchedChunks || []).filter(Boolean);
  if (chunks.length < 2) return "";
  const resultKey = String(result.id || result.doc?.id || index);
  const open = (state.expandedSearchResults || []).includes(resultKey) ? " open" : "";
  return `
    <details class="result-passages" data-result-passages="${escapeHtml(resultKey)}"${open}>
      <summary><span>${chunks.length} trechos encontrados</span><small>Expandir páginas</small></summary>
      <ol>
        ${chunks.map((chunk, chunkIndex) => {
          const heading = compactText(chunk.heading || `Página ${chunk.page || "—"}`, 74);
          const text = compactText(chunk.text || "Trecho indexado do documento.", 170);
          const pdfUrl = openPdfAtPage(result.doc, chunk.page, { query: state.effectiveSearchQuery, section: chunk.heading || "" });
          return `<li>
            <button type="button" data-preview-index="${index}" data-preview-match="${chunkIndex}">
              <strong>p. ${escapeHtml(chunk.page || "—")} · ${escapeHtml(heading)}</strong>
              <span>${highlight(text, result.exactTerms || [], [], result.strictTerms || [])}</span>
            </button>
            <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener" aria-label="Abrir página ${escapeHtml(chunk.page || "")} no PDF">Abrir página</a>
          </li>`;
        }).join("")}
      </ol>
    </details>`;
}

function renderResultCard(result, index) {
  if (result.type === "doom") return renderDoomResultCard(result, index);
  const openLabel = result.type === "document" ? "Prévia" : result.type === "workflow" ? "Ver passos" : "Abrir";
  const subtitle = highlight(result.subtitle || "", result.exactTerms || [], [], result.strictTerms || []);
  const thumbResource = result.type === "document" ? result.doc : result;
  const thumb = thumbnailHtml(thumbResource, result.type, result.type === "document" ? { page: result.chunk?.page } : {});
  const infoRow = result.type === "document"
    ? documentInfoBadges(result.doc)
    : itemInfoBadges(result.type, result.fileFormat);

  let primaryAction = "";
  if (result.type === "document") {
    primaryAction = `<button type="button" data-preview-index="${index}">${openLabel}</button>`;
  } else if (result.type === "workflow") {
    primaryAction = `<button type="button" data-workflow-open="${escapeHtml(result.id)}">${openLabel}</button>`;
  } else {
    primaryAction = `<a class="small-action" href="${escapeHtml(result.url)}"${linkTargetAttrs(result.app || result.link || result.answer || result)}>${openLabel}</a>`;
  }

  const secondaryAction = result.type === "document"
    ? `<a class="secondary-button" href="${escapeHtml(openPdfAtPage(result.doc, result.chunk?.page, { query: state.effectiveSearchQuery, section: result.chunk?.heading || "" }))}" target="_blank" rel="noopener">Abrir</a>${documentDownloadLink(result.doc)}`
    : `<button type="button" class="secondary-button" data-copy-resource="${index}">Copiar</button>`;

  const titleHtml = highlight(result.title, result.exactTerms || [], [], result.strictTerms || []);
  const matchLine = renderMatchLine(result);
  const snippetHtml = result.type === "answer"
    ? `<strong>${highlight(result.answer?.answer || result.title, result.exactTerms || [], result.strictTerms || [])}</strong><br>${resultSnippet(result)}`
    : resultSnippet(result);
  const resultId = result.type === "document" ? (result.doc?.id || result.id) : result.id;
  const resultUrl = result.type === "document" ? openPdfAtPage(result.doc, result.chunk?.page, { query: state.effectiveSearchQuery, section: result.chunk?.heading || "" }) : (result.url || "#");

  return `
    <article class="result-card result-${escapeHtml(result.type)}" tabindex="0" data-result-index="${index}" aria-label="Resultado ${index + 1}: ${escapeHtml(result.title || "Item")}">
      <div class="result-thumb">${thumb}</div>
      <div class="result-meta-actions">
        ${infoRow ? `<div class="result-head">${infoRow}</div>` : ""}
        <div class="result-actions">
          ${primaryAction}
          ${secondaryAction}
          <button type="button" class="favorite-toggle" data-favorite-toggle data-favorite-id="${escapeHtml(resultId)}" data-favorite-kind="${escapeHtml(result.type)}" data-favorite-title="${escapeHtml(result.title || "Item")}" data-favorite-url="${escapeHtml(resultUrl)}" data-favorite-meta="${escapeHtml(result.subtitle || result.fileFormat || "Item")}" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">☆</button>
        </div>
      </div>
      <div class="result-body">
        <h3>${titleHtml}</h3>
        <p class="result-subtitle">${subtitle}</p>
      </div>
      <div class="result-details">
        ${matchLine}
        <p class="snippet result-snippet">${snippetHtml}</p>
        ${resultPassagesHtml(result, index)}
      </div>
    </article>
  `;
}


function applySearchColumns(value = "auto", { persist = true } = {}) {
  const allowed = new Set(["auto", "1", "2", "3", "4", "5", "6"]);
  const clean = allowed.has(String(value)) ? String(value) : "auto";
  state.searchColumns = clean;
  const results = document.getElementById("searchResults");
  if (results) {
    if (clean === "auto") results.style.removeProperty("--search-result-columns");
    else results.style.setProperty("--search-result-columns", clean);
    results.dataset.searchColumns = clean;
  }
  const select = document.getElementById("searchColumnsSelect");
  if (select) select.value = clean;
  if (persist) prefSet(HUB_PREF_KEYS.searchColumns, clean);
}

function setupSearchColumns() {
  applySearchColumns(prefGet(HUB_PREF_KEYS.searchColumns, "auto"), { persist: false });
  document.getElementById("searchColumnsSelect")?.addEventListener("change", event => {
    applySearchColumns(event.target.value, { persist: true });
  });
}

function applySearchResultsView(value = "cards", { persist = true } = {}) {
  const clean = value === "directory" ? "directory" : "cards";
  state.searchResultsView = clean;
  document.querySelectorAll("[data-search-results-view]").forEach(button => {
    const active = button.dataset.searchResultsView === clean;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const cards = document.getElementById("searchResults");
  const directory = document.getElementById("searchDirectory");
  const columnsControl = document.getElementById("searchColumnsControl");
  const hasSearch = Boolean((state.lastQuery || "").trim() || filtersAreActive(getFilters()));

  if (clean === "directory" && hasSearch) renderSearchDirectory(state.lastResults || []);

  if (cards) {
    const showCards = !hasSearch || clean === "cards";
    cards.hidden = !showCards;
    cards.style.display = showCards ? "" : "none";
  }
  if (directory) {
    const showDirectory = hasSearch && clean === "directory";
    directory.hidden = !showDirectory;
    directory.style.display = showDirectory ? "grid" : "none";
    directory.setAttribute("aria-hidden", showDirectory ? "false" : "true");
    if (showDirectory) requestAnimationFrame(() => renderSearchDirectory(state.lastResults || []));
  }
  if (columnsControl) columnsControl.hidden = !hasSearch || clean !== "cards";
  if (persist) {
    prefSet(HUB_PREF_KEYS.searchResultsView, clean);
    syncSearchHistory("replace");
  }
}

function sortedSearchDocumentResults(results = state.lastResults || []) {
  const docs = results.map((result, resultIndex) => ({ result, resultIndex, doc: result.doc }))
    .filter(item => item.result?.type === "document" && item.doc);
  const sort = state.searchDirectorySort || "relevance";
  if (sort === "relevance") return docs;
  const [field, direction] = sort.split("-");
  const multiplier = direction === "desc" ? -1 : 1;
  return docs.sort((a, b) => {
    if (field === "category") return multiplier * String(a.doc.documentType || a.doc.category || "").localeCompare(String(b.doc.documentType || b.doc.category || ""), "pt-BR", { sensitivity: "base" });
    if (field === "date") return multiplier * (directoryDateValue(a.doc) - directoryDateValue(b.doc));
    if (field === "size") return multiplier * (directoryFileSize(a.doc) - directoryFileSize(b.doc));
    return multiplier * String(a.doc.title || "").localeCompare(String(b.doc.title || ""), "pt-BR", { sensitivity: "base" });
  });
}

function defaultDirectorySortDirection(field = "name") {
  return ["date", "size"].includes(field) ? "desc" : "asc";
}

function toggledDirectorySort(current = "name-asc", field = "name") {
  const [currentField, currentDirection] = String(current || "").split("-");
  const direction = currentField === field
    ? (currentDirection === "asc" ? "desc" : "asc")
    : defaultDirectorySortDirection(field);
  return `${field}-${direction}`;
}

function syncDirectorySortHeaders(selector, sort = "") {
  const [field, direction] = String(sort || "").split("-");
  document.querySelectorAll(selector).forEach(button => {
    const active = button.dataset.directorySortField === field || button.dataset.searchDirectorySortField === field;
    const th = button.closest("th");
    if (th) th.setAttribute("aria-sort", active ? (direction === "desc" ? "descending" : "ascending") : "none");
    button.classList.toggle("active", active);
    const icon = button.querySelector("span");
    if (icon) icon.textContent = active ? (direction === "desc" ? "↓" : "↑") : "↕";
  });
}

function renderSearchDirectoryPagination(total = 0, pageCount = 1) {
  const box = document.getElementById("searchDirectoryPagination");
  if (!box) return;
  const page = Math.min(Math.max(1, state.searchDirectoryPage), Math.max(1, pageCount));
  const from = total ? ((page - 1) * state.searchDirectoryRows) + 1 : 0;
  const to = Math.min(total, page * state.searchDirectoryRows);
  const pages = [];
  for (let value = Math.max(1, page - 2); value <= Math.min(pageCount, page + 2); value += 1) pages.push(value);
  box.innerHTML = `
    <span>${from}–${to} de ${total} documento(s)</span>
    <div class="directory-page-buttons">
      <button type="button" data-search-directory-page="first" ${page <= 1 ? "disabled" : ""} aria-label="Primeira página">«</button>
      <button type="button" data-search-directory-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
      ${pages.map(value => `<button type="button" data-search-directory-page="${value}" class="${value === page ? "active" : ""}" aria-current="${value === page ? "page" : "false"}">${value}</button>`).join("")}
      <button type="button" data-search-directory-page="next" ${page >= pageCount ? "disabled" : ""} aria-label="Próxima página">›</button>
      <button type="button" data-search-directory-page="last" ${page >= pageCount ? "disabled" : ""} aria-label="Última página">»</button>
    </div>`;
}

function renderSearchDirectory(results = state.lastResults || []) {
  const tbody = document.getElementById("searchDirectoryTableBody");
  const note = document.getElementById("searchDirectoryNote");
  const sortSelect = document.getElementById("searchDirectorySortSelect");
  const rowsSelect = document.getElementById("searchDirectoryRowsSelect");
  if (!tbody) return;
  if (sortSelect) sortSelect.value = state.searchDirectorySort;
  if (rowsSelect) rowsSelect.value = String(state.searchDirectoryRows);
  syncDirectorySortHeaders("[data-search-directory-sort-field]", state.searchDirectorySort);

  const docs = sortedSearchDocumentResults(results);
  const pageCount = Math.max(1, Math.ceil(docs.length / state.searchDirectoryRows));
  state.searchDirectoryPage = Math.min(Math.max(1, state.searchDirectoryPage), pageCount);
  const start = (state.searchDirectoryPage - 1) * state.searchDirectoryRows;
  const pageDocs = docs.slice(start, start + state.searchDirectoryRows);
  if (note) note.textContent = `${docs.length} documento(s) entre ${results.length} resultado(s). Esta visualização mostra exclusivamente documentos.`;

  if (pageDocs.length) {
    patchDirectoryRows(tbody, pageDocs.map(({ result, resultIndex, doc }) => {
      const category = doc.documentType || doc.category || "Documentos";
      const snippet = resultSnippet(result);
      return {
        key: `search-directory:${doc.id}`,
        signature: JSON.stringify([doc.id, resultIndex, result.score, result.chunk?.page, snippet, state.effectiveSearchQuery]),
        html: `<tr>
          <td class="directory-thumb-cell">${thumbnailHtml(doc, "document", { page: result.chunk?.page })}</td>
          <td class="directory-name-cell"><strong>${highlight(doc.title || "Documento", result.exactTerms || [], result.semanticTerms || [], result.strictTerms || [])}</strong><small class="search-directory-snippet">${snippet}</small></td>
          <td><span class="directory-category">${escapeHtml(category)}</span></td>
          <td>${escapeHtml(doc.displayDate || doc.date || "—")}</td>
          <td>${escapeHtml(formatFileSize(directoryFileSize(doc)))}</td>
          <td><div class="directory-actions"><button type="button" data-preview-index="${resultIndex}">Prévia</button><a class="secondary-button" href="${escapeHtml(openPdfAtPage(doc, result.chunk?.page))}" target="_blank" rel="noopener">Abrir</a>${documentDownloadLink(doc)}<button type="button" class="favorite-toggle" data-favorite-toggle data-favorite-id="${escapeHtml(doc.id)}" data-favorite-kind="document" data-favorite-title="${escapeHtml(doc.title || "Documento")}" data-favorite-url="${escapeHtml(openPdfAtPage(doc))}" data-favorite-meta="${escapeHtml(category)}" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">☆</button></div></td>
        </tr>`
      };
    }));
  } else {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><strong>Nenhum documento entre os resultados.</strong><span>Use Cards para ver links, apps, contatos e respostas.</span></div></td></tr>`;
  }
  renderSearchDirectoryPagination(docs.length, pageCount);
  schedulePdfThumbnailRender();
}

function setupSearchResultsView() {
  state.searchResultsView = prefGet(HUB_PREF_KEYS.searchResultsView, "cards") === "directory" ? "directory" : "cards";
  state.searchDirectorySort = prefGet(HUB_PREF_KEYS.searchDirectorySort, "relevance");
  state.searchDirectoryRows = Number(prefGet(HUB_PREF_KEYS.searchDirectoryRows, "10")) || 10;
  state.searchDirectoryPage = Math.max(1, Number(prefGet(HUB_PREF_KEYS.searchDirectoryPage, "1")) || 1);
  document.querySelectorAll("[data-search-results-view]").forEach(button => button.addEventListener("click", () => applySearchResultsView(button.dataset.searchResultsView, { persist: true })));
  document.getElementById("searchDirectorySortSelect")?.addEventListener("change", event => {
    state.searchDirectorySort = event.target.value;
    state.searchDirectoryPage = 1;
    prefSet(HUB_PREF_KEYS.searchDirectorySort, state.searchDirectorySort);
    prefSet(HUB_PREF_KEYS.searchDirectoryPage, "1");
    renderSearchDirectory();
    syncSearchHistory("replace");
  });
  document.querySelector(".search-directory-table thead")?.addEventListener("click", event => {
    const button = event.target.closest("[data-search-directory-sort-field]");
    if (!button) return;
    state.searchDirectorySort = toggledDirectorySort(state.searchDirectorySort, button.dataset.searchDirectorySortField);
    state.searchDirectoryPage = 1;
    prefSet(HUB_PREF_KEYS.searchDirectorySort, state.searchDirectorySort);
    prefSet(HUB_PREF_KEYS.searchDirectoryPage, "1");
    renderSearchDirectory();
    syncSearchHistory("replace");
  });
  document.getElementById("searchDirectoryRowsSelect")?.addEventListener("change", event => {
    state.searchDirectoryRows = Number(event.target.value) || 10;
    state.searchDirectoryPage = 1;
    prefSet(HUB_PREF_KEYS.searchDirectoryRows, String(state.searchDirectoryRows));
    prefSet(HUB_PREF_KEYS.searchDirectoryPage, "1");
    renderSearchDirectory();
    syncSearchHistory("replace");
  });
  document.getElementById("searchDirectoryPagination")?.addEventListener("click", event => {
    const button = event.target.closest("[data-search-directory-page]");
    if (!button || button.disabled) return;
    const total = sortedSearchDocumentResults().length;
    const pageCount = Math.max(1, Math.ceil(total / state.searchDirectoryRows));
    const action = button.dataset.searchDirectoryPage;
    if (action === "first") state.searchDirectoryPage = 1;
    else if (action === "prev") state.searchDirectoryPage = Math.max(1, state.searchDirectoryPage - 1);
    else if (action === "next") state.searchDirectoryPage = Math.min(pageCount, state.searchDirectoryPage + 1);
    else if (action === "last") state.searchDirectoryPage = pageCount;
    else state.searchDirectoryPage = Math.min(pageCount, Math.max(1, Number(action) || 1));
    prefSet(HUB_PREF_KEYS.searchDirectoryPage, String(state.searchDirectoryPage));
    renderSearchDirectory();
    syncSearchHistory("replace");
    document.getElementById("searchDirectory")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  applySearchResultsView(state.searchResultsView, { persist: false });
}

function isDoomEasterEggQuery(query = "") {
  const clean = String(query || "").trim().replace(/^(["'])doom\1$/i, "doom");
  return clean.toLowerCase() === "doom";
}

function doomSearchResult() {
  return {
    type: "doom",
    id: "doom-easter-egg",
    title: "DOOM — Documento Operacional Oculto do Ministério",
    subtitle: "Tipo de arquivo desconhecido",
    text: "Abrir por sua conta e risco.",
    fileFormat: "???",
    url: "apps/doom/",
    exactTerms: ["doom"],
    strictTerms: ["doom"],
    matchSources: { title: true, strict: true },
  };
}


let searchWorker = null;
let searchWorkerAllowed = false;
let searchWorkerReady = false;
let searchWorkerInitPromise = null;
let searchRequestId = 0;
let latestSearchRequestId = 0;
const searchPending = new Map();
let mainThreadSearchEngine = null;
let searchWorkerUpdateTimer = 0;

function searchWorkerPayload() {
  const indexedById = new Map((deferredSearchIndex?.documents || []).map(item => [item.id, item]));
  return {
    documents: documents.map(doc => {
      const indexed = indexedById.get(doc.id) || null;
      return {
        id: doc.id, title: doc.title, summary: doc.summary, tags: doc.tags || [], status: doc.status,
        documentType: doc.documentType || doc.kind, kind: doc.kind, correspondent: doc.correspondent,
        fileFormat: doc.fileFormat, sourceUrl: doc.sourceUrl, pdfUrl: doc.pdfUrl,
        normalized: indexed?.normalized || doc.normalized || null,
        chunks: indexed?.chunks || doc.chunks || []
      };
    }),
    vocabulary: deferredSearchIndex?.vocabulary || [],
    links: usefulLinks,
    apps,
    answers: answerCards,
    conceptMap
  };
}

async function ensureDeferredSearchIndex() {
  if (deferredSearchIndexLoaded) return deferredSearchIndex;
  if (deferredSearchIndexPromise) return deferredSearchIndexPromise;
  if (deferredSearchIndexRetryAt > Date.now()) return deferredSearchIndex || { documents: [], vocabulary: [] };
  deferredSearchIndexPromise = (async () => {
    const text = await fetchOptionalText(searchIndexUrl || "documents/search-index.json");
    if (!text) throw new Error("O índice completo de trechos não respondeu.");
    const parsed = JSON.parse(text);
    deferredSearchIndex = {
      documents: Array.isArray(parsed) ? parsed : (parsed.documents || []),
      vocabulary: Array.isArray(parsed?.vocabulary) ? parsed.vocabulary : []
    };
    deferredSearchIndexLoaded = true;
    deferredSearchIndexRetryAt = 0;
    const chunksById = new Map(deferredSearchIndex.documents.map(item => [item.id, item]));
    documents.forEach(doc => {
      const indexed = chunksById.get(doc.id);
      if (!indexed) return;
      doc.normalized = indexed.normalized || doc.normalized || null;
      doc.passageCount = Number(doc.passageCount || indexed.chunks?.length || 0);
    });
    await updateSearchWorkerNow();
    return deferredSearchIndex;
  })().catch(error => {
    deferredSearchIndex = deferredSearchIndex || { documents: [], vocabulary: [] };
    deferredSearchIndexRetryAt = Date.now() + SEARCH_INDEX_RETRY_DELAY_MS;
    console.warn("Índice completo de trechos indisponível; nova tentativa será feita depois:", error);
    return deferredSearchIndex;
  }).finally(() => {
    deferredSearchIndexPromise = null;
  });
  return deferredSearchIndexPromise;
}

async function hydrateDocumentPassages(doc = {}) {
  if (!doc?.id || (doc.chunks || []).length) return doc;
  const index = await ensureDeferredSearchIndex();
  const indexed = (index?.documents || []).find(item => item.id === doc.id);
  if (indexed?.chunks?.length) {
    doc.chunks = indexed.chunks;
    doc.normalized = indexed.normalized || doc.normalized || null;
  }
  return doc;
}

function resetSearchWorker(error = new Error("O mecanismo de busca foi reiniciado.")) {
  const worker = searchWorker;
  searchWorker = null;
  searchWorkerReady = false;
  searchWorkerInitPromise = null;
  try { worker?.terminate?.(); } catch (_) {}
  searchPending.forEach(pending => {
    try { pending.reject?.(error); } catch (_) {}
  });
  searchPending.clear();
}

function ensureSearchWorker() {
  if (searchWorkerReady && searchWorker) return Promise.resolve(searchWorker);
  if (searchWorkerInitPromise) return searchWorkerInitPromise;
  if (!("Worker" in window)) return Promise.reject(new Error("Web Worker indisponível"));

  searchWorkerInitPromise = new Promise((resolve, reject) => {
    const worker = new Worker("js/search-worker.js?v=0.2.36");
    searchWorker = worker;
    const initId = ++searchRequestId;
    let settled = false;
    const finishInit = (handler, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      handler(value);
    };
    const timeout = window.setTimeout(() => { const error = new Error("Tempo esgotado ao iniciar a busca"); finishInit(reject, error); resetSearchWorker(error); }, 7000);

    worker.addEventListener("message", event => {
      const message = event.data || {};
      if (message.type === "ready") {
        searchWorkerReady = true;
        finishInit(resolve, worker);
        const readyPending = searchPending.get(message.id);
        if (readyPending) { searchPending.delete(message.id); readyPending.resolve(message); }
        return;
      }
      if (message.type === "error" && message.id === initId && !settled) {
        const error = new Error(message.message || "Falha ao iniciar a busca");
        finishInit(reject, error);
        resetSearchWorker(error);
        return;
      }
      const pending = searchPending.get(message.id);
      if (!pending) return;
      searchPending.delete(message.id);
      if (message.type === "error") pending.reject(new Error(message.message || "Falha na busca"));
      else pending.resolve(message);
    });
    worker.addEventListener("error", event => {
      const error = event?.error || new Error(event?.message || "O Web Worker de busca falhou.");
      finishInit(reject, error);
      resetSearchWorker(error);
    });
    worker.postMessage({ type: "init", id: initId, payload: searchWorkerPayload() });
  }).catch(error => {
    if (searchWorker) resetSearchWorker(error);
    console.warn("Busca em Web Worker indisponível:", error);
    throw error;
  });
  return searchWorkerInitPromise;
}

async function updateSearchWorkerNow() {
  if (!searchWorker) return null;
  try {
    const worker = await ensureSearchWorker();
    const id = ++searchRequestId;
    return await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        searchPending.delete(id);
        const error = new Error("Tempo esgotado ao atualizar o índice");
        resetSearchWorker(error);
        reject(error);
      }, 7000);
      searchPending.set(id, {
        resolve: value => { window.clearTimeout(timer); resolve(value); },
        reject: error => { window.clearTimeout(timer); reject(error); }
      });
      worker.postMessage({ type: "update", id, payload: searchWorkerPayload() });
    });
  } catch (error) {
    console.warn("Índice do Worker não pôde ser atualizado:", error);
    return null;
  }
}

function scheduleSearchWorkerUpdate() {
  window.clearTimeout(searchWorkerUpdateTimer);
  searchWorkerUpdateTimer = window.setTimeout(() => { updateSearchWorkerNow(); }, 40);
}

function hydrateSearchResult(result = {}) {
  if (result.type === "document") return { ...result, doc: documents.find(doc => doc.id === result.docId || doc.id === result.id) || null };
  if (result.type === "link") return { ...result, link: usefulLinks.find(item => item.id === result.id) || null };
  if (result.type === "app") return { ...result, app: apps.find(item => item.id === result.id) || null };
  if (result.type === "answer") return { ...result, answer: answerCards.find(item => item.id === result.id) || null };
  return result;
}

async function searchInWorker(query, filters) {
  if (String(query || "").trim()) await ensureDeferredSearchIndex();
  try {
    const worker = await ensureSearchWorker();
    const id = ++searchRequestId;
    latestSearchRequestId = id;
    return await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        searchPending.delete(id);
        const error = new Error("Tempo esgotado ao executar a busca");
        resetSearchWorker(error);
        reject(error);
      }, 10000);
      searchPending.set(id, {
        resolve: value => { window.clearTimeout(timer); resolve(value); },
        reject: error => { window.clearTimeout(timer); reject(error); }
      });
      worker.postMessage({ type: "search", id, query, filters });
    });
  } catch (workerError) {
    if (!window.HubSearchEngine) await import("./js/search-engine.js?v=0.2.36");
    if (!mainThreadSearchEngine) mainThreadSearchEngine = new window.HubSearchEngine(searchWorkerPayload());
    else mainThreadSearchEngine.update(searchWorkerPayload());
    const id = ++searchRequestId;
    latestSearchRequestId = id;
    const started = performance.now();
    const payload = mainThreadSearchEngine.search(query, filters);
    return { type: "result", id, elapsedMs: performance.now() - started, ...payload, fallback: true };
  }
}


async function runSearch(query = document.getElementById("searchInput").value, { historyMode = "replace", navigationRestoreGeneration = 0 } = {}) {
  if (!navigationRestoreGeneration) {
    searchRestoreGeneration += 1;
    restoringSearchHistory = false;
  }
  const runGeneration = ++latestSearchRunGeneration;
  const normalizedQuery = String(query || "").trim();
  const queryChanged = normalizedQuery !== String(state.lastQuery || "").trim();
  if (queryChanged) {
    state.searchDirectoryPage = 1; state.selectedSearchIndex = -1;
    if (!restoringSearchHistory) state.expandedSearchResults = [];
    prefSet(HUB_PREF_KEYS.searchDirectoryPage, "1");
  }
  if (isDoomEasterEggQuery(normalizedQuery)) {
    renderResults([doomSearchResult()], normalizedQuery); updateSuggestions(normalizedQuery); syncSearchHistory(historyMode, { routeHash: "#buscar" }); return;
  }
  if (!searchWorkerAllowed && !normalizedQuery && !filtersAreActive(getFilters())) {
    renderResults(buildBrowseResources().slice(0, 24), normalizedQuery);
    updateSuggestions(normalizedQuery);
    if (historyMode !== "none") syncSearchHistory(historyMode, { routeHash: "#buscar" });
    return;
  }
  const requestMarker = searchRequestId + 1;
  try {
    const response = await searchInWorker(normalizedQuery, getFilters());
    if (runGeneration !== latestSearchRunGeneration) return;
    if (response.id !== latestSearchRequestId || response.id < requestMarker) return;
    const results = (response.results || []).map(hydrateSearchResult);
    renderResults(results, normalizedQuery, { effectiveQuery: response.effectiveQuery || normalizedQuery, correction: response.correction || null });
    updateSuggestions(response.effectiveQuery || normalizedQuery);
    syncSearchHistory(historyMode, { routeHash: "#buscar" });
    window.dispatchEvent(new CustomEvent("hub:search-performance", { detail: { elapsedMs: response.elapsedMs || 0, query: normalizedQuery } }));
  } catch (error) {
    if (runGeneration !== latestSearchRunGeneration) return;
    console.warn("Falha no mecanismo de busca:", error);
    renderResults([], normalizedQuery, { effectiveQuery: normalizedQuery, correction: null });
    updateSuggestions(normalizedQuery);
    syncSearchHistory(historyMode, { routeHash: "#buscar" });
  }
}

function populateSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll("option:not([value='all'])").forEach(option => option.remove());
  el.insertAdjacentHTML(
    "beforeend",
    values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")
  );
}

function populateFilters() {
  populateSelect("docTypeFilter", getAllDocumentTypes());
  populateSelect("correspondentFilter", getAllCorrespondents());
  populateSelect("formatFilter", getAllFormats());
  populateAutocomplete();
}

const CURATED_SEARCH_SUGGESTIONS = [
  "calendário acadêmico",
  "PPC 2024",
  "matriz curricular",
  "TCC",
  "estágio",
  "protocolo",
  "média final",
  "tabela da final",
  "barema",
  "atividades complementares",
  "coordenador",
  "whatsapp CAENS",
  "fluxograma atual",
  "fluxograma antigo",
  "provas passadas"
];

function isGoodSuggestion(term) {
  if (!term) return false;
  const clean = term.toString().replace(/\s+/g, " ").trim();
  if (!clean) return false;
  if (clean.length > 58) return false;
  if (clean.split(" ").length > 7) return false;
  if (/https?:\/\//i.test(clean)) return false;
  if (/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro).*(dias letivos|resolução|processo sei)/i.test(clean)) return false;
  return true;
}

function addSuggestion(set, term) {
  if (!isGoodSuggestion(term)) return;
  set.add(term.toString().replace(/\s+/g, " ").trim());
}

function buildVocabulary() {
  const phrases = new Set();
  CURATED_SEARCH_SUGGESTIONS.forEach(term => addSuggestion(phrases, term));

  documents.forEach(doc => {
    [doc.title, doc.documentType, doc.correspondent, doc.fileFormat].forEach(item => addSuggestion(phrases, item));
    (doc.aliases || []).forEach(item => addSuggestion(phrases, item));
  });

  usefulLinks.forEach(link => {
    [link.title, link.category, ...(link.tags || [])].forEach(item => addSuggestion(phrases, item));
  });

  apps.forEach(app => {
    [app.title, app.category, ...(app.keywords || [])].forEach(item => addSuggestion(phrases, item));
  });

  answerCards.forEach(answer => {
    [answer.title, answer.category, ...(answer.tags || [])].forEach(item => addSuggestion(phrases, item));
  });

  return unique([...phrases]).slice(0, 180);
}

let vocabulary = [];

function populateAutocomplete() {
  vocabulary = buildVocabulary();
  const datalist = document.getElementById("autocompleteTerms");
  if (!datalist) return;
  datalist.innerHTML = vocabulary.slice(0, 120).map(term => `<option value="${escapeHtml(term)}"></option>`).join("");
}

function updateSuggestions(query) {
  const box = document.getElementById("smartSuggestions");
  const quickChips = document.querySelector(".quick-chips");
  const q = normalize(query).trim();

  if (quickChips) quickChips.hidden = Boolean(q);
  if (!box) return;

  if (!q) {
    box.innerHTML = "";
    return;
  }

  const scored = vocabulary
    .filter(term => isGoodSuggestion(term))
    .map(term => {
      const n = normalize(term);
      if (n === q) return null;
      if (!n.includes(q)) return null;
      const score = (n.startsWith(q) ? 100 : 0) - Math.min(term.length, 58);
      return { term, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, "pt-BR"));

  const suggestions = unique(scored.map(item => item.term)).slice(0, 4);
  box.innerHTML = suggestions.map(term => `<button type="button" data-suggest="${escapeHtml(term)}">${escapeHtml(term)}</button>`).join("");
}

function loadSavedSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SEARCHES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch (_) { return []; }
}

function persistSavedSearches(items) {
  try { localStorage.setItem(SAVED_SEARCHES_STORAGE_KEY, JSON.stringify(items.slice(0, 10))); } catch (_) {}
  document.dispatchEvent(new CustomEvent("hub:saved-searches-changed"));
}

function currentSearchSnapshot() {
  const query = document.getElementById("searchInput")?.value?.trim() || "";
  const filters = getFilters();
  return { query, filters };
}

function savedSearchLabel(item) {
  if (item.query) return item.query;
  const labels = [];
  if (item.filters?.type && item.filters.type !== "all") labels.push(typeLabel[item.filters.type] || item.filters.type);
  if (item.filters?.docType && item.filters.docType !== "all") labels.push(item.filters.docType);
  if (item.filters?.correspondent && item.filters.correspondent !== "all") labels.push(item.filters.correspondent);
  if (item.filters?.format && item.filters.format !== "all") labels.push(item.filters.format);
  return labels.join(" · ") || "Pesquisa";
}

function updateSavedSearchControls() {
  const button = document.getElementById("saveCurrentSearch");
  if (!button) return;
  const snapshot = currentSearchSnapshot();
  button.disabled = !snapshot.query && !filtersAreActive(snapshot.filters);
}

function renderSavedSearches() {
  const list = document.getElementById("savedSearchesList");
  if (!list) return;
  const items = loadSavedSearches();
  list.innerHTML = items.length ? items.map(item => `
    <span class="saved-search-chip">
      <button type="button" data-run-saved-search="${escapeHtml(item.id)}" title="Executar pesquisa salva">${escapeHtml(savedSearchLabel(item))}</button>
      <button type="button" data-remove-saved-search="${escapeHtml(item.id)}" aria-label="Remover pesquisa ${escapeHtml(savedSearchLabel(item))}" title="Remover">×</button>
    </span>
  `).join("") : `<span class="saved-searches-empty">Nenhuma pesquisa salva.</span>`;
  updateSavedSearchControls();
}

function setupSavedSearches() {
  const saveButton = document.getElementById("saveCurrentSearch");
  const list = document.getElementById("savedSearchesList");
  renderSavedSearches();
  saveButton?.addEventListener("click", () => {
    const snapshot = currentSearchSnapshot();
    if (!snapshot.query && !filtersAreActive(snapshot.filters)) return;
    const signature = JSON.stringify(snapshot);
    const items = loadSavedSearches().filter(item => JSON.stringify({ query: item.query, filters: item.filters }) !== signature);
    items.unshift({ id: `search-${Date.now()}`, ...snapshot });
    persistSavedSearches(items);
    renderSavedSearches();
  });
  list?.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-saved-search]");
    if (remove) {
      persistSavedSearches(loadSavedSearches().filter(item => item.id !== remove.dataset.removeSavedSearch));
      renderSavedSearches();
      return;
    }
    const run = event.target.closest("[data-run-saved-search]");
    if (!run) return;
    const item = loadSavedSearches().find(saved => saved.id === run.dataset.runSavedSearch);
    if (!item) return;
    const input = document.getElementById("searchInput");
    if (input) input.value = item.query || "";
    const ids = { type: "typeFilter", docType: "docTypeFilter", correspondent: "correspondentFilter", format: "formatFilter" };
    Object.entries(ids).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = item.filters?.[key] || "all";
    });
    liveSearchHistoryEntry = false;
    runSearch(item.query || "", { historyMode: "push" });
    document.getElementById("buscar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("searchInput")?.addEventListener("input", updateSavedSearchControls);
  ["typeFilter", "docTypeFilter", "correspondentFilter", "formatFilter"].forEach(id => document.getElementById(id)?.addEventListener("change", updateSavedSearchControls));
}

function openSearchResultByIndex(index = 0, { newTab = false } = {}) {
  const numericIndex = Number(index);
  const result = state.lastResults?.[numericIndex];
  if (!result) return false;
  state.selectedSearchIndex = numericIndex;
  syncSearchHistory("replace", { selectedResultIndex: numericIndex });
  if (result.type === "doom") {
    const trigger = document.querySelector(`.result-card[data-result-index="${Number(index)}"] [data-doom-launch]`);
    trigger?.click();
    return Boolean(trigger);
  }
  if (newTab) {
    const url = result.type === "document"
      ? openPdfAtPage(result.doc, result.chunk?.page, { query: state.effectiveSearchQuery, section: result.chunk?.heading || "" })
      : (result.url || result.app?.url || result.link?.url || "");
    if (url && url !== "#") window.open(url, "_blank", "noopener");
    return Boolean(url && url !== "#");
  }
  const card = document.querySelector(`.result-card[data-result-index="${Number(index)}"]`);
  const target = card?.querySelector("[data-doom-launch], [data-preview-index], [data-workflow-open], a.small-action");
  if (target) {
    target.click();
    return true;
  }
  return false;
}

function focusSearchResult(index = 0) {
  const cards = [...document.querySelectorAll(".result-card[data-result-index]")];
  if (!cards.length) return false;
  const safe = Math.max(0, Math.min(cards.length - 1, Number(index) || 0));
  state.selectedSearchIndex = safe;
  cards[safe].focus({ preventScroll: true });
  cards[safe].scrollIntoView({ behavior: "smooth", block: "nearest" });
  syncSearchHistory("replace", { selectedResultIndex: safe });
  return true;
}

function readDoomReturnContext() {
  try {
    const raw = sessionStorage.getItem(DOOM_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    const context = JSON.parse(raw);
    if (!context || typeof context !== "object") return null;
    return context;
  } catch (_) {
    return null;
  }
}

function saveDoomReturnContext() {
  const context = {
    ...currentSearchNavigationSnapshot({ previewDocId: "", previewPage: "" }),
    query: document.getElementById("searchInput")?.value || "doom",
    createdAt: Date.now(),
  };
  try { sessionStorage.setItem(DOOM_RETURN_CONTEXT_KEY, JSON.stringify(context)); } catch (_) {}
}

function playDoomAnomalySound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const now = context.currentTime;
    oscillator.type = "sine";
    overtone.type = "triangle";
    oscillator.frequency.setValueAtTime(118, now);
    oscillator.frequency.exponentialRampToValueAtTime(76, now + .34);
    overtone.frequency.setValueAtTime(236, now + .08);
    overtone.frequency.exponentialRampToValueAtTime(152, now + .34);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.035, now + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .38);
    oscillator.connect(gain);
    overtone.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    overtone.start(now + .08);
    oscillator.stop(now + .38);
    overtone.stop(now + .38);
    window.setTimeout(() => context.close().catch(() => {}), 600);
  } catch (_) {}
}

function doomAnomalyOverlay() {
  let overlay = document.getElementById("doomAnomalyOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "doomAnomalyOverlay";
  overlay.className = "doom-anomaly-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "doomAnomalyTitle");
  overlay.innerHTML = `
    <div class="doom-anomaly-panel">
      <p class="doom-anomaly-source">HUB ARQUIVOS IFBA · BUSCA INTERNA</p>
      <h2 id="doomAnomalyTitle">ANOMALIA DETECTADA NO ACERVO</h2>
      <p id="doomAnomalyStatus">Falha ao classificar o documento solicitado.</p>
      <div class="doom-anomaly-progress" aria-hidden="true"><span></span></div>
      <small>Isolando subsistema experimental…</small>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
}

let doomLaunchInProgress = false;
function launchDoomEasterEgg(trigger = null) {
  if (doomLaunchInProgress) return;
  doomLaunchInProgress = true;
  saveDoomReturnContext();
  let discoveredBefore = false;
  try {
    discoveredBefore = localStorage.getItem(DOOM_DISCOVERED_KEY) === "1";
    localStorage.setItem(DOOM_DISCOVERED_KEY, "1");
  } catch (_) {}
  playDoomAnomalySound();

  const card = trigger?.closest?.(".doom-secret-result");
  card?.classList.add("is-corrupted");
  const summary = document.getElementById("resultsSummary");
  if (summary) summary.textContent = discoveredBefore
    ? "Subsistema experimental reconhecido."
    : "Falha de leitura: o item não corresponde a nenhum formato acadêmico conhecido.";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const overlayDelay = reducedMotion ? 30 : (discoveredBefore ? 80 : 260);
  const navigationDelay = reducedMotion ? 360 : (discoveredBefore ? 720 : 1650);
  const statusDelay = reducedMotion ? 140 : (discoveredBefore ? 300 : 980);
  const overlay = doomAnomalyOverlay();
  overlay.classList.toggle("is-returning", discoveredBefore);

  window.setTimeout(() => {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    document.body.classList.add("doom-anomaly-open");
  }, overlayDelay);

  window.setTimeout(() => {
    const status = document.getElementById("doomAnomalyStatus");
    if (status) status.textContent = discoveredBefore
      ? "Subsistema reconhecido. Transferindo controle…"
      : "Subsistema localizado. Transferindo controle…";
  }, statusDelay);

  window.setTimeout(() => window.location.assign("apps/doom/?from=hub"), navigationDelay);
}

function setupDoomEasterEgg() {
  document.body.addEventListener("click", event => {
    const trigger = event.target.closest("[data-doom-launch]");
    if (!trigger) return;
    event.preventDefault();
    launchDoomEasterEgg(trigger);
  });
}

function restoreDoomSearchContext() {
  const params = new URLSearchParams(location.search);
  if (params.get("doomReturn") !== "1") return false;
  const context = readDoomReturnContext() || { query: "doom", filters: {} };
  const input = document.getElementById("searchInput");
  if (input) input.value = context.query || "doom";
  applySearchFilters(context.filters || {});
  state.searchResultsView = context.resultsView === "directory" ? "directory" : "cards";
  state.searchDirectorySort = context.directorySort || state.searchDirectorySort || "relevance";
  state.searchDirectoryRows = Math.max(1, Number(context.directoryRows) || state.searchDirectoryRows || 10);
  const restoredDirectoryPage = Math.max(1, Number(context.directoryPage) || 1);
  state.searchDirectoryPage = restoredDirectoryPage;
  state.selectedSearchIndex = Number.isFinite(Number(context.selectedResultIndex)) ? Number(context.selectedResultIndex) : -1;
  const restorePromise = runSearch(input?.value || "doom", { historyMode: "none" });
  searchHistoryReady = true;
  const snapshot = currentSearchNavigationSnapshot({
    scrollY: Math.max(0, Number(context.scrollY) || 0),
    previewDocId: "",
    previewPage: "",
  });
  history.replaceState(snapshot, "", buildShareableSearchUrl(snapshot));
  Promise.resolve(restorePromise).finally(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    state.searchDirectoryPage = restoredDirectoryPage;
    applySearchResultsView(state.searchResultsView, { persist: false });
    renderSearchDirectory();
    const fallback = document.getElementById("buscar");
    if (snapshot.scrollY > 0) window.scrollTo({ top: snapshot.scrollY, behavior: "auto" });
    else fallback?.scrollIntoView({ block: "start" });
  })));
  return true;
}

function clearSearchAndFilters({ historyMode = "push", focus = true } = {}) {
  const input = document.getElementById("searchInput");
  if (!input) return;
  input.value = "";
  applySearchFilters({ type: "all", docType: "all", correspondent: "all", format: "all" });
  prefRemove(HUB_PREF_KEYS.searchFilters);
  liveSearchHistoryEntry = false;
  runSearch("", { historyMode });
  if (focus) input.focus();
}

function setupSearch() {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  if (!form || !input) return;
  document.getElementById("searchResults")?.addEventListener("toggle", event => {
    const details = event.target.closest?.("details[data-result-passages]");
    if (!details) return;
    const key = details.dataset.resultPassages || "";
    const expanded = new Set(state.expandedSearchResults || []);
    if (details.open) expanded.add(key); else expanded.delete(key);
    state.expandedSearchResults = [...expanded];
    syncSearchHistory("replace", { expandedResults: state.expandedSearchResults });
  }, true);
  setupSearchHistoryNavigation();

  form.addEventListener("submit", event => {
    event.preventDefault();
    const mode = liveSearchHistoryEntry ? "replace" : "push";
    runSearch(input.value, { historyMode: mode });
    liveSearchHistoryEntry = false;
  });

  input.addEventListener("keydown", async event => {
    if (event.key === "ArrowDown" && state.lastResults?.length) {
      event.preventDefault();
      focusSearchResult(state.selectedSearchIndex >= 0 ? state.selectedSearchIndex : 0);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const queryChanged = String(state.lastQuery || "").trim() !== input.value.trim();
      if (queryChanged) {
        const mode = liveSearchHistoryEntry ? "replace" : "push";
        await runSearch(input.value, { historyMode: mode });
        liveSearchHistoryEntry = false;
        if (isDoomEasterEggQuery(input.value)) return;
      }
      if (state.lastResults?.length) openSearchResultByIndex(state.selectedSearchIndex >= 0 ? state.selectedSearchIndex : 0, { newTab: event.ctrlKey || event.metaKey });
      else runSearch(input.value, { historyMode: "replace" });
      return;
    }
    if (event.key === "Escape" && (input.value || filtersAreActive(getFilters()))) {
      event.preventDefault();
      clearSearchAndFilters({ historyMode: "push" });
    }
  });

  input.addEventListener("input", () => {
    window.clearTimeout(input._timer);
    input._timer = window.setTimeout(() => {
      const mode = liveSearchHistoryEntry ? "replace" : "push";
      runSearch(input.value, { historyMode: mode });
      liveSearchHistoryEntry = true;
    }, 120);
  });

  document.querySelectorAll("[data-example]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      liveSearchHistoryEntry = false;
      runSearch(input.value, { historyMode: "push" });
      input.focus();
    });
  });

  const urlParams = new URLSearchParams(window.location.search);
  const focusSearchRequested = urlParams.get("focus") === "search";
  if (focusSearchRequested || urlParams.has("q") || window.location.hash === "#buscar") {
    window.setTimeout(() => input.focus({ preventScroll: true }), 260);
  }

  document.getElementById("smartSuggestions")?.addEventListener("click", event => {
    const button = event.target.closest("[data-suggest]");
    if (!button) return;
    input.value = button.dataset.suggest;
    liveSearchHistoryEntry = false;
    runSearch(input.value, { historyMode: "push" });
    input.focus();
  });

  document.getElementById("searchResults")?.addEventListener("click", event => {
    const button = event.target.closest("[data-empty-suggest]");
    if (!button) return;
    input.value = button.dataset.emptySuggest;
    liveSearchHistoryEntry = false;
    runSearch(input.value, { historyMode: "push" });
    input.focus();
  });

  Object.values(SEARCH_FILTER_IDS).forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      saveSearchFiltersPreference();
      liveSearchHistoryEntry = false;
      runSearch(input.value, { historyMode: "push" });
    });
  });

  document.getElementById("clearSearch")?.addEventListener("click", () => clearSearchAndFilters({ historyMode: "push" }));
  runSearch("", { historyMode: "none" });
}


function renderResourceCard(resource, kind) {
  const action = kind === "document"
    ? `<button type="button" data-doc-preview="${escapeHtml(resource.id)}">Prévia</button><a class="secondary-button" href="${escapeHtml(openPdfAtPage(resource))}" target="_blank" rel="noopener">Abrir</a>${documentDownloadLink(resource)}`
    : `<a class="small-action" href="${escapeHtml(resource.url)}"${linkTargetAttrs(resource)}>Abrir</a>`;
  const subtitle = kind === "document" ? documentInfoInline(resource) : (resource.category || "Atalho");
  const infoRow = kind === "document"
    ? documentInfoBadges(resource)
    : itemInfoBadges(kind, resource.category || inferFormat({ ...resource, type: kind }));

  const favoriteUrl = kind === "document" ? openPdfAtPage(resource) : (resource.url || "#");
  const favoriteMeta = kind === "document" ? documentInfoInline(resource) : (resource.category || "Atalho");
  return `
    <article class="resource-card resource-${escapeHtml(kind)}" id="${escapeHtml(resource.id)}">
      <button type="button" class="favorite-toggle" data-favorite-toggle data-favorite-id="${escapeHtml(resource.id)}" data-favorite-kind="${escapeHtml(kind)}" data-favorite-title="${escapeHtml(resource.title || "Item")}" data-favorite-url="${escapeHtml(favoriteUrl)}" data-favorite-meta="${escapeHtml(favoriteMeta)}" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">☆</button>
      ${thumbnailHtml(resource, kind)}
      <div class="badge-row">${infoRow}</div>
      <h3>${escapeHtml(resource.title)}</h3>
      <p class="result-subtitle">${escapeHtml(subtitle || "")}</p>
      <p>${escapeHtml(compactText(resource.summary || resource.description || resource.body || "", 132))}</p>
      <footer class="card-footer">${action}</footer>
    </article>
  `;
}

function findResourceByRef(ref) {
  if (!ref || !ref.id) return null;
  if (ref.type === "document") return documents.find(item => item.id === ref.id);
  if (ref.type === "link") return usefulLinks.find(item => item.id === ref.id);
  if (ref.type === "app") return apps.find(item => item.id === ref.id);
  if (ref.type === "guide") return guides.find(item => item.id === ref.id);
  return null;
}

function refTitle(resource) {
  return resource?.title || "Item";
}

function refMeta(resource, type) {
  if (!resource) return "";
  if (type === "document") return documentInfoInline(resource);
  return resource.category || (type === "guide" ? "Informação" : "Item");
}

function directoryFileSize(doc = {}) {
  const value = Number(doc.fileSize || doc.sizeBytes || doc.size || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${units[unit]}`;
}

function directoryDateValue(doc = {}) {
  const raw = doc.createdDate || doc.creationDate || doc.createdAt || doc.docDate || doc.date || "";
  if (!raw) return 0;
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return iso;
  const match = String(raw).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
  return 0;
}

function sortedDirectoryDocuments() {
  const list = [...documents];
  const sort = state.directorySort || "name-asc";
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const [field, direction] = sort.split("-");
  const multiplier = direction === "desc" ? -1 : 1;
  list.sort((a, b) => {
    if (field === "category") {
      return multiplier * collator.compare(a.group || a.category || "", b.group || b.category || "");
    }
    if (field === "date") return multiplier * (directoryDateValue(a) - directoryDateValue(b));
    if (field === "size") return multiplier * (directoryFileSize(a) - directoryFileSize(b));
    return multiplier * collator.compare(a.title || "", b.title || "");
  });
  return list;
}

function renderDirectoryPagination(total, pageCount) {
  const box = document.getElementById("directoryPagination");
  if (!box) return;
  const page = Math.min(Math.max(1, state.directoryPage), Math.max(1, pageCount));
  const from = total ? ((page - 1) * state.directoryRows) + 1 : 0;
  const to = Math.min(total, page * state.directoryRows);
  const pages = [];
  const low = Math.max(1, page - 2);
  const high = Math.min(pageCount, page + 2);
  for (let value = low; value <= high; value += 1) pages.push(value);
  box.innerHTML = `
    <span>Mostrando <strong>${from}–${to}</strong> de <strong>${total}</strong> documentos.</span>
    <div class="directory-page-buttons">
      <button type="button" data-directory-page="first" ${page <= 1 ? "disabled" : ""} aria-label="Primeira página">«</button>
      <button type="button" data-directory-page="prev" ${page <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
      ${pages.map(value => `<button type="button" data-directory-page="${value}" class="${value === page ? "active" : ""}" aria-current="${value === page ? "page" : "false"}">${value}</button>`).join("")}
      <button type="button" data-directory-page="next" ${page >= pageCount ? "disabled" : ""} aria-label="Próxima página">›</button>
      <button type="button" data-directory-page="last" ${page >= pageCount ? "disabled" : ""} aria-label="Última página">»</button>
    </div>
  `;
}

function renderDirectory() {
  const container = document.getElementById("directoryGrid");
  const tbody = document.getElementById("directoryTableBody");
  if (!container || !tbody) return;

  const sortSelect = document.getElementById("directorySortSelect");
  const rowsSelect = document.getElementById("directoryRowsSelect");
  if (sortSelect) sortSelect.value = state.directorySort;
  if (rowsSelect) rowsSelect.value = String(state.directoryRows);
  syncDirectorySortHeaders("[data-directory-sort-field]", state.directorySort);

  if (!documents.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyStateHtml("Nenhum documento no diretório ainda", "Adicione documentos ao Acervo e gere o manifesto.")}</td></tr>`;
    renderDirectoryPagination(0, 1);
    return;
  }

  const sorted = sortedDirectoryDocuments();
  const pageCount = Math.max(1, Math.ceil(sorted.length / state.directoryRows));
  state.directoryPage = Math.min(Math.max(1, state.directoryPage), pageCount);
  prefSet(HUB_PREF_KEYS.directoryPage, String(state.directoryPage));
  const start = (state.directoryPage - 1) * state.directoryRows;
  const pageDocs = sorted.slice(start, start + state.directoryRows);

  patchDirectoryRows(tbody, pageDocs.map(doc => {
    const fileUrl = doc.pdfUrl || doc.sourceUrl || "#";
    const category = doc.group || doc.category || categoryFromPath(fileUrl);
    return {
      key: `directory:${doc.id}`,
      signature: JSON.stringify([
        doc.id, doc.title, category, createdDateText(doc), directoryFileSize(doc),
        doc.thumbnailUrl, doc.thumbnailSrcset, fileUrl, doc.pdfUrl, doc.sourceUrl
      ]),
      html: `
        <tr>
          <td class="directory-thumb-cell">${thumbnailHtml(doc, "document")}</td>
          <td class="directory-name-cell"><strong>${escapeHtml(doc.title || "Documento")}</strong><small>${escapeHtml((fileUrl.split("/").pop() || "arquivo").replace(/%20/g, " "))}</small></td>
          <td><span class="directory-category">${escapeHtml(category || "Documentos")}</span></td>
          <td>${escapeHtml(createdDateText(doc))}</td>
          <td>${escapeHtml(formatFileSize(directoryFileSize(doc)))}</td>
          <td><div class="directory-actions"><button type="button" data-directory-doc="${escapeHtml(doc.id)}">Prévia</button><a class="secondary-button" href="${escapeHtml(openPdfAtPage(doc))}" target="_blank" rel="noopener">Abrir</a>${documentDownloadLink(doc)}<button type="button" class="favorite-toggle" data-favorite-toggle data-favorite-id="${escapeHtml(doc.id)}" data-favorite-kind="document" data-favorite-title="${escapeHtml(doc.title || "Documento")}" data-favorite-url="${escapeHtml(openPdfAtPage(doc))}" data-favorite-meta="${escapeHtml(category || "Documentos")}" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">☆</button></div></td>
        </tr>
      `
    };
  }));

  renderDirectoryPagination(sorted.length, pageCount);
  schedulePdfThumbnailRender();
}

function emptyStateHtml(title, text) {
  return `
    <article class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function renderArchiveLoadMore(total = documents.length, visible = 0) {
  const box = document.getElementById("archiveLoadMore");
  if (!box) return;

  if (!total || state.archiveView !== "grid") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const shown = Math.min(visible, total);
  const remaining = Math.max(0, total - shown);
  const nextBatch = Math.min(getArchiveBatchSize(), remaining);
  const shouldShow = total > getArchiveBatchSize() || remaining > 0;

  if (!shouldShow) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.hidden = false;
  box.innerHTML = `
    <span>Mostrando <strong>${shown}</strong> de <strong>${total}</strong> documentos.</span>
    ${remaining ? `<button type="button" class="secondary-button" data-archive-more>Ver mais ${nextBatch}</button>` : `<span class="archive-all-visible">Todos os documentos foram exibidos.</span>`}
  `;
}

function renderDocuments() {
  const grid = document.getElementById("documentGrid");
  if (!grid) return;
  if (!documents.length) {
    grid.innerHTML = emptyStateHtml("Nenhum documento cadastrado ainda", "Adicione PDFs em /documents e gere o manifesto.");
    renderArchiveLoadMore(0, 0);
    return;
  }

  const limit = Math.min(ensureArchiveLimit(), documents.length);
  const visibleDocs = documents.slice(0, limit);
  patchResourceCards(grid, visibleDocs);
  renderArchiveLoadMore(documents.length, limit);
  schedulePdfThumbnailRender();
}

function linksColumnsMaximum() {
  if (window.matchMedia?.("(max-width: 520px)")?.matches) return 2;
  if (window.matchMedia?.("(max-width: 920px)")?.matches) return 3;
  return 8;
}

function linksColumnsPreferenceKey(view = state.linksView || defaultLinksView()) {
  const device = isMobileViewport() ? "Mobile" : "Desktop";
  const suffix = view === "cards" ? "Cards" : "Quick";
  return `${HUB_PREF_KEYS[`linksColumns${suffix}`]}${device}`;
}

function sanitizeLinksColumns(value) {
  if (value === "auto") return "auto";
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? String(Math.min(linksColumnsMaximum(), Math.max(1, number))) : "auto";
}

function currentLinksColumns(view = state.linksView || defaultLinksView()) {
  return view === "cards" ? state.linksColumnsCards : state.linksColumnsQuick;
}

function setCurrentLinksColumns(value, view = state.linksView || defaultLinksView()) {
  const clean = sanitizeLinksColumns(value);
  if (view === "cards") state.linksColumnsCards = clean;
  else state.linksColumnsQuick = clean;
  return clean;
}

function populateLinksColumnsSelect() {
  const select = document.getElementById("linksColumnsSelect");
  const label = document.getElementById("linksColumnsLabel");
  if (!select) return;
  const view = state.linksView || defaultLinksView();
  const maximum = linksColumnsMaximum();
  const preferred = sanitizeLinksColumns(currentLinksColumns(view));
  const options = ['<option value="auto">Automático</option>'];
  for (let columns = 1; columns <= maximum; columns += 1) {
    options.push(`<option value="${columns}">${columns}</option>`);
  }
  select.innerHTML = options.join("");
  select.value = preferred;
  select.disabled = state.linksEditMode;
  if (label) label.textContent = "Colunas";
}

function applyLinksColumns({ persist = false } = {}) {
  const grid = document.getElementById("linksGrid");
  if (!grid) return;
  const view = state.linksView || defaultLinksView();
  const clean = setCurrentLinksColumns(currentLinksColumns(view), view);
  grid.style.removeProperty("grid-template-columns");
  if (!state.linksEditMode && clean !== "auto") {
    grid.style.gridTemplateColumns = `repeat(${clean}, minmax(0, 1fr))`;
  }
  grid.dataset.linksColumns = clean;
  if (persist) prefSet(linksColumnsPreferenceKey(view), clean);
  populateLinksColumnsSelect();
}

function loadLinksColumnPreferences() {
  for (const view of ["quick", "cards"]) {
    const stored = prefGet(linksColumnsPreferenceKey(view), "auto");
    setCurrentLinksColumns(stored, view);
  }
}

function defaultLinksView() {
  return window.matchMedia && window.matchMedia("(max-width: 920px)").matches ? "quick" : "cards";
}

function applyLinksView(value, { persist = true } = {}) {
  const clean = value === "cards" ? "cards" : "quick";
  state.linksView = clean;

  document.querySelectorAll("[data-links-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.linksView === clean);
  });

  const grid = document.getElementById("linksGrid");
  if (grid) {
    grid.classList.toggle("linktree-list", clean === "quick" && !state.linksEditMode);
    grid.classList.toggle("cards-grid", clean === "cards" && !state.linksEditMode);
    grid.classList.toggle("links-edit-list", state.linksEditMode);
    grid.dataset.view = state.linksEditMode ? "edit" : clean;
  }

  applyLinksColumns({ persist: false });

  if (persist) {
    try { localStorage.setItem(linksViewStorageKey(), clean); } catch (_) {}
  }
}

function orderedUsefulLinks() {
  const byId = new Map(usefulLinks.map(link => [link.id, link]));
  const saved = prefGetJson(LINKS_ORDER_STORAGE_KEY, null);
  const order = Array.isArray(saved) && saved.length ? saved : DEFAULT_LINK_ORDER;
  const seen = new Set();
  const ordered = [];

  order.forEach(id => {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      ordered.push(item);
      seen.add(id);
    }
  });

  usefulLinks.forEach(item => {
    if (!seen.has(item.id)) {
      ordered.push(item);
      seen.add(item.id);
    }
  });

  return ordered;
}

function saveLinksOrder(links = orderedUsefulLinks()) {
  prefSetJson(LINKS_ORDER_STORAGE_KEY, links.map(link => link.id));
}

function moveLinkInOrder(id, direction) {
  const links = orderedUsefulLinks();
  const index = links.findIndex(link => link.id === id);
  if (index < 0) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= links.length) return;
  const [item] = links.splice(index, 1);
  links.splice(nextIndex, 0, item);
  saveLinksOrder(links);
  renderLinks();
  renderSidebarLinks();
}

function moveDraggedLink(dragId, targetId) {
  if (!dragId || !targetId || dragId === targetId) return;
  const links = orderedUsefulLinks();
  const from = links.findIndex(link => link.id === dragId);
  const to = links.findIndex(link => link.id === targetId);
  if (from < 0 || to < 0) return;
  const [item] = links.splice(from, 1);
  const targetIndex = links.findIndex(link => link.id === targetId);
  links.splice(targetIndex < 0 ? to : targetIndex, 0, item);
  saveLinksOrder(links);
  renderLinks();
  renderSidebarLinks();
}

function renderLinktreeItem(link) {
  const roleLabel = /^apps\//.test(link.url || "") || /^#/.test(link.url || "") || link.category === "App"
    ? "Ferramenta do HUB"
    : "Link externo";
  return `
    <article class="linktree-shell">
      <a class="linktree-item" href="${escapeHtml(link.url || "#")}"${linkTargetAttrs({ ...link, newTab: true })}>
        <span class="linktree-emoji" aria-hidden="true">${emojiForResource(link, "link")}</span>
        <span class="linktree-copy"><strong>${escapeHtml(link.title)}</strong><small>${roleLabel}</small></span>
      </a>
      <button type="button" class="favorite-toggle linktree-favorite" data-favorite-toggle data-favorite-id="${escapeHtml(link.id)}" data-favorite-kind="link" data-favorite-title="${escapeHtml(link.title || "Link")}" data-favorite-url="${escapeHtml(link.url || "#")}" data-favorite-meta="${escapeHtml(link.category || "Link externo")}" aria-label="Adicionar aos favoritos" title="Adicionar aos favoritos">☆</button>
    </article>
  `;
}

function renderEditableLinkItem(link, index, total) {
  return `
    <article class="link-order-item" draggable="true" data-link-order-id="${escapeHtml(link.id)}">
      <button type="button" class="drag-handle" draggable="true" aria-label="Arrastar ${escapeHtml(link.title)}">☰</button>
      <span class="linktree-emoji" aria-hidden="true">${emojiForResource(link, "link")}</span>
      <div class="link-order-text">
        <strong>${escapeHtml(link.title)}</strong>
        <small>${escapeHtml(link.category || "Atalho")}</small>
      </div>
      <div class="link-order-actions" aria-label="Mover ${escapeHtml(link.title)}">
        <button type="button" data-link-move="up" data-link-id="${escapeHtml(link.id)}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-link-move="down" data-link-id="${escapeHtml(link.id)}" ${index === total - 1 ? "disabled" : ""}>↓</button>
      </div>
    </article>
  `;
}

function linksExpandedStorageKey() {
  const device = isMobileViewport() ? "mobile" : "desktop";
  const view = state.linksView || defaultLinksView();
  return `hubLinksExpanded:${device}:${view}`;
}

function collapsedLinksLimit(grid) {
  if (isMobileViewport()) return state.linksView === "cards" ? 4 : 10;
  const columns = Math.max(1, (getComputedStyle(grid).gridTemplateColumns || "").split(" ").filter(Boolean).length);
  return columns * 2;
}

function applyLinksLimit() {
  const grid = document.getElementById("linksGrid");
  const control = document.getElementById("linksMoreControl");
  if (!grid || !control) return;
  const items = [...grid.children];
  if (state.linksEditMode || !items.length) {
    items.forEach(item => item.classList.remove("compact-hidden"));
    control.innerHTML = "";
    control.hidden = true;
    return;
  }
  state.linksExpanded = prefGet(linksExpandedStorageKey(), "0") === "1";
  const limit = collapsedLinksLimit(grid);
  const shouldLimit = items.length > limit;
  items.forEach((item, index) => item.classList.toggle("compact-hidden", shouldLimit && !state.linksExpanded && index >= limit));
  if (!shouldLimit) {
    control.innerHTML = "";
    control.hidden = true;
    return;
  }
  control.hidden = false;
  control.innerHTML = `<button type="button" class="secondary-button" data-links-more>${state.linksExpanded ? "Mostrar menos" : `Ver mais ${items.length - limit}`}</button>`;
}

function renderLinks() {
  const grid = document.getElementById("linksGrid");
  if (!grid) return;

  const view = state.linksView || defaultLinksView();
  const links = orderedUsefulLinks();
  applyLinksView(view, { persist: false });
  document.body.classList.toggle("links-editing", state.linksEditMode);
  document.querySelectorAll("[data-links-edit-toggle]").forEach(button => {
    button.classList.toggle("active", state.linksEditMode);
    button.textContent = state.linksEditMode ? "Concluir" : "Personalizar ordem";
    button.setAttribute("aria-pressed", state.linksEditMode ? "true" : "false");
  });
  document.querySelectorAll("[data-links-reset-order]").forEach(button => {
    button.hidden = !state.linksEditMode;
  });
  document.querySelectorAll("[data-links-view]").forEach(button => {
    button.disabled = state.linksEditMode;
  });
  applyLinksColumns({ persist: false });

  if (!links.length) {
    grid.innerHTML = emptyStateHtml("Nenhum link cadastrado ainda", "Quando você adicionar links reais em data.js, eles aparecerão aqui.");
    return;
  }

  grid.innerHTML = state.linksEditMode
    ? links.map((link, index) => renderEditableLinkItem(link, index, links.length)).join("")
    : (state.linksView === "quick"
      ? links.map(renderLinktreeItem).join("")
      : links.map(link => renderResourceCard(link, "link")).join(""));
  requestAnimationFrame(applyLinksLimit);
}

function linksViewStorageKey() {
  return isMobileViewport() ? "hubLinksViewMobile" : "hubLinksViewDesktop";
}

function setupLinksViewToggle() {
  let linksDeviceBucket = isMobileViewport() ? "mobile" : "desktop";
  let linksResizeFrame = 0;
  const saved = (() => {
    try { return localStorage.getItem(linksViewStorageKey()); } catch (_) { return null; }
  })();
  state.linksView = saved === "cards" || saved === "quick" ? saved : defaultLinksView();
  loadLinksColumnPreferences();
  applyLinksView(state.linksView, { persist: false });

  document.getElementById("linksColumnsSelect")?.addEventListener("change", event => {
    setCurrentLinksColumns(event.currentTarget.value);
    applyLinksColumns({ persist: true });
    state.linksExpanded = false;
    prefSet(linksExpandedStorageKey(), "0");
    requestAnimationFrame(applyLinksLimit);
  });

  document.querySelectorAll("[data-links-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (state.linksEditMode) return;
      applyLinksView(button.dataset.linksView || "quick", { persist: false });
      try { localStorage.setItem(linksViewStorageKey(), state.linksView); } catch (_) {}
      renderLinks();
    });
  });

  document.querySelectorAll("[data-links-edit-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      state.linksEditMode = !state.linksEditMode;
      state.linkDragId = null;
      renderLinks();
    });
  });

  document.querySelectorAll("[data-links-reset-order]").forEach(button => {
    button.addEventListener("click", () => {
      prefRemove(LINKS_ORDER_STORAGE_KEY);
      state.linkDragId = null;
      renderLinks();
      renderSidebarLinks();
    });
  });

  document.getElementById("linksGrid")?.addEventListener("click", event => {
    const button = event.target.closest("[data-link-move]");
    if (!button) return;
    event.preventDefault();
    moveLinkInOrder(button.dataset.linkId, button.dataset.linkMove);
  });

  document.getElementById("linksGrid")?.addEventListener("dragstart", event => {
    const item = event.target.closest("[data-link-order-id]");
    if (!item || !state.linksEditMode) return;
    state.linkDragId = item.dataset.linkOrderId;
    item.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", state.linkDragId || "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  document.getElementById("linksGrid")?.addEventListener("dragover", event => {
    const item = event.target.closest("[data-link-order-id]");
    if (!item || !state.linksEditMode || !state.linkDragId) return;
    event.preventDefault();
    item.classList.add("is-drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  document.getElementById("linksGrid")?.addEventListener("dragleave", event => {
    event.target.closest("[data-link-order-id]")?.classList.remove("is-drop-target");
  });

  document.getElementById("linksGrid")?.addEventListener("drop", event => {
    const item = event.target.closest("[data-link-order-id]");
    if (!item || !state.linksEditMode) return;
    event.preventDefault();
    const dragId = state.linkDragId || event.dataTransfer?.getData("text/plain");
    moveDraggedLink(dragId, item.dataset.linkOrderId);
    state.linkDragId = null;
  });

  document.getElementById("linksGrid")?.addEventListener("dragend", () => {
    state.linkDragId = null;
    document.querySelectorAll(".link-order-item.is-dragging, .link-order-item.is-drop-target").forEach(item => {
      item.classList.remove("is-dragging", "is-drop-target");
    });
  });

  document.getElementById("linksMoreControl")?.addEventListener("click", event => {
    const button = event.target.closest("[data-links-more]");
    if (!button) return;
    state.linksExpanded = !state.linksExpanded;
    prefSet(linksExpandedStorageKey(), state.linksExpanded ? "1" : "0");
    applyLinksLimit();
  });
  window.addEventListener("resize", () => {
    cancelAnimationFrame(linksResizeFrame);
    linksResizeFrame = requestAnimationFrame(() => {
      const nextBucket = isMobileViewport() ? "mobile" : "desktop";
      if (nextBucket !== linksDeviceBucket) {
        linksDeviceBucket = nextBucket;
        const storedView = (() => {
          try { return localStorage.getItem(linksViewStorageKey()); } catch (_) { return null; }
        })();
        state.linksView = storedView === "cards" || storedView === "quick" ? storedView : defaultLinksView();
        loadLinksColumnPreferences();
        renderLinks();
        return;
      }
      loadLinksColumnPreferences();
      applyLinksColumns({ persist: false });
      applyLinksLimit();
    });
  }, { passive: true });
}


function getGridColumnCount(element, fallback = 3) {
  if (!element) return fallback;
  const template = getComputedStyle(element).gridTemplateColumns || "";
  const count = template.split(" ").filter(Boolean).length;
  return Math.max(1, count || fallback);
}

function applyAppsLimit() {
  const grid = document.getElementById("appsGrid");
  const control = document.getElementById("appsMoreControl");
  if (!grid || !control) return;
  const items = [...grid.children];
  if (!items.length || items[0]?.classList.contains("empty-state")) {
    control.hidden = true;
    control.innerHTML = "";
    return;
  }
  state.appsExpanded = prefGet(HUB_PREF_KEYS.appsExpanded, "0") === "1";
  const limit = isMobileViewport() ? Math.min(4, items.length) : Math.min(getGridColumnCount(grid, 3), items.length);
  const shouldLimit = items.length > limit;
  items.forEach((item, index) => item.classList.toggle("compact-hidden", shouldLimit && !state.appsExpanded && index >= limit));
  control.hidden = !shouldLimit;
  control.innerHTML = shouldLimit ? `<button type="button" class="secondary-button" data-apps-more>${state.appsExpanded ? "Mostrar menos" : `Ver mais ${items.length - limit}`}</button>` : "";
}

function renderApps() {
  const grid = document.getElementById("appsGrid");
  if (!grid) return;
  const visibleApps = apps.filter(app => !app.hideInHome);
  grid.innerHTML = visibleApps.length
    ? visibleApps.map(app => renderResourceCard(app, "app")).join("")
    : emptyStateHtml("Nenhum app cadastrado", "Os apps internos do hub aparecerão aqui.");
  requestAnimationFrame(applyAppsLimit);
}

function setupAppsMoreControl() {
  document.getElementById("appsMoreControl")?.addEventListener("click", event => {
    if (!event.target.closest("[data-apps-more]")) return;
    state.appsExpanded = !state.appsExpanded;
    prefSet(HUB_PREF_KEYS.appsExpanded, state.appsExpanded ? "1" : "0");
    applyAppsLimit();
  });
  window.addEventListener("resize", () => requestAnimationFrame(applyAppsLimit), { passive: true });
}

function resourceById(id) {
  return usefulLinks.find(item => item.id === id)
    || apps.find(item => item.id === id)
    || answerCards.find(item => item.id === id)
    || documents.find(item => item.id === id)
    || null;
}

function docsMatchingWorkflow(flow = {}, limit = 4) {
  const needles = [...(flow.documents || []), flow.title || "", flow.summary || ""].flatMap(item => tokenize(item));
  if (!needles.length) return [];
  return documents
    .map(doc => {
      const haystack = normalize(`${doc.title} ${doc.documentType} ${doc.correspondent} ${doc.summary} ${(doc.chunks || []).map(chunk => `${chunk.heading} ${chunk.text}`).join(" ")}`);
      let score = 0;
      needles.forEach(token => { if (haystack.includes(token)) score += 1; });
      return { doc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.doc);
}

function renderWorkflows() {
  const grid = document.getElementById("workflowGrid");
  if (!grid) return;
  grid.innerHTML = workflows.length ? workflows.map(flow => `
    <button class="workflow-card" type="button" data-workflow-open="${escapeHtml(flow.id)}">
      <span class="workflow-emoji" aria-hidden="true">${escapeHtml(flow.emoji || "🧭")}</span>
      <strong>${escapeHtml(flow.title)}</strong>
      <small>${escapeHtml(flow.summary || "")}</small>
    </button>
  `).join("") : emptyStateHtml("Nenhum guia cadastrado", "Os fluxos guiados aparecerão aqui.");

  if (workflows[0]) renderWorkflowDetail(workflows[0].id, false);
}

function renderWorkflowDetail(id, shouldScroll = true) {
  const flow = workflows.find(item => item.id === id);
  const box = document.getElementById("workflowDetail");
  if (!flow || !box) return;
  const relatedDocs = docsMatchingWorkflow(flow);
  const linkedResources = (flow.links || []).map(resourceById).filter(Boolean);

  document.querySelectorAll(".workflow-card").forEach(card => {
    card.classList.toggle("active", card.dataset.workflowOpen === id);
  });

  box.hidden = false;
  box.innerHTML = `
    <div class="workflow-detail-head">
      <span class="workflow-emoji big" aria-hidden="true">${escapeHtml(flow.emoji || "🧭")}</span>
      <div>
        <p class="eyebrow">Passo a passo</p>
        <h3>${escapeHtml(flow.title)}</h3>
        <p>${escapeHtml(flow.summary || "")}</p>
      </div>
    </div>

    <div class="workflow-columns">
      <section>
        <h4>Como resolver</h4>
        <ol>${(flow.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </section>
      <section>
        <h4>Checklist</h4>
        <ul>${(flow.checklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </div>

    <div class="workflow-resources">
      <section>
        <h4>Links e apps úteis</h4>
        ${linkedResources.length ? linkedResources.map(item => {
          const kind = item.url ? (apps.includes(item) ? "app" : "link") : "answer";
          return `<a class="workflow-resource" href="${escapeHtml(item.url || '#')}"${linkTargetAttrs(item)}><span>${emojiForResource(item, kind)}</span><strong>${escapeHtml(item.title)}</strong></a>`;
        }).join("") : `<p class="muted-text">Nenhum link específico cadastrado ainda.</p>`}
      </section>
      <section>
        <h4>Documentos sugeridos</h4>
        ${relatedDocs.length ? relatedDocs.map(doc => `
          <button class="workflow-resource" type="button" data-open-doc="${escapeHtml(doc.id)}"><span>📄</span><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(documentInfoInline(doc))}</small></button>
        `).join("") : `<p class="muted-text">Quando documentos relacionados estiverem no acervo, eles aparecerão aqui.</p>`}
      </section>
    </div>
  `;
  if (shouldScroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openWorkflow(id) {
  navigateToLocalAnchor("#onde-resolvo", { behavior: "smooth" });
  renderWorkflowDetail(id, true);
}


function renderGuides() {
  // Seção de informações rápidas removida da interface.
}

function renderMetrics() {
  // Métricas/infos removidas da primeira tela para manter a experiência direta.
}

function buildCitation(result) {
  if (!result) return "";
  if (result.type === "document") {
    const date = createdDateText(result.doc);
    const pages = pageCountText(result.doc);
    return `${result.doc.title}. ${result.doc.documentType || result.doc.kind}. Página ${result.chunk?.page || "—"}, seção "${result.chunk?.heading || "—"}". ${date}. ${pages}. Fonte: ${result.doc.sourceUrl || result.doc.pdfUrl}.`;
  }
  return `${result.title}. ${typeLabel[result.type] || "Item"}. ${result.text || ""} URL: ${result.url || ""}`;
}

function fallbackCopyText(text = "") {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  try { document.execCommand("copy"); } catch (error) {}
  textarea.remove();
  return Promise.resolve();
}

function copyText(text = "") {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return fallbackCopyText(text);
}

function documentTokens(doc) {
  return new Set(tokenize(`${doc.title} ${doc.documentType} ${doc.correspondent} ${doc.summary} ${(doc.tags || []).join(" ")} ${(doc.chunks || []).map(c => c.text).join(" ")}`));
}

function similarDocuments(doc, limit = 6) {
  const currentTokens = documentTokens(doc);
  return documents
    .filter(other => other.id !== doc.id)
    .map(other => {
      const otherTokens = documentTokens(other);
      let overlap = 0;
      currentTokens.forEach(token => { if (otherTokens.has(token)) overlap += 1; });
      const tagOverlap = (doc.tags || []).filter(tag => (other.tags || []).includes(tag)).length;
      const sameType = (doc.documentType === other.documentType) ? 3 : 0;
      const sameCorrespondent = (doc.correspondent === other.correspondent) ? 2 : 0;
      return { doc: other, score: overlap + tagOverlap * 4 + sameType + sameCorrespondent };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.doc);
}


function bestChunksForDoc(doc, exactTerms = [], semanticTerms = []) {
  const terms = [...exactTerms, ...semanticTerms].map(normalize).filter(Boolean);
  const exactSet = new Set(exactTerms.map(normalize));
  const chunks = (doc.chunks || []).length ? doc.chunks : [
    { id: `${doc.id}-summary`, page: "—", heading: doc.title, text: doc.summary || doc.title || "" }
  ];

  if (!terms.length) return chunks.slice(0, 3);

  const metaHaystack = normalize(`${doc.title || ""} ${doc.summary || ""} ${doc.documentType || ""} ${doc.correspondent || ""} ${(doc.tags || []).join(" ")}`);
  const scored = chunks.map(chunk => {
    const chunkHaystack = normalize(`${chunk.heading || ""} ${chunk.text || ""} ${(chunk.semanticTags || []).join(" ")}`);
    let score = 0;
    terms.forEach(term => {
      if (chunkHaystack.includes(term)) score += exactSet.has(term) ? 4 : 2;
    });
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);

  const matched = scored.filter(item => item.score > 0).slice(0, 4).map(item => item.chunk);
  if (matched.length) return matched;

  // Title/metadata matches should still open a useful preview, but should not
  // pretend every page/chunk matched internally.
  if (terms.some(term => metaHaystack.includes(term))) return chunks.slice(0, 1);
  return chunks.slice(0, 1);
}

function previewFocusableElements() {
  const modal = document.getElementById("previewModal");
  if (!modal || modal.getAttribute("aria-hidden") !== "false") return [];
  return [...modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter(element => !element.hidden && element.getClientRects().length > 0);
}

function setPreviewModalOpen(open) {
  const modal = document.getElementById("previewModal");
  if (!modal) return;
  const wasOpen = modal.getAttribute("aria-hidden") === "false";
  if (!open) previewOpenGeneration += 1;
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("modal-open", Boolean(open));
  if (wasOpen && !open) {
    const returnTarget = previewReturnFocus;
    previewReturnFocus = null;
    const fallbackTarget = document.getElementById("searchInput") || document.querySelector("a[href], button:not([disabled])");
    const focusTarget = returnTarget?.isConnected && typeof returnTarget.focus === "function" ? returnTarget : fallbackTarget;
    if (focusTarget && typeof focusTarget.focus === "function") {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }
}

function closePreviewModal({ historyMode = "back" } = {}) {
  const modal = document.getElementById("previewModal");
  const wasOpen = modal?.getAttribute("aria-hidden") === "false";
  const canGoBack = Boolean(state.previewHistoryPushed);
  setPreviewModalOpen(false);
  state.previewDocId = "";
  state.previewPage = "";
  state.previewHistoryPushed = false;
  if (!wasOpen || restoringSearchHistory || historyMode === "none") return;
  if (historyMode === "back" && canGoBack && history.state?.marker === SEARCH_HISTORY_MARKER && history.state?.previewDocId) {
    history.back();
    return;
  }
  syncSearchHistory("replace", { previewDocId: "", previewPage: "", previewHistoryPushed: false });
}

async function openPreviewFromDoc(doc, options = {}) {
  if (!doc) return false;
  const requestGeneration = Number(options.requestGeneration) || ++previewOpenGeneration;
  const modalAlreadyOpen = document.getElementById("previewModal")?.getAttribute("aria-hidden") === "false";
  if (!modalAlreadyOpen && !options.requestGeneration) previewReturnFocus = options.returnFocus || document.activeElement;
  await hydrateDocumentPassages(doc);
  if (requestGeneration !== previewOpenGeneration) return false;
  const queryTerms = expandedTerms(state.lastQuery || "");
  const exactTerms = options.exactTerms || queryTerms.exact || [];
  const semanticTerms = options.semanticTerms || queryTerms.semantic || [];
  const chunk = options.chunk || bestChunksForDoc(doc, exactTerms, semanticTerms)[0] || doc.chunks?.[0] || { page: "—", heading: "Prévia", text: doc.summary || doc.title || "" };
  return openPreview({ type: "document", doc, chunk, exactTerms, semanticTerms }, { ...options, requestGeneration });
}

async function openPreview(result, { historyMode = "push", restorePage = "", requestGeneration = 0, returnFocus = null } = {}) {
  const modal = document.getElementById("previewModal");
  const modalContent = document.getElementById("modalContent");
  if (!modal || !modalContent || !result || result.type !== "document") return false;
  const generation = Number(requestGeneration) || ++previewOpenGeneration;
  const modalAlreadyOpen = modal.getAttribute("aria-hidden") === "false";
  if (!modalAlreadyOpen && !requestGeneration) previewReturnFocus = returnFocus || document.activeElement;
  const doc = result.doc;
  if (!doc) return false;
  await hydrateDocumentPassages(doc);
  if (generation !== previewOpenGeneration) return false;
  const exactTerms = result.exactTerms || [];
  const semanticTerms = result.semanticTerms || [];
  const chunks = (result.matchedChunks || []).length
    ? result.matchedChunks
    : bestChunksForDoc(doc, exactTerms, semanticTerms);
  const shownChunks = chunks.length ? chunks : [{ page: "—", heading: "Prévia", text: doc.summary || doc.title || "Texto não indexado para este documento." }];
  const requestedPage = String(restorePage || result.chunk?.page || "");
  const firstPage = shownChunks.find(chunk => String(chunk.page || "") === requestedPage)?.page
    || shownChunks.find(chunk => String(chunk.page || "").match(/\d+/))?.page
    || result.chunk?.page
    || "";
  const citationText = buildCitation({ type: "document", doc, chunk: shownChunks[0] || result.chunk || {} });
  const titleHtml = highlight(doc.title, exactTerms, semanticTerms);
  const infoHtml = `${escapeHtml(documentInfoInline(doc))}`;
  const hasSearchTerms = [...exactTerms, ...semanticTerms].filter(Boolean).length > 0;

  modalContent.innerHTML = `
    <div class="verified-preview">
      <header class="verified-preview-head">
        <div>
          <h2 id="previewTitle">${titleHtml}</h2>
          <p>${infoHtml}</p>
        </div>
      </header>

      <section class="source-confidence" aria-label="Informações da fonte">
        <div><span>Fonte</span><strong>${escapeHtml(doc.sourceLabel || doc.correspondent || "IFBA / fonte institucional")}</strong></div>
        <div><span>Última conferência</span><strong>${escapeHtml(doc.reviewedDate || doc.collectedDate || "Não informada")}</strong></div>
        <div><span>Situação</span><strong>${escapeHtml(doc.validityStatus || (doc.status === "verified" ? "Fonte conferida" : "A conferir"))}</strong></div>
        ${doc.supersededBy ? `<div><span>Substituído por</span><strong>${escapeHtml(doc.supersededBy)}</strong></div>` : ""}
      </section>

      <section class="verified-preview-layout">
        <aside class="verified-preview-left">
          ${thumbnailHtml(doc, "document")}
          <div class="preview-page-list" aria-label="Páginas encontradas">
            ${shownChunks.map((chunk, i) => `
              <button type="button" data-preview-scroll="preview-chunk-${i}" data-preview-page="${escapeHtml(chunk.page || "")}">
                <strong>p. ${escapeHtml(chunk.page || "—")}</strong>
                <span>${escapeHtml(compactText(chunk.heading || "Trecho encontrado", 46))}</span>
              </button>
            `).join("")}
          </div>
        </aside>

        <section class="verified-preview-text">
          <h3>Texto encontrado</h3>
          ${shownChunks.map((chunk, i) => {
            const text = chunk.text || doc.summary || doc.title || "Texto não indexado para este documento.";
            const highlighted = highlight(text, exactTerms, semanticTerms);
            const finalText = !hasSearchTerms
              ? escapeHtml(text)
              : /<mark\b/i.test(highlighted)
                ? highlighted
                : `<span class="match-reason">Nenhum trecho interno destacou os termos. Este resultado pode ter vindo do título ou metadados.</span> ${escapeHtml(compactText(text, 520))}`;
            return `
              <article class="preview-paper" id="preview-chunk-${i}">
                <div class="result-head">
                  <span class="badge">p. ${escapeHtml(chunk.page || "—")}</span>
                  <span class="badge">${highlight(chunk.heading || "Trecho", exactTerms, semanticTerms)}</span>
                  <a class="preview-passage-open" href="${escapeHtml(openPdfAtPage(doc, chunk.page, { query: state.effectiveSearchQuery, section: chunk.heading || "" }))}" target="_blank" rel="noopener">Abrir nesta página</a>
                </div>
                <p>${finalText}</p>
              </article>
            `;
          }).join("")}
        </section>
      </section>

      <footer class="verified-preview-actions">
        <a class="small-action" href="${escapeHtml(openPdfAtPage(doc, firstPage, { query: state.effectiveSearchQuery, section: shownChunks.find(chunk => String(chunk.page || "") === String(firstPage || ""))?.heading || "" }))}" target="_blank" rel="noopener">Abrir PDF</a>
        <button class="secondary-button" type="button" data-copy-reference="${escapeHtml(citationText)}">Copiar referência</button>
        <button class="secondary-button" type="button" data-close-modal>Fechar</button>
      </footer>
    </div>
  `;
  if (generation !== previewOpenGeneration) return false;
  setPreviewModalOpen(true);
  state.previewDocId = doc.id || "";
  state.previewPage = String(firstPage || "");
  if (historyMode !== "none") state.previewHistoryPushed = historyMode === "push";
  syncSearchHistory(historyMode, { previewDocId: state.previewDocId, previewPage: state.previewPage, previewHistoryPushed: state.previewHistoryPushed });
  requestAnimationFrame(() => modal.querySelector("button[data-close-modal]")?.focus?.({ preventScroll: true }));
  if (restorePage) {
    const restoreIndex = shownChunks.findIndex(chunk => String(chunk.page || "") === String(restorePage));
    if (restoreIndex >= 0) requestAnimationFrame(() => document.getElementById(`preview-chunk-${restoreIndex}`)?.scrollIntoView({ block: "start", behavior: "auto" }));
  }
  schedulePdfThumbnailRender();
  return true;
}

function setupModal() {
  const modal = document.getElementById("previewModal");
  if (!modal) return;

  document.body.addEventListener("click", event => {
    const previewButton = event.target.closest("[data-preview-index]");
    if (previewButton) {
      state.selectedSearchIndex = Number(previewButton.dataset.previewIndex);
      const result = state.lastResults[state.selectedSearchIndex];
      const matchIndex = Number(previewButton.dataset.previewMatch);
      if (result?.type === "document" && Number.isFinite(matchIndex) && matchIndex >= 0) {
        const selectedChunk = (result.matchedChunks || [])[matchIndex];
        openPreview({ ...result, chunk: selectedChunk || result.chunk }, { restorePage: selectedChunk?.page || "", returnFocus: previewButton });
      } else {
        openPreview(result, { returnFocus: previewButton });
      }
    }

    const directoryDoc = event.target.closest("[data-directory-doc]");
    if (directoryDoc) {
      event.preventDefault();
      const doc = documents.find(item => item.id === directoryDoc.dataset.directoryDoc);
      openPreviewFromDoc(doc, { returnFocus: directoryDoc });
    }

    const docPreviewButton = event.target.closest("[data-doc-preview]");
    if (docPreviewButton) {
      const doc = documents.find(item => item.id === docPreviewButton.dataset.docPreview);
      openPreviewFromDoc(doc, { returnFocus: docPreviewButton });
    }

    const openDoc = event.target.closest("[data-open-doc]");
    if (openDoc) {
      const doc = documents.find(item => item.id === openDoc.dataset.openDoc);
      openPreviewFromDoc(doc, { returnFocus: openDoc });
    }

    const copyButton = event.target.closest("[data-copy-resource]");
    if (copyButton) {
      const result = state.lastResults[Number(copyButton.dataset.copyResource)];
      copyText(buildCitation(result));
      const previous = copyButton.textContent;
      copyButton.textContent = "Copiado";
      setTimeout(() => copyButton.textContent = previous, 1400);
    }

    const copyRef = event.target.closest("[data-copy-reference]");
    if (copyRef) {
      copyText(copyRef.dataset.copyReference || "");
      const previous = copyRef.textContent;
      copyRef.textContent = "Referência copiada";
      setTimeout(() => copyRef.textContent = previous, 1400);
    }

    const scrollPreview = event.target.closest("[data-preview-scroll]");
    if (scrollPreview) {
      const target = document.getElementById(scrollPreview.dataset.previewScroll);
      state.previewPage = scrollPreview.dataset.previewPage || state.previewPage || "";
      syncSearchHistory("replace", { previewDocId: state.previewDocId, previewPage: state.previewPage });
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const workflowButton = event.target.closest("[data-workflow-open]");
    if (workflowButton) {
      openWorkflow(workflowButton.dataset.workflowOpen);
    }

    if (event.target.closest("[data-close-modal]")) closePreviewModal();
  });

}

document.addEventListener("keydown", event => {
  if (event.defaultPrevented) return;
  const target = event.target;
  const typing = target && /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName || "") || target?.isContentEditable;
  const modalOpen = document.getElementById("previewModal")?.getAttribute("aria-hidden") === "false";

  if (modalOpen && event.key === "Tab") {
    const focusable = previewFocusableElements();
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeInside = focusable.includes(document.activeElement);
      if (!activeInside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }

  if (modalOpen && event.key === "Escape") {
    event.preventDefault();
    closePreviewModal();
    return;
  }

  if (modalOpen) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") event.preventDefault();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    window.HUB_SIDEBAR_SEARCH?.open?.();
    return;
  }

  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "/") {
    event.preventDefault();
    const input = document.getElementById("searchInput");
    navigateToLocalAnchor("#buscar", { behavior: "smooth" });
    input?.focus({ preventScroll: true });
    input?.select();
    return;
  }

  if (!typing && event.key === "Escape" && (document.getElementById("searchInput")?.value || filtersAreActive(getFilters()))) {
    event.preventDefault();
    clearSearchAndFilters({ historyMode: "push" });
    return;
  }

  const onResultCard = target?.closest?.(".result-card[data-result-index]");
  const interactive = target?.closest?.("button, a, [role='button'], [contenteditable='true']");
  if (typing || onResultCard || interactive || event.ctrlKey || event.metaKey || event.altKey || !state.lastResults?.length) return;

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const current = state.selectedSearchIndex >= 0 ? state.selectedSearchIndex : (event.key === "ArrowDown" ? -1 : state.lastResults.length);
    focusSearchResult(current + (event.key === "ArrowDown" ? 1 : -1));
  } else if (event.key === "Enter" && state.selectedSearchIndex >= 0) {
    event.preventDefault();
    openSearchResultByIndex(state.selectedSearchIndex);
  }
});

document.addEventListener("keydown", event => {
  const card = event.target.closest?.(".result-card[data-result-index]");
  if (!card || event.target.closest("button, a, input, select, textarea")) return;
  const index = Number(card.dataset.resultIndex || 0);
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openSearchResultByIndex(index, { newTab: event.ctrlKey || event.metaKey });
  } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    focusSearchResult(index + 1);
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    focusSearchResult(index - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    focusSearchResult(0);
  } else if (event.key === "End") {
    event.preventDefault();
    focusSearchResult((state.lastResults?.length || 1) - 1);
  }
});

function relocateFiltersCard(archiveView = "grid") {
  const card = document.getElementById("filtersCard");
  const homeSlot = document.getElementById("filtersHomeSlot");
  const directoryToolbar = document.getElementById("directoryToolbar");
  const toggle = document.getElementById("filterToggle");
  if (!card || !homeSlot || !directoryToolbar) return;
  const inDirectory = archiveView === "list";
  if (inDirectory) {
    if (card.parentElement !== directoryToolbar) directoryToolbar.prepend(card);
    card.classList.add("in-directory-toolbar", "open");
    if (toggle) toggle.hidden = true;
  } else {
    if (card.parentElement !== homeSlot) homeSlot.appendChild(card);
    card.classList.remove("in-directory-toolbar");
    if (toggle) toggle.hidden = false;
    const shouldOpen = prefGet(HUB_PREF_KEYS.filtersOpen, "0") === "1";
    card.classList.toggle("open", shouldOpen);
    toggle?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    if (toggle) toggle.textContent = shouldOpen ? "Ocultar filtros" : "Filtros";
  }
}

function applyArchiveView(value = "grid", { persist = true } = {}) {
  const clean = value === "list" ? "list" : "grid";
  state.archiveView = clean;
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === clean);
  });
  const documentGrid = document.getElementById("documentGrid");
  const directoryGrid = document.getElementById("directoryGrid");
  if (documentGrid) documentGrid.hidden = clean !== "grid";
  if (directoryGrid) directoryGrid.hidden = clean !== "list";
  document.querySelector(".archive-columns-control")?.toggleAttribute("hidden", clean !== "grid");
  relocateFiltersCard(clean);
  if (persist) prefSet(HUB_PREF_KEYS.archiveView, clean);
  renderArchiveLoadMore(documents.length, Math.min(ensureArchiveLimit(), documents.length));
  if (clean === "list") renderDirectory();
}

function saveSearchFiltersPreference() {
  const filters = getFilters();
  prefSetJson(HUB_PREF_KEYS.searchFilters, {
    type: filters.type,
    docType: filters.docType,
    correspondent: filters.correspondent,
    format: filters.format
  });
}

function restoreSearchFiltersPreference() {
  const saved = prefGetJson(HUB_PREF_KEYS.searchFilters, null);
  if (!saved || typeof saved !== "object") return;
  [["typeFilter", saved.type], ["docTypeFilter", saved.docType], ["correspondentFilter", saved.correspondent], ["formatFilter", saved.format]].forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el || !value) return;
    const hasOption = Array.from(el.options || []).some(option => option.value === value);
    if (hasOption) el.value = value;
  });
}

function setupResizableDirectoryTable(tableSelector, storageKey, defaults = [74, 360, 180, 140, 110, 250]) {
  const table = document.querySelector(tableSelector);
  if (!table || table.dataset.resizableReady === "1") return;
  table.dataset.resizableReady = "1";
  const headers = [...table.querySelectorAll("thead th")];
  if (!headers.length) return;
  let widths = prefGetJson(storageKey, null);
  if (!Array.isArray(widths) || widths.length !== headers.length) widths = defaults.slice(0, headers.length);
  const minWidths = [60, 180, 120, 110, 90, 190];
  let colgroup = table.querySelector("colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    colgroup.innerHTML = headers.map(() => "<col>").join("");
    table.prepend(colgroup);
  }
  const cols = [...colgroup.children];
  const applyWidths = () => {
    widths = widths.map((value, index) => Math.max(minWidths[index] || 80, Number(value) || defaults[index] || 120));
    cols.forEach((col, index) => { col.style.width = `${widths[index]}px`; });
    headers.forEach((header, index) => { header.style.width = `${widths[index]}px`; });
    table.style.tableLayout = "fixed";
    table.style.width = `${widths.reduce((sum, value) => sum + value, 0)}px`;
  };
  applyWidths();
  headers.forEach((header, index) => {
    const handle = document.createElement("span");
    handle.className = "directory-column-resizer";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `Redimensionar coluna ${header.textContent.trim()}`);
    header.appendChild(handle);
    let startX = 0;
    let startWidth = 0;
    const move = event => {
      if (!startX) return;
      widths[index] = Math.max(minWidths[index] || 80, startWidth + event.clientX - startX);
      applyWidths();
    };
    const finish = event => {
      if (!startX) return;
      startX = 0;
      document.body.classList.remove("directory-column-resizing");
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      prefSetJson(storageKey, widths.map(Math.round));
    };
    handle.addEventListener("pointerdown", event => {
      startX = event.clientX;
      startWidth = widths[index];
      document.body.classList.add("directory-column-resizing");
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
  });
}

function setupResizableDirectoryTables() {
  setupResizableDirectoryTable("#directoryGrid .directory-table", HUB_PREF_KEYS.directoryColumnWidths);
  setupResizableDirectoryTable("#searchDirectory .directory-table", HUB_PREF_KEYS.searchDirectoryColumnWidths, [74, 440, 170, 130, 110, 250]);
}

function setupArchiveViews() {
  applyArchiveView(prefGet(HUB_PREF_KEYS.archiveView, "grid"), { persist: false });

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => applyArchiveView(button.dataset.view, { persist: true }));
  });

  document.getElementById("archiveLoadMore")?.addEventListener("click", event => {
    const button = event.target.closest("[data-archive-more]");
    if (!button) return;
    state.archiveVisibleCount = Math.min(documents.length, ensureArchiveLimit() + getArchiveBatchSize());
    renderDocuments();
  });

  state.directorySort = prefGet(HUB_PREF_KEYS.directorySort, "name-asc");
  state.directoryRows = Number(prefGet(HUB_PREF_KEYS.directoryRows, "10")) || 10;
  state.directoryPage = Math.max(1, Number(prefGet(HUB_PREF_KEYS.directoryPage, "1")) || 1);
  document.getElementById("directorySortSelect")?.addEventListener("change", event => {
    state.directorySort = event.target.value;
    state.directoryPage = 1;
    prefSet(HUB_PREF_KEYS.directorySort, state.directorySort);
    prefSet(HUB_PREF_KEYS.directoryPage, "1");
    renderDirectory();
  });
  document.querySelector("#directoryGrid .directory-table thead")?.addEventListener("click", event => {
    const button = event.target.closest("[data-directory-sort-field]");
    if (!button) return;
    state.directorySort = toggledDirectorySort(state.directorySort, button.dataset.directorySortField);
    state.directoryPage = 1;
    prefSet(HUB_PREF_KEYS.directorySort, state.directorySort);
    prefSet(HUB_PREF_KEYS.directoryPage, "1");
    renderDirectory();
  });
  document.getElementById("directoryRowsSelect")?.addEventListener("change", event => {
    state.directoryRows = Number(event.target.value) || 10;
    state.directoryPage = 1;
    prefSet(HUB_PREF_KEYS.directoryRows, String(state.directoryRows));
    prefSet(HUB_PREF_KEYS.directoryPage, "1");
    renderDirectory();
  });
  document.getElementById("directoryPagination")?.addEventListener("click", event => {
    const button = event.target.closest("[data-directory-page]");
    if (!button || button.disabled) return;
    const pageCount = Math.max(1, Math.ceil(documents.length / state.directoryRows));
    const action = button.dataset.directoryPage;
    if (action === "first") state.directoryPage = 1;
    else if (action === "prev") state.directoryPage = Math.max(1, state.directoryPage - 1);
    else if (action === "next") state.directoryPage = Math.min(pageCount, state.directoryPage + 1);
    else if (action === "last") state.directoryPage = pageCount;
    else state.directoryPage = Math.min(pageCount, Math.max(1, Number(action) || 1));
    prefSet(HUB_PREF_KEYS.directoryPage, String(state.directoryPage));
    renderDirectory();
    document.getElementById("directoryGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}



const whereResolveItems = window.HUB_WHERE_ITEMS || [];

function resolveLinkedResource(id) {
  return resourceById(id) || usefulLinks.find(item => item.id === id) || apps.find(item => item.id === id);
}

function primaryLinkForWhere(item = {}) {
  const resource = (item.links || []).map(resolveLinkedResource).find(Boolean);
  if (!resource) return null;
  const type = apps.includes(resource) ? "app" : "link";
  return { resource, type };
}

function linksForWhere(item = {}) {
  return (item.links || [])
    .map(id => {
      const resource = resolveLinkedResource(id);
      if (!resource) return null;
      const type = apps.includes(resource) ? "app" : "link";
      return { resource, type };
    })
    .filter(Boolean);
}

function renderWhereResolve() {
  const options = document.getElementById("whereOptions");
  const result = document.getElementById("whereResult");
  const control = document.getElementById("whereMoreControl");
  if (!options) return;

  state.whereExpanded = prefGet(HUB_PREF_KEYS.whereExpanded, "0") === "1";
  options.innerHTML = whereResolveItems.map(item => {
    const linked = linksForWhere(item);
    const actionLabel = item.action || item.checklist?.[0] || "Confira o caminho indicado.";
    const contactLabel = item.sector || "Setor a confirmar";
    const docLabel = item.docs?.[0] || "Documento a confirmar";
    const linksHtml = linked.length
      ? `<div class="where-link-list">${linked.map(({ resource, type }) => `
          <a class="where-card-action" href="${escapeHtml(resource.url || "#")}"${linkTargetAttrs(resource)}>
            <span>${emojiForResource(resource, type)}</span>
            <strong>${escapeHtml(resource.title)}</strong>
          </a>
        `).join("")}</div>`
      : `<span class="where-card-action muted-action">Sem link direto</span>`;

    return `
      <article class="where-help-card" id="where-${escapeHtml(item.id)}">
        <header>
          <span class="where-help-emoji" aria-hidden="true">${escapeHtml(item.emoji)}</span>
          <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p></div>
        </header>
        <div class="where-help-grid">
          <div><small>O que fazer?</small><strong>${escapeHtml(actionLabel)}</strong></div>
          <div><small>Com quem falar?</small><strong>${escapeHtml(contactLabel)}</strong></div>
          <div><small>Qual documento consultar?</small><strong>${escapeHtml(docLabel)}</strong></div>
          <div class="where-links-cell"><small>Qual link usar?</small>${linksHtml}</div>
        </div>
        ${item.checklist?.length ? `<details class="where-checklist"><summary>Checklist rápido</summary><ul>${item.checklist.map(check => `<li>${escapeHtml(check)}</li>`).join("")}</ul></details>` : ""}
      </article>
    `;
  }).join("");

  const applyWhereLimit = () => {
    const cards = [...options.children];
    const limit = isMobileViewport() ? Math.min(2, cards.length) : Math.min(getGridColumnCount(options, 4), cards.length);
    const remaining = Math.max(0, cards.length - limit);
    cards.forEach((card, index) => card.classList.toggle("compact-hidden", remaining > 0 && !state.whereExpanded && index >= limit));
    if (control) {
      control.hidden = remaining <= 0;
      control.innerHTML = remaining > 0 ? `<button type="button" class="secondary-button" data-where-more>${state.whereExpanded ? "Mostrar menos" : `Ver mais ${remaining}`}</button>` : "";
    }
  };
  requestAnimationFrame(applyWhereLimit);
  if (result) result.innerHTML = "";
}

function setupWhereResolve() {
  const content = document.getElementById("whereSectionContent");
  const toggle = document.getElementById("whereSectionToggle");
  const applyOpen = (open, { persist = true } = {}) => {
    state.whereSectionOpen = Boolean(open);
    if (content) content.hidden = !state.whereSectionOpen;
    if (toggle) {
      toggle.setAttribute("aria-expanded", state.whereSectionOpen ? "true" : "false");
      toggle.textContent = state.whereSectionOpen ? "Ocultar" : "Mostrar";
    }
    if (persist) prefSet(HUB_PREF_KEYS.whereSectionOpen, state.whereSectionOpen ? "1" : "0");
  };
  applyOpen(prefGet(HUB_PREF_KEYS.whereSectionOpen, "1") !== "0", { persist: false });
  renderWhereResolve();
  toggle?.addEventListener("click", () => applyOpen(!state.whereSectionOpen));
  document.getElementById("whereMoreControl")?.addEventListener("click", event => {
    if (!event.target.closest("[data-where-more]")) return;
    state.whereExpanded = !state.whereExpanded;
    prefSet(HUB_PREF_KEYS.whereExpanded, state.whereExpanded ? "1" : "0");
    renderWhereResolve();
  });
  let whereResizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(whereResizeTimer);
    whereResizeTimer = window.setTimeout(renderWhereResolve, 120);
  }, { passive: true });
}

function formatGrade(value) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setupCalculators() {
  const finalButton = document.getElementById("finalGradeButton");
  const finalOutput = document.getElementById("finalGradeResult");
  const gradeList = document.getElementById("partialGrades");
  const addGradeButton = document.getElementById("addGradeButton");
  const clearGradesButton = document.getElementById("clearGradesButton");

  if (!finalOutput || !gradeList) return;

  function parseNumber(raw) {
    const normalized = (raw ?? "").toString().replace(",", ".").trim();
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function resultRangeClass(mp) {
    if (!Number.isFinite(mp) || mp < 2.5 || mp >= 7) return "";
    if (mp >= 6) return "result-range-g1";
    if (mp >= 5) return "result-range-g2";
    if (mp >= 4) return "result-range-g3";
    if (mp >= 3) return "result-range-g4";
    return "result-range-g5";
  }

  function setFinalResult(kind, html, mp = null) {
    finalOutput.classList.remove("result-positive", "result-negative", "result-warning", "result-neutral", "result-range-g1", "result-range-g2", "result-range-g3", "result-range-g4", "result-range-g5");
    const range = resultRangeClass(mp);
    finalOutput.classList.add(range || `result-${kind}`);
    finalOutput.innerHTML = html;
  }

  function readGradeInput(input) {
    return parseNumber(input?.value);
  }

  function readGrade(id) {
    return parseNumber(document.getElementById(id)?.value);
  }

  function renumberGrades() {
    [...gradeList.querySelectorAll(".grade-row")].forEach((row, index) => {
      const label = row.querySelector("label span");
      if (label) label.textContent = `Nota ${index + 1}`;
      const input = row.querySelector("input");
      if (input) input.placeholder = index === 0 ? "Ex.: 6,5" : index === 1 ? "Ex.: 7,0" : "Ex.: 8,0";
      const remove = row.querySelector("button");
      if (remove) remove.disabled = (gradeList.querySelectorAll(".grade-row").length <= 1);
    });
  }

  function createGradeRow(value = "") {
    const row = document.createElement("div");
    row.className = "grade-row";
    row.innerHTML = `
      <label><span>Nota</span><input type="number" class="partial-grade" min="0" max="10" step="0.01" inputmode="decimal" value="${escapeHtml(value)}" /></label>
      <button class="remove-row" type="button" aria-label="Remover nota">×</button>
    `;
    row.querySelector("input")?.addEventListener("input", () => {
      finalOutput.classList.remove("result-positive", "result-negative", "result-warning", "result-range-g1", "result-range-g2", "result-range-g3", "result-range-g4", "result-range-g5");
      finalOutput.classList.add("result-neutral");
    });
    row.querySelector("button")?.addEventListener("click", () => {
      row.remove();
      if (!gradeList.querySelector(".grade-row")) createGradeRow();
      renumberGrades();
    });
    gradeList.appendChild(row);
    renumberGrades();
  }

  function resetGrades() {
    gradeList.innerHTML = "";
    createGradeRow();
    createGradeRow();
    const pfInput = document.getElementById("pfFinal");
    if (pfInput) pfInput.value = "";
    clearFinalExamHighlight();
    setFinalResult("neutral", "Resultado: —");
  }

  function getPartialGrades() {
    return [...gradeList.querySelectorAll(".partial-grade")]
      .map(input => readGradeInput(input))
      .filter(value => value !== null);
  }

  function calculateFinalSituation() {
    const grades = getPartialGrades();
    const pf = readGrade("pfFinal");

    if (!grades.length) {
      setFinalResult("warning", "Informe pelo menos uma nota parcial.");
      return;
    }

    if (grades.some(value => value < 0 || value > 10) || (pf !== null && (pf < 0 || pf > 10))) {
      setFinalResult("negative", "As notas devem estar entre 0 e 10.");
      return;
    }

    const mp = grades.reduce((sum, value) => sum + value, 0) / grades.length;
    const gradesText = grades.map(formatGrade).join(" · ");
    const base = `<span class="calc-detail">Notas usadas: ${gradesText}</span><span class="calc-detail">MP: <strong>${formatGrade(mp)}</strong></span>`;
    const rule = `<span class="calc-rule"><strong>Regra usada:</strong> MF = (MP × 2 + PF) / 3</span>`;

    if (mp >= 7) {
      clearFinalExamHighlight();
      setFinalResult("positive", `<div class="official-result"><strong>✅ Aprovado por média</strong>${base}<span class="calc-detail">Não precisa fazer prova final.</span>${rule}</div>`);
      return;
    }

    if (mp < 2.5) {
      clearFinalExamHighlight();
      setFinalResult("negative", `<div class="official-result"><strong>❌ Reprovado sem direito à final</strong>${base}<span class="calc-detail">A média parcial mínima para fazer final é 2,5.</span>${rule}</div>`);
      return;
    }

    const neededPf = Math.max(0, 15 - (mp * 2));
    highlightClosestFinalRow(mp);

    if (pf === null) {
      const resultKind = neededPf >= 7.2 ? "negative" : "warning";
      const icon = neededPf >= 7.2 ? "⚠️" : "⚠️";
      setFinalResult(resultKind, `<div class="official-result"><strong>${icon} Vai para prova final</strong>${base}<span class="calc-detail">Precisa tirar <strong>${formatGrade(neededPf)}</strong> na final.</span>${rule}</div>`, mp);
      return;
    }

    const mf = ((mp * 2) + pf) / 3;
    if (mf >= 5) {
      setFinalResult("positive", `<div class="official-result"><strong>✅ Aprovado após a final</strong>${base}<span class="calc-detail">PF: <strong>${formatGrade(pf)}</strong> · MF: <strong>${formatGrade(mf)}</strong></span>${rule}</div>`, mp);
    } else {
      setFinalResult("negative", `<div class="official-result"><strong>❌ Reprovado após a final</strong>${base}<span class="calc-detail">PF: <strong>${formatGrade(pf)}</strong> · MF: <strong>${formatGrade(mf)}</strong></span><span class="calc-detail">Precisava tirar ${formatGrade(neededPf)} na PF.</span>${rule}</div>`, mp);
    }
  }

  addGradeButton?.addEventListener("click", () => {
    createGradeRow();
    gradeList.querySelector(".grade-row:last-child input")?.focus();
  });
  clearGradesButton?.addEventListener("click", resetGrades);
  finalButton?.addEventListener("click", calculateFinalSituation);
  document.getElementById("pfFinal")?.addEventListener("keydown", event => {
    if (event.key === "Enter") calculateFinalSituation();
  });

  if (!gradeList.querySelector(".grade-row")) {
    createGradeRow();
    createGradeRow();
  }
}


function renderSidebarLinks() {
  const linksMenu = document.getElementById("sidebarLinksList");
  if (!linksMenu) return;
  const links = orderedUsefulLinks();
  linksMenu.innerHTML = links.length ? links.map(link => `
    <a href="${escapeHtml(link.url || "#")}"${linkTargetAttrs({ ...link, newTab: true })}>
      <span aria-hidden="true">${emojiForResource(link, "link")}</span>
      <span class="sidebar-label">${escapeHtml(link.title)}</span>
    </a>`).join("") : `<p class="sidebar-empty">Nenhum atalho cadastrado.</p>`;
}

function setupSidebarLinksEditing() {}

function setupAppsMenu() {
  const appsMenu = document.getElementById("appsMenu");
  const linksMenu = document.getElementById("sidebarLinksList");
  if (appsMenu) {
    const items = apps.map(app => ({ ...app, url: app.url || "#apps", emoji: emojiForResource(app, "app") }));
    appsMenu.innerHTML = items.map(item => {
      const attrs = linkTargetAttrs(item);
      return `<a href="${escapeHtml(item.url)}"${attrs}><span aria-hidden="true">${escapeHtml(item.emoji)}</span><span class="sidebar-label">${escapeHtml(item.title)}</span></a>`;
    }).join("");
  }
  if (linksMenu) renderSidebarLinks();

  const groups = [
    ["appsMenuToggle", "appsMenu", HUB_PREF_KEYS.appsMenuOpen, true],
    ["favoritesMenuToggle", "sidebarFavoritesList", HUB_PREF_KEYS.favoritesMenuOpen, true],
    ["linksMenuToggle", "sidebarLinksList", HUB_PREF_KEYS.linksMenuOpen, false]
  ];
  groups.forEach(([buttonId, panelId, key, defaultOpen]) => {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    if (!button || !panel) return;
    const setOpen = (open, persist = true) => {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.closest(".sidebar-menu-group")?.classList.toggle("is-open", open);
      if (persist) prefSet(key, open ? "1" : "0");
    };
    setOpen(prefGet(key, defaultOpen ? "1" : "0") === "1", false);
    button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  });
}


function setupFixedHeader() {}

function setupNavigation() {
  const navLinks = [...document.querySelectorAll(".sidebar-nav a[href^='#']")];
  const sections = [...document.querySelectorAll("[data-nav-section]")];

  const mark = id => {
    navLinks.forEach(link => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  const currentSection = () => {
    const offset = isMobileViewport() ? 70 : 24;
    const position = window.scrollY + offset;
    let current = sections[0]?.id || "buscar";
    sections.forEach(section => {
      if (section.offsetTop <= position) current = section.id;
    });

    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 12;
    if (nearBottom && sections.length) current = sections[sections.length - 1].id;
    return current;
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    mark(currentSection());
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href")?.replace("#", "");
      if (id) mark(id);
    });
  });

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  window.addEventListener("hashchange", requestUpdate);
  window.addEventListener("hub:route-changed", requestUpdate);
  requestUpdate();
}


function resolvedTheme(mode = "auto") {
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyThemeMode(mode = "auto", { persist = true } = {}) {
  const clean = ["auto", "dark", "light"].includes(mode) ? mode : "auto";
  state.themeMode = clean;
  document.documentElement.dataset.themeMode = clean;
  document.documentElement.dataset.theme = resolvedTheme(clean);
  document.querySelectorAll("[data-theme-choice]").forEach(button => button.classList.toggle("active", button.dataset.themeChoice === clean));
  const mobile = document.getElementById("mobileThemeButton");
  if (mobile) {
    const map = { auto: ["◐", "Tema automático"], dark: ["☾", "Modo escuro"], light: ["☀", "Modo claro"] };
    mobile.textContent = map[clean][0];
    mobile.title = map[clean][1];
    mobile.setAttribute("aria-label", `${map[clean][1]}. Toque para alterar.`);
  }
  if (persist) prefSet(HUB_PREF_KEYS.themeMode, clean);
}

function setupTheme() {
  const mobileButton = document.getElementById("mobileThemeButton");
  const mobileMenu = document.getElementById("mobileThemeMenu");
  const setMobileThemeMenu = open => {
    if (!mobileMenu || !mobileButton) return;
    mobileMenu.hidden = !open;
    mobileButton.setAttribute("aria-expanded", open ? "true" : "false");
  };

  applyThemeMode(prefGet(HUB_PREF_KEYS.themeMode, "auto"), { persist: false });
  document.querySelectorAll("[data-theme-choice]").forEach(button => button.addEventListener("click", () => {
    applyThemeMode(button.dataset.themeChoice);
    setMobileThemeMenu(false);
  }));
  mobileButton?.addEventListener("click", event => {
    event.stopPropagation();
    setMobileThemeMenu(mobileMenu?.hidden ?? true);
  });
  mobileMenu?.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => setMobileThemeMenu(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape") setMobileThemeMenu(false); });

  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  media?.addEventListener?.("change", () => { if (state.themeMode === "auto") applyThemeMode("auto", { persist: false }); });
  window.addEventListener("storage", event => { if (event.key === HUB_PREF_KEYS.themeMode) applyThemeMode(event.newValue || "auto", { persist: false }); });
}

function setupSidebar() {
  const sidebar = document.getElementById("siteSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const mobileToggle = document.getElementById("mobileSidebarToggle");
  const closeButton = document.getElementById("mobileSidebarClose");
  const collapseButton = document.getElementById("sidebarCollapseButton");
  const reopenButton = document.getElementById("sidebarReopenButton");
  if (!sidebar) return;

  const applyCollapsed = collapsed => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    prefSet(HUB_PREF_KEYS.sidebarCollapsed, collapsed ? "1" : "0");
    collapseButton?.setAttribute("aria-label", collapsed ? "Mostrar menu" : "Ocultar menu");
  };
  const setMobileOpen = open => {
    document.body.classList.toggle("mobile-sidebar-open", open);
    mobileToggle?.setAttribute("aria-expanded", open ? "true" : "false");
    overlay?.setAttribute("aria-hidden", open ? "false" : "true");
  };

  applyCollapsed(prefGet(HUB_PREF_KEYS.sidebarCollapsed, "0") === "1");
  collapseButton?.addEventListener("click", () => applyCollapsed(!document.body.classList.contains("sidebar-collapsed")));
  reopenButton?.addEventListener("click", () => applyCollapsed(false));
  mobileToggle?.addEventListener("click", () => setMobileOpen(!document.body.classList.contains("mobile-sidebar-open")));
  closeButton?.addEventListener("click", () => setMobileOpen(false));
  overlay?.addEventListener("click", () => setMobileOpen(false));
  sidebar.addEventListener("click", event => {
    if (event.target.closest("a") && isMobileViewport()) setMobileOpen(false);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") setMobileOpen(false); });
  window.addEventListener("resize", () => { if (!isMobileViewport()) setMobileOpen(false); });

  const resizeHandle = document.getElementById("sidebarResizeHandle");
  const minWidth = 72;
  const maxWidth = 420;
  const applyWidth = (value, persist = true) => {
    const width = Math.min(maxWidth, Math.max(minWidth, Math.round(Number(value) || 276)));
    state.sidebarWidth = width;
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
    const iconsOnly = width <= 96;
    document.body.classList.toggle("sidebar-icons-only", iconsOnly);
    document.documentElement.classList.toggle("sidebar-icons-only-preload", iconsOnly);
    resizeHandle?.setAttribute("aria-valuenow", String(width));
    resizeHandle?.setAttribute("aria-valuemin", String(minWidth));
    resizeHandle?.setAttribute("aria-valuemax", String(maxWidth));
    if (persist) prefSet(HUB_PREF_KEYS.sidebarWidth, String(width));
  };
  applyWidth(Number(prefGet(HUB_PREF_KEYS.sidebarWidth, "276")), false);
  if (resizeHandle) {
    let resizing = false;
    const onMove = event => {
      if (!resizing || isMobileViewport()) return;
      applyWidth(event.clientX, false);
    };
    const finish = event => {
      if (!resizing) return;
      resizing = false;
      document.body.classList.remove("sidebar-resizing");
      try { resizeHandle.releasePointerCapture(event.pointerId); } catch (_) {}
      applyWidth(state.sidebarWidth, true);
    };
    resizeHandle.addEventListener("pointerdown", event => {
      if (isMobileViewport()) return;
      resizing = true;
      document.body.classList.add("sidebar-resizing");
      resizeHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", finish);
    resizeHandle.addEventListener("pointercancel", finish);
    resizeHandle.addEventListener("dblclick", () => applyWidth(276, true));
    resizeHandle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") applyWidth(minWidth, true);
      else if (event.key === "End") applyWidth(maxWidth, true);
      else applyWidth(state.sidebarWidth + (event.key === "ArrowRight" ? 10 : -10), true);
    });
  }
}

const finalExamGroups = [
  { cls: "g1", rows: [[6.9,1.2],[6.8,1.4],[6.7,1.6],[6.6,1.8],[6.5,2.0],[6.4,2.2],[6.3,2.4],[6.2,2.6],[6.1,2.8],[6.0,3.0]] },
  { cls: "g2", rows: [[5.9,3.2],[5.8,3.4],[5.7,3.6],[5.6,3.8],[5.5,4.0],[5.4,4.2],[5.3,4.4],[5.2,4.6],[5.1,4.8],[5.0,5.0]] },
  { cls: "g3", rows: [[4.9,5.2],[4.8,5.4],[4.7,5.6],[4.6,5.8],[4.5,6.0],[4.4,6.2],[4.3,6.4],[4.2,6.6],[4.1,6.8],[4.0,7.0]] },
  { cls: "g4", rows: [[3.9,7.2],[3.8,7.4],[3.7,7.6],[3.6,7.8],[3.5,8.0],[3.4,8.2],[3.3,8.4],[3.2,8.6],[3.1,8.8],[3.0,9.0]] },
  { cls: "g5", rows: [[2.9,9.2],[2.8,9.4],[2.7,9.6],[2.6,9.8],[2.5,10.0]] }
];

function formatOneDecimal(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return rounded.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1, maximumFractionDigits: 1 });
}

function clearFinalExamHighlight() {
  document.querySelectorAll(".final-row-active").forEach(row => row.classList.remove("final-row-active"));
}

function highlightClosestFinalRow(mp) {
  clearFinalExamHighlight();
  if (!Number.isFinite(mp) || mp < 2.5 || mp >= 7) return;
  const rows = [...document.querySelectorAll("#finalExamTable tr[data-media]")];
  if (!rows.length) return;
  const closest = rows.reduce((best, row) => {
    const media = Number(row.dataset.media);
    const distance = Math.abs(media - mp);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null);
  if (closest?.row) {
    closest.row.classList.add("final-row-active");
    closest.row.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
}

function buildFinalExamTable() {
  const container = document.getElementById("finalExamTable");
  if (!container) return;
  container.innerHTML = "";

  finalExamGroups.forEach(group => {
    const table = document.createElement("table");
    table.className = `grade-group ${group.cls}`;
    table.innerHTML = `<thead><tr><th>média</th><th>final</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    group.rows.forEach(([media, final]) => {
      const tr = document.createElement("tr");
      tr.dataset.media = String(media);
      tr.dataset.final = String(final);
      tr.innerHTML = `<td>${formatOneDecimal(media)}</td><td>${formatOneDecimal(final)}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  });
}


function setupFilterToggle() {
  const toggle = document.getElementById("filterToggle");
  const card = document.getElementById("filtersCard");
  if (!toggle || !card) return;
  const setOpen = (open, { persist = true } = {}) => {
    const forcedOpen = card.classList.contains("in-directory-toolbar");
    const finalOpen = forcedOpen ? true : open;
    card.classList.toggle("open", finalOpen);
    toggle.setAttribute("aria-expanded", finalOpen ? "true" : "false");
    toggle.textContent = finalOpen ? "Ocultar filtros" : "Filtros";
    if (persist && !forcedOpen) prefSet(HUB_PREF_KEYS.filtersOpen, finalOpen ? "1" : "0");
  };
  setOpen(prefGet(HUB_PREF_KEYS.filtersOpen, "0") === "1", { persist: false });
  toggle.addEventListener("click", () => setOpen(!card.classList.contains("open")));
}

function sharedLinkRequestFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const docId = params.get("share") || params.get("doc");
  if (!docId) return null;
  return { docId, expires: params.get("expires") || "" };
}

function handleSharedLink(request = sharedLinkRequestFromLocation()) {
  if (!request?.docId) return false;
  const summary = document.getElementById("resultsSummary");
  if (request.expires) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(`${request.expires}T00:00:00`);
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate < today) {
      if (summary) summary.textContent = "O link público expirou.";
      navigateToLocalAnchor("#buscar", { behavior: "auto", replace: true });
      return true;
    }
  }
  const doc = documents.find(item => item.id === request.docId);
  navigateToLocalAnchor("#buscar", { behavior: "auto", replace: true });
  if (!doc) {
    if (summary) summary.textContent = "O documento compartilhado não foi encontrado ou não está mais disponível.";
    return true;
  }
  openPreviewFromDoc(doc, { historyMode: "replace" });
  return true;
}

function skeletonCards(count = 8, label = "Carregando...") {
  return Array.from({ length: count }, (_, index) => `
    <article class="loading-card" aria-hidden="true">
      <div class="loading-thumb"></div>
      <div class="loading-line loading-line-title"></div>
      <div class="loading-line"></div>
      <div class="loading-line short"></div>
      <span class="sr-only">${escapeHtml(label)} ${index + 1}</span>
    </article>
  `).join("");
}

function renderInitialLoadingPlaceholders() {
  const docs = document.getElementById("documentGrid");
  const dir = document.getElementById("directoryGrid");
  // Only asynchronous document metadata receives placeholders. Apps and links
  // are already embedded and render immediately, so skeletons would add fake delay.
  if (docs && !docs.children.length) docs.innerHTML = skeletonCards(10, "Carregando documentos");
  if (dir && !dir.children.length) dir.innerHTML = skeletonCards(4, "Carregando diretório");
}

function refreshCurrentSearchIfNeeded() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  if ((input.value || "").trim() || filtersAreActive(getFilters())) {
    runSearch(input.value);
  }
}

function setupPwa() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    if (window.HUB_UI?.registerServiceWorker) {
      window.HUB_UI.registerServiceWorker({ url: "service-worker.js", scope: "./" });
      return;
    }
    navigator.serviceWorker.register("service-worker.js", { scope: "./" })
      .catch(error => console.warn("Service worker não registrado:", error));
  }, { once: true });
}


function waitForInitialPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}


function loadDeferredFeatureScripts() {
  const scripts = [
    "js/enhancements.js?v=0.2.36",
    "js/experience.js?v=0.2.36",
    "js/sidebar-quick-search.js?v=0.2.36",
    "js/performance-monitor.js?v=0.2.36"
  ];
  const load = src => new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement("script"); script.src = src; script.defer = true;
    script.onload = resolve; script.onerror = () => { console.warn("Módulo adiado não carregou:", src); resolve(); };
    document.head.appendChild(script);
  });
  const run = () => Promise.all(scripts.map(load));
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1800 });
  else window.setTimeout(run, 250);
}

async function boot() {
  renderInitialLoadingPlaceholders();
  setupPwa();
  setLoadingStatus("Carregando interface...");

  // Render immediately available static content first. This keeps the page filled
  // even if the user scrolls fast on mobile before the document manifest finishes.
  renderApps();
  setupAppsMoreControl();
  renderGuides();
  setupLinksViewToggle();
  renderLinks();
  setupSearchResultsView();
  setupSearchColumns();
  setupSearch();
  setupDoomEasterEgg();
  setupSavedSearches();
  setupModal();
  setupArchiveViews();
  setupResizableDirectoryTables();
  setupCalculators();
  setupWhereResolve();
  setupFilterToggle();
  buildFinalExamTable();
  setupAppsMenu();
  setupTheme();
  setupSidebar();
  setupInternalAnchorNavigation();
  window.HUB_UI?.setupReportButton(document.getElementById("reportIssueButton"), { title: "Página inicial" });
  setupNavigation();
  setupFixedHeader();
  setupDesktopColumnsControl();

  // O manifesto de documentos fica fora do JavaScript inicial e só é solicitado
  // após a primeira pintura da interface, preservando o orçamento de carregamento.
  await waitForInitialPaint();
  searchWorkerAllowed = true;
  loadDeferredFeatureScripts();
  setLoadingStatus("Carregando documentos...");
  await loadManifestDocuments();

  setLoadingStatus("Preparando busca e filtros...");
  populateFilters();
  restoreSearchFiltersPreference();
  renderDirectory();
  resetArchiveLimit();
  renderDocuments();
  const sharedLinkRequest = sharedLinkRequestFromLocation();
  const restoredDoomSearch = restoreDoomSearchContext();
  if (!restoredDoomSearch) await initializeSearchHistoryNavigation();
  if (!restoredDoomSearch && sharedLinkRequest) handleSharedLink(sharedLinkRequest);

  setLoadingStatus("Gerando prévias dos documentos...");
  schedulePdfThumbnailRender();
  window.setTimeout(() => setLoadingStatus(""), 1200);

  const scheduleBackgroundIndex = () => {
    if (navigator.connection?.saveData || document.visibilityState === "hidden") return;
    backgroundIndexMissingPdfText(3).finally(() => {
      if (!state.lastQuery) setLoadingStatus("");
      refreshCurrentSearchIfNeeded();
    });
  };
  if ("requestIdleCallback" in window) requestIdleCallback(scheduleBackgroundIndex, { timeout: 6000 });
  else window.setTimeout(scheduleBackgroundIndex, 3500);
}


boot().catch(error => {
  console.error("Falha ao iniciar o HUB:", error);
  setLoadingStatus("Não foi possível concluir a inicialização. Recarregue a página ou tente novamente quando a conexão estiver estável.", "error");
  const summary = document.getElementById("resultsSummary");
  if (summary && !summary.textContent.trim()) summary.textContent = "Falha ao carregar os recursos principais do HUB.";
});
