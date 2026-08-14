#!/usr/bin/env python3
"""Instala o Assistente no HUB por cópia determinística usando release.json.

Não usa substituições por expressão regular. Estruturas administradas são arquivos
completos ou blocos delimitados por marcadores de início/fim.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
PATCH = Path(__file__).resolve().parents[1]
def load_release_meta() -> dict[str, str]:
    candidates = (
        PATCH.parent / "release.json",
        ROOT / "scripts" / "hub-assistente-release.json",
    )
    for candidate in candidates:
        if candidate.is_file():
            data = json.loads(candidate.read_text(encoding="utf-8"))
            required = ("oneClick", "assistant", "hub")
            if all(str(data.get(key) or "").strip() for key in required):
                return {key: str(data[key]).strip() for key in required}
    raise SystemExit("release.json não encontrado ou incompleto.")


RELEASE_META = load_release_meta()
TARGET_VERSION = RELEASE_META["hub"]
APP_VERSION = RELEASE_META["assistant"]
DATA_PREFIX = "window.HUB_DATA = "

OBSOLETE_APP_IDS = {"app-onde-resolvo", "onde-resolvo", "onde-resolvo-isso"}
NORMALIZED_OBSOLETE_APP_IDS = {"app onde resolvo", "onde resolvo", "onde resolvo isso"}
GENERIC_APP_ICONS = {"", "💼", "🧰", "📦", "🗃️", "🗂️"}
FORCED_APP_EMOJI_RULES = (
    (("assistente", "chatbot", "bot do hub"), "🤖"),
    (("media final", "prova final", "calculadora", "calculo da media"), "🧮"),
    (("barema", "atividade complementar"), "🎓"),
    (("calendario",), "📅"),
    (("fluxograma", "matriz curricular"), "🗺️"),
    (("doom", "jogo"), "🎮"),
)
APP_EMOJI_RULES = (
    (("horario",), "🕒"),
    (("sala",), "🚪"),
    (("professor", "docente"), "👨‍🏫"),
    (("biblioteca",), "📚"),
    (("documento", "acervo", "arquivo", "leitor pdf"), "📄"),
    (("estagio",), "💼"),
    (("tcc", "trabalho de conclusao"), "📝"),
    (("setor", "contato"), "☎️"),
    (("mapa",), "🗺️"),
    (("acessibilidade",), "♿"),
    (("link",), "🔗"),
)
DEFAULT_EXTERNAL_LINKS = (
    {"id": "portal", "title": "Portal", "url": "https://portal.ifba.edu.br/conquista", "emoji": "🏫", "icon": "🏫"},
    {"id": "suap", "title": "SUAP", "url": "https://suap.ifba.edu.br", "emoji": "🔐", "icon": "🔐"},
)

OFFICIAL_SCHEDULE_LINK_ID = "link-quadro-horario-2026-2"
OFFICIAL_SCHEDULE_URL_2026_2 = "https://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y"
MANAGED_CONCEPT_ALIASES = {
    "liojes": ["liojes", "liojenes", "liogenes", "liorges", "lioges"],
    "materia": ["matéria", "materia", "matérias", "materias", "mteria", "mterias"],
    "contato": ["contato", "conato"],
    "barema": ["barema", "planilha do barema", "barema de atividades complementares"],
    "quadro de horarios": ["quadro de horários", "quadro de horario", "planilha de horários", "planilha com os horarios de aula", "horários de aula"],
}


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return " ".join("".join(char.lower() if char.isalnum() else " " for char in text).split())


def app_search_text(item: dict[str, Any]) -> str:
    return normalized(" ".join(str(item.get(key) or "") for key in ("id", "title", "name", "url", "category")))


def is_obsolete_app(item: dict[str, Any]) -> bool:
    identifier = normalized(item.get("id"))
    title = normalized(item.get("title") or item.get("name"))
    url = normalized(item.get("url"))
    return (
        str(item.get("id") or "").casefold() in OBSOLETE_APP_IDS
        or identifier in NORMALIZED_OBSOLETE_APP_IDS
        or title == "onde resolvo isso"
        or "onde resolvo" in title
        or "onde resolvo" in url
    )


def canonical_app_emoji(item: dict[str, Any]) -> str:
    search = app_search_text(item)
    for keywords, emoji in FORCED_APP_EMOJI_RULES:
        if any(keyword in search for keyword in keywords):
            return emoji
    explicit = str(item.get("emoji") or item.get("icon") or "").strip()
    if explicit not in GENERIC_APP_ICONS:
        return explicit
    for keywords, emoji in APP_EMOJI_RULES:
        if any(keyword in search for keyword in keywords):
            return emoji
    return "🧩"


def canonical_app_id(item: dict[str, Any]) -> str:
    """Normaliza IDs históricos dos apps públicos sem depender da release de origem."""
    search = app_search_text(item)
    url = normalized(item.get("url"))
    if "apps calendario" in url or "calendario" in search:
        return "calendario"
    if "apps barema" in url or "barema" in search or "atividade complementar" in search:
        return "barema"
    if "apps fluxograma" in url or "fluxograma" in search or "matriz curricular" in search:
        return "fluxogramas"
    if "media final" in search or "prova final" in search or "#media-final" in str(item.get("url") or ""):
        return "app-media-final"
    if "apps assistente" in url or "assistente do hub" in search:
        return "app-assistente-hub"
    return str(item.get("id") or "").strip()


def normalize_app(item: dict[str, Any]) -> dict[str, Any]:
    normalized_item = dict(item)
    canonical_id = canonical_app_id(normalized_item)
    if canonical_id:
        normalized_item["id"] = canonical_id
    emoji = canonical_app_emoji(normalized_item)
    normalized_item["emoji"] = emoji
    normalized_item["icon"] = emoji
    return normalized_item


def external_link_kind(item: dict[str, Any]) -> str:
    search = app_search_text(item)
    if "suap" in search:
        return "suap"
    if "portal ifba" in search or "portal do ifba" in search or "portal ifba edu br" in search:
        return "portal"
    return ""


def build_external_links(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retorna somente os dois atalhos institucionais fixos da base da sidebar.

    Os demais links úteis continuam em ``registry.links`` e não devem virar botões
    externos automaticamente. Isso evita poluir a área reservada a Portal e SUAP.
    """
    found: dict[str, dict[str, Any]] = {}
    for item in items:
        kind = external_link_kind(item)
        if kind and kind not in found:
            found[kind] = dict(item)
    result: list[dict[str, Any]] = []
    for default in DEFAULT_EXTERNAL_LINKS:
        kind = str(default["id"])
        merged = {**default, **found.get(kind, {})}
        merged["id"] = kind
        merged["emoji"] = default["emoji"]
        merged["icon"] = default["icon"]
        merged["title"] = default["title"]
        if not merged.get("url"):
            merged["url"] = default["url"]
        result.append(merged)
    return result

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


