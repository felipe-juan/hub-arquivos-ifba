#!/usr/bin/env python3
from __future__ import annotations

import ast
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
release_file = root / "scripts" / "hub-assistente-release.json"
assert release_file.is_file(), "manifesto de release ausente"
release_meta = json.loads(release_file.read_text(encoding="utf-8"))
APP_VERSION = str(release_meta["assistant"])
HUB_VERSION = str(release_meta["hub"])
app = root / "apps" / "assistente"
required_modules = ("config.js", "app.js")
for name in ("index.html", "app.css", "offline-data.json", "offline-academic.json", *required_modules):
    assert (app / name).is_file(), f"arquivo ausente: apps/assistente/{name}"

html = (app / "index.html").read_text(encoding="utf-8")
css = (app / "app.css").read_text(encoding="utf-8")
app_js = (app / "app.js").read_text(encoding="utf-8")
config_js = (app / "config.js").read_text(encoding="utf-8")

# Regressão principal: o fluxo funcional da v1.4.4 voltou a ser monolítico.
legacy_split_modules = (
    "api-client.js", "history-store.js", "offline-search.js", "chat-controller.js",
    "composer-controller.js", "message-renderer.js", "response-actions.js",
)
for name in legacy_split_modules:
    assert not (app / name).exists(), f"módulo regressivo ainda instalado: {name}"
    assert name not in html, f"HTML ainda carrega módulo regressivo: {name}"
for asset in required_modules:
    assert f'{asset}?v={APP_VERSION}' in html, f'asset sem cache-busting: {asset}'
assert f'app.css?v={APP_VERSION}' in html
assert f'offline-data.json?v={APP_VERSION}' in config_js
assert html.index(f'config.js?v={APP_VERSION}') < html.index(f'app.js?v={APP_VERSION}')
assert f'version: "{APP_VERSION}"' in config_js

for identifier in ("chatApp", "messages", "messageScroll", "composerArea", "messageInput", "sendMessage", "typingTemplate", "clearConversation"):
    assert f'id="{identifier}"' in html, identifier
for removed in ("chatSidebar", "conversationList", "newChat", "openSidebar", "activeContext", "clearContext", "settingsDialog", "openSettings"):
    assert f'id="{removed}"' not in html, removed
assert '../../sidebar/sidebar.css' in html and '../../sidebar/sidebar.js' in html
assert 'app-shell.css' not in html and 'app-shell.js' not in html
assert "🤖" in html and "🧭" not in html

# O caminho que funcionava na v1.4.4 deve permanecer direto e observável.
for marker in (
    'async function send(text, { appendUser = true',
    'bypassLocal = false',
    'const active = beginMessageRequest()',
    "if (state.activeRequest) abortMessageRequest('superseded')",
    "const result = await requestStream(CONFIG.messagePath || '/api/assistant/message'",
    'if (state.activeRequest?.id !== active.id) return',
    'finishMessageRequest(active.id)',
    'function showTyping()',
    'function hideTyping()',
    'function stopCurrentResponse()',
    "if (state.activeRequest && !draft.trim()) stopCurrentResponse()",
    "sendButton.dataset.mode = replacing ? 'replace' : (stopping ? 'stop' : 'send')",
    'Interromper resposta atual e enviar',
):
    assert marker in app_js, marker
assert 'class ChatController' not in app_js
assert 'window.HUBAssistant' not in app_js

# Composer e histórico continuam no mesmo arquivo funcional antigo.
for marker in (
    'grid-template-rows: auto minmax(0, 1fr) auto', '.chat-viewport', '.composer-area',
    'min-height: 0', 'overflow-y: auto', '100dvh',
):
    assert marker in css, f"layout estrutural ausente: {marker}"
