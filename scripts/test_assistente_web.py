#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
app = root / "apps" / "assistente"
required_modules = (
    "config.js", "api-client.js", "history-store.js", "offline-search.js",
    "chat-controller.js", "composer-controller.js", "message-renderer.js",
    "response-actions.js", "app.js",
)
for name in ("index.html", "app.css", "offline-data.json", *required_modules):
    assert (app / name).is_file(), f"arquivo ausente: apps/assistente/{name}"

html = (app / "index.html").read_text(encoding="utf-8")
css = (app / "app.css").read_text(encoding="utf-8")
app_js = (app / "app.js").read_text(encoding="utf-8")
chat_js = (app / "chat-controller.js").read_text(encoding="utf-8")
composer_js = (app / "composer-controller.js").read_text(encoding="utf-8")
renderer_js = (app / "message-renderer.js").read_text(encoding="utf-8")
history_js = (app / "history-store.js").read_text(encoding="utf-8")
offline_js = (app / "offline-search.js").read_text(encoding="utf-8")
api_js = (app / "api-client.js").read_text(encoding="utf-8")
config_js = (app / "config.js").read_text(encoding="utf-8")

# Estrutura única, sem segunda sidebar nem configurações técnicas expostas.
for identifier in ("chatApp", "messages", "messageScroll", "composerArea", "messageInput", "sendMessage", "typingTemplate", "clearConversation"):
    assert f'id="{identifier}"' in html, identifier
for removed in ("chatSidebar", "conversationList", "newChat", "openSidebar", "activeContext", "clearContext", "settingsDialog", "openSettings"):
    assert f'id="{removed}"' not in html, removed
assert '../../sidebar/sidebar.css' in html and '../../sidebar/sidebar.js' in html
assert 'app-shell.css' not in html and 'app-shell.js' not in html
assert "🤖" in html and "🧭" not in html

# Os módulos devem carregar em ordem explícita antes do orquestrador mínimo.
positions = []
for module in required_modules:
    marker = f'<script src="{module}"></script>'
    position = html.find(marker)
    assert position >= 0, marker
    positions.append(position)
assert positions == sorted(positions), "ordem dos módulos do Assistente inválida"
assert positions[-1] == html.find('<script src="app.js"></script>')

# Composer fixo por layout; observador apenas como última salvaguarda de remoção física.
for marker in (
    "grid-template-rows: auto minmax(0, 1fr) auto",
    ".chat-viewport", "min-height: 0", "overflow-y: auto",
    ".composer-area", "grid-row: 3", "flex-shrink: 0", "100dvh",
):
    assert marker in css, f"layout estrutural ausente: {marker}"
assert "MutationObserver" in composer_js
assert "this.observer.observe(this.workspace, { childList: true })" in composer_js
assert "attributes: true" not in composer_js
assert "display: block !important" not in css
assert "visibility: visible !important" not in css

# Um único ciclo de requisição: abort real, timeout e resposta antiga ignorada.
for marker in (
    "class ChatController", "AbortController", "this.abort('superseded')",
    "controller.abort('timeout')", "if (!this.isCurrent(active.id))",
    "this.finish(active.id)", "get sending()",
):
    assert marker in chat_js, marker
assert "setSending(false)" not in app_js
assert "visibilitychange" not in chat_js
assert "chat.sending" in app_js
assert "if (!text || chat.sending) return" in app_js
assert "signal => api.request" in app_js
assert "externalSignal" in api_js and "controller.abort" in api_js

# Resposta primeiro: corpo principal integral, fonte compacta e apenas evidência secundária recolhível.
assert "presentation.summary || presentation.answer || message.text" in renderer_js
assert "Ver explicação completa" in renderer_js
assert "Ver trecho da fonte" in renderer_js
assert '<summary>Detalhes' not in renderer_js
assert "renderSource(message)" in renderer_js
assert "renderComponents(message)" in renderer_js
assert ".slice(0, 1)" in renderer_js  # no máximo um complemento não duplicado
assert "return all.slice(0, 2)" in renderer_js
assert "['hub-actions', 'sources']" in renderer_js
assert "Ações no HUB" not in renderer_js and "data-hub-action" not in renderer_js
assert "renderKnowledge" not in renderer_js
assert "message.feedback === 'helpful' ? '♥' : '♡'" in renderer_js
assert ".message-toolbar button.helpful" in css

