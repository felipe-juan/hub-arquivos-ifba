const hubData = window.HUB_DATA || {};
const rawDocuments = hubData.documents || [];
const usefulLinks = hubData.usefulLinks || [];
const apps = hubData.apps || [];
const guides = []; // seção de informações removida da interface
const directoryGroups = hubData.directoryGroups || [];
const conceptMap = hubData.conceptMap || {};

const state = {
  lastQuery: "",
  lastResults: [],
  archiveView: "grid",
  selectMode: false,
  selectedDocs: new Set(),
  temporaryEdits: new Map()
};

const statusLabel = {
  verified: "",
  review: "",
  archived: ""
};

const typeLabel = {
  document: "Documento",
  link: "Link",
  app: "App",
};

const typeIcon = {
  document: "PDF",
  link: "↗",
  app: "⚙",
};

const stopWords = new Set([
  "para", "com", "das", "dos", "uma", "por", "que", "seu", "sua", "de", "do", "da", "e", "o", "a", "as", "os", "em", "no", "na", "nos", "nas", "ao", "aos", "à", "às", "the", "and", "for"
]);

const normalize = (text = "") => text
  .toString()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const tokenize = (text = "") => normalize(text)
  .replace(/[^a-z0-9\s]/g, " ")
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
  if (/\.(xlsx?|ods)($|[?#])/.test(url) || title.includes("planilha") || title.includes("horarios") || title.includes("horários")) return "Excel/Calc";
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
  const manualEdit = state.temporaryEdits.get(base.id) || {};

  const enriched = {
    ...base,
    documentType: manualEdit.documentType || base.documentType || predictedType || "Documento",
    correspondent: manualEdit.correspondent || base.correspondent || predictedCorrespondent || "A definir",
    fileFormat: base.fileFormat || "PDF",
    tags: unique([...(base.tags || []), ...ruleTags, ...predictedTags, ...(manualEdit.tags || [])]),
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
  if (has("calcular", "calcule", "calculo", "cálculo", "calculadora", "simular", "simule", "quanto preciso", "preciso tirar", "nota necessária", "nota necessaria", "média final", "media final", "média", "media", "nota", "prova final")) {
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


function highlight(text, exactTerms = [], semanticTerms = []) {
  let safe = escapeHtml(text);
  const allTerms = [
    ...exactTerms.map(term => ({ term, cls: "" })),
    ...semanticTerms.map(term => ({ term, cls: "semantic" }))
  ]
    .filter(item => item.term && item.term.length > 2)
    .sort((a, b) => b.term.length - a.term.length);

  for (const { term, cls } of allTerms) {
    const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escapedTerm})`, "gi");
    safe = safe.replace(regex, `<mark class="${cls}">$1</mark>`);
  }
  return safe;
}

function statusBadge(status) {
  // Status badges were intentionally removed from the public UI.
  return "";
}

function typeBadge(type) {
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(typeLabel[type] || type)}</span>`;
}

function metaBadge(text, cls = "") {
  return `<span class="badge ${cls}">${escapeHtml(text || "—")}</span>`;
}

function compactText(text = "", limit = 110) {
  const clean = text.toString().replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function resourceFormat(resource, type = "document") {
  if (type === "document") return resource.fileFormat || inferFormat(resource) || "PDF";
  if (type === "app") return "APP";
  if (type === "link") return inferFormat({ ...resource, type: "link" }) || "LINK";
  return "ITEM";
}

function thumbnailHtml(resource, type = "document", options = {}) {
  const title = resource?.title || "Item";
  const format = resourceFormat(resource || {}, type);
  const page = options.page ? `<span class="thumb-page">p. ${escapeHtml(options.page)}</span>` : "";
  const image = resource?.thumbnailUrl || resource?.coverUrl;
  const href = resource?.pdfUrl || resource?.sourceUrl || resource?.url || "#";
  const kindClass = `thumb-${type}`;

  if (image) {
    return `
      <div class="doc-thumb ${kindClass} thumb-image" style="background-image:url('${escapeHtml(image)}')" aria-label="Miniatura de ${escapeHtml(title)}">
        <span class="doc-format">${escapeHtml(format)}</span>
        ${page}
      </div>
    `;
  }

  return `
    <div class="doc-thumb ${kindClass}" aria-label="Miniatura de ${escapeHtml(title)}">
      <div class="doc-sheet">
        <span class="doc-format">${escapeHtml(format)}</span>
        ${page}
        <strong>${escapeHtml(compactText(title, 48))}</strong>
        <i></i><i></i><i></i>
      </div>
    </div>
  `;
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
  const docResources = documents.flatMap(doc => (doc.chunks || []).map(chunk => ({
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
    chunk
  })));

  return [
    ...docResources,
    ...usefulLinks.map(linkResource),
    ...apps.map(appResource)
  ];
}

function getFilters() {
  const valueOf = (id, fallback = "all") => document.getElementById(id)?.value || fallback;
  return {
    type: valueOf("typeFilter"),
    tag: valueOf("tagFilter"),
    status: "all",
    docType: valueOf("docTypeFilter"),
    correspondent: valueOf("correspondentFilter"),
    format: valueOf("formatFilter")
  };
}

function scoreResource(resource, query, filters, intent = detectSearchIntent(query)) {
  if (filters.type !== "all" && resource.type !== filters.type) return null;
  if (filters.status !== "all" && resource.status !== filters.status) return null;
  if (filters.tag !== "all" && !(resource.tags || []).includes(filters.tag)) return null;
  if (filters.docType !== "all" && resource.documentType !== filters.docType) return null;
  if (filters.correspondent !== "all" && resource.correspondent !== filters.correspondent) return null;
  if (filters.format !== "all" && resource.fileFormat !== filters.format) return null;

  const trimmed = query.trim();
  if (!trimmed) {
    return {
      ...resource,
      score: resource.scoreBase,
      exactTerms: [],
      semanticTerms: []
    };
  }

  const terms = expandedTerms(query);
  const haystack = `${resource.title} ${resource.subtitle} ${resource.text} ${(resource.tags || []).join(" ")} ${resource.correspondent || ""} ${resource.documentType || ""} ${resource.fileFormat || ""}`;
  const haystackNorm = normalize(haystack);
  const titleNorm = normalize(resource.title);
  const tagNorm = normalize((resource.tags || []).join(" "));
  let score = resource.scoreBase;
  let matched = false;
  const phrase = normalize(query.trim());

  if (phrase.length > 2 && haystackNorm.includes(phrase)) {
    score += 18;
    matched = true;
  }

  for (const term of terms.exact) {
    if (haystackNorm.includes(term)) { score += 8; matched = true; }
    if (titleNorm.includes(term)) { score += 10; matched = true; }
    if (tagNorm.includes(term)) { score += 6; matched = true; }
    if (normalize(resource.correspondent || "").includes(term)) { score += 4; matched = true; }
    if (normalize(resource.documentType || "").includes(term)) { score += 5; matched = true; }
  }

  for (const term of terms.semantic) {
    if (haystackNorm.includes(term)) { score += 3; matched = true; }
  }

  // Intent-aware ranking. This keeps the search general, but pushes tools and links up
  // when the query sounds like an action instead of a formal document lookup.
  if (resource.type === intent.primary) score += 26;
  else if (intent.primary !== "mixed" && resource.type !== intent.primary) score -= 6;

  if (resource.type === "app") score += intent.app;
  if (resource.type === "link") score += intent.link;
  if (resource.type === "document") score += intent.document;

  if (resource.type === "document" && resource.status === "verified") score += 3;

  // Extra precision for the app cards.
  if (resource.type === "app") {
    const title = normalize(resource.title);
    if (terms.exact.some(term => ["calcular", "calculo", "cálculo", "calculadora", "simular"].includes(term))) score += 10;
    if ((title.includes("media") || title.includes("média")) && terms.exact.some(term => ["media", "média", "nota", "final"].includes(term))) score += 14;
    if (title.includes("preciso") && phrase.includes("preciso")) score += 18;
  }

  // Extra precision for common external shortcuts.
  if (resource.type === "link") {
    const title = normalize(resource.title);
    if (title.includes("protocolo") && phrase.includes("protocolo")) score += 16;
    if ((title.includes("horario") || title.includes("horários")) && terms.exact.some(term => ["horario", "horarios", "horário", "horários", "aulas"].includes(term))) score += 16;
    if (title.includes("instagram") && phrase.includes("instagram")) score += 16;
    if (title.includes("provas") && phrase.includes("prova")) score += 14;
  }

  if (!matched || score <= resource.scoreBase) return null;

  return {
    ...resource,
    score,
    exactTerms: terms.exact,
    semanticTerms: terms.semantic
  };
}

function searchResources(query, filters) {
  const intent = detectSearchIntent(query);
  return buildResources()
    .map(resource => scoreResource(resource, query, filters, intent))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
}

function renderResults(results, query) {
  const container = document.getElementById("searchResults");
  const summary = document.getElementById("resultsSummary");
  state.lastResults = results;
  state.lastQuery = query;

  if (!results.length) {
    summary.textContent = "Nada encontrado. Tente outro termo ou remova filtros.";
    container.innerHTML = "";
    return;
  }

  const counts = results.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const countText = Object.entries(counts)
    .map(([type, count]) => `${count} ${typeLabel[type].toLowerCase()}${count > 1 ? "s" : ""}`)
    .join(" · ");
  summary.textContent = query.trim()
    ? `${results.length} resultado(s): ${countText}. Ordenado por relevância.`
    : `Principais itens do hub: ${countText}.`;

  container.innerHTML = results.map((result, index) => renderResultCard(result, index)).join("");
}

function renderResultCard(result, index) {
  const openLabel = result.type === "document" ? "Prévia" : "Abrir";
  const subtitle = escapeHtml(result.subtitle);
  const tags = (result.tags || []).slice(0, 6).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
  const thumbResource = result.type === "document" ? result.doc : result;
  const thumb = thumbnailHtml(thumbResource, result.type, result.type === "document" ? { page: result.chunk.page } : {});
  const primaryAction = result.type === "document"
    ? `<button type="button" data-preview-index="${index}">${openLabel}</button>`
    : `<a class="small-action" href="${escapeHtml(result.url)}">${openLabel}</a>`;
  const secondaryAction = result.type === "document"
    ? `<a class="secondary-button" href="${escapeHtml(result.doc.pdfUrl || result.doc.sourceUrl || '#')}" target="_blank" rel="noopener">Arquivo</a>`
    : `<button type="button" class="secondary-button" data-copy-resource="${index}">Copiar</button>`;

  return `
    <article class="result-card result-${escapeHtml(result.type)}">
      <div class="result-thumb">${thumb}</div>
      <div class="result-body">
        <div class="result-head">
          ${typeBadge(result.type)}
          ${statusBadge(result.status)}
          ${metaBadge(result.fileFormat)}
          ${result.type === "document" ? `<span class="badge">p. ${escapeHtml(result.chunk.page)}</span>` : ""}
        </div>
        <h3>${escapeHtml(result.title)}</h3>
        <p class="result-subtitle">${subtitle}</p>
        <div class="badge-row">${tags}</div>
      </div>
      <div class="result-actions">
        ${primaryAction}
        ${secondaryAction}
        ${result.type === "document" ? `<button type="button" class="secondary-button" data-share-index="${index}">Compartilhar</button>` : ""}
        ${result.type === "document" ? `<button type="button" class="secondary-button" data-copy-resource="${index}">Copiar ref.</button>` : ""}
      </div>
    </article>
  `;
}

function runSearch(query = document.getElementById("searchInput").value) {
  const results = searchResources(query, getFilters());
  renderResults(results, query);
  updateSuggestions(query);
}

function populateSelect(id, values) {
  const el = document.getElementById(id);
  el.querySelectorAll("option:not([value='all'])").forEach(option => option.remove());
  el.insertAdjacentHTML(
    "beforeend",
    values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")
  );
}

function populateFilters() {
  populateSelect("tagFilter", getAllTags());
  populateSelect("docTypeFilter", getAllDocumentTypes());
  populateSelect("correspondentFilter", getAllCorrespondents());
  populateSelect("formatFilter", getAllFormats());
  populateAutocomplete();
}

function buildVocabulary() {
  const tokenCounts = new Map();
  const phrases = new Set();

  function addText(text) {
    tokenize(text).forEach(token => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
  }

  documents.forEach(doc => {
    [doc.title, doc.documentType, doc.correspondent, doc.fileFormat, doc.summary, ...(doc.tags || [])].forEach(item => {
      if (item) {
        phrases.add(item.toString());
        addText(item);
      }
    });
    (doc.chunks || []).forEach(chunk => addText(`${chunk.heading || ""} ${chunk.text || ""} ${(chunk.semanticTags || []).join(" ")}`));
  });
  usefulLinks.forEach(link => [link.title, link.category, link.description, ...(link.tags || [])].forEach(item => item && (phrases.add(item.toString()), addText(item))));
  apps.forEach(app => [app.title, app.category, app.description, ...(app.tags || [])].forEach(item => item && (phrases.add(item.toString()), addText(item))));

  const popularTokens = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);
  return unique([...phrases, ...popularTokens]).slice(0, 800);
}

let vocabulary = [];

function populateAutocomplete() {
  vocabulary = buildVocabulary();
  const datalist = document.getElementById("autocompleteTerms");
  datalist.innerHTML = vocabulary.slice(0, 250).map(term => `<option value="${escapeHtml(term)}"></option>`).join("");
}

function updateSuggestions(query) {
  const box = document.getElementById("smartSuggestions");
  const q = normalize(query).trim();
  if (!q) {
    box.innerHTML = "";
    return;
  }
  const suggestions = vocabulary
    .filter(term => normalize(term).includes(q) && normalize(term) !== q)
    .slice(0, 7);
  box.innerHTML = suggestions.map(term => `<button type="button" data-suggest="${escapeHtml(term)}">${escapeHtml(term)}</button>`).join("");
}

function setupSearch() {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");

  form.addEventListener("submit", event => {
    event.preventDefault();
    runSearch(input.value);
  });

  input.addEventListener("input", () => {
    window.clearTimeout(input._timer);
    input._timer = window.setTimeout(() => runSearch(input.value), 120);
  });

  document.querySelectorAll("[data-example]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      runSearch(input.value);
      input.focus();
    });
  });

  document.getElementById("smartSuggestions").addEventListener("click", event => {
    const button = event.target.closest("[data-suggest]");
    if (!button) return;
    input.value = button.dataset.suggest;
    runSearch(input.value);
    input.focus();
  });

  ["typeFilter", "tagFilter", "docTypeFilter", "correspondentFilter", "formatFilter"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => runSearch(input.value));
  });

  document.getElementById("clearSearch").addEventListener("click", () => {
    input.value = "";
    ["typeFilter", "tagFilter", "docTypeFilter", "correspondentFilter", "formatFilter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "all";
    });
    runSearch("");
    input.focus();
  });

  runSearch("");
}

