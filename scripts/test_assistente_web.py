#!/usr/bin/env python3
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
app = root / "apps" / "assistente"
html = (app / "index.html").read_text(encoding="utf-8")
css = (app / "app.css").read_text(encoding="utf-8")
js = (app / "app.js").read_text(encoding="utf-8")
config = (app / "config.js").read_text(encoding="utf-8")

for identifier in ("chatApp", "messages", "messageScroll", "composerArea", "messageInput", "sendMessage", "typingTemplate", "clearConversation"):
    assert f'id="{identifier}"' in html, identifier
for removed in ("chatSidebar", "conversationList", "newChat", "openSidebar", "activeContext", "clearContext", "settingsDialog", "openSettings"):
    assert f'id="{removed}"' not in html, removed
assert '../../sidebar/sidebar.css' in html and '../../sidebar/sidebar.js' in html
assert 'app-shell.css' not in html and 'app-shell.js' not in html
assert "🤖" in html and "🧭" not in html

for marker in (
    "grid-template-rows: auto minmax(0, 1fr) auto",
    ".chat-viewport",
    "min-height: 0",
    "overflow-y: auto",
    ".composer-area",
    "grid-row: 3",
    "flex-shrink: 0",
    "100dvh",
):
    assert marker in css, f"layout estrutural ausente: {marker}"
assert "#composerArea[hidden]" not in css
assert "display: block !important" not in css
assert "visibility: visible !important" not in css

for marker in (
    "activeRequest", "AbortController", "beginMessageRequest", "finishMessageRequest", "abortMessageRequest",
    "controller.abort('timeout')", "state.activeRequest?.id !== active.id", "state.sending = Boolean(state.activeRequest)",
    "historyStore.queue", "historyStore.dbPromise", "persistDraft", "messageFingerprints", "renderLimit",
    "isNearBottom", "load-earlier-messages", "MutationObserver",
):
    assert marker in js, marker
assert ".scrollIntoView(" not in js
assert "ResizeObserver(updateComposerMetrics)" in js
assert "composerGuard.observer.observe(composerGuard.workspace, { childList: true })" in js
assert "attributes: true" not in js
assert "setSending(false)" not in js
assert "if (!document.hidden)" in js and "syncSendingUi()" in js
assert "state.activeRequest = null" in js
assert "if (state.activeRequest) abortMessageRequest('superseded')" in js
assert "component.type !== 'hub-actions'" in js
assert "Ações no HUB" not in js
assert "data-hub-action" not in js
assert "offline-suap" not in js and "offline-calendar" not in js and "offline-help" not in js
assert "loadOfflineCatalog" in js and "sourcePolicy" not in js  # catálogo é dado, não regra hardcoded
assert "message.feedback === 'helpful' ? '♥' : '♡'" in js
assert ".message-toolbar button.helpful" in css
assert 'version: "1.4.5"' in config

sidebar = root / "sidebar"
for name in ("sidebar.js", "sidebar.css", "apps-registry.json"):
    assert (sidebar / name).is_file(), name
registry = json.loads((sidebar / "apps-registry.json").read_text(encoding="utf-8"))
assert registry.get("apps") and registry["apps"][0].get("title") == "Assistente do HUB"
assert registry["apps"][0].get("emoji") == "🤖"
assert not (root / "apps" / "app-shell.js").exists()
assert not (root / "apps" / "app-shell.css").exists()
assert "mount.replaceChildren()" in (sidebar / "sidebar.js").read_text(encoding="utf-8")
assert "document.querySelectorAll('.mobile-topbar, #siteSidebar, #sidebarReopenButton, #sidebarOverlay')" in (sidebar / "sidebar.js").read_text(encoding="utf-8")

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

metadata = json.loads((root / "documents" / "document-metadata.json").read_text(encoding="utf-8"))
for document in metadata.get("documents", []):
    assert document.get("status") in {"vigente", "revogado", "histórico", "unknown"}
    if not document.get("metadataComplete"):
        assert document.get("citationPolicy") == "related-only"
offline = json.loads((app / "offline-data.json").read_text(encoding="utf-8"))
assert offline.get("sourcePolicy") == "central-records-only"
assert offline.get("version") == "1.4.5"
assert all(item.get("source") in {"hub-data", "document-metadata"} for item in offline.get("items", []))

installer = (Path(__file__).resolve().parent / "install_assistente_web.py").read_text(encoding="utf-8")
assert "import re" not in installer and "re." not in installer
assert "HUB ASSISTENTE MANAGED CACHE START" in installer and "HUB ASSISTENTE MANAGED CACHE END" in installer
assert "raise SystemExit" in installer
assert "Não foi possível localizar um ponto seguro para inserir sidebar/sidebar.js" in installer
assert "Sequência de inicialização da sidebar não reconhecida" not in installer
assert "splitlines(keepends=True)" in installer

build_patcher = root / "scripts" / "patch_build_production_assets.py"
assert build_patcher.is_file()
subprocess.run([sys.executable, str(build_patcher), str(root)], check=True)
build_script = root / "scripts" / "build_production_assets.py"
if build_script.is_file():
    import ast
    build_tree = ast.parse(build_script.read_text(encoding="utf-8"))
    obsolete = {"apps/app-shell.js", "apps/app-shell.css", "apps/assistente/app.js", "apps/assistente/app.css", "apps/assistente/config.js", "apps/assistente/offline-data.json", "sidebar/sidebar.js", "sidebar/sidebar.css", "sidebar/apps-registry.json"}
    configured = []
    for statement in build_tree.body:
        if isinstance(statement, (ast.Assign, ast.AnnAssign)) and statement.value is not None:
            configured.extend(ast.walk(statement.value))
    assert not any(
        isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and node.value.replace("\\", "/").removeprefix("./") in obsolete
        for node in configured
    ), "build ainda tenta hashear assets estáveis do Assistente/sidebar"

# A sidebar canônica carrega depois do runtime principal e antes da busca rápida.
home_runtime_positions = [position for marker in ('<script src="app.js', '<script src="./app.js', '<script src="assets/build/app.', '<script src="./assets/build/app.') if (position := home.find(marker)) >= 0]
sidebar_position = home.find('<script src="sidebar/sidebar.js')
quick_position = home.find('<script src="js/sidebar-quick-search.js')
assert sidebar_position >= 0
if home_runtime_positions:
    assert max(home_runtime_positions) < sidebar_position
if quick_position >= 0:
    assert sidebar_position < quick_position


sw = (root / "service-worker.js").read_text(encoding="utf-8")
assert "apps/app-shell.js" not in sw and "apps/app-shell.css" not in sw
assert "apps/assistente/assets/build/" not in sw
assert '"./apps/assistente/app.js"' in sw
assert '"./sidebar/sidebar.js"' in sw
assert (root / "scripts" / "build_and_validate_hub.py").is_file()

workflow = root / ".github" / "workflows" / "pages.yml"
assert workflow.is_file()
workflow_text = workflow.read_text(encoding="utf-8")
for marker in ("needs: build", "cancel-in-progress: true", "actions/deploy-pages@v5", "timeout: 1200000", "scripts/build_and_validate_hub.py"):
    assert marker in workflow_text, marker

for path in (app / "app.js", app / "config.js", sidebar / "sidebar.js"):
    subprocess.run(["node", "--check", str(path)], check=True)
print("Assistente web v1.4.5 instalado: OK")
