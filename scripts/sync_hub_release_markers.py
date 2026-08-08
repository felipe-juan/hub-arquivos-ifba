#!/usr/bin/env python3
"""Sincroniza somente os marcadores canônicos de versão do HUB.

Não faz substituição global. Os únicos alvos são VERSION, a constante VERSION do
service worker, o marcador exibido no index/rodapé, o monitor de desempenho e a
seção ``## Versão atual`` do README.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

SEMVER = re.compile(r"(?<!\d)(v?)(\d+\.\d+\.\d+)(?!\d)")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_if_changed(path: Path, text: str) -> bool:
    old = read(path) if path.is_file() else ""
    if old == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def replace_old_version(text: str, old: str, target: str) -> tuple[str, int]:
    if not old or old == target:
        return text, 0
    patterns = (f"v{old}", old)
    count = 0
    for needle in patterns:
        replacement = f"v{target}" if needle.startswith("v") else target
        occurrences = text.count(needle)
        if occurrences:
            text = text.replace(needle, replacement)
            count += occurrences
    return text, count


def sync_first_semver(text: str, target: str) -> tuple[str, int]:
    """Sincroniza o primeiro semver de um contexto já identificado como canônico.

    O retorno indica que o marcador foi encontrado, mesmo quando já continha a
    versão alvo. Isso torna a operação idempotente e evita depender de VERSION
    estar previamente sincronizado com o HTML.
    """
    match = SEMVER.search(text)
    if not match:
        return text, 0
    replacement = f"{match.group(1)}{target}"
    updated = text[:match.start()] + replacement + text[match.end():]
    return updated, 1


def sync_service_worker(path: Path, target: str) -> int:
    if not path.is_file():
        return 0
    text = read(path)
    pattern = re.compile(r'(?m)^(\s*const\s+VERSION\s*=\s*["\']hub-ifba-v)(\d+\.\d+\.\d+)(["\']\s*;?)')
    updated, count = pattern.subn(lambda m: f"{m.group(1)}{target}{m.group(3)}", text, count=1)
    if count != 1:
        raise SystemExit("Marcador canônico VERSION não encontrado no service-worker.js.")
    write_if_changed(path, updated)
    return count


def sync_index(path: Path, old: str, target: str) -> int:
    if not path.is_file():
        return 0
    lines = read(path).splitlines(keepends=True)
    matched = 0
    output = []
    marker = re.compile(r"(?:vers[aã]o|version|footer|rodap[eé]|app-version|hub-version|build-version)", re.I)
    for line in lines:
        if marker.search(line):
            # O contexto da linha já identifica um marcador de versão. Trocar o
            # semver encontrado é mais correto que exigir que ele coincida com
            # VERSION, pois justamente estamos reparando possíveis divergências.
            line, found = sync_first_semver(line, target)
            matched += found
        output.append(line)

    text = "".join(output)
    if not matched:
        # Em HTML formatado em várias linhas, o número pode estar separado da
        # tag <footer>. A página atual possui também footers internos (por
        # exemplo, o da paleta de comandos), portanto não podemos parar no
        # primeiro <footer> encontrado. Percorremos os blocos em ordem e
        # sincronizamos somente o primeiro footer que realmente contém semver.
        footer = re.compile(r"(?is)(<footer\b.*?</footer>)")
        for match in footer.finditer(text):
            block, found = sync_first_semver(match.group(1), target)
            if not found:
                continue
            text = text[:match.start()] + block + text[match.end():]
            matched += found
            break

    if matched:
        write_if_changed(path, text)
    return matched


def sync_performance(root: Path, old: str, target: str) -> int:
    """Sincroniza o marcador que o validador canônico lê no monitor.

    O HUB atual não declara uma constante ``PERFORMANCE_MONITOR_VERSION``.
    O marcador real fica em ``js/performance-monitor.js`` como a propriedade
    ``version: "x.y.z"`` dentro do objeto de métricas. Por isso, o arquivo
    canônico recebe tratamento explícito antes dos fallbacks legados.
    """
    canonical = root / "js" / "performance-monitor.js"
    property_pattern = re.compile(
        r'(?m)^(\s*version\s*:\s*["\'])(\d+\.\d+\.\d+)(["\']\s*,?)'
    )

    if canonical.is_file():
        text = read(canonical)
        updated, count = property_pattern.subn(
            lambda m: f"{m.group(1)}{target}{m.group(3)}", text, count=1
        )
        if count == 1:
            write_if_changed(canonical, updated)
            return 1

        # Compatibilidade com releases intermediárias que usaram constante
        # nomeada no mesmo arquivo canônico.
        named = re.compile(
            r'(?im)^(\s*(?:const|let|var)\s+[A-Z0-9_]*(?:PERFORMANCE|MONITOR)[A-Z0-9_]*VERSION[A-Z0-9_]*\s*=\s*["\'])'
            r'(\d+\.\d+\.\d+)(["\']\s*;?)'
        )
        updated, count = named.subn(
            lambda m: f"{m.group(1)}{target}{m.group(3)}", text, count=1
        )
        if count == 1:
            write_if_changed(canonical, updated)
            return 1

        return 0

    # Fallback para layouts antigos em que o monitor tinha outro nome. Só
    # arquivos cujo próprio nome indica performance/monitoramento são tocados.
    matched = 0
    candidates = sorted({
        *root.glob("js/*performance*.js"),
        *root.glob("js/**/*performance*.js"),
        *root.glob("js/*monitor*.js"),
        *root.glob("js/**/*monitor*.js"),
        *root.glob("*performance*.js"),
        *root.glob("*monitor*.js"),
    })
    semantic = re.compile(r"(?i)(?:performance.*version|version.*performance|monitor.*version|version.*monitor)")
    for path in candidates:
        if not path.is_file():
            continue
        text = read(path)

        updated, count = property_pattern.subn(
            lambda m: f"{m.group(1)}{target}{m.group(3)}", text, count=1
        )
        if count == 1:
            write_if_changed(path, updated)
            matched += 1
            continue

        lines = text.splitlines(keepends=True)
        output = []
        file_matched = 0
        for line in lines:
            if semantic.search(line):
                line, found = sync_first_semver(line, target)
                file_matched += found
            output.append(line)
        if not file_matched:
            generic_version = re.compile(r"(?i)\b(?:const|let|var)\s+[A-Z0-9_]*VERSION[A-Z0-9_]*\s*=")
            output2 = []
            for line in output:
                if not file_matched and generic_version.search(line):
                    line, found = sync_first_semver(line, target)
                    file_matched += found
                output2.append(line)
            output = output2
        if file_matched:
            write_if_changed(path, "".join(output))
            matched += file_matched
    return matched


def sync_readme(path: Path, target: str) -> int:
    if not path.is_file():
        return 0
    text = read(path)
    section = re.compile(r"(?ims)(^##\s+Vers[aã]o\s+atual\s*$)(.*?)(?=^##\s|\Z)")
    match = section.search(text)
    if not match:
        raise SystemExit("Seção '## Versão atual' não encontrada no README.md.")
    body = match.group(2)
    replaced, count = SEMVER.subn(lambda m: f"{m.group(1)}{target}", body, count=1)
    if not count:
        # Mantém o título e insere explicitamente a versão atual quando a seção
        # existe mas ainda não contém um número.
        replaced = f"\n\nv{target}\n" + body.lstrip("\n")
        count = 1
    updated = text[:match.start(2)] + replaced + text[match.end(2):]
    write_if_changed(path, updated)
    return count


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("Uso: sync_hub_release_markers.py <raiz-hub> <versao-alvo>")
    root = Path(sys.argv[1]).resolve()
    target = str(sys.argv[2]).strip().lstrip("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", target):
        raise SystemExit(f"Versão alvo inválida: {target}")
    version_file = root / "VERSION"
    old = read(version_file).strip().lstrip("v") if version_file.is_file() else ""

    sw = sync_service_worker(root / "service-worker.js", target)
    footer = sync_index(root / "index.html", old, target)
    perf = sync_performance(root, old, target)
    readme = sync_readme(root / "README.md", target)
    version_file.write_text(target + "\n", encoding="utf-8")

    if sw != 1:
        raise SystemExit("Service worker não foi sincronizado.")
    if footer < 1:
        raise SystemExit("Marcador de versão exibida no index/rodapé não foi sincronizado.")
    if perf < 1:
        raise SystemExit("Marcador do monitor de desempenho não foi sincronizado.")
    if readme < 1:
        raise SystemExit("Versão atual do README não foi sincronizada.")
    print(f"Marcadores canônicos do HUB sincronizados: {old or '?'} -> {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