def apply_managed_link_overrides(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    updated: list[dict[str, Any]] = []
    schedule_found = False
    for original in items:
        item = dict(original)
        identifier = str(item.get("id") or "").strip()
        title = normalized(item.get("title") or item.get("name"))
        if identifier == OFFICIAL_SCHEDULE_LINK_ID or "quadro de horario" in title:
            item["id"] = identifier or OFFICIAL_SCHEDULE_LINK_ID
            item["url"] = OFFICIAL_SCHEDULE_URL_2026_2
            schedule_found = True
        updated.append(item)
    if not schedule_found:
        updated.append({
            "id": OFFICIAL_SCHEDULE_LINK_ID,
            "title": "Quadro de horários 2026.2",
            "description": "Planilha atual do quadro de horários de aulas.",
            "url": OFFICIAL_SCHEDULE_URL_2026_2,
        })
    return updated


def merge_managed_concept_aliases(data: dict[str, Any]) -> None:
    concept_map = data.get("conceptMap")
    if not isinstance(concept_map, dict):
        concept_map = {}
        data["conceptMap"] = concept_map
    for key, required in MANAGED_CONCEPT_ALIASES.items():
        current = concept_map.get(key, [])
        if isinstance(current, str):
            current = [current]
        elif not isinstance(current, list):
            current = []
        merged: list[str] = []
        seen: set[str] = set()
        for value in [*current, *required]:
            clean = str(value or "").strip()
            token = normalized(clean)
            if clean and token not in seen:
                seen.add(token)
                merged.append(clean)
        concept_map[key] = merged


def embed_sidebar_registry_fallback(registry: dict[str, Any]) -> None:
    path = ROOT / "sidebar" / "sidebar.js"
    text = read(path)
    start_marker = "    /* HUB REGISTRY FALLBACK START */"
    end_marker = "    /* HUB REGISTRY FALLBACK END */"
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker))
    if start < 0 or end < 0:
        fail("Marcadores do fallback canônico da sidebar não encontrados.")
    body = json.dumps(registry, ensure_ascii=False, indent=2)
    replacement = start_marker + "\n" + "\n".join("    " + line for line in body.splitlines()) + "\n" + end_marker
    write(path, text[:start] + replacement + text[end + len(end_marker):])