assert 'MutationObserver' in app_js
assert "indexedDB.open(DB_NAME, DB_VERSION)" in app_js
assert 'loadDraft()' in app_js and 'persistDraft(' in app_js
assert 'loadOfflineCatalog()' in app_js and 'offlineAnswer(text,' in app_js
assert 'renderComponents(message)' in app_js and 'renderKnowledge(message)' in app_js
assert "toolbarIcon('up')" in app_js and "toolbarIcon('down')" in app_js
assert 'data-feedback="helpful"' in app_js and 'data-feedback="not-helpful"' in app_js
assert 'data-feedback[^>]*>👍' not in app_js and 'data-feedback[^>]*>👎' not in app_js
assert '.message-toolbar button.helpful.selected' in css
assert '.message-toolbar button.negative.selected' in css
assert "message.feedback = 'not-helpful'" in app_js and "state.feedbackMenuMessageId = opening ? messageId : ''" in app_js
assert 'interactive-widget=resizes-content' in html
assert '--assistant-viewport-top' not in css
assert "visualViewport?.addEventListener('scroll'" in app_js
assert 'const visibleBottom = visualHeight > 0 ? visualHeight + visualTop : layoutHeight' in app_js
assert 'mailto:${email}' in app_js
assert 'HUBMAIL' in app_js
assert 'HUBURLTOKEN' in app_js
url_protection_marker = 'let rawValue = safeText(text).replace(/https?:'
underscore_emphasis_marker = r".replace(/_([^_\n]+)_/g"
assert url_protection_marker in app_js, 'proteção de URLs ausente no parser inline'
assert underscore_emphasis_marker in app_js, 'regra de ênfase por underscore ausente no parser inline'
assert app_js.index(url_protection_marker) < app_js.index(underscore_emphasis_marker), 'URLs devem ser protegidas antes da ênfase por underscore'
assert "if (!raw) return '';" in app_js, 'URL vazia não pode virar a própria página do Assistente'
assert 'function isAssistantSelfUrl' in app_js
assert 'function uniqueSources' in app_js
assert 'document-card-actions' in app_js and '.document-card-actions' in css
assert 'component.pdfUrl || matchingSource?.pdfUrl' in app_js

# v1.6.0 — UX integrada: streaming, edição/regeneração, fontes, cards, contexto e offline.
for identifier in ("offlineBanner", "promptGrid"):
    assert f'id="{identifier}"' in html, identifier
for label in ("📅 Calendário", "🏫 Salas e horários", "📚 Documentos", "🎓 Barema", "🧮 Notas e final", "💰 Auxílios"):
    assert label in html, label
for marker in (
    "application/x-ndjson", "requestStream(", "reply-delta", "stream-caret",
    "data-edit-message", "data-regenerate-message", "data-feedback-reason",
    "Informação errada", "Não entendeu a pergunta", "Fonte errada", "Resposta confusa",
    "renderSources(message)", "pdf-page-preview", "integrated-source", "context-chip",
    "hub-actions", "hub-results", "schedule-mini-table", "bestOfflineSnippet",
    "Modo offline disponível", f"FRONTEND_RELEASE = '{APP_VERSION}-ux-offline-history-v2'",
):
    assert marker in app_js or marker in css, marker
for marker in ("feedback-reasons", "visual-card", "integrated-sources", "pdf-page-preview", "offline-banner"):
    assert f'.{marker}' in css, marker

# Sidebar canônica única em todo o HUB.
sidebar = root / "sidebar"
for name in ("sidebar.js", "sidebar.css", "hub-url-resolver.js", "hub-user-state.js", "hub-search.js", "hub-network.js", "hub-academic-search.json", "hub-registry.json", "apps-registry.json"):
    assert (sidebar / name).is_file(), name
registry = json.loads((sidebar / "hub-registry.json").read_text(encoding="utf-8"))
assert registry.get("sourceOfTruth") is True
assert (sidebar / "apps-registry.json").read_text(encoding="utf-8") == (sidebar / "hub-registry.json").read_text(encoding="utf-8")
assert registry.get("apps") and registry["apps"][0].get("title") == "Assistente do HUB"
assert registry["apps"][0].get("emoji") == "🤖"
expected_sidebar_emojis = {
    "app-assistente-hub": "🤖",
    "app-media-final": "🧮",
    "barema": "🎓",
    "calendario": "📅",
    "fluxogramas": "🗺️",
}
for item in registry["apps"]:
    if item.get("id") in expected_sidebar_emojis:
        assert item.get("emoji") == expected_sidebar_emojis[item["id"]]
        assert item.get("icon") == expected_sidebar_emojis[item["id"]]
