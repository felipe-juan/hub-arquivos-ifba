#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
warnings: list[str] = []


def check_file(path: str) -> None:
    if not (ROOT / path).exists():
        errors.append(f"Arquivo ausente: {path}")


required = [
    "index.html", "app.js", "data.js", "styles.css", "service-worker.js", "offline.html", "DESIGN_SYSTEM.md",
    "css/enhancements.css", "css/design-system.css", "css/specificity-baseline.json", "js/storage.js", "js/design-system.js", "js/where-data.js", "js/enhancements.js",
    "js/search-engine.js", "js/search-worker.js", "js/pdf-runtime.js", "js/performance-monitor.js",
    "scripts/check_inline_scripts.py", "scripts/test_internal_navigation.cjs", "scripts/test_doom_mobile_controls.cjs", "scripts/test_links_columns.cjs", "scripts/test_search_engine.cjs", "scripts/test_runtime_regressions.cjs", "scripts/test_markup_safety.py", "scripts/test_production_asset_resolution.py", "scripts/test_host_verifier.py", "scripts/responsive_smoke_test.mjs", "scripts/update_content.py", "scripts/audit_css.py", "scripts/check_performance_budget.py", "scripts/benchmark_search.cjs", "scripts/build_production_assets.py", "scripts/verify_production_host.py", "scripts/vendor_doom_assets.sh", "performance-budget.json", "PERFORMANCE_HOSTING.md", "PERFORMANCE_DEVICE_TESTING.md", "assets/build-manifest.json", "documents/manifest-summary.json", "documents/search-index.json", ".github/workflows/validate.yml",
    "apps/catalog.json", "apps/README.md",
    "apps/barema/index.html", "apps/barema/data/barema-data.js", "apps/barema/data/source-metadata.json",
    "apps/calendario/index.html", "apps/calendario/data/calendar-data.js", "apps/calendario/data/source-metadata.json",
    "apps/fluxogramas/index.html", "apps/fluxogramas/data/fluxogramas-data.js", "apps/fluxogramas/data/source-metadata.json",
    "apps/doom/index.html", "apps/doom/doom.js", "apps/doom/doom.css", "apps/doom/vendor/README.md",
]
for item in required:
    check_file(item)

try:
    release_version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", release_version):
        errors.append(f"VERSION inválida: {release_version!r}")
except Exception as exc:
    release_version = ""
    errors.append(f"VERSION não pôde ser lida: {exc}")

html_files = [
    ROOT / "index.html",
    ROOT / "apps/barema/index.html",
    ROOT / "apps/calendario/index.html",
    ROOT / "apps/fluxogramas/index.html",
    ROOT / "apps/doom/index.html",
]

for html_path in html_files:
    text = html_path.read_text(encoding="utf-8")
    ids = re.findall(r'\bid=["\']([^"\']+)', text)
    for item in sorted(set(ids)):
        if "${" in item:
            continue
        if ids.count(item) > 1:
            errors.append(f"ID HTML duplicado em {html_path.relative_to(ROOT)}: {item}")

    for ref in re.findall(r'(?:href|src)=["\']([^"\']+)', text):
        if not ref or ref.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:", "blob:", "javascript:")):
            continue
        clean = ref.split("#")[0].split("?")[0]
        target = (html_path.parent / clean).resolve()
        if clean and not target.exists():
            warnings.append(f"Referência não encontrada em {html_path.relative_to(ROOT)}: {ref}")

try:
    catalog = json.loads((ROOT / "apps/catalog.json").read_text(encoding="utf-8"))
    for app in catalog.get("apps", []):
        check_file(app["url"].rstrip("/") + "/index.html")
        for source in app.get("sourceFiles", []):
            check_file(source)
except Exception as exc:
    errors.append(f"apps/catalog.json inválido: {exc}")

# Verifica caminhos internos declarados no catálogo principal de dados.
data_js = (ROOT / "data.js").read_text(encoding="utf-8")
index_ids = set(re.findall(r'\bid=["\']([^"\']+)', (ROOT / "index.html").read_text(encoding="utf-8")))
for ref in re.findall(r'["\']url["\']\s*:\s*["\']([^"\']+)', data_js):
    if ref.startswith("#"):
        target_id = ref[1:]
        if target_id and target_id not in index_ids:
            errors.append(f"Âncora interna ausente em data.js: {ref}")
        continue
    if ref.startswith(("http:", "https:", "mailto:", "tel:")):
        continue
    clean = ref.split("#")[0].split("?")[0]
    target = (ROOT / clean).resolve()
    if clean.endswith("/"):
        target = target / "index.html"
    if clean and not target.exists():
        errors.append(f"URL interna ausente em data.js: {ref}")