function renderResourceCard(resource, kind) {
  const status = statusBadge(resource.status || "review");
  const tags = (resource.tags || []).slice(0, 5).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
  const formatText = kind === "document" ? resource.fileFormat : inferFormat({ ...resource, type: kind });
  const format = metaBadge(formatText);
  const select = kind === "document" ? `<label class="select-doc" ${state.selectMode ? "" : "hidden"}><input type="checkbox" data-select-doc="${escapeHtml(resource.id)}" ${state.selectedDocs.has(resource.id) ? "checked" : ""}> selecionar</label>` : "";
  const action = kind === "document"
    ? `<button type="button" data-doc-preview="${escapeHtml(resource.id)}">Prévia</button><a class="secondary-button" href="${escapeHtml(resource.pdfUrl || resource.sourceUrl || '#')}" target="_blank" rel="noopener">Arquivo</a><button type="button" class="secondary-button" data-doc-share="${escapeHtml(resource.id)}">Link público</button>`
    : `<a class="small-action" href="${escapeHtml(resource.url)}">Abrir</a>`;
  const subtitle = kind === "document" ? resource.correspondent : (resource.category || "Atalho");

  return `
    <article class="resource-card resource-${escapeHtml(kind)}" id="${escapeHtml(resource.id)}">
      ${select}
      ${thumbnailHtml(resource, kind)}
      <div class="badge-row">${typeBadge(kind)}${status}${format}<span class="badge">${escapeHtml(resource.documentType || resource.kind || resource.category || "")}</span></div>
      <h3>${escapeHtml(resource.title)}</h3>
      <p class="result-subtitle">${escapeHtml(subtitle || "")}</p>
      <p>${escapeHtml(compactText(resource.summary || resource.description || resource.body || "", 132))}</p>
      <div class="tag-list">${tags}</div>
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
  if (type === "document") return `${resource.documentType || resource.kind} · ${resource.correspondent || ""}`;
  return resource.category || (type === "guide" ? "Informação" : "Item");
}

function renderDirectory() {
  const container = document.getElementById("directoryGrid");
  if (!container) return;

  const renderedGroups = directoryGroups.map(group => {
    const items = (group.items || [])
      .map(ref => ({ ref, resource: findResourceByRef(ref) }))
      .filter(item => item.resource)
      .map(({ ref, resource }) => {
        const href = ref.type === "document" ? `#${resource.id}` : (resource.url || `#${resource.id}`);
        const extraAttrs = ref.type === "document" ? `data-directory-doc="${escapeHtml(resource.id)}"` : "";
        const format = ref.type === "document" ? resource.fileFormat : inferFormat({ ...resource, type: ref.type });
        return `
          <a class="directory-item" href="${escapeHtml(href)}" ${extraAttrs}>
            <span class="mini-icon type-${escapeHtml(ref.type)}">${escapeHtml(typeIcon[ref.type] || "•")}</span>
            <span>
              <strong>${escapeHtml(refTitle(resource))}</strong>
              <small>${escapeHtml(refMeta(resource, ref.type))}</small>
            </span>
            <em>${escapeHtml(format)}</em>
          </a>
        `;
      }).join("");

    if (!items.trim()) return "";

    return `
      <article class="directory-card" id="${escapeHtml(group.id)}">
        <header>
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(group.description || "")}</p>
        </header>
        <div class="directory-items">${items}</div>
      </article>
    `;
  }).filter(Boolean).join("");

  container.innerHTML = renderedGroups || emptyStateHtml(
    "Nenhum documento no diretório ainda",
    "Quando você adicionar documentos reais em data.js e apontar para seus PDFs/links, eles aparecerão aqui organizados por grupo."
  );
}