assert all("onde resolvo" not in f"{item.get('id','')} {item.get('title','')} {item.get('url','')}".casefold() for item in registry["apps"])
assert len(registry.get("externalLinks", [])) == 2
external_by_id = {item.get("id"): item for item in registry.get("externalLinks", [])}
assert external_by_id.get("portal", {}).get("url") == "https://portal.ifba.edu.br/conquista"
assert external_by_id.get("portal", {}).get("emoji") == "🏫"
assert external_by_id.get("portal", {}).get("title") == "Portal"
assert external_by_id.get("suap", {}).get("url") == "https://suap.ifba.edu.br"
assert external_by_id.get("suap", {}).get("emoji") == "🔐"
assert not (root / "apps" / "app-shell.js").exists()
assert not (root / "apps" / "app-shell.css").exists()
sidebar_js = (sidebar / "sidebar.js").read_text(encoding="utf-8")
assert "mount.replaceChildren()" in sidebar_js
assert "hubFavoritesV2" in sidebar_js
assert "hub-registry.json" in sidebar_js
assert "HUB REGISTRY FALLBACK START" in sidebar_js
assert (sidebar / "hub-url-resolver.js").is_file() and (sidebar / "hub-user-state.js").is_file()
assert (sidebar / "hub-search.js").is_file() and (sidebar / "hub-network.js").is_file() and (sidebar / "hub-academic-search.json").is_file()

home = (root / "index.html").read_text(encoding="utf-8")
assert 'id="hubSidebarMount"' in home
assert 'sidebar/sidebar.css' in home and 'sidebar/sidebar.js' in home
assert 'sidebar/hub-url-resolver.js' in home and 'sidebar/hub-user-state.js' in home
assert 'sidebar/hub-search.js' in home and 'sidebar/hub-network.js' in home
assert 'sidebar-quick-search.js' not in home
assert '<aside id="siteSidebar"' not in home
for page in sorted((root / "apps").glob("*/index.html")):
    text = page.read_text(encoding="utf-8")
    assert '../../sidebar/sidebar.css' in text, f"CSS compartilhado ausente: {page}"
    assert '../../sidebar/sidebar.js' in text, f"JS compartilhado ausente: {page}"
    assert '../../sidebar/hub-url-resolver.js' in text and '../../sidebar/hub-user-state.js' in text, f"Estado/URLs compartilhados ausentes: {page}"
    assert '../../sidebar/hub-search.js' in text and '../../sidebar/hub-network.js' in text, f"Busca/rede globais ausentes: {page}"
    assert 'sidebar-quick-search.js' not in text, f"Busca legada ainda carregada: {page}"
    assert 'app-shell.css' not in text and 'app-shell.js' not in text, f"shell antigo ainda referenciado: {page}"

raw = (root / "data.js").read_text(encoding="utf-8").strip()
prefix = "window.HUB_DATA = "
assert raw.startswith(prefix) and raw.endswith(';')
data = json.loads(raw[len(prefix):-1])
assert data.get("apps") and data["apps"][0].get("title") == "Assistente do HUB"
assert data["apps"][0].get("emoji") == "🤖"
assert all(item.get("emoji") and item.get("icon") == item.get("emoji") for item in data["apps"])
assert all("onde resolvo" not in f"{item.get('id','')} {item.get('title','')} {item.get('url','')}".casefold() for item in data["apps"])

# Offline vem somente do catálogo central gerado.
offline = json.loads((app / "offline-data.json").read_text(encoding="utf-8"))
assert offline.get("sourcePolicy") == "hub-registry-and-document-metadata"
assert int(offline.get("schemaVersion") or 0) >= 3
assert offline.get("version") == APP_VERSION
assert "generatedAt" not in offline
assert all(item.get("source") in {"hub-registry", "document-metadata"} for item in offline.get("items", []))
assert all(not str(item.get("url") or "").startswith("../../") for item in offline.get("items", []))
for forbidden in ("offline-suap", "offline-calendar", "offline-help", "portal.ifba.edu.br"):
    assert forbidden not in app_js, forbidden