def update_data_and_registry(previous_registry: dict[str, Any] | None = None) -> None:
    path = ROOT / "data.js"
    data = load_hub_data(path)

    # Migração única: se o HUB já possuía um hub-registry canônico, ele vence
    # qualquer cópia derivada em data.js. Em instalações antigas sem registry,
    # importamos data.js uma vez e, a partir desta release, o registry passa a
    # ser a fonte de verdade das próximas atualizações.
    canonical = previous_registry if isinstance(previous_registry, dict) and previous_registry.get("sourceOfTruth") is True else None
    if canonical:
        source_apps = [item for item in (canonical.get("apps") or []) if isinstance(item, dict)]
        useful = [item for item in (canonical.get("links") or []) if isinstance(item, dict)]
        canonical_external = [item for item in (canonical.get("externalLinks") or []) if isinstance(item, dict)]
    else:
        source_apps = [item for item in (data.get("apps") or []) if isinstance(item, dict)]
        useful = [item for item in (data.get("usefulLinks") or data.get("links") or []) if isinstance(item, dict)]
        canonical_external = []

    apps = [
        normalize_app(item) for item in source_apps
        if not is_obsolete_app(item)
        and item.get("id") != APP_ENTRY["id"]
        and item.get("title") != APP_ENTRY["title"]
        and item.get("url") != APP_ENTRY["url"]
    ]
    apps = [normalize_app(APP_ENTRY), *apps]
    useful = apply_managed_link_overrides([item for item in useful if not is_obsolete_app(item)])
    merge_managed_concept_aliases(data)

    # Links institucionais obrigatórios continuam protegidos mesmo se uma versão
    # antiga do registry estiver incompleta. Mantemos metadados já canônicos e
    # completamos Portal/SUAP pelo normalizador central.
    external_by_id = {str(item.get("id") or ""): item for item in canonical_external if item.get("id")}
    for item in build_external_links(useful):
        external_by_id.setdefault(str(item.get("id") or ""), item)
    for item in build_external_links([]):
        external_by_id.setdefault(str(item.get("id") or ""), item)
    external = list(external_by_id.values())

    registry = {
        "schemaVersion": 2,
        "version": APP_VERSION,
        "hubVersion": TARGET_VERSION,
        "sourceOfTruth": True,
        "generatedBy": f"hub-assistente-v{APP_VERSION}",
        "apps": apps,
        "links": useful,
        "externalLinks": external,
    }
    serialized = json.dumps(registry, ensure_ascii=False, indent=2) + "\n"
    write(ROOT / "sidebar" / "hub-registry.json", serialized)
    # Espelho temporário somente para clientes/cache de versões antigas.
    write(ROOT / "sidebar" / "apps-registry.json", serialized)
    embed_sidebar_registry_fallback(registry)

    # Home é materializada a partir do registry, não o contrário.
    data["apps"] = registry["apps"]
    data["usefulLinks"] = registry["links"]
    if "links" in data:
        data["links"] = registry["links"]
    save_hub_data(path, data)


