const PDFJS_VERSION = "3.11.174";
let pdfJsLoadPromise = null;
let observer = null;
const activeRenders = new WeakMap();

function cancelElementRender(el) {
  const active = activeRenders.get(el);
  if (!active) return;
  active.cancelled = true;
  try { active.renderTask?.cancel(); } catch (_) {}
  try { active.loadingTask?.destroy(); } catch (_) {}
  activeRenders.delete(el);
  if (el?.dataset.pdfRendered === "loading") delete el.dataset.pdfRendered;
  el?.classList.remove("thumb-loading");
  el?.removeAttribute("aria-busy");
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return true;
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise(resolve => {
    const existing = document.querySelector(`script[data-hub-pdfjs="${PDFJS_VERSION}"]`);
    const script = existing || document.createElement("script");
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!value) pdfJsLoadPromise = null;
      resolve(Boolean(value));
    };
    const timer = window.setTimeout(() => {
      console.warn("PDF.js demorou demais para carregar; mantendo o fallback visual.");
      if (!window.pdfjsLib) script.remove();
      finish(false);
    }, 12000);
    script.dataset.hubPdfjs = PDFJS_VERSION;
    script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    script.referrerPolicy = "no-referrer";
    script.async = true;
    script.addEventListener("load", () => finish(Boolean(window.pdfjsLib)), { once: true });
    script.addEventListener("error", () => {
      console.warn("PDF.js não carregou; miniaturas permanecerão no fallback visual.");
      script.remove();
      finish(false);
    }, { once: true });
    if (!existing) document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

function setupPdfJs() {
  if (!window.pdfjsLib) return false;
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  }
  return true;
}

export async function renderSinglePdfThumbnail(el, budget) {
  if (!el || el.dataset.pdfRendered === "done" || el.dataset.staticThumbnail === "true") return;
  cancelElementRender(el);
  if (!(await ensurePdfJs()) || !setupPdfJs() || !el.isConnected) return;
  const url = el.dataset.pdfUrl;
  if (!url) return;
  const active = { cancelled: false, loadingTask: null, renderTask: null };
  activeRenders.set(el, active);
  el.dataset.pdfRendered = "loading";
  el.classList.add("thumb-loading");
  el.setAttribute("aria-busy", "true");
  try {
    active.loadingTask = window.pdfjsLib.getDocument(url);
    const pdf = await active.loadingTask.promise;
    if (active.cancelled || !el.isConnected) return;
    const page = await pdf.getPage(1);
    if (active.cancelled || !el.isConnected) return;
    const box = el.getBoundingClientRect();
    const targetWidth = Math.max(110, Math.min(budget.maxCssWidth, box.width || 160));
    const viewport1 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / viewport1.width });
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, budget.maxDevicePixelRatio, budget.maxCanvasWidth / Math.max(1, viewport.width), budget.maxCanvasHeight / Math.max(1, viewport.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(budget.maxCanvasWidth, Math.floor(viewport.width * ratio));
    canvas.height = Math.min(budget.maxCanvasHeight, Math.floor(viewport.height * ratio));
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("aria-hidden", "true");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D indisponível para gerar a miniatura.");
    active.renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
    await active.renderTask.promise;
    if (active.cancelled || !el.isConnected) return;
    el.querySelector("canvas")?.remove();
    el.classList.add("thumb-rendered");
    el.prepend(canvas);
    el.dataset.pdfRendered = "done";
  } catch (error) {
    if (error?.name !== "RenderingCancelledException" && !active.cancelled) {
      el.dataset.pdfRendered = "error";
      console.warn("Não foi possível gerar miniatura do PDF:", url, error);
    }
  } finally {
    try { await active.loadingTask?.destroy(); } catch (_) {}
    if (activeRenders.get(el) === active) activeRenders.delete(el);
    el.classList.remove("thumb-loading");
    el.removeAttribute("aria-busy");
    if (el.dataset.pdfRendered === "done" || el.dataset.pdfRendered === "error") observer?.unobserve(el);
  }
}

export function renderPdfThumbnails(budget) {
  const thumbs = [...document.querySelectorAll(".doc-thumb[data-pdf-url]:not([data-pdf-rendered]):not([data-static-thumbnail='true'])")];
  if (!thumbs.length) return;
  if ("IntersectionObserver" in window) {
    if (!observer) {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) renderSinglePdfThumbnail(entry.target, budget);
        else cancelElementRender(entry.target);
      }), { rootMargin: "180px 0px", threshold: 0.01 });
    }
    thumbs.forEach(el => observer.observe(el));
  } else thumbs.slice(0, 12).forEach(el => renderSinglePdfThumbnail(el, budget));
}

export function schedulePdfThumbnailRender(budget) {
  const run = () => renderPdfThumbnails(budget);
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 900 });
  else window.setTimeout(run, 120);
}

const normalizeText = text => String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const splitClientText = (text="", maxChars=1600) => { const clean=String(text).replace(/\s+/g," ").trim(); const chunks=[]; for(let start=0;start<clean.length;start+=maxChars)chunks.push(clean.slice(start,start+maxChars).trim()); return chunks; };
const cacheKey = doc => `hub-pdf-text-v2:${doc.id}:${doc.pdfUrl || doc.sourceUrl || ""}`;
function readCache(doc){try{const parsed=JSON.parse(localStorage.getItem(cacheKey(doc))||"null");return Array.isArray(parsed?.chunks)&&parsed.chunks.length?parsed:null}catch(_){return null}}
function writeCache(doc,payload){try{const raw=JSON.stringify(payload);if(raw.length<650000)localStorage.setItem(cacheKey(doc),raw)}catch(_){}}

export async function extractPdfTextInBrowser(doc) {
  if (!(await ensurePdfJs()) || !setupPdfJs()) return null;
  const url=doc.pdfUrl||doc.sourceUrl; if(!url||!/\.pdf($|[?#])/i.test(url))return null;
  const cached=readCache(doc); if(cached)return cached;
  let loadingTask=null;
  try {
    loadingTask=window.pdfjsLib.getDocument(url); const pdf=await loadingTask.promise; const chunks=[]; let allText="";
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber+=1){
      const page=await pdf.getPage(pageNumber); const content=await page.getTextContent(); const pageText=content.items.map(item=>item.str||"").join(" ").replace(/\s+/g," ").trim();
      if(pageText){allText+=` ${pageText}`;splitClientText(pageText).forEach((text,index)=>chunks.push({id:`${doc.id}-browser-p${pageNumber}-${index+1}`,page:String(pageNumber),heading:index===0?doc.title:`${doc.title} — trecho ${index+1}`,semanticTags:doc.tags||[],text}))}
      try{page.cleanup?.()}catch(_){}
    }
    const clean=allText.replace(/\s+/g," ").trim(); if(!chunks.length||clean.length<30)return null;
    const payload={chunks,summary:clean.slice(0,360)+(clean.length>360?"…":""),contentLength:clean.length,indexed:true,extractionMethod:"browser-pdfjs"}; writeCache(doc,payload); return payload;
  } catch(error){console.warn("Não foi possível indexar o PDF no navegador:",url,error);return null} finally { try{await loadingTask?.destroy()}catch(_){} }
}

export function hasRealIndexedText(doc={}) {
  if(doc.indexed&&Number(doc.contentLength||0)>80)return true; const text=(doc.chunks||[]).map(chunk=>chunk.text||"").join(" ").trim(); if(text.length<100)return false; const normalized=normalizeText(text); return !(normalized.includes("arquivo disponivel em")&&normalized.includes("nao foi possivel extrair texto"));
}