# Manifestos e metadados usam política conservadora.
metadata_path = root / "documents" / "document-metadata.json"
if metadata_path.is_file():
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    for document in metadata.get("documents", []):
        assert document.get("status") in {"vigente", "revogado", "histórico", "unknown"}
        if not document.get("metadataComplete"):
            assert document.get("citationPolicy") == "related-only"
for relative in ("documents/manifest.json", "documents/manifest-summary.json", "documents/search-index.json"):
    path = root / relative
    if path.is_file():
        parsed = json.loads(path.read_text(encoding="utf-8"))
        serialized = json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        assert path.read_text(encoding="utf-8") == serialized, f"JSON não canônico: {relative}"
        for volatile in ("generatedAt", "generated_at", "buildTimestamp", "builtAt", "generationTime"):
            assert f'"{volatile}"' not in serialized, f"campo volátil: {relative}:{volatile}"

# Instalador determinístico: sem regex estrutural, scripts canônicos e verificação em duas execuções.
scripts = root / "scripts"
installer = (scripts / "install_assistente_web.py").read_text(encoding="utf-8")
assert "import re" not in installer and "re." not in installer
assert "splitlines(keepends=True)" in installer
assert "GENERIC_APP_ICONS" in installer and "APP_EMOJI_RULES" in installer
assert "DEFAULT_EXTERNAL_LINKS" in installer and "is_obsolete_app" in installer
assert "NORMALIZED_OBSOLETE_APP_IDS" in installer
assert "Os demais links úteis continuam em ``registry.links``" in installer
assert "Sequência de inicialização da sidebar não reconhecida" not in installer
assert "def sync_version" not in installer
assert "text.replace(old_version, TARGET_VERSION)" not in installer
assert "hub-assistente-release.json" in installer
assert "sync_hub_release_markers.py" in installer
assert (scripts / "sync_hub_release_markers.py").is_file()
assert "isObsoleteApp" in sidebar_js and ".filter(item => !isObsoleteApp(item))" in sidebar_js

