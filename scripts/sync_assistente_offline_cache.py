#!/usr/bin/env python3
"""Normaliza deterministicamente a lista CORE do service worker.

A rotina interpreta a matriz JavaScript de strings, em vez de remover linhas por
substrings. Isso permite corrigir referências compactadas, com ou sem ``./`` e
com query string, sem apagar outros arquivos que estejam na mesma linha.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
SW = ROOT / "service-worker.js"
RELEASE_FILE = ROOT / "scripts" / "hub-assistente-release.json"
if not RELEASE_FILE.is_file():
    raise SystemExit("Manifesto scripts/hub-assistente-release.json ausente.")
RELEASE_META = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))
APP_VERSION = str(RELEASE_META.get("assistant") or "").strip()
if not APP_VERSION:
    raise SystemExit("Versão do Assistente ausente no manifesto de release.")
ENTRIES = [
    "./apps/assistente/",
    f"./apps/assistente/index.html?v={APP_VERSION}",
    f"./apps/assistente/config.js?v={APP_VERSION}",
    f"./apps/assistente/app.css?v={APP_VERSION}",
    f"./apps/assistente/app.js?v={APP_VERSION}",
    f"./apps/assistente/offline-data.json?v={APP_VERSION}",
    f"./apps/assistente/offline-academic.json?v={APP_VERSION}",
    f"./apps/assistente/assets/calendario-academico-2026.png?v={APP_VERSION}",
    "./sidebar/sidebar.css",
    "./sidebar/sidebar.js",
    "./sidebar/hub-url-resolver.js",
    "./sidebar/hub-user-state.js",
    "./sidebar/hub-search.js",
    "./sidebar/hub-network.js",
    "./sidebar/hub-academic-search.json",
    "./sidebar/hub-registry.json",
    "./sidebar/apps-registry.json",
]


def normalized(ref: str) -> str:
    return ref.replace("\\", "/").removeprefix("./").split("?", 1)[0].split("#", 1)[0]


def is_managed_or_obsolete(ref: str) -> bool:
    path = normalized(ref)
    return (
        path in {"apps/app-shell.js", "apps/app-shell.css"}
        or path.startswith("apps/assistente/")
        or path.startswith("apps/onde-resolvo/")
        or path.startswith("apps/onde-resolvo-isso/")
        or path.startswith("apps/app-onde-resolvo/")
        or path.startswith("sidebar/")
    )


def find_core_array(text: str) -> tuple[int, int]:
    marker = "const CORE"
    start_marker = text.find(marker)
    if start_marker < 0:
        raise SystemExit("Lista CORE não encontrada no service-worker.js.")
    opening = text.find("[", start_marker)
    if opening < 0:
        raise SystemExit("Abertura da lista CORE não encontrada no service-worker.js.")

    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    i = opening
    while i < len(text):
        char = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if char == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            i += 1
            continue
        if char == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if char == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if char in {'"', "'", "`"}:
            quote = char
            i += 1
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return opening, i
        i += 1
    raise SystemExit("Fechamento da lista CORE não encontrado no service-worker.js.")


def decode_js_string(raw: str) -> str:
    quote = raw[0]
    if quote == '"':
        return json.loads(raw)
    if quote == "'":
        return ast.literal_eval(raw)
    raise SystemExit("Template string não é permitido na lista CORE.")


def parse_string_array(body: str) -> list[str]:
    values: list[str] = []
    i = 0
    while i < len(body):
        char = body[i]
        if char.isspace() or char == ",":
            i += 1
            continue
        if char == "/" and i + 1 < len(body) and body[i + 1] == "/":
            newline = body.find("\n", i + 2)
            i = len(body) if newline < 0 else newline + 1
            continue
        if char == "/" and i + 1 < len(body) and body[i + 1] == "*":
            close = body.find("*/", i + 2)
            if close < 0:
                raise SystemExit("Comentário não fechado na lista CORE.")
            i = close + 2
            continue
        if char not in {'"', "'"}:
            snippet = body[i:i + 40].splitlines()[0]
            raise SystemExit(f"A lista CORE contém expressão não suportada: {snippet!r}")
        quote = char
        start = i
        i += 1
        escaped = False
        while i < len(body):
            current = body[i]
            if escaped:
                escaped = False
            elif current == "\\":
                escaped = True
            elif current == quote:
                i += 1
                values.append(decode_js_string(body[start:i]))
                break
            i += 1
        else:
            raise SystemExit("String não fechada na lista CORE.")
    return values


def main() -> int:
    for entry in ENTRIES:
        if entry.endswith("/"):
            continue
        # Entradas versionadas usam query string apenas na chave HTTP/cache;
        # a existência deve ser verificada pelo caminho físico sem ?v=.
        if not (ROOT / normalized(entry)).is_file():
            raise SystemExit(f"Arquivo obrigatório do cache ausente: {entry}")
    if not SW.is_file():
        raise SystemExit("service-worker.js não encontrado.")

    text = SW.read_text(encoding="utf-8")
    opening, closing = find_core_array(text)
    existing = parse_string_array(text[opening + 1:closing])

    preserved: list[str] = []
    seen: set[str] = set()
    for ref in existing:
        if is_managed_or_obsolete(ref):
            continue
        key = normalized(ref)
        if key in seen:
            continue
        seen.add(key)
        preserved.append(ref)

    anchor = next(
        (index + 1 for index, ref in enumerate(preserved) if normalized(ref) == "apps/catalog.json"),
        min(1, len(preserved)),
    )
    final = preserved[:anchor] + ENTRIES + preserved[anchor:]
    rendered = "[\n" + "".join(f"  {json.dumps(ref, ensure_ascii=False)},\n" for ref in final) + "]"
    SW.write_text(text[:opening] + rendered + text[closing + 1:], encoding="utf-8")

    updated = SW.read_text(encoding="utf-8")
    new_opening, new_closing = find_core_array(updated)
    verified = parse_string_array(updated[new_opening + 1:new_closing])
    normalized_refs = [normalized(ref) for ref in verified]
    for entry in ENTRIES:
        if normalized(entry) not in normalized_refs:
            raise SystemExit(f"Referência ausente após sincronização: {entry}")
    leftovers = [
        ref for ref in verified
        if normalized(ref) in {"apps/app-shell.js", "apps/app-shell.css"}
        or normalized(ref).startswith(("apps/onde-resolvo/", "apps/onde-resolvo-isso/", "apps/app-onde-resolvo/"))
    ]
    if leftovers:
        raise SystemExit("Referência obsoleta ainda presente: " + ", ".join(leftovers))
    hashed = [ref for ref in verified if normalized(ref).startswith("apps/assistente/assets/build/")]
    if hashed:
        raise SystemExit("Referência hash instável do Assistente ainda presente: " + ", ".join(hashed))
    print("Cache offline do Assistente e da sidebar normalizado: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
