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
  answer: "Resposta",
  workflow: "Guia",
};

const typeIcon = {
  document: "PDF",
  link: "🔗",
  app: "🧮",
  answer: "💡",
  workflow: "🧭",
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
  if (has("calcular", "calcule", "calculo", "cálculo", "calculadora", "simular", "simule", "quanto preciso", "preciso tirar", "nota necessária", "nota necessaria", "média final", "media final", "média", "media", "nota", "prova final", "tabela da final", "tabela final", "tabela", "consulta rápida", "consulta rapida", "barema", "atividades complementares", "atividade complementar", "horas complementares", "certificados", "certificado", "doação de sangue", "doacao de sangue", "monitoria", "curso de idioma")) {
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

function highlight(text, exactTerms = [], semanticTerms = []) {
  let safe = escapeHtml(text || "");
  const allTerms = [
    ...exactTerms.map(term => ({ term, cls: "" })),
    ...semanticTerms.map(term => ({ term, cls: "semantic" }))
  ]
    .filter(item => item.term && item.term.length > 2)
    .sort((a, b) => b.term.length - a.term.length);

  for (const { term, cls } of allTerms) {
    const regex = new RegExp(`(${regexAccentPattern(term)})`, "gi");
    safe = safe.replace(regex, `<mark class="${cls}">$1</mark>`);
  }
  return safe;
}

function plainSnippet(text = "", exactTerms = [], semanticTerms = [], limit = 220) {
  const clean = (text || "").toString().replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const terms = [...exactTerms, ...semanticTerms].map(normalize).filter(Boolean);
  const normalized = normalize(clean);
  let hit = -1;
  for (const term of terms) {
    hit = normalized.indexOf(term);
    if (hit >= 0) break;
  }
  if (hit < 0 || clean.length <= limit) return compactText(clean, limit);
  const start = Math.max(0, hit - Math.floor(limit / 3));
  const end = Math.min(clean.length, start + limit);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

function resultSnippet(result) {
  const exactTerms = result.exactTerms || [];
  const semanticTerms = result.semanticTerms || [];
  const source = result.type === "document"
    ? `${result.chunk?.heading || ""}. ${result.text || ""}`
    : `${result.title}. ${result.text || ""}`;
  let snippet = plainSnippet(source, exactTerms, semanticTerms, 230);

  // If the match came from title/metadata rather than from the selected chunk, show
  // something still useful and highlightable instead of a random non-highlighted passage.
  const highlighted = highlight(snippet, exactTerms, semanticTerms);
  if (!/<mark/i.test(highlighted)) {
    const fallback = `${result.title || ""}. ${result.subtitle || ""}. ${result.text || ""}`;
    snippet = plainSnippet(fallback, exactTerms, semanticTerms, 230);
    return highlight(snippet, exactTerms, semanticTerms);
  }
  return highlighted;
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

function itemInfoBadges(type, secondary = "") {
  const primary = typeLabel[type] || type || "Item";
  const cleanSecondary = (secondary || "").toString().trim();
  if (!cleanSecondary || normalize(cleanSecondary) === normalize(primary)) return typeBadge(type);
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
    if (haystack.includes("barema") || haystack.includes("atividades complementares") || haystack.includes("horas complementares") || haystack.includes("certificado")) return "🎓";
    if (haystack.includes("media") || haystack.includes("nota") || haystack.includes("calculadora")) return "🧮";
    if (haystack.includes("tabela") || haystack.includes("consulta rapida") || haystack.includes("prova final")) return "📊";
    return "⚙️";
  }
  if (url.includes("linktr.ee") || url.includes("linkme.bio") || haystack.includes("linktree")) return "🌳";
  if (url.startsWith("mailto:") || haystack.includes("email") || haystack.includes("e-mail")) return "✉️";
  if (url.includes("wa.me") || haystack.includes("whatsapp")) return "💬";
  if (url.includes("instagram.com") || haystack.includes("instagram")) return "📸";
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
  const external = /^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url) || /^https?:/i.test(url);
  const newTab = resource.openMode === "new-tab" || resource.target === "_blank" || resource.newTab === true;
  if (newTab || external) return ' target="_blank" rel="noopener"';
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
    return `
      <div class="doc-thumb ${kindClass} thumb-image" style="background-image:url('${escapeHtml(image)}')" aria-label="Miniatura de ${escapeHtml(title)}">
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

function setupPdfJs() {
  if (!window.pdfjsLib) {
    console.warn("PDF.js não carregou; miniaturas reais de PDF ficarão no fallback visual.");
    return false;
  }
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  return true;
}

async function renderSinglePdfThumbnail(el) {
  if (!setupPdfJs() || !el || el.dataset.pdfRendered) return;
  const url = el.dataset.pdfUrl;
  if (!url) return;
  el.dataset.pdfRendered = "loading";
  try {
    const pdf = await window.pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const box = el.getBoundingClientRect();
    const targetWidth = Math.max(110, Math.min(260, box.width || 160));
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewport1.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("aria-hidden", "true");
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
    el.classList.add("thumb-rendered");
    el.prepend(canvas);
    el.dataset.pdfRendered = "done";
  } catch (error) {
    el.dataset.pdfRendered = "error";
    console.warn("Não foi possível gerar miniatura do PDF:", url, error);
  }
}

function renderPdfThumbnails() {
  const thumbs = [...document.querySelectorAll(".doc-thumb[data-pdf-url]:not([data-pdf-rendered])")];
  if (!thumbs.length || !setupPdfJs()) return;

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          renderSinglePdfThumbnail(entry.target);
        }
      });
    }, { rootMargin: "240px" });
    thumbs.forEach(el => observer.observe(el));
    return;
  }

  thumbs.slice(0, 40).forEach(renderSinglePdfThumbnail);
}

function schedulePdfThumbnailRender() {
  requestAnimationFrame(() => {
    renderPdfThumbnails();
    window.setTimeout(renderPdfThumbnails, 350);
    window.setTimeout(renderPdfThumbnails, 1200);
  });
}


function hasRealIndexedText(doc = {}) {
  if (doc.indexed && Number(doc.contentLength || 0) > 80) return true;
  const text = (doc.chunks || []).map(chunk => chunk.text || "").join(" ").trim();
  if (text.length < 100) return false;
  const normalized = normalize(text);
  if (normalized.includes("arquivo disponivel em") && normalized.includes("nao foi possivel extrair texto")) return false;
  return true;
}

function splitClientText(text = "", maxChars = 1600) {
  const clean = text.toString().replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks = [];
  for (let start = 0; start < clean.length; start += maxChars) {
    chunks.push(clean.slice(start, start + maxChars).trim());
  }
  return chunks;
}

function pdfTextCacheKey(doc = {}) {
  return `hub-pdf-text-v2:${doc.id}:${doc.pdfUrl || doc.sourceUrl || ""}`;
}

function readCachedPdfText(doc) {
  try {
    const raw = localStorage.getItem(pdfTextCacheKey(doc));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.chunks) || !parsed.chunks.length) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function writeCachedPdfText(doc, payload) {
  try {
    const raw = JSON.stringify(payload);
    // Avoid filling the browser cache with huge PDFs.
    if (raw.length < 650000) localStorage.setItem(pdfTextCacheKey(doc), raw);
  } catch (error) {
    // localStorage may be full or unavailable. Search still works in memory.
  }
}

async function extractPdfTextInBrowser(doc) {
  if (!setupPdfJs()) return null;
  const url = doc.pdfUrl || doc.sourceUrl;
  if (!url || !/\.pdf($|[?#])/i.test(url)) return null;

  const cached = readCachedPdfText(doc);
  if (cached) return cached;

  try {
    const pdf = await window.pdfjsLib.getDocument(url).promise;
    const chunks = [];
    let allText = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => item.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!pageText) continue;
      allText += ` ${pageText}`;
      splitClientText(pageText).forEach((text, index) => {
        chunks.push({
          id: `${doc.id}-browser-p${pageNumber}-${index + 1}`,
          page: String(pageNumber),
          heading: index === 0 ? doc.title : `${doc.title} — trecho ${index + 1}`,
          semanticTags: doc.tags || [],
          text
        });
      });
    }

    const cleanText = allText.replace(/\s+/g, " ").trim();
    if (!chunks.length || cleanText.length < 30) return null;

    const payload = {
      chunks,
      summary: cleanText.slice(0, 360) + (cleanText.length > 360 ? "…" : ""),
      contentLength: cleanText.length,
      indexed: true,
      extractionMethod: "browser-pdfjs"
    };
    writeCachedPdfText(doc, payload);
    return payload;
  } catch (error) {
    console.warn("Não foi possível indexar o PDF no navegador:", url, error);
    return null;
  }
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
}

async function backgroundIndexMissingPdfText() {
  const candidates = documents.filter(doc => {
    const url = doc.pdfUrl || doc.sourceUrl || "";
    return /\.pdf($|[?#])/i.test(url) && !hasRealIndexedText(doc);
  });

  if (!candidates.length) return;

  const summary = document.getElementById("resultsSummary");
  if (summary && !state.lastQuery) {
    summary.textContent = `Indexando conteúdo de ${candidates.length} PDF(s) em segundo plano...`;
  }

  let changed = false;
  for (const doc of candidates) {
    const payload = await extractPdfTextInBrowser(doc);
    if (payload) {
      applyExtractedPayload(doc.id, payload);
      changed = true;
    }
  }

  if (changed) {
    refreshDocuments();
    populateFilters();
    renderDocuments();
    renderDirectory();
    if (state.lastQuery) runSearch(state.lastQuery);
    else renderResults([], "");
  } else if (summary && !state.lastQuery) {
    summary.textContent = "Documentos carregados. Alguns PDFs parecem escaneados ou sem texto extraível.";
  }
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
  if (/^(https?:|mailto:|#)/i.test(raw)) return raw;
  if (raw.startsWith("documents/")) return raw;
  return `documents/${raw.replace(/^\.?\/?/, "")}`;
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
  const page = entry.page || entry.pages || "—";

  return {
    id,
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
    collectedDate: entry.collectedDate || entry.collected || "",
    sourceUrl: normalizeManifestPath(entry.sourceUrl || entry.officialUrl || originalPath),
    pdfUrl: normalizeManifestPath(entry.pdfUrl || entry.path || originalPath),
    thumbnailUrl: entry.thumbnailUrl || entry.coverUrl || "",
    group: category,
    category,
    correspondent: entry.correspondent || inferCorrespondent({ title, kind, group: category, tags }),
    fileFormat: format,
    tags,
    summary,
    chunks: Array.isArray(entry.chunks) && entry.chunks.length ? entry.chunks : [
      {
        id: `${id}-manifesto`,
        page,
        heading: entry.heading || title,
        semanticTags: tags,
        text
      }
    ]
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
      thumbnailUrl: item.thumbnailurl || item.thumbnail || item.coverurl || item.capa
    };
  }).filter(item => item.title || item.path || item.sourceUrl);
}

async function fetchOptionalText(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    if (/^\s*</.test(text) && text.includes("<html")) return null;
    return text;
  } catch (error) {
    return null;
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

async function loadManifestDocuments() {
  const loaded = [];
  let loadedFromJson = false;

  if (Array.isArray(window.HUB_MANIFEST?.documents)) {
    loaded.push(...window.HUB_MANIFEST.documents);
    loadedFromJson = true;
  }

  const jsonText = await fetchOptionalText("documents/manifest.json") || await fetchOptionalText("documents/documents-manifest.json");
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
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

  const normalizedDocs = loaded.map(normalizeManifestDocument);
  const existingIds = new Set(rawDocuments.map(doc => doc.id));
  normalizedDocs.forEach(doc => {
    let id = doc.id;
    let counter = 2;
    while (existingIds.has(id)) {
      id = `${doc.id}-${counter}`;
      counter += 1;
    }
    doc.id = id;
    existingIds.add(id);
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

function scoreResource(resource, query, filters, intent = detectSearchIntent(query)) {
  if (filters.type !== "all" && resource.type !== filters.type) return null;
  if (filters.status !== "all" && resource.status !== filters.status) return null;
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

  if (phrase.length > 2 && titleNorm.includes(phrase)) {
    score += 70;
    matched = true;
  }

  if (phrase.length > 2 && haystackNorm.includes(phrase)) {
    score += 18;
    matched = true;
  }

  for (const term of terms.exact) {
    if (titleNorm.includes(term)) { score += 28; matched = true; }
    if (haystackNorm.includes(term)) { score += 8; matched = true; }
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
    if (title.includes("barema") && terms.exact.some(term => ["barema", "horas", "complementares", "certificado", "certificados", "monitoria", "estagio", "estágio"].includes(term))) score += 18;
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
  const titleNeedle = normalize(query || "").trim();
  return buildResources()
    .map(resource => scoreResource(resource, query, filters, intent))
    .filter(Boolean)
    .sort((a, b) => {
      const aTitle = titleNeedle && normalize(a.title || "").includes(titleNeedle) ? 1 : 0;
      const bTitle = titleNeedle && normalize(b.title || "").includes(titleNeedle) ? 1 : 0;
      if (aTitle !== bTitle) return bTitle - aTitle;
      return b.score - a.score;
    })
    .slice(0, 24);
}

function renderResults(results, query) {
  const container = document.getElementById("searchResults");
  const summary = document.getElementById("resultsSummary");
  const cleanQuery = (query || "").trim();
  state.lastResults = cleanQuery ? results : [];
  state.lastQuery = query;

  if (!cleanQuery) {
    summary.textContent = "Pesquise documentos, regulamentos, contatos, links ou ferramentas.";
    container.innerHTML = "";
    return;
  }

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
  summary.textContent = `${results.length} resultado(s): ${countText}. Ordenado por relevância.`;

  container.innerHTML = results.map((result, index) => renderResultCard(result, index)).join("");
  schedulePdfThumbnailRender();
}


function openPdfAtPage(doc = {}, page = "") {
  const base = doc.pdfUrl || doc.sourceUrl || "#";
  const cleanPage = String(page || "").match(/\d+/)?.[0];
  if (cleanPage && /\.pdf($|[?#])/i.test(base)) return `${base}#page=${cleanPage}`;
  return base;
}

function renderResultCard(result, index) {
  const openLabel = result.type === "document" ? "Prévia" : result.type === "workflow" ? "Ver passos" : "Abrir";
  const subtitle = highlight(result.subtitle || "", result.exactTerms || [], result.semanticTerms || []);
  const thumbResource = result.type === "document" ? result.doc : result;
  const thumb = thumbnailHtml(thumbResource, result.type, result.type === "document" ? { page: result.chunk.page } : {});
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
    ? `<a class="secondary-button" href="${escapeHtml(openPdfAtPage(result.doc, result.chunk?.page))}" target="_blank" rel="noopener">Arquivo</a>`
    : `<button type="button" class="secondary-button" data-copy-resource="${index}">Copiar</button>`;

  const titleHtml = highlight(result.title, result.exactTerms || [], result.semanticTerms || []);
  const snippetHtml = result.type === "answer"
    ? `<strong>${highlight(result.answer?.answer || result.title, result.exactTerms || [], result.semanticTerms || [])}</strong><br>${resultSnippet(result)}`
    : resultSnippet(result);

  return `
    <article class="result-card result-${escapeHtml(result.type)}">
      <div class="result-thumb">${thumb}</div>
      <div class="result-body">
        <div class="result-head">${infoRow}</div>
        <h3>${titleHtml}</h3>
        <p class="result-subtitle">${subtitle}</p>
        <p class="snippet result-snippet">${snippetHtml}</p>
      </div>
      <div class="result-actions">
        ${primaryAction}
        ${secondaryAction}
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

function buildVocabulary() {
  const tokenCounts = new Map();
  const phrases = new Set();

  function addText(text) {
    tokenize(text).forEach(token => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
  }

  documents.forEach(doc => {
    [doc.title, doc.documentType, doc.correspondent, doc.fileFormat, doc.summary].forEach(item => {
      if (item) {
        phrases.add(item.toString());
        addText(item);
      }
    });
    (doc.chunks || []).forEach(chunk => addText(`${chunk.heading || ""} ${chunk.text || ""} ${(chunk.semanticTags || []).join(" ")}`));
  });
  usefulLinks.forEach(link => [link.title, link.category, link.description].forEach(item => item && (phrases.add(item.toString()), addText(item))));
  apps.forEach(app => [app.title, app.category, app.description].forEach(item => item && (phrases.add(item.toString()), addText(item))));
  answerCards.forEach(answer => [answer.title, answer.answer, answer.description, answer.category, ...(answer.tags || [])].forEach(item => item && (phrases.add(item.toString()), addText(item))));
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

  ["typeFilter", "docTypeFilter", "correspondentFilter", "formatFilter"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => runSearch(input.value));
  });

  document.getElementById("clearSearch").addEventListener("click", () => {
    input.value = "";
    ["typeFilter", "docTypeFilter", "correspondentFilter", "formatFilter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "all";
    });
    runSearch("");
    input.focus();
  });

  runSearch("");
}


function renderResourceCard(resource, kind) {
  const action = kind === "document"
    ? `<button type="button" data-doc-preview="${escapeHtml(resource.id)}">Prévia</button><a class="secondary-button" href="${escapeHtml(resource.pdfUrl || resource.sourceUrl || '#')}" target="_blank" rel="noopener">Arquivo</a>`
    : `<a class="small-action" href="${escapeHtml(resource.url)}"${linkTargetAttrs(resource)}>Abrir</a>`;
  const subtitle = kind === "document" ? documentInfoInline(resource) : (resource.category || "Atalho");
  const infoRow = kind === "document"
    ? documentInfoBadges(resource)
    : itemInfoBadges(kind, resource.category || inferFormat({ ...resource, type: kind }));

  return `
    <article class="resource-card resource-${escapeHtml(kind)}" id="${escapeHtml(resource.id)}">
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

function renderDirectory() {
  const container = document.getElementById("directoryGrid");
  if (!container) return;

  const renderedGroups = directoryGroups.map(group => {
    const items = (group.items || [])
      .map(ref => ({ ref, resource: findResourceByRef(ref) }))
      .filter(item => item.resource)
      .map(({ ref, resource }) => {
        const href = ref.type === "document" ? `#${resource.id}` : (resource.url || `#${resource.id}`);
        const targetAttrs = ref.type === "document" ? "" : linkTargetAttrs(resource);
        const extraAttrs = ref.type === "document" ? `data-directory-doc="${escapeHtml(resource.id)}"` : "";
        const format = ref.type === "document" ? "" : inferFormat({ ...resource, type: ref.type });
        const miniIcon = ref.type === "document" ? (typeIcon[ref.type] || "PDF") : emojiForResource(resource, ref.type);
        return `
          <a class="directory-item" href="${escapeHtml(href)}" ${extraAttrs}${targetAttrs}>
            <span class="mini-icon type-${escapeHtml(ref.type)}">${escapeHtml(miniIcon || "•")}</span>
            <span>
              <strong>${escapeHtml(refTitle(resource))}</strong>
              <small>${escapeHtml(refMeta(resource, ref.type))}</small>
            </span>
            ${format ? `<em>${escapeHtml(format)}</em>` : ""}
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

  if (renderedGroups) {
    container.innerHTML = renderedGroups;
    return;
  }

  const groupedDocs = Object.entries(documents.reduce((groups, doc) => {
    const title = doc.group || doc.category || categoryFromPath(doc.pdfUrl || doc.sourceUrl || "");
    groups[title] = groups[title] || [];
    groups[title].push(doc);
    return groups;
  }, {})).map(([title, docs]) => `
      <article class="directory-card" id="group-${escapeHtml(slugify(title))}">
        <header>
          <h3>${escapeHtml(title)}</h3>
          <p>${docs.length} documento(s).</p>
        </header>
        <div class="directory-items">
          ${docs.map(doc => `
            <a class="directory-item" href="#${escapeHtml(doc.id)}" data-directory-doc="${escapeHtml(doc.id)}">
              <span class="mini-icon type-document">PDF</span>
              <span>
                <strong>${escapeHtml(doc.title)}</strong>
                <small>${escapeHtml(refMeta(doc, "document"))}</small>
              </span>
            </a>
          `).join("")}
        </div>
      </article>
    `).join("");

  container.innerHTML = groupedDocs || emptyStateHtml(
    "Nenhum documento no diretório ainda",
    "Adicione PDFs em subpastas de documents/ e gere documents/manifest.json para o hub criar as categorias automaticamente."
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
  schedulePdfThumbnailRender();
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
  location.hash = "resolver";
  renderWorkflowDetail(id, true);
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
  const terms = [...exactTerms, ...semanticTerms].map(normalize).filter(Boolean);
  const chunks = (doc.chunks || []).length ? doc.chunks : [
    { id: `${doc.id}-summary`, page: "—", heading: doc.title, text: doc.summary || doc.title || "" }
  ];

  const scored = chunks.map(chunk => {
    const haystack = normalize(`${doc.title || ""} ${doc.summary || ""} ${doc.documentType || ""} ${doc.correspondent || ""} ${(doc.tags || []).join(" ")} ${chunk.heading || ""} ${chunk.text || ""} ${(chunk.semanticTags || []).join(" ")}`);
    let score = 0;
    terms.forEach(term => {
      if (haystack.includes(term)) score += exactTerms.map(normalize).includes(term) ? 3 : 1;
    });
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);

  if (!terms.length) return chunks.slice(0, 3);
  const matched = scored.filter(item => item.score > 0).slice(0, 4).map(item => item.chunk);
  return matched.length ? matched : chunks.slice(0, 1);
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
  const queryTerms = expandedTerms(state.lastQuery || "");
  const exactTerms = options.exactTerms || queryTerms.exact || [];
  const semanticTerms = options.semanticTerms || queryTerms.semantic || [];
  const chunk = options.chunk || bestChunksForDoc(doc, exactTerms, semanticTerms)[0] || doc.chunks?.[0] || { page: "—", heading: "Prévia", text: doc.summary || doc.title || "" };
  openPreview({ type: "document", doc, chunk, exactTerms, semanticTerms });
}

function openPreview(result) {
  const modal = document.getElementById("previewModal");
  const modalContent = document.getElementById("modalContent");
  if (!result || result.type !== "document") return;
  const doc = result.doc;
  const exactTerms = result.exactTerms || [];
  const semanticTerms = result.semanticTerms || [];
  const chunks = bestChunksForDoc(doc, exactTerms, semanticTerms);
  const shownChunks = chunks.length ? chunks : [{ page: "—", heading: "Prévia", text: doc.summary || doc.title || "" }];
  const firstPage = shownChunks.find(chunk => String(chunk.page || "").match(/\d+/))?.page || result.chunk?.page || "";
  const related = similarDocuments(doc, 4);
  const citationText = buildCitation({ type: "document", doc, chunk: shownChunks[0] || result.chunk || {} });

  modalContent.innerHTML = `
    <div class="full-preview compact-preview">
      <header class="preview-header compact-preview-header">
        <div class="preview-cover">
          ${thumbnailHtml(doc, "document")}
        </div>
        <div>
          <div class="badge-row">
            ${documentInfoBadges(doc)}
          </div>
          <h2 id="previewTitle">${highlight(doc.title, exactTerms, semanticTerms)}</h2>
          <p class="result-subtitle">${highlight(doc.summary || doc.correspondent || "", exactTerms, semanticTerms)}</p>
          <div class="preview-actions-line action-row">
            <a class="small-action" href="${escapeHtml(openPdfAtPage(doc, firstPage))}" target="_blank" rel="noopener">Abrir PDF nesta página</a>
            <button class="secondary-button" type="button" data-copy-reference="${escapeHtml(citationText)}">Copiar referência</button>
          </div>
        </div>
      </header>

      <section class="preview-layout-v2">
        <aside class="preview-pages">
          <h3>Páginas</h3>
          ${shownChunks.map((chunk, i) => `
            <button type="button" data-preview-scroll="preview-chunk-${i}">
              <span>p. ${escapeHtml(chunk.page || "—")}</span>
              <small>${escapeHtml(compactText(chunk.heading || "Trecho", 42))}</small>
            </button>
          `).join("")}
        </aside>

        <section class="preview-main">
          <h3>Trechos encontrados</h3>
          ${shownChunks.map((chunk, i) => `
            <article class="preview-paper" id="preview-chunk-${i}">
              <div class="result-head">
                <span class="badge">p. ${escapeHtml(chunk.page || "—")}</span>
                <span class="badge">${highlight(chunk.heading || "Trecho", exactTerms, semanticTerms)}</span>
              </div>
              <p>${highlight(chunk.text || doc.summary || doc.title || "", exactTerms, semanticTerms)}</p>
              <p class="preview-actions-line"><a class="small-action" href="${escapeHtml(openPdfAtPage(doc, chunk.page))}" target="_blank" rel="noopener">Abrir PDF na página ${escapeHtml(chunk.page || "")}</a></p>
            </article>
          `).join("")}

          <section class="related-docs">
            <h3>Documentos relacionados</h3>
            ${related.length ? related.map(item => `
              <button type="button" data-open-doc="${escapeHtml(item.id)}">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(documentInfoInline(item))}</span>
              </button>
            `).join("") : `<p class="muted-text">Nenhum documento relacionado encontrado no acervo atual.</p>`}
          </section>
        </section>
      </section>
    </div>
  `;
  modal.setAttribute("aria-hidden", "false");
  schedulePdfThumbnailRender();
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

    const copyRef = event.target.closest("[data-copy-reference]");
    if (copyRef) {
      navigator.clipboard?.writeText(copyRef.dataset.copyReference || "");
      const previous = copyRef.textContent;
      copyRef.textContent = "Referência copiada";
      setTimeout(() => copyRef.textContent = previous, 1400);
    }

    const scrollPreview = event.target.closest("[data-preview-scroll]");
    if (scrollPreview) {
      const target = document.getElementById(scrollPreview.dataset.previewScroll);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const workflowButton = event.target.closest("[data-workflow-open]");
    if (workflowButton) {
      openWorkflow(workflowButton.dataset.workflowOpen);
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
  if (!button) return;
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

  if (!finalOutput || !gradeList) return;

  function parseNumber(raw) {
    const normalized = (raw ?? "").toString().replace(",", ".").trim();
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function setFinalResult(kind, html) {
    finalOutput.classList.remove("result-positive", "result-negative", "result-warning", "result-neutral");
    finalOutput.classList.add(`result-${kind}`);
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
    const base = `<span class="calc-detail">Notas usadas: ${gradesText}</span><span class="calc-detail">MP = ${formatGrade(mp)}</span>`;

    if (mp >= 7) {
      setFinalResult("positive", `<strong>✅ Aprovado por média.</strong>${base}<span class="calc-detail">Não precisa fazer prova final.</span>`);
      return;
    }

    if (mp < 2.5) {
      setFinalResult("negative", `<strong>❌ Reprovado sem direito à prova final.</strong>${base}<span class="calc-detail">MP abaixo de 2,5.</span>`);
      return;
    }

    const neededPf = Math.max(0, 15 - (mp * 2));

    if (pf === null) {
      setFinalResult("warning", `<strong>⚠️ Precisa fazer prova final.</strong>${base}<span class="calc-detail">Para ser aprovado após a final, precisa tirar <strong>${formatGrade(neededPf)}</strong> na PF.</span>`);
      return;
    }

    const mf = ((mp * 2) + pf) / 3;
    if (mf >= 5) {
      setFinalResult("positive", `<strong>✅ Aprovado após a final.</strong>${base}<span class="calc-detail">PF = ${formatGrade(pf)} · MF = ${formatGrade(mf)}</span>`);
    } else {
      setFinalResult("negative", `<strong>❌ Reprovado após a final.</strong>${base}<span class="calc-detail">PF = ${formatGrade(pf)} · MF = ${formatGrade(mf)}</span><span class="calc-detail">Precisava tirar ${formatGrade(neededPf)} na PF.</span>`);
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


function setupNavigation() {
  const navLinks = [...document.querySelectorAll(".nav a[href^='#']")];
  const sections = [...document.querySelectorAll("[data-nav-section]")];

  const mark = id => {
    navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
  };

  const currentSection = () => {
    const offset = 92;
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
  requestUpdate();
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
      tr.innerHTML = `<td>${formatOneDecimal(media)}</td><td>${formatOneDecimal(final)}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  });
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

async function boot() {
  await loadManifestDocuments();
  populateFilters();
  renderDirectory();
  renderDocuments();
  renderApps();
  renderLinks();
  renderGuides();
  setupSearch();
  setupModal();
  setupArchiveViews();
  setupCalculators();
  buildFinalExamTable();
  setupNavigation();
  backgroundIndexMissingPdfText();
  schedulePdfThumbnailRender();
}

boot();