# Consolidação da Média e Prova Final e arquivos essenciais do modo offline.
for stale in ("app-media\"", "app-tabela-final"):
    if stale in data_js:
        errors.append(f"Identificador antigo ainda presente em data.js: {stale}")
if data_js.count('"id": "app-media-final"') != 2:
    warnings.append("A referência app-media-final deveria aparecer no catálogo e no grupo principal.")

sw_text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
if release_version and f'hub-ifba-v{release_version}' not in sw_text:
    errors.append("Versão do service worker não corresponde a VERSION")
core_match = re.search(r"const CORE = \[(.*?)\];", sw_text, re.S)
if not core_match:
    errors.append("Lista CORE não encontrada no service-worker.js")
else:
    for ref in re.findall(r'"([^"]+)"', core_match.group(1)):
        clean = ref.split("?")[0].split("#")[0].removeprefix("./")
        target = ROOT / clean
        if ref.split("?")[0].endswith("/"):
            target = target / "index.html"
        if not target.exists():
            errors.append(f"Arquivo do cache offline ausente: {ref}")

# Verificação simples dos pré-requisitos dentro de cada matriz externalizada.
flux = (ROOT / "apps/fluxogramas/data/fluxogramas-data.js").read_text(encoding="utf-8")
for matrix, body in re.findall(r"(\w+):\{course:.*?semesters:\[(.*?)\]\s*\}", flux, re.S):
    names = set(re.findall(r"c\('([^']+)'", body))
    prerequisites: list[str] = []
    for raw in re.findall(r"c\('[^']+'[^\n]*?\[([^\]]+)\]\)", body):
        prerequisites.extend(re.findall(r"'([^']+)'", raw))
    for requirement in prerequisites:
        if requirement not in names:
            warnings.append(f"Pré-requisito possivelmente ausente em {matrix}: {requirement}")

# Os arquivos versionados mantidos devem ser redirecionamentos pequenos, não cópias antigas completas.
for redirect in [
    ROOT / "apps/barema-explorer-v0.1.9.html",
    ROOT / "apps/calendario-academico-ifba-vca-2026-v0.1.15.html",
    ROOT / "apps/fluxogramas-curriculares-v0.1.20.html",
]:
    if redirect.exists() and redirect.stat().st_size > 5000:
        errors.append(f"Redirecionamento versionado grande demais: {redirect.relative_to(ROOT)}")

# Recursos compartilhados de qualidade e atualização.
index_text = (ROOT / "index.html").read_text(encoding="utf-8")
if "reportIssueButton" not in index_text:
    errors.append("Botão de reportar problema ausente da página principal")
try:
    build_payload = json.loads((ROOT / "assets/build-manifest.json").read_text(encoding="utf-8"))
    build_manifest = build_payload.get("files", {})
    if release_version and build_payload.get("version") != release_version:
        errors.append("Versão do build-manifest não corresponde a VERSION")
    for source, built in build_manifest.items():
        if not (ROOT / source).exists():
            errors.append(f"Fonte declarada no build-manifest está ausente: {source}")
        if not (ROOT / built).exists():
            errors.append(f"Asset declarado no build-manifest está ausente: {built}")
except Exception as exc:
    build_manifest = {}
    errors.append(f"Manifesto de build inválido: {exc}")
for source in ("css/design-system.css", "js/design-system.js", "app.js", "styles.css"):
    target = build_manifest.get(source, "")
    if not target or target not in index_text:
        errors.append(f"Asset com hash não carregado na página principal: {source}")
if 'type: "SKIP_WAITING"' not in (ROOT / "js/design-system.js").read_text(encoding="utf-8"):
    errors.append("Fluxo de atualização do service worker ausente")



# Fluxo cinematográfico e controles seguros do Easter Egg do DOOM.
doom_index = (ROOT / "apps/doom/index.html").read_text(encoding="utf-8")
doom_js = (ROOT / "apps/doom/doom.js").read_text(encoding="utf-8")
for required_id in (
    "doomTerminal", "doomStart", "doomKeyboardGate", "doomExit", "doomProductivity", "doomSessionDuration",
    "doomTouchControls", "doomJoystick", "doomJoystickKnob", "doomWeapon", "doomLandscapeHint",
    "doomTouchSettings", "doomTouchOpacity", "doomTouchSensitivity", "doomLeftHanded", "doomVibration", "doomRecoveryToast",
):
    if f'id="{required_id}"' not in doom_index:
        errors.append(f"Elemento do fluxo DOOM ausente: {required_id}")
