#!/usr/bin/env python3
"""Restaura referências estáveis do Assistente no cache offline após o build do HUB."""
from __future__ import annotations

import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
sw = root / "service-worker.js"
app = root / "apps" / "assistente"

required = [
    app / "index.html",
    app / "config.js",
    app / "app.css",
    app / "app.js",
    app / "offline-data.json",
]
missing = [str(path) for path in required if not path.is_file()]
if missing:
    raise SystemExit("Arquivos-fonte do Assistente ausentes: " + ", ".join(missing))
if not sw.is_file():
    raise SystemExit("service-worker.js não encontrado na raiz do HUB.")

# O build geral do HUB cria hashes para os assets principais. Para um app aninhado,
# algumas versões do build produziram uma referência em apps/assistente/assets/build
# sem produzir o arquivo correspondente. Os fontes do Assistente já são versionados
# junto com o cache global, portanto usar os caminhos estáveis é correto e idempotente.
entries = [
    "./apps/assistente/",
    "./apps/assistente/index.html",
    "./apps/assistente/config.js",
    "./apps/assistente/app.css",
    "./apps/assistente/app.js",
    "./apps/assistente/offline-data.json",
]

text = sw.read_text(encoding="utf-8")
match = re.search(r"(const\s+CORE\s*=\s*\[)(.*?)(\];)", text, re.S)
if not match:
    raise SystemExit("Lista CORE não encontrada no service-worker.js.")

prefix, body, suffix = match.groups()
# Remove toda referência anterior do Assistente, inclusive hashes obsoletos.
lines = [line for line in body.splitlines() if "./apps/assistente/" not in line]
anchor = '"./apps/catalog.json",'
output: list[str] = []
inserted = False
for line in lines:
    output.append(line)
    if anchor in line and not inserted:
        output.extend(f'  "{entry}",' for entry in entries)
        inserted = True
if not inserted:
    output = [*(f'  "{entry}",' for entry in entries), *output]

replacement = prefix + "\n".join(output) + "\n" + suffix
text = text[: match.start()] + replacement + text[match.end() :]
sw.write_text(text, encoding="utf-8")

# Verificação final: cada referência do Assistente no CORE deve existir de verdade.
updated = sw.read_text(encoding="utf-8")
refs = re.findall(r'"(\./apps/assistente/[^"?#]*)[?#]?[^"\n]*"', updated)
for ref in refs:
    if ref.endswith("/"):
        continue
    target = root / ref.removeprefix("./")
    if not target.is_file():
        raise SystemExit(f"Cache offline ainda aponta para arquivo ausente: {ref}")

hashed_refs = [ref for ref in refs if "/assets/build/" in ref]
if hashed_refs:
    raise SystemExit(f"Referências hash instáveis ainda presentes: {hashed_refs}")

print("Cache offline do Assistente restaurado para caminhos estáveis: OK")