# Normalização real da sidebar sobre uma base com ícones genéricos e links ausentes.
spec = importlib.util.spec_from_file_location("hub_assistente_installer_test", scripts / "install_assistente_web.py")
assert spec and spec.loader
installer_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer_module)
with tempfile.TemporaryDirectory(prefix="hub-sidebar-registry-") as temp_dir:
    fixture = Path(temp_dir)
    (fixture / "sidebar").mkdir()
    (fixture / "apps").mkdir()
    (fixture / "sidebar" / "sidebar.js").write_text((sidebar / "sidebar.js").read_text(encoding="utf-8"), encoding="utf-8")
    fixture_data = {
        "apps": [
            {"id": "app-media-final", "title": "Média e Prova Final", "url": "#media-final", "emoji": "💼"},
            {"id": "barema", "title": "Barema de Atividades Complementares", "url": "apps/barema/", "icon": "💼"},
            {"id": "calendario", "title": "Calendário Acadêmico 2026", "url": "apps/calendario/", "emoji": "💼"},
            {"id": "fluxogramas", "title": "Fluxogramas Curriculares", "url": "apps/fluxogramas/", "emoji": "💼"},
            {"id": "onde-resolvo-isso", "title": "Onde resolvo isso?", "url": "apps/onde-resolvo-isso/", "emoji": "💼"},
            {"id": "app-personalizado", "title": "Ferramenta personalizada", "url": "apps/personalizado/", "emoji": "🌟"},
        ],
        "usefulLinks": [{"title": "Biblioteca", "url": "https://example.invalid/biblioteca"}],
    }
    (fixture / "data.js").write_text(
        installer_module.DATA_PREFIX + json.dumps(fixture_data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    installer_module.ROOT = fixture
    installer_module.update_data_and_registry()
    normalized_data = installer_module.load_hub_data(fixture / "data.js")
    emoji_by_id = {item["id"]: item["emoji"] for item in normalized_data["apps"]}
    assert emoji_by_id["app-assistente-hub"] == "🤖"
    assert emoji_by_id["app-media-final"] == "🧮"
    assert emoji_by_id["barema"] == "🎓"
    assert emoji_by_id["calendario"] == "📅"
    assert emoji_by_id["fluxogramas"] == "🗺️"
    assert emoji_by_id["app-personalizado"] == "🌟"
    assert "onde-resolvo-isso" not in emoji_by_id
    generated_registry = json.loads((fixture / "sidebar" / "hub-registry.json").read_text(encoding="utf-8"))
    assert generated_registry.get("sourceOfTruth") is True
    assert (fixture / "sidebar" / "apps-registry.json").read_text(encoding="utf-8") == (fixture / "sidebar" / "hub-registry.json").read_text(encoding="utf-8")
    embedded_sidebar = (fixture / "sidebar" / "sidebar.js").read_text(encoding="utf-8")
    assert "app-personalizado" in embedded_sidebar and "HUB REGISTRY FALLBACK START" in embedded_sidebar
    assert [item["id"] for item in generated_registry["externalLinks"]] == ["portal", "suap"]
    assert generated_registry["externalLinks"][0]["url"] == "https://portal.ifba.edu.br/conquista"
    assert generated_registry["externalLinks"][0]["title"] == "Portal"
    assert generated_registry["externalLinks"][1]["url"] == "https://suap.ifba.edu.br"
    assert generated_registry["links"] == fixture_data["usefulLinks"]
    # Depois da migração inicial, alterações divergentes em data.js não podem
    # voltar a ser fonte de verdade: o registry canônico é preservado.
    divergent = installer_module.load_hub_data(fixture / "data.js")
    divergent["apps"].append({"id":"nao-importar","title":"App divergente","url":"apps/divergente/","emoji":"❌"})
    installer_module.save_hub_data(fixture / "data.js", divergent)
    installer_module.update_data_and_registry(generated_registry)
    registry_second = json.loads((fixture / "sidebar" / "hub-registry.json").read_text(encoding="utf-8"))
    assert "app-personalizado" in {item["id"] for item in registry_second["apps"]}
    assert "nao-importar" not in {item["id"] for item in registry_second["apps"]}
for name in ("normalize_document_manifests.py", "verify_document_generation.py", "build_and_validate_hub.py"):
    assert (scripts / name).is_file(), name
verify_text = (scripts / "verify_document_generation.py").read_text(encoding="utf-8")
assert "time.sleep(2)" in verify_text
assert "first != second" in verify_text
normalize_text = (scripts / "normalize_document_manifests.py").read_text(encoding="utf-8")
assert "sort_keys=True" in normalize_text and "VOLATILE_KEYS" in normalize_text
with tempfile.TemporaryDirectory(prefix="hub-manifest-determinism-") as temp_dir:
    temp_root = Path(temp_dir)
    (temp_root / "documents").mkdir()
    sample = temp_root / "documents" / "manifest-summary.json"
    sample.write_text('{"z":1,"generatedAt":"2026-08-06T18:43:09Z","a":2}\n', encoding="utf-8")
    subprocess.run([sys.executable, str(scripts / "normalize_document_manifests.py"), str(temp_root)], check=True)
    assert sample.read_text(encoding="utf-8") == '{"a":2,"z":1}\n'
pipeline = (scripts / "build_and_validate_hub.py").read_text(encoding="utf-8")
assert "verify_document_generation.py" in pipeline
assert pipeline.index("verify_document_generation.py") < pipeline.index('run(root, "scripts/build_production_assets.py")')

build_patcher = scripts / "patch_build_production_assets.py"
subprocess.run([sys.executable, str(build_patcher), str(root)], check=True)
build_script = scripts / "build_production_assets.py"
if build_script.is_file():
    build_tree = ast.parse(build_script.read_text(encoding="utf-8"))
    stable = {
        "apps/app-shell.js", "apps/app-shell.css",
        "apps/assistente/app.js", "apps/assistente/app.css",
        "apps/assistente/config.js", "apps/assistente/offline-data.json",
        "sidebar/sidebar.js", "sidebar/sidebar.css", "sidebar/hub-url-resolver.js", "sidebar/hub-user-state.js", "sidebar/hub-search.js", "sidebar/hub-network.js", "sidebar/hub-academic-search.json", "sidebar/hub-registry.json", "sidebar/apps-registry.json",
    }
    configured = []
    for statement in build_tree.body:
        if isinstance(statement, (ast.Assign, ast.AnnAssign)) and statement.value is not None:
            configured.extend(ast.walk(statement.value))
    assert not any(
        isinstance(node, ast.Constant) and isinstance(node.value, str)
        and node.value.replace("\\", "/").removeprefix("./") in stable
        for node in configured
    ), "build ainda tenta hashear assets estáveis"

# Service worker inclui todos os módulos estáveis e não referências hash transitórias.
sw = (root / "service-worker.js").read_text(encoding="utf-8")
assert "apps/app-shell.js" not in sw and "apps/app-shell.css" not in sw
assert "apps/assistente/assets/build/" not in sw
for obsolete_ref in ("apps/onde-resolvo/", "apps/onde-resolvo-isso/", "apps/app-onde-resolvo/"):
    assert obsolete_ref not in sw, obsolete_ref
for module in required_modules:
    assert f'"./apps/assistente/{module}?v={APP_VERSION}"' in sw, module
assert '"./sidebar/sidebar.js"' in sw
assert '"./sidebar/hub-url-resolver.js"' in sw and '"./sidebar/hub-user-state.js"' in sw and '"./sidebar/hub-registry.json"' in sw
assert '"./sidebar/hub-search.js"' in sw and '"./sidebar/hub-network.js"' in sw and '"./sidebar/hub-academic-search.json"' in sw

# v1.8.0 — busca única instantânea, erros úteis e conexão/offline visível.
search_js = (sidebar / "hub-search.js").read_text(encoding="utf-8")
network_js = (sidebar / "hub-network.js").read_text(encoding="utf-8")
academic_search = json.loads((sidebar / "hub-academic-search.json").read_text(encoding="utf-8"))
for marker in ("Documentos", "Apps", "Professores", "Disciplinas", "Links", "Perguntar ao Assistente", "boundedDistance", "suggestionFor", "hubGlobalSearchInput"):
    assert marker in search_js, marker
assert "trancamento" in search_js and "tranacamento" in search_js
assert "input.addEventListener(\'click\'" in search_js, "campo de busca deve abrir também por click sintético/acessível"
assert "searchParams.set('q'" in search_js
assert academic_search.get("items") and any(item.get("kind") == "professor" for item in academic_search["items"])
assert any(item.get("kind") == "discipline" for item in academic_search["items"])
for marker in ("Offline · Conteúdo salvo até", "Conexão lenta · Conteúdo local disponível", "HUB atualizado"):
    assert marker in network_js, marker
assert "O Assistente está temporariamente indisponível, mas documentos e ferramentas do HUB continuam funcionando." in app_js
assert "searchParams.get('q')" in app_js
assert '.connection-state[data-state="degraded"]' in css

# No one-click v2, build e testes acontecem no Fedora antes do push.
# O GitHub Actions deve somente transportar o site já validado para o Pages.
workflow = root / ".github" / "workflows" / "pages.yml"
assert workflow.is_file()
workflow_text = workflow.read_text(encoding="utf-8")
for marker in (
    "cancel-in-progress: true",
    "actions/checkout@v4",
    "actions/configure-pages@v5",
    "actions/upload-pages-artifact@v4",
    "actions/deploy-pages@v5",
    "path: .",
):
    assert marker in workflow_text, marker
for forbidden in (
    "needs: build",
    "jobs:\n  build:",
    "setup-python",
    "setup-node",
    "scripts/build_and_validate_hub.py",
    "scripts/test_assistente_web.py",
    "git diff --exit-code",
    "PYTHONDONTWRITEBYTECODE",
    "__pycache__",
):
    assert forbidden not in workflow_text, forbidden
assert workflow_text.count("actions/deploy-pages@") == 1
assert workflow_text.count("actions/upload-pages-artifact@") == 1


# Teste local usa processos reais e portas efêmeras: não pode reutilizar backend/SW antigo.
local_runner = (root.parent / "testar-local.sh") if (root.parent / "testar-local.sh").is_file() else None
if local_runner:
    local_text = local_runner.read_text(encoding="utf-8")
    for marker in ('pick_port', 'API_PORT="$(pick_port)"', 'WEB_PORT="$(pick_port)"', 'exec env', 'PID real da API', 'sala liojes'):
        assert marker in local_text, marker
    assert "ASSISTANT_PORT=3220" not in local_text
    assert "python3 -m http.server 8003" not in local_text

for path in [*(app / name for name in required_modules), sidebar / "sidebar.js", sidebar / "hub-search.js", sidebar / "hub-network.js"]:
    subprocess.run(["node", "--check", str(path)], check=True)
subprocess.run(["node", str(scripts / "test_frontend_modules.js"), str(root)], check=True)
print(f"Assistente web v{APP_VERSION} / HUB v{HUB_VERSION} instalado: OK")

# v2.0.0 — modo anônimo substitui o antigo modo de teste visível.
assert 'id="anonymousModeToggle"' in html
for marker in ('telemetryMode', 'toggleAnonymousMode()', "telemetryMode:'anonymous'", '60_000'):
    assert marker in app_js, marker
assert 'id="testModeToggle"' not in html
assert '/api/assistant/popular?period=' in app_js
assert 'encodeURIComponent(period)' in app_js
assert '.anonymous-mode-toggle.selected' in css


# v1.9.0 — Home do Assistente é uma view independente da conversa.
for marker in (
    "view: 'home'",
    "function showHome(",
    "function showConversation(",
    "async function startNewConversation(",
    "function renderHomeConversationPanels(",
    "findConversationContainingMessage",
    "data-assistant-home",
    "data-assistant-new",
    "event.altKey",
):
    assert marker in app_js, marker
for marker in (
    'id="homeViewButton"',
    'id="newConversationButton"',
    'id="continueConversationCard"',
    'id="conversationHistoryPanel"',
    'id="conversationHistoryList"',
    'data-prompt="auxílio"',
):
    assert marker in html, marker
assert "$('welcome').hidden = !home" in app_js
assert "container.hidden = home" in app_js
assert "Limpar conversa" in app_js and "confirmAssistantAction" in app_js
assert "await clearSavedState()" not in app_js[app_js.index('async function resetCurrent()'):app_js.index('function messageById', app_js.index('async function resetCurrent()'))]
assert '.continue-conversation-card' in css and '.assistant-local-nav' in css

# v1.9.1 — Mais perguntadas não aparenta reset em falha transitória/redeploy.
assert "POPULAR_CACHE_KEY = 'hubAssistantPopularCacheV1'" in app_js
assert 'savePopularCache(state.popularCache)' in app_js
assert 'if (!response.ok) throw new Error' in app_js
assert 'state.popularStale = Boolean(state.popularQuestions.length)' in app_js
assert 'Atualizações não apagam o histórico.' in html


# v2.0.0 — contexto visível, streaming incremental, histórico, offline acadêmico e modal próprio.
for marker in (
    'id="activeContextBar"', 'id="clearActiveContext"', 'id="conversationHistorySearch"',
    'id="assistantDialog"', 'id="assistantDialogInput"', 'id="anonymousModeToggle"',
):
    assert marker in html, marker
for marker in (
    'function syncActiveContextUi()', 'function patchStreamingMessage(message)',
    'function localAcademicAnswer(', 'function renameConversation(', 'function deleteConversation(',
    'function renderInterrupted(message)', 'DB_CONVERSATIONS', 'DB_MESSAGES',
    'function smartConversationTitle(', 'function openAssistantDialog(',
):
    assert marker in app_js, marker
assert 'prompt(' not in app_js
assert 'confirm(' not in app_js
assert 'offlineAcademicPath' in config_js
assert (app / 'assets' / 'calendario-academico-2026.png').is_file()
assert '.interrupted-state' in css and '.source-details' in css