if "<kbd>Ctrl</kbd>" not in doom_index or "doom-controls-list" not in doom_index:
    errors.append("Lista visual de controles do DOOM ausente")
if "data-doom-launch" not in index_text and "data-doom-launch" not in (ROOT / "app.js").read_text(encoding="utf-8"):
    errors.append("Resultado falso do DOOM não possui ação de abertura")
if 'data-doom-hold="fire"' not in doom_index or 'data-doom-hold="strafe"' not in doom_index:
    errors.append("Botões multitouch essenciais do DOOM ausentes")
if 'kiosk: mobileInput' not in doom_js:
    errors.append("Modo kiosk móvel do js-dos ausente")
for token in (
    "hubDoomReturnContextV1", "visibilitychange", "requestFullscreen", "showProductivitySummary",
    "sendKeyEvent", "simulateKeyEvent", "maxTouchPoints", "screen.orientation", "releaseAllTouchControls",
    "TOUCH_PREFS_KEY", "recoverDoomSession",
):
    if token not in doom_js:
        errors.append(f"Comportamento do DOOM ausente: {token}")

# URLs compartilháveis, histórico navegável, empty state e atalhos globais.
app_text = (ROOT / "app.js").read_text(encoding="utf-8")
performance_text = (ROOT / "js/performance-monitor.js").read_text(encoding="utf-8")
if release_version and f'version: "{release_version}"' not in performance_text:
    errors.append("Versão do monitor de desempenho não corresponde a VERSION")
if release_version and f'**v{release_version}**' not in (ROOT / "README.md").read_text(encoding="utf-8"):
    errors.append("README não informa a versão atual de VERSION")
for token in (
    "buildShareableSearchUrl", "SEARCH_HISTORY_MARKER", "popstate", "selectedResultIndex",
    "previewDocId", "scrollY", "routeHash", "setupInternalAnchorNavigation", "navigateToLocalAnchor",
    "emptySearchSuggestions", "data-empty-suggest", "hubDoomDiscoveredV1",
    'event.key === "/"', 'event.key === "Escape"', 'event.key === "ArrowDown"',
):
    if token not in app_text:
        errors.append(f"Navegação ou busca aprimorada ausente: {token}")


if 'linkTargetAttrs({ url: item.url, newTab: true })' in app_text:
    errors.append("Apps internos da sidebar ainda são forçados a abrir em nova aba")
if 'location.hash = "resolver"' in app_text:
    errors.append("Destino legado inexistente #resolver ainda é usado diretamente")
if 'if (cleanUrl.startsWith("#")) return "";' not in app_text:
    errors.append("Links de âncora ainda podem receber target=_blank")

# Desempenho: índices separados, virtualização, renderização progressiva e diagnósticos.
for token in ("manifest-summary.json", "ensureDeferredSearchIndex", "patchResultCards", "VIEWPORT_VIRTUALIZATION_THRESHOLD"):
    if token not in app_text:
        errors.append(f"Otimização principal ausente: {token}")
viewer_text = (ROOT / "document-viewer.html").read_text(encoding="utf-8")
for token in ("previewRatio", "sharpCanvas", "cancelRenderTasks"):
    if token not in viewer_text:
        errors.append(f"Renderização progressiva do PDF ausente: {token}")
for output in ("documents/manifest-summary.json", "documents/search-index.json"):
    try: json.loads((ROOT / output).read_text(encoding="utf-8"))
    except Exception as exc: errors.append(f"Índice JSON inválido {output}: {exc}")

# O service worker nunca pode devolver uma página HTML como fallback de assets executáveis.
if 'url.origin !== self.location.origin) return' not in sw_text:
    errors.append("Recursos externos ainda estão sendo interceptados pelo service worker")
exec_branch = re.search(r'if \(isExecutableAsset\(url\)\) \{(.*?)\n  \}', sw_text, re.S)
if not exec_branch:
    errors.append("Ramo específico para assets executáveis ausente do service worker")
elif 'offline.html' in exec_branch.group(1):
    errors.append("Fallback HTML detectado para assets executáveis")

print(f"Validação concluída: {len(errors)} erro(s), {len(warnings)} aviso(s).")
for message in warnings[:100]:
    print("AVISO:", message)
for message in errors:
    print("ERRO:", message)
sys.exit(1 if errors else 0)