function emptyStateHtml(title, text) {
  return `
    <article class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function renderDocuments() {
  const grid = document.getElementById("documentGrid");
  const archiveTools = document.querySelector(".archive-tools");
  if (archiveTools) archiveTools.hidden = !documents.length;
  grid.innerHTML = documents.length
    ? documents.map(doc => renderResourceCard(doc, "document")).join("")
    : emptyStateHtml("Nenhum documento cadastrado ainda", "A base pública está limpa. Adicione seus documentos reais em data.js e coloque os PDFs na pasta documents/.");
  updateBulkUI();
}

function renderLinks() {
  const grid = document.getElementById("linksGrid");
  grid.innerHTML = usefulLinks.length
    ? usefulLinks.map(link => renderResourceCard(link, "link")).join("")
    : emptyStateHtml("Nenhum link cadastrado ainda", "Quando você adicionar links reais em data.js, eles aparecerão aqui.");
}

function renderApps() {
  const grid = document.getElementById("appsGrid");
  grid.innerHTML = apps.length
    ? apps.map(app => renderResourceCard(app, "app")).join("")
    : emptyStateHtml("Nenhum app cadastrado", "Os apps internos do hub aparecerão aqui.");
}

function renderGuides() {
  // Seção de informações rápidas removida da interface.
}

function renderMetrics() {
  // Métricas/infos removidas da primeira tela para manter a experiência direta.
}

function buildCitation(result) {
  if (result.type === "document") {
    return `${result.doc.title}. ${result.doc.documentType || result.doc.kind}. Página ${result.chunk.page}, seção "${result.chunk.heading}". Correspondente: ${result.doc.correspondent}. Data do documento: ${result.doc.docDate}. Fonte: ${result.doc.sourceUrl}.`;
  }
  return `${result.title}. ${typeLabel[result.type]}. ${result.text} URL: ${result.url}`;
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
  const terms = [...exactTerms, ...semanticTerms];
  const scored = (doc.chunks || []).map(chunk => {
    const haystack = normalize(`${chunk.heading || ""} ${chunk.text || ""} ${(chunk.semanticTags || []).join(" ")}`);
    let score = 0;
    terms.forEach(term => { if (haystack.includes(normalize(term))) score += exactTerms.includes(term) ? 3 : 1; });
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);

  if (!terms.length) return (doc.chunks || []).slice(0, 3);
  return scored.filter(item => item.score > 0).slice(0, 4).map(item => item.chunk).concat((doc.chunks || []).slice(0, 1)).slice(0, 4);
}

function createShareUrl(docId, expires = "") {
  const url = new URL(window.location.href.split("#")[0]);
  url.searchParams.set("share", docId);
  if (expires) url.searchParams.set("expires", expires);
  else url.searchParams.delete("expires");
  return url.toString();
}

function renderShareBox(doc) {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <section class="share-box">
      <h3>Link público</h3>
      <p>Como o hub é público, a data de expiração é controlada pelo próprio site ao abrir o link.</p>
      <label>Expira em <input type="date" id="shareExpiry" min="${today}" /></label>
      <div class="share-line">
        <input id="shareUrl" readonly value="${escapeHtml(createShareUrl(doc.id))}" />
        <button type="button" data-copy-share>Copiar</button>
      </div>
    </section>
  `;
}