def update_catalog() -> None:
    path = ROOT / "apps" / "catalog.json"
    if not path.is_file():
        return
    data = json.loads(read(path))
    apps = [item for item in (data.get("apps") or []) if isinstance(item, dict)]
    apps = [normalize_app(item) for item in apps if not is_obsolete_app(item) and item.get("id") != CATALOG_ENTRY["id"] and item.get("title") != CATALOG_ENTRY["title"]]
    data["apps"] = [normalize_app(CATALOG_ENTRY), *apps]
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
    managed_scripts = (
        'src="sidebar/sidebar.js', 'src="sidebar/hub-url-resolver.js', 'src="sidebar/hub-user-state.js',
        'src="sidebar/hub-search.js', 'src="sidebar/hub-network.js', 'src="js/sidebar-quick-search.js',
        'src="./js/sidebar-quick-search.js',
    )
    managed_styles = ('href="css/sidebar-quick-search.css', 'href="./css/sidebar-quick-search.css')
    lines = [line for line in text.splitlines(keepends=True) if not any(marker in line for marker in (*managed_scripts, *managed_styles))]
    text = "".join(lines)
    script = ('  <script src="sidebar/hub-url-resolver.js"></script>\n'
              '  <script src="sidebar/hub-user-state.js"></script>\n'
              '  <script src="sidebar/sidebar.js"></script>\n'
              '  <script src="sidebar/hub-search.js"></script>\n'
              '  <script src="sidebar/hub-network.js"></script>\n')
    index = text.find('</body>')
    if index < 0:
        fail("Não foi possível localizar um ponto seguro para inserir a experiência global do HUB na página inicial.")
    text = text[:index] + script + text[index:]
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
    # Favoritos da home e do Assistente compartilham a mesma chave global.
    text = text.replace("hubFavoritesV1", "hubFavoritesV2")
    text = text.replace("hubAssistantFavoritesV1", "hubFavoritesV2")
    write(path, text)

def patch_app_html(path: Path) -> None:
    text = read(path)
    lines = []
    for line in text.splitlines(keepends=True):
        if "app-shell.css" in line or "app-shell.js" in line or "sidebar-quick-search.css" in line or "sidebar-quick-search.js" in line:
            continue
        if any(marker in line for marker in ("sidebar/sidebar.css", "sidebar/sidebar.js", "sidebar/hub-url-resolver.js", "sidebar/hub-user-state.js", "sidebar/hub-search.js", "sidebar/hub-network.js")):
            continue
        lines.append(line)
    text = "".join(lines)
    text = insert_once(text, 'href="../../sidebar/sidebar.css"', '  <link rel="stylesheet" href="../../sidebar/sidebar.css" />\n', "</head>")
    script = ('  <script src="../../sidebar/hub-url-resolver.js"></script>\n'
              '  <script src="../../sidebar/hub-user-state.js"></script>\n'
              '  <script src="../../sidebar/sidebar.js"></script>\n'
              '  <script src="../../sidebar/hub-search.js"></script>\n'
              '  <script src="../../sidebar/hub-network.js"></script>\n')
    text = insert_once(text, 'src="../../sidebar/hub-search.js"', script, "</body>")
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