# Histórico: conexão única, schema explícito, fila serial, debounce e rascunho separado.
for marker in ("dbVersion = 3", "this.dbPromise", "this.queue", "saveDraft", "loadDraft", "clearTimeout(this.stateTimer)", "clearTimeout(this.draftTimer)"):
    assert marker in history_js, marker
assert "loadOfflineCatalog" not in offline_js  # módulo próprio, sem funções herdadas do app monolítico
assert "fetch(this.path" in offline_js
assert "version: \"1.5.0\"" in config_js

# O app.js é somente orquestração: não contém classes dos módulos.
for forbidden in ("class ChatController", "class HistoryStore", "class MessageRenderer", "class ComposerController", "function formatMessage"):
    assert forbidden not in app_js, forbidden

# Sidebar canônica única em todo o HUB.
sidebar = root / "sidebar"
for name in ("sidebar.js", "sidebar.css", "apps-registry.json"):
    assert (sidebar / name).is_file(), name
registry = json.loads((sidebar / "apps-registry.json").read_text(encoding="utf-8"))
assert registry.get("apps") and registry["apps"][0].get("title") == "Assistente do HUB"
assert registry["apps"][0].get("emoji") == "🤖"
assert not (root / "apps" / "app-shell.js").exists()
assert not (root / "apps" / "app-shell.css").exists()
sidebar_js = (sidebar / "sidebar.js").read_text(encoding="utf-8")
assert "mount.replaceChildren()" in sidebar_js

home = (root / "index.html").read_text(encoding="utf-8")
assert 'id="hubSidebarMount"' in home
assert 'sidebar/sidebar.css' in home and 'sidebar/sidebar.js' in home
assert '<aside id="siteSidebar"' not in home
for page in sorted((root / "apps").glob("*/index.html")):
    text = page.read_text(encoding="utf-8")
    assert '../../sidebar/sidebar.css' in text, f"CSS compartilhado ausente: {page}"
    assert '../../sidebar/sidebar.js' in text, f"JS compartilhado ausente: {page}"
    assert 'app-shell.css' not in text and 'app-shell.js' not in text, f"shell antigo ainda referenciado: {page}"

raw = (root / "data.js").read_text(encoding="utf-8").strip()
prefix = "window.HUB_DATA = "
assert raw.startswith(prefix) and raw.endswith(';')
data = json.loads(raw[len(prefix):-1])
assert data.get("apps") and data["apps"][0].get("title") == "Assistente do HUB"
assert data["apps"][0].get("emoji") == "🤖"

# Offline vem somente do catálogo central gerado.
offline = json.loads((app / "offline-data.json").read_text(encoding="utf-8"))
assert offline.get("sourcePolicy") == "central-records-only"
assert offline.get("version") == "1.5.0"
assert "generatedAt" not in offline
assert all(item.get("source") in {"hub-data", "document-metadata"} for item in offline.get("items", []))
for forbidden in ("offline-suap", "offline-calendar", "offline-help", "portal.ifba.edu.br"):
    assert forbidden not in offline_js, forbidden

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
assert "Sequência de inicialização da sidebar não reconhecida" not in installer
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
        "apps/app-shell.js", "apps/app-shell.css", "apps/assistente/app.js",
        "apps/assistente/api-client.js", "apps/assistente/history-store.js",
        "apps/assistente/offline-search.js", "apps/assistente/chat-controller.js",
        "apps/assistente/composer-controller.js", "apps/assistente/message-renderer.js",
        "apps/assistente/response-actions.js", "apps/assistente/app.css",
        "apps/assistente/config.js", "apps/assistente/offline-data.json",
        "sidebar/sidebar.js", "sidebar/sidebar.css", "sidebar/apps-registry.json",
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
for module in required_modules:
    assert f'"./apps/assistente/{module}"' in sw, module
assert '"./sidebar/sidebar.js"' in sw

# Workflow usa exatamente o pipeline canônico e exige git diff vazio.
workflow = root / ".github" / "workflows" / "pages.yml"
assert workflow.is_file()
workflow_text = workflow.read_text(encoding="utf-8")
for marker in (
    "needs: build", "cancel-in-progress: true", "actions/deploy-pages@v5",
    "timeout: 1200000", "scripts/build_and_validate_hub.py", "git diff --exit-code",
):
    assert marker in workflow_text, marker

for path in [*(app / name for name in required_modules), sidebar / "sidebar.js"]:
    subprocess.run(["node", "--check", str(path)], check=True)
subprocess.run(["node", str(scripts / "test_frontend_modules.js"), str(root)], check=True)
print("Assistente web v1.5.0 instalado: OK")
