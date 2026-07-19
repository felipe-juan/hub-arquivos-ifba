#!/usr/bin/env python3
from pathlib import Path
import gzip
import json
import re
import subprocess
import sys

try:
    import brotli
except Exception:
    brotli = None

ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
BUDGET = json.loads((ROOT / "performance-budget.json").read_text(encoding="utf-8"))
errors: list[str] = []

def clean_local(value: str) -> str | None:
    if not value or re.match(r"^(?:https?:|data:|blob:|mailto:|tel:|#)", value, re.I):
        return None
    return value.split("#", 1)[0].split("?", 1)[0].lstrip("./")

index = (ROOT / "index.html").read_text(encoding="utf-8")
script_refs = [clean_local(v) for v in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)', index, re.I)]
style_refs = [clean_local(v) for v in re.findall(r'<link\b[^>]*\brel=["\'][^"\']*stylesheet[^"\']*["\'][^>]*\bhref=["\']([^"\']+)', index, re.I)]
style_refs += [clean_local(v) for v in re.findall(r'<link\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*\brel=["\'][^"\']*stylesheet', index, re.I)]
asset_refs = [clean_local(v) for v in re.findall(r'<(?:img|script)\b[^>]*\bsrc=["\']([^"\']+)', index, re.I)]
asset_refs += [clean_local(v) for v in re.findall(r'<link\b[^>]*\bhref=["\']([^"\']+)', index, re.I)]
script_refs = list(dict.fromkeys(ref for ref in script_refs if ref))
style_refs = list(dict.fromkeys(ref for ref in style_refs if ref))
initial_refs = list(dict.fromkeys(ref for ref in asset_refs if ref))

def read_refs(refs: list[str], kind: str) -> bytes:
    chunks = []
    for ref in refs:
        path = ROOT / ref
        if not path.exists(): errors.append(f"Recurso inicial {kind} ausente: {ref}")
        else: chunks.append(path.read_bytes())
    return b"\n".join(chunks)

js_data = read_refs(script_refs, "JavaScript")
css_data = read_refs(style_refs, "CSS")
limits = BUDGET["initialPage"]
metrics = {
    "jsRaw": len(js_data), "jsGzip": len(gzip.compress(js_data, 9)),
    "cssRaw": len(css_data), "cssGzip": len(gzip.compress(css_data, 9)),
}
if brotli:
    metrics["jsBrotli"] = len(brotli.compress(js_data, quality=11))
    metrics["cssBrotli"] = len(brotli.compress(css_data, quality=11))
else:
    metrics["jsBrotli"] = metrics["cssBrotli"] = 0

checks = [
    ("JavaScript inicial", metrics["jsRaw"], limits["maxJavaScriptBytes"]),
    ("JavaScript inicial gzip", metrics["jsGzip"], limits["maxJavaScriptGzipBytes"]),
    ("CSS inicial", metrics["cssRaw"], limits["maxCssBytes"]),
    ("CSS inicial gzip", metrics["cssGzip"], limits["maxCssGzipBytes"]),
]
if brotli:
    checks += [
        ("JavaScript inicial Brotli", metrics["jsBrotli"], limits["maxJavaScriptBrotliBytes"]),
        ("CSS inicial Brotli", metrics["cssBrotli"], limits["maxCssBrotliBytes"]),
    ]
for label, actual, maximum in checks:
    if actual > maximum: errors.append(f"{label}: {actual} bytes > {maximum}")

request_count = 1 + len(initial_refs) + len(limits.get("dynamicFirstLoadResources", []))
if request_count > limits["maxFirstLoadRequests"]:
    errors.append(f"Requisições de primeira carga: {request_count} > {limits['maxFirstLoadRequests']}")
for forbidden in limits.get("mustNotLoadInitially", []):
    if forbidden in script_refs: errors.append(f"Módulo adiado carregado inicialmente: {forbidden}")

app_js = (ROOT / "app.js").read_text(encoding="utf-8")
thumb = BUDGET["thumbnails"]
for token in (f"maxCssWidth: {thumb['maxCssWidth']}", f"maxDevicePixelRatio: {thumb['maxDevicePixelRatio']}", f"maxCanvasWidth: {thumb['maxCanvasWidth']}", f"maxCanvasHeight: {thumb['maxCanvasHeight']}"):
    if token not in app_js: errors.append(f"Limite de miniatura não aplicado no app.js: {token}")
if f'new Worker("js/search-worker.js?v={VERSION}")' not in app_js:
    errors.append("Busca principal não está delegada ao Web Worker versionado")
if f'import("./js/pdf-runtime.js?v={VERSION}")' not in app_js:
    errors.append("Runtime de PDF não está dividido/carregado sob demanda")
for token in ("ensureDeferredSearchIndex", "documents/search-index.json", "manifest-summary.json"):
    if token not in app_js: errors.append(f"Separação resumo/trechos ausente no app.js: {token}")
for token in ("VIEWPORT_VIRTUALIZATION_THRESHOLD = 48", "patchResultCards", "patchDirectoryRows", "patchResourceCards"):
    if token not in app_js: errors.append(f"Virtualização/reuso DOM ausente: {token}")

paint_index = app_js.find("await waitForInitialPaint()")
manifest_index = app_js.find("await loadManifestDocuments()")
if paint_index < 0 or manifest_index < 0 or paint_index > manifest_index:
    errors.append("Metadados de documentos não estão adiados até depois da primeira pintura")