def stamp_assistant_release(target: Path) -> None:
    replacements = {
        "__ASSISTANT_VERSION__": APP_VERSION,
        "__HUB_VERSION__": TARGET_VERSION,
    }
    for path in target.rglob("*"):
        if not path.is_file() or path.suffix.casefold() not in {".html", ".js", ".css", ".json", ".md"}:
            continue
        text = read(path)
        updated = text
        for token, value in replacements.items():
            updated = updated.replace(token, value)
        if updated != text:
            write(path, updated)
    leftovers = []
    for path in target.rglob("*"):
        if path.is_file() and path.suffix.casefold() in {".html", ".js", ".css", ".json", ".md"}:
            text = read(path)
            if "__ASSISTANT_VERSION__" in text or "__HUB_VERSION__" in text:
                leftovers.append(str(path))
    if leftovers:
        fail("Marcadores de release não resolvidos: " + ", ".join(leftovers))


def install_scripts() -> None:
    target = ROOT / "scripts"
    target.mkdir(parents=True, exist_ok=True)
    release_source = next((candidate for candidate in (
        PATCH.parent / "release.json",
        ROOT / "scripts" / "hub-assistente-release.json",
    ) if candidate.is_file()), None)
    if release_source is None:
        fail("release.json do pacote não encontrado.")
    destination_release = target / "hub-assistente-release.json"
    if release_source.resolve() != destination_release.resolve():
        shutil.copy2(release_source, destination_release)
    for name in (
        "sync_assistente_offline_cache.py",
        "sync_hub_release_markers.py",
        "patch_github_pages_workflow.py",
        "enrich_document_metadata.py",
        "generate_assistente_offline_catalog.py",
        "verify_assistente_offline_catalog.py",
        "e2e_browser_test.js",
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
    previous_registry = None
    previous_registry_path = ROOT / "sidebar" / "hub-registry.json"
    if previous_registry_path.is_file():
        try:
            candidate = json.loads(read(previous_registry_path))
            if isinstance(candidate, dict) and candidate.get("sourceOfTruth") is True:
                previous_registry = candidate
        except Exception:
            previous_registry = None

    assistant_source = PATCH / "apps" / "assistente"
    assistant_target = ROOT / "apps" / "assistente"
    if assistant_target.exists():
        shutil.rmtree(assistant_target)
    shutil.copytree(assistant_source, assistant_target)
    stamp_assistant_release(assistant_target)
    for obsolete_name in ("onde-resolvo", "onde-resolvo-isso", "app-onde-resolvo"):
        obsolete_path = ROOT / "apps" / obsolete_name
        if obsolete_path.exists():
            shutil.rmtree(obsolete_path)

    sidebar_target = ROOT / "sidebar"
    if sidebar_target.exists():
        shutil.rmtree(sidebar_target)
    shutil.copytree(PATCH / "sidebar", sidebar_target)
    stamp_assistant_release(sidebar_target)

    install_scripts()
    override_example = PATCH / "document-metadata.overrides.example.json"
    override_target = ROOT / "documents" / "document-metadata.overrides.example.json"
    if override_example.is_file() and not override_target.exists():
        shutil.copy2(override_example, override_target)
    update_data_and_registry(previous_registry)
    update_catalog()
    install_home_shell()
    patch_home_runtime()
    patch_all_apps()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "patch_build_production_assets.py"), str(ROOT)], check=True)
    patch_site_validator()
    update_service_worker()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "enrich_document_metadata.py"), str(ROOT)], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_assistente_offline_catalog.py"), str(ROOT)], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "verify_assistente_offline_catalog.py"), str(ROOT)], check=True)
    update_service_worker()
    # Sincronização deliberadamente restrita aos quatro marcadores que o
    # validador canônico do HUB compara com VERSION. Não existe replace global.
    subprocess.run([sys.executable, str(ROOT / "scripts" / "sync_hub_release_markers.py"), str(ROOT), TARGET_VERSION], check=True)
    print(f"Assistente v{APP_VERSION} integrado deterministicamente. HUB v{TARGET_VERSION}.")

if __name__ == "__main__":
    main()