function openPreviewFromDoc(doc, options = {}) {
  if (!doc) return;
  const exactTerms = options.exactTerms || expandedTerms(state.lastQuery).exact || [];
  const semanticTerms = options.semanticTerms || expandedTerms(state.lastQuery).semantic || [];
  const chunk = options.chunk || bestChunksForDoc(doc, exactTerms, semanticTerms)[0] || doc.chunks?.[0] || { page: "—", heading: "Prévia", text: doc.summary || "" };
  openPreview({ type: "document", doc, chunk, exactTerms, semanticTerms });
}

function openPreview(result) {
  const modal = document.getElementById("previewModal");
  const modalContent = document.getElementById("modalContent");
  if (!result || result.type !== "document") return;
  const doc = result.doc;
  const chunks = bestChunksForDoc(doc, result.exactTerms || [], result.semanticTerms || []);
  modalContent.innerHTML = `
    <div class="full-preview">
      <header class="preview-header">
        <div>
          <div class="badge-row">
            ${typeBadge(result.type)}${statusBadge(doc.status)}${metaBadge(doc.fileFormat)}${metaBadge(doc.documentType)}${metaBadge(doc.correspondent, "correspondent")}
          </div>
          <h2 id="previewTitle">${escapeHtml(doc.title)}</h2>
          <p class="result-subtitle">${escapeHtml(doc.summary)}</p>
        </div>
      </header>

      <div class="preview-layout">
        <aside class="preview-meta">
          <h3>Metadados</h3>
          <p><strong>Tipo:</strong> ${escapeHtml(doc.documentType || doc.kind)}</p>
          <p><strong>Correspondente:</strong> ${escapeHtml(doc.correspondent)}</p>
          <p><strong>Formato:</strong> ${escapeHtml(doc.fileFormat)}</p>
          <p><strong>Data:</strong> ${escapeHtml(doc.docDate)} · <strong>Coleta:</strong> ${escapeHtml(doc.collectedDate)}</p>
          <p><strong>Observação:</strong> ${escapeHtml(doc.trust)}</p>
          <div class="tag-list">${(doc.tags || []).slice(0, 14).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div>
          <h3>Classificação automática</h3>
          <p class="result-subtitle">Sugestões baseadas no conteúdo indexado.</p>
          <div class="tag-list auto-tags">
            ${metaBadge(doc.autoMetadata.documentType || doc.documentType, "auto")}
            ${metaBadge(doc.autoMetadata.correspondent || doc.correspondent, "auto")}
            ${(doc.autoMetadata.tags || []).slice(0, 6).map(tag => metaBadge(tag, "auto")).join("")}
          </div>
          <p><a href="${escapeHtml(doc.pdfUrl || doc.sourceUrl || '#')}" target="_blank" rel="noopener">Abrir arquivo/fonte</a></p>
        </aside>
        <section class="preview-main">
          <h3>Prévia com destaque</h3>
          ${chunks.map(chunk => `
            <article class="preview-paper">
              <div class="result-head"><span class="badge">p. ${escapeHtml(chunk.page)}</span><span class="badge">${escapeHtml(chunk.heading)}</span></div>
              <p>${highlight(chunk.text, result.exactTerms || [], result.semanticTerms || [])}</p>
            </article>
          `).join("")}
          <label><strong>Referência rápida</strong>
            <textarea class="copy-box" readonly>${escapeHtml(buildCitation({ ...result, chunk }))}</textarea>
          </label>
          ${renderShareBox(doc)}

        </section>
      </div>
    </div>
  `;
  modal.setAttribute("aria-hidden", "false");

  const expiry = modalContent.querySelector("#shareExpiry");
  const shareUrl = modalContent.querySelector("#shareUrl");
  expiry?.addEventListener("change", () => {
    shareUrl.value = createShareUrl(doc.id, expiry.value);
  });
}

