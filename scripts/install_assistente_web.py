#!/usr/bin/env python3
"""Instala o Assistente v1.5.0 no HUB por cópia determinística.

Não usa substituições por expressão regular. Estruturas administradas são arquivos
completos ou blocos delimitados por marcadores de início/fim.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
PATCH = Path(__file__).resolve().parents[1]
TARGET_VERSION = "0.2.61"
APP_VERSION = "1.5.0"
DATA_PREFIX = "window.HUB_DATA = "
SW_START = "  // HUB ASSISTENTE MANAGED CACHE START"
SW_END = "  // HUB ASSISTENTE MANAGED CACHE END"

APP_ENTRY = {
    "id": "app-assistente-hub",
    "title": "Assistente do HUB",
    "description": "Consulta direta de salas, horários, professores, setores e documentos do IFBA.",
    "url": "apps/assistente/",
    "category": "Assistente",
    "openMode": "new-tab",
    "emoji": "🤖",
    "icon": "🤖",
    "tags": ["assistente", "chat", "horários", "salas", "professores", "documentos", "IFBA"],
}

CATALOG_ENTRY = {
    "id": "assistente",
    "title": "Assistente do HUB",
    "url": "apps/assistente/",
    "internalVersion": APP_VERSION,
    "sourceFiles": [],
    "status": "uses-independent-assistant-api",
    "reviewedAt": "2026-08-06",
    "emoji": "🤖",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def load_hub_data(path: Path) -> dict[str, Any]:
    text = read(path).strip()
    if not text.startswith(DATA_PREFIX) or not text.endswith(";"):
        fail("data.js não possui o formato determinístico esperado.")
    data = json.loads(text[len(DATA_PREFIX):-1])
    if not isinstance(data, dict):
        fail("window.HUB_DATA precisa ser um objeto JSON.")
    return data


def save_hub_data(path: Path, data: dict[str, Any]) -> None:
    write(path, DATA_PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")


def update_data_and_registry() -> None:
    path = ROOT / "data.js"
    data = load_hub_data(path)
    apps = [item for item in (data.get("apps") or []) if isinstance(item, dict)]
    apps = [item for item in apps if item.get("id") != APP_ENTRY["id"] and item.get("title") != APP_ENTRY["title"] and item.get("url") != APP_ENTRY["url"]]
    data["apps"] = [APP_ENTRY, *apps]
    save_hub_data(path, data)

    useful = [item for item in (data.get("usefulLinks") or data.get("links") or []) if isinstance(item, dict)]
    external: list[dict[str, Any]] = []
    for item in useful:
        title = str(item.get("title") or item.get("name") or "")
        if title.casefold() in {"portal", "portal ifba", "suap"} or "suap" in title.casefold():
            external.append(item)
    registry = {
        "schemaVersion": 1,
        "generatedBy": "hub-assistente-v1.5.0",
        "apps": data["apps"],
        "links": useful,
        "externalLinks": external,
    }
    write(ROOT / "sidebar" / "apps-registry.json", json.dumps(registry, ensure_ascii=False, indent=2) + "\n")


def update_catalog() -> None:
    path = ROOT / "apps" / "catalog.json"
    if not path.is_file():
        return
    data = json.loads(read(path))
    apps = [item for item in (data.get("apps") or []) if isinstance(item, dict)]
    apps = [item for item in apps if item.get("id") != CATALOG_ENTRY["id"] and item.get("title") != CATALOG_ENTRY["title"]]
    data["apps"] = [CATALOG_ENTRY, *apps]
    data["updatedAt"] = "2026-08-06"
    write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def insert_once(text: str, marker: str, insertion: str, before: str) -> str:
    if marker in text:
        return text
    index = text.find(before)
    if index < 0:
        fail(f"Marcador de inserção não encontrado: {before}")
    return text[:index] + insertion + text[index:]


def install_home_shell() -> None:
    path = ROOT / "index.html"
    text = read(path)
    if 'id="hubSidebarMount"' not in text:
        start = text.find('  <header class="mobile-topbar">')
        end = text.find('  <main id="mainContent"')
        if start < 0 or end < 0 or end <= start:
            fail("Não foi possível localizar a sidebar original da página inicial.")
        text = text[:start] + '  <div id="hubSidebarMount"></div>\n\n' + text[end:]
    text = insert_once(text, 'href="sidebar/sidebar.css"', '  <link rel="stylesheet" href="sidebar/sidebar.css" />\n', "</head>")

    # A sidebar compartilhada deve carregar depois do runtime principal da página
    # e antes do complemento de busca rápida. Assim, o runtime legado pode concluir
    # sua inicialização sem disputar os mesmos elementos, e o componente canônico
    # substitui o shell antigo ao final. A normalização é por linhas, sem regex.
    lines = [line for line in text.splitlines(keepends=True) if 'src="sidebar/sidebar.js' not in line]
    text = "".join(lines)
    script = '  <script src="sidebar/sidebar.js"></script>\n'
    anchors = (
        '<script src="js/sidebar-quick-search.js',
        '<script src="./js/sidebar-quick-search.js',
        '<script defer src="js/sidebar-quick-search.js',
        '<script defer src="./js/sidebar-quick-search.js',
        '</body>',
    )
    for before in anchors:
        index = text.find(before)
        if index >= 0:
            text = text[:index] + script + text[index:]
            break
    else:
        fail("Não foi possível localizar um ponto seguro para inserir sidebar/sidebar.js na página inicial.")
    write(path, text)

def patch_home_runtime() -> None:
    # Não alteramos mais a sequência interna do app.js. Versões anteriores do HUB
    # organizam boot/setup de formas diferentes, e exigir uma sequência textual
    # específica tornou a instalação frágil. A sidebar canônica é carregada depois
    # do runtime principal e remove o shell legado de maneira autônoma.
    path = ROOT / "app.js"
    if not path.is_file():
        return
    text = read(path)
    # Mantém a prioridade do emoji explícito quando a função ainda existe.
    function_marker = 'function emojiForResource(resource = {}, type = "link") {'
    explicit = '  const explicitEmoji = resource.emoji || resource.icon || resource.app?.emoji || resource.app?.icon || "";\n  if (explicitEmoji) return explicitEmoji;'
    if function_marker in text and explicit not in text:
        text = text.replace(function_marker, function_marker + "\n" + explicit, 1)
    write(path, text)

def patch_app_html(path: Path) -> None:
    text = read(path)
    lines = []
    for line in text.splitlines(keepends=True):
        if "app-shell.css" in line or "app-shell.js" in line:
            continue
        if "sidebar/sidebar.css" in line or "sidebar/sidebar.js" in line:
            continue
        lines.append(line)
    text = "".join(lines)
    text = insert_once(text, 'href="../../sidebar/sidebar.css"', '  <link rel="stylesheet" href="../../sidebar/sidebar.css" />\n', "</head>")
    script = '  <script src="../../sidebar/sidebar.js"></script>\n'
    quick = '<script src="../../js/sidebar-quick-search.js'
    if quick in text:
        text = insert_once(text, 'src="../../sidebar/sidebar.js"', script, quick)
    else:
        text = insert_once(text, 'src="../../sidebar/sidebar.js"', script, "</body>")
    write(path, text)


def patch_all_apps() -> None:
    for path in sorted((ROOT / "apps").glob("*/index.html")):
        patch_app_html(path)
    for obsolete in (ROOT / "apps" / "app-shell.js", ROOT / "apps" / "app-shell.css"):
        obsolete.unlink(missing_ok=True)


def update_service_worker() -> None:
    script = ROOT / "scripts" / "sync_assistente_offline_cache.py"
    if not script.is_file():
        fail("Sincronizador do cache offline não foi instalado.")
    subprocess.run([sys.executable, str(script), str(ROOT)], check=True)



def patch_site_validator() -> None:
    path = ROOT / "scripts" / "validate_site.py"
    if not path.is_file():
        return
    text = read(path)
    old = 'if "reportIssueButton" not in index_text:\n    errors.append("Botão de reportar problema ausente da página principal")'
    new = 'shared_sidebar = (ROOT / "sidebar/sidebar.js")\nif "reportIssueButton" not in index_text and (not shared_sidebar.is_file() or "reportIssueButton" not in shared_sidebar.read_text(encoding="utf-8")):\n    errors.append("Botão de reportar problema ausente da sidebar compartilhada")'
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        fail("Validador do HUB possui uma regra de reporte não reconhecida.")
    write(path, text)

def sync_version(old_version: str) -> None:
    if old_version == TARGET_VERSION:
        return
    allowed = {".html", ".js", ".css", ".json", ".md"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.casefold() not in allowed or ".git" in path.parts or "documents" in path.parts:
            continue
        try:
            text = read(path)
        except UnicodeDecodeError:
            continue
        updated = text.replace(old_version, TARGET_VERSION)
        if updated != text:
            write(path, updated)


def install_scripts() -> None:
    target = ROOT / "scripts"
    target.mkdir(parents=True, exist_ok=True)
    for name in (
        "sync_assistente_offline_cache.py",
        "patch_github_pages_workflow.py",
        "enrich_document_metadata.py",
        "generate_assistente_offline_catalog.py",
        "test_assistente_web.py",
        "test_frontend_modules.js",
        "install_assistente_web.py",
        "patch_build_production_assets.py",
        "normalize_document_manifests.py",
        "verify_document_generation.py",
        "build_and_validate_hub.py",
    ):
        source = PATCH / "scripts" / name
        shutil.copy2(source, target / name)
        (target / name).chmod(0o755)
    subprocess.run([sys.executable, str(target / "patch_github_pages_workflow.py"), str(ROOT)], check=True)


def main() -> None:
    if not (ROOT / "data.js").is_file() or not (ROOT / "apps").is_dir():
        fail("Execute este script na raiz do HUB Arquivos IFBA.")
    old_version = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").is_file() else ""

    assistant_source = PATCH / "apps" / "assistente"
    assistant_target = ROOT / "apps" / "assistente"
    if assistant_target.exists():
        shutil.rmtree(assistant_target)
    shutil.copytree(assistant_source, assistant_target)

    sidebar_target = ROOT / "sidebar"
    if sidebar_target.exists():
        shutil.rmtree(sidebar_target)
    shutil.copytree(PATCH / "sidebar", sidebar_target)

    install_scripts()
    override_example = PATCH / "document-metadata.overrides.example.json"
    override_target = ROOT / "documents" / "document-metadata.overrides.example.json"
    if override_example.is_file() and not override_target.exists():
        shutil.copy2(override_example, override_target)
    update_data_and_registry()
    update_catalog()
    install_home_shell()
    patch_home_runtime()
    patch_all_apps()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "patch_build_production_assets.py"), str(ROOT)], check=True)
    patch_site_validator()
    update_service_worker()
    sync_version(old_version)
    write(ROOT / "VERSION", TARGET_VERSION + "\n")

    subprocess.run([sys.executable, str(ROOT / "scripts" / "enrich_document_metadata.py"), str(ROOT)], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_assistente_offline_catalog.py"), str(ROOT)], check=True)
    update_service_worker()
    print(f"Assistente v{APP_VERSION} integrado deterministicamente. HUB v{TARGET_VERSION}.")

if __name__ == "__main__":
    main()