data_js = (ROOT / "data.js").read_text(encoding="utf-8")
if BUDGET["documentMetadata"].get("embeddedDocumentsMustBeEmpty") and not re.search(r'["\']documents["\']\s*:\s*\[\s*\]', data_js):
    errors.append("data.js deve manter documents vazio; metadados pertencem ao manifesto")

viewer = (ROOT / "document-viewer.html").read_text(encoding="utf-8")
pdf_budget = BUDGET["pdfViewer"]
for token in (f"PAGE_CACHE_LIMIT={pdf_budget['pageCacheEntries']}", f"BITMAP_CACHE_LIMIT={pdf_budget['bitmapCacheEntries']}", "cancelRenderTasks", "previewRatio", "sharpCanvas"):
    if token not in viewer: errors.append(f"Visualizador PDF não comprova requisito: {token}")

generator = (ROOT / "scripts/generate_documents_manifest.py").read_text(encoding="utf-8")
for width in thumb["generatedWidths"]:
    if str(width) not in generator: errors.append(f"Gerador não contém largura responsiva {width}px")
if "generate_pdf_thumbnails" not in generator or "thumbnailSrcset" not in generator:
    errors.append("Miniaturas responsivas pré-geradas não estão integradas ao manifesto")
for token in ("MANIFEST_SUMMARY_JSON", "SEARCH_INDEX_JSON", "normalized_document_fields", "normalized_chunk_fields"):
    if token not in generator: errors.append(f"Pré-cálculo/índice dividido ausente no gerador: {token}")
for output in (ROOT / "documents/manifest-summary.json", ROOT / "documents/search-index.json"):
    if not output.exists(): errors.append(f"Saída de índice ausente: {output.relative_to(ROOT)}")

build_manifest_path = ROOT / BUDGET["productionAssets"]["manifest"]
if not build_manifest_path.exists(): errors.append("Manifesto de assets com hash ausente")
else:
    try:
        built = json.loads(build_manifest_path.read_text(encoding="utf-8")).get("files", {})
        hash_pattern = re.compile(r"\.[0-9a-f]{12}\.(?:js|css)$")
        for source, target in built.items():
            if not hash_pattern.search(target): errors.append(f"Asset sem hash de conteúdo: {source} -> {target}")
            if not (ROOT / target).exists(): errors.append(f"Asset construído ausente: {target}")
        for ref in script_refs + style_refs:
            if ref.endswith((".js", ".css")) and ref not in built.values(): errors.append(f"Página inicial carrega asset textual sem hash: {ref}")
    except Exception as exc: errors.append(f"Manifesto de assets inválido: {exc}")

for required in ("PERFORMANCE_DEVICE_TESTING.md", "js/performance-monitor.js", "scripts/verify_production_host.py"):
    if not (ROOT / required).exists(): errors.append(f"Diagnóstico de produção ausente: {required}")

doom_html = (ROOT / "apps/doom/index.html").read_text(encoding="utf-8")
sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
engine_pattern = re.compile(r"js-dos(?:\.js|\.css)|emulators/|\.jsdos(?:[?\"']|$)|wdosbox", re.I)
if engine_pattern.search(doom_html): errors.append("A página inicial do DOOM contém asset do emulador antes de INICIAR DOOM")
core = re.search(r"const CORE\s*=\s*\[(.*?)\];", sw, re.S)
if core and engine_pattern.search(core.group(1)): errors.append("O service worker pré-carrega assets do emulador do DOOM")
for cache_name in ("METADATA_CACHE", "IMAGE_CACHE", "DOCUMENT_CACHE"):
    if cache_name not in sw: errors.append(f"Estratégia de cache ausente: {cache_name}")
core_text = core.group(1) if core else ""
for forbidden in ("search-index.json", "search-worker", "search-engine", "pdf-runtime"):
    if forbidden in core_text: errors.append(f"Recurso pesado pré-carregado pelo service worker: {forbidden}")

search_budget = BUDGET["search"]
try:
    result = subprocess.run(["node", str(ROOT / search_budget["benchmarkScript"]), "--json"], cwd=ROOT, check=True, capture_output=True, text=True, timeout=45)
    bench = json.loads(result.stdout)
    for key, limit_key, label in (("medianMs","maxMedianMs","mediana"),("p95Ms","maxP95Ms","p95"),("worstMs","maxWorstMs","pior caso")):
        if bench[key] > search_budget[limit_key]: errors.append(f"Busca {label}: {bench[key]} ms > {search_budget[limit_key]} ms")
except Exception as exc:
    bench = {"medianMs": 0, "p95Ms": 0, "worstMs": 0}
    errors.append(f"Benchmark da busca falhou: {exc}")

print("Orçamento de desempenho: " f"JS={metrics['jsRaw']} B (gzip {metrics['jsGzip']}, br {metrics['jsBrotli']}), " f"CSS={metrics['cssRaw']} B (gzip {metrics['cssGzip']}, br {metrics['cssBrotli']}), " f"requisições={request_count}, busca mediana/p95/pior={bench['medianMs']}/{bench['p95Ms']}/{bench['worstMs']} ms.")
for error in errors: print("ERRO:", error)
sys.exit(1 if errors else 0)