function setupModal() {
  const modal = document.getElementById("previewModal");

  document.body.addEventListener("click", event => {
    const previewButton = event.target.closest("[data-preview-index]");
    if (previewButton) openPreview(state.lastResults[Number(previewButton.dataset.previewIndex)]);

    const directoryDoc = event.target.closest("[data-directory-doc]");
    if (directoryDoc) {
      event.preventDefault();
      const doc = documents.find(item => item.id === directoryDoc.dataset.directoryDoc);
      openPreviewFromDoc(doc);
    }

    const docPreviewButton = event.target.closest("[data-doc-preview]");
    if (docPreviewButton) {
      const doc = documents.find(item => item.id === docPreviewButton.dataset.docPreview);
      openPreviewFromDoc(doc);
    }

    const docShareButton = event.target.closest("[data-doc-share]");
    if (docShareButton) {
      const doc = documents.find(item => item.id === docShareButton.dataset.docShare);
      openPreviewFromDoc(doc);
      setTimeout(() => document.getElementById("shareUrl")?.focus(), 20);
    }



    const shareButton = event.target.closest("[data-share-index]");
    if (shareButton) {
      const result = state.lastResults[Number(shareButton.dataset.shareIndex)];
      if (result?.doc) {
        openPreview(result);
        setTimeout(() => document.getElementById("shareUrl")?.focus(), 20);
      }
    }

    const openDoc = event.target.closest("[data-open-doc]");
    if (openDoc) {
      const doc = documents.find(item => item.id === openDoc.dataset.openDoc);
      openPreviewFromDoc(doc);
    }

    const copyButton = event.target.closest("[data-copy-resource]");
    if (copyButton) {
      const result = state.lastResults[Number(copyButton.dataset.copyResource)];
      navigator.clipboard?.writeText(buildCitation(result));
      const previous = copyButton.textContent;
      copyButton.textContent = "Copiado";
      setTimeout(() => copyButton.textContent = previous, 1400);
    }

    const copyShare = event.target.closest("[data-copy-share]");
    if (copyShare) {
      const input = document.getElementById("shareUrl");
      navigator.clipboard?.writeText(input.value);
      copyShare.textContent = "Copiado";
      setTimeout(() => copyShare.textContent = "Copiar", 1400);
    }

    if (event.target.matches("[data-close-modal]")) modal.setAttribute("aria-hidden", "true");
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") modal.setAttribute("aria-hidden", "true");
  });
}

