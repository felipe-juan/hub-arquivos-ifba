#!/usr/bin/env python3
"""Executa o gerador documental duas vezes e exige saída idêntica."""
from __future__ import annotations

import hashlib
import subprocess
import sys
import time
from pathlib import Path

TRACKED = (
    "documents/manifest.json",
    "documents/manifest-summary.json",
    "documents/search-index.json",
    "documents/manifest.csv",
    "documents/_manifest_reports/ignored-files.csv",
    "documents/_manifest_reports/duplicates-ignored.csv",
)


def run(root: Path) -> None:
    subprocess.run([sys.executable, "scripts/generate_documents_manifest.py"], cwd=root, check=True)
    subprocess.run([sys.executable, "scripts/normalize_document_manifests.py", str(root)], cwd=root, check=True)


def digest(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for relative in TRACKED:
        path = root / relative
        if path.is_file():
            result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    run(root)
    first = digest(root)
    time.sleep(2)
    run(root)
    second = digest(root)
    if first != second:
        changed = sorted(set(first) | set(second))
        details = [name for name in changed if first.get(name) != second.get(name)]
        raise SystemExit("Geração documental não determinística: " + ", ".join(details))
    print("Geração documental determinística em duas execuções: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
