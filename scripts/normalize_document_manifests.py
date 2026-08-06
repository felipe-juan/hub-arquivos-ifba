#!/usr/bin/env python3
"""Canonicaliza os manifestos documentais para builds reprodutíveis.

Campos de horário de geração não fazem parte do conteúdo publicado e são
removidos. Objetos JSON são serializados com chaves ordenadas e newline final.
A mesma rotina é usada no Fedora e no GitHub Actions.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

VOLATILE_KEYS = {
    "generatedAt", "generated_at", "generatedOn", "generated_on",
    "buildTimestamp", "build_timestamp", "builtAt", "built_at",
    "generationTime", "generation_time",
}
TARGETS = (
    "documents/manifest.json",
    "documents/manifest-summary.json",
    "documents/search-index.json",
)


def canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: canonical(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
            if str(key) not in VOLATILE_KEYS
        }
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def normalize_file(path: Path) -> bool:
    if not path.is_file():
        return False
    original = path.read_text(encoding="utf-8")
    data = json.loads(original)
    rendered = json.dumps(canonical(data), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if rendered == original:
        return False
    path.write_text(rendered, encoding="utf-8")
    return True


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    changed = []
    for relative in TARGETS:
        path = root / relative
        if normalize_file(path):
            changed.append(relative)
    print("Manifestos documentais canonicalizados: " + (", ".join(changed) if changed else "sem alterações"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