function setupArchiveViews() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      state.archiveView = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === button));
      document.getElementById("documentGrid").hidden = state.archiveView !== "grid";
      document.getElementById("directoryGrid").hidden = state.archiveView !== "list";
    });
  });
}

function updateBulkUI() {
  const panel = document.getElementById("bulkPanel");
  const button = document.getElementById("selectModeButton");
  const count = document.getElementById("selectedCount");
  if (!panel || !button || !count) return;
  panel.hidden = !state.selectMode;
  button.textContent = state.selectMode ? "Sair da edição em lote" : "Selecionar para edição em lote";
  count.textContent = state.selectedDocs.size;
  document.querySelectorAll(".select-doc").forEach(el => { el.hidden = !state.selectMode; });
  document.querySelectorAll("[data-select-doc]").forEach(input => { input.checked = state.selectedDocs.has(input.dataset.selectDoc); });
}

function setupBulkEditing() {
  const button = document.getElementById("selectModeButton");
  button.addEventListener("click", () => {
    state.selectMode = !state.selectMode;
    if (!state.selectMode) state.selectedDocs.clear();
    renderDocuments();
  });

  document.getElementById("documentGrid").addEventListener("change", event => {
    const input = event.target.closest("[data-select-doc]");
    if (!input) return;
    if (input.checked) state.selectedDocs.add(input.dataset.selectDoc);
    else state.selectedDocs.delete(input.dataset.selectDoc);
    updateBulkUI();
  });

  document.getElementById("bulkApplyButton").addEventListener("click", () => {
    const tag = document.getElementById("bulkTagInput").value.trim();
    const type = document.getElementById("bulkTypeInput").value.trim();
    const correspondent = document.getElementById("bulkCorrespondentInput").value.trim();
    state.selectedDocs.forEach(id => {
      const current = state.temporaryEdits.get(id) || { tags: [] };
      state.temporaryEdits.set(id, {
        ...current,
        tags: unique([...(current.tags || []), tag].filter(Boolean)),
        documentType: type || current.documentType,
        correspondent: correspondent || current.correspondent
      });
    });
    refreshDocuments();
    populateFilters();
    renderDocuments();
    renderDirectory();
    runSearch(document.getElementById("searchInput").value);
  });

  document.getElementById("bulkExportButton").addEventListener("click", () => {
    const output = document.getElementById("bulkOutput");
    const data = [...state.selectedDocs].map(id => {
      const doc = documents.find(item => item.id === id);
      const edit = state.temporaryEdits.get(id) || {};
      return {
        id,
        title: doc?.title,
        addTags: edit.tags || [],
        documentType: edit.documentType || doc?.documentType,
        correspondent: edit.correspondent || doc?.correspondent
      };
    });
    output.hidden = false;
    output.value = JSON.stringify(data, null, 2);
    output.focus();
  });
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

  function parseNumber(raw) {
    const normalized = (raw ?? "").toString().replace(",", ".").trim();
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function readGradeInput(input) {
    return parseNumber(input?.value);
  }

  function readGrade(id) {
    return parseNumber(document.getElementById(id)?.value);
  }

  function renumberGrades() {
    [...gradeList?.querySelectorAll(".grade-row") || []].forEach((row, index) => {
      const label = row.querySelector("label span");
      if (label) label.textContent = `Nota ${index + 1}`;
      const input = row.querySelector("input");
      if (input) input.placeholder = index === 0 ? "Ex.: 6,5" : index === 1 ? "Ex.: 7,0" : "Ex.: 8,0";
      const remove = row.querySelector("button");
      if (remove) remove.disabled = (gradeList.querySelectorAll(".grade-row").length <= 1);
    });
  }

  function createGradeRow(value = "") {
    if (!gradeList) return;
    const row = document.createElement("div");
    row.className = "grade-row";
    row.innerHTML = `
      <label><span>Nota</span><input type="number" class="partial-grade" min="0" max="10" step="0.01" inputmode="decimal" value="${escapeHtml(value)}" /></label>
      <button class="remove-row" type="button" aria-label="Remover nota">×</button>
    `;
    row.querySelector("input")?.addEventListener("input", calculateFinalSituation);
    row.querySelector("button")?.addEventListener("click", () => {
      row.remove();
      if (!gradeList.querySelector(".grade-row")) createGradeRow();
      renumberGrades();
      calculateFinalSituation();
    });
    gradeList.appendChild(row);
    renumberGrades();
  }

  function resetGrades() {
    if (!gradeList) return;
    gradeList.innerHTML = "";
    createGradeRow();
    createGradeRow();
    document.getElementById("pfFinal").value = "";
    finalOutput.textContent = "Resultado: —";
  }

  function getPartialGrades() {
    return [...gradeList?.querySelectorAll(".partial-grade") || []]
      .map(input => readGradeInput(input))
      .filter(value => value !== null);
  }

  function calculateFinalSituation() {
    const grades = getPartialGrades();
    const pf = readGrade("pfFinal");

    if (!grades.length) {
      finalOutput.textContent = "Resultado: informe pelo menos uma nota parcial.";
      return;
    }

    if (grades.some(value => value < 0 || value > 10) || (pf !== null && (pf < 0 || pf > 10))) {
      finalOutput.textContent = "Resultado: as notas devem estar entre 0 e 10.";
      return;
    }

    const mp = grades.reduce((sum, value) => sum + value, 0) / grades.length;
    const gradesText = grades.map(formatGrade).join(" · ");

    if (mp >= 7) {
      finalOutput.innerHTML = `<strong>Aprovado por média.</strong><br>Notas: ${gradesText}<br>MP = ${formatGrade(mp)}. Não precisa de prova final.`;
      return;
    }

    if (mp < 2.5) {
      finalOutput.innerHTML = `<strong>Reprovado sem direito à prova final.</strong><br>Notas: ${gradesText}<br>MP = ${formatGrade(mp)}. Abaixo de 2,5 não dá direito à final.`;
      return;
    }

    const neededPf = 15 - (mp * 2);

    if (pf === null) {
      finalOutput.innerHTML = `<strong>Precisa fazer prova final.</strong><br>Notas: ${gradesText}<br>MP = ${formatGrade(mp)}. Para atingir média final 5,0, precisa tirar <strong>${formatGrade(neededPf)}</strong> na PF.`;
      return;
    }

    const mf = ((mp * 2) + pf) / 3;
    const finalStatus = mf >= 5 ? "Aprovado após a final." : "Reprovado após a final.";
    finalOutput.innerHTML = `<strong>${finalStatus}</strong><br>Notas: ${gradesText}<br>MP = ${formatGrade(mp)} · PF = ${formatGrade(pf)} · MF = ${formatGrade(mf)}.`;
  }

  addGradeButton?.addEventListener("click", () => {
    createGradeRow();
    const lastInput = gradeList?.querySelector(".grade-row:last-child input");
    lastInput?.focus();
  });
  clearGradesButton?.addEventListener("click", resetGrades);
  finalButton?.addEventListener("click", calculateFinalSituation);
  document.getElementById("pfFinal")?.addEventListener("input", calculateFinalSituation);

  if (gradeList && !gradeList.querySelector(".grade-row")) {
    createGradeRow();
    createGradeRow();
  }
}

function setupNavigation() {
  const navLinks = [...document.querySelectorAll(".nav a[href^='#']")];
  const sections = [...document.querySelectorAll("[data-nav-section]")];

  const mark = id => {
    navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
  };

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) mark(visible.target.id);
  }, { rootMargin: "-18% 0px -64% 0px", threshold: [0.08, 0.15, 0.25, 0.4] });

  sections.forEach(section => observer.observe(section));

  window.addEventListener("hashchange", () => {
    const id = (location.hash || "#buscar").replace("#", "");
    if (sections.some(section => section.id === id)) mark(id);
  });

  mark((location.hash || "#buscar").replace("#", ""));
}

function handleSharedLink() {
  const params = new URLSearchParams(window.location.search);
  const docId = params.get("share") || params.get("doc");
  if (!docId) return;
  const expires = params.get("expires");
  if (expires) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(`${expires}T00:00:00`);
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate < today) {
      document.getElementById("resultsSummary").textContent = "O link público expirou.";
      location.hash = "#buscar";
      return;
    }
  }
  const doc = documents.find(item => item.id === docId);
  if (doc) {
    location.hash = "#buscar";
    window.setTimeout(() => openPreviewFromDoc(doc), 100);
  }
}

function boot() {
  populateFilters();
  renderDirectory();
  renderDocuments();
  renderApps();
  renderLinks();
  renderGuides();
  renderMetrics();
  setupSearch();
  setupModal();
  setupArchiveViews();
  setupBulkEditing();
  setupCalculators();
  setupNavigation();
  handleSharedLink();
}

boot();
