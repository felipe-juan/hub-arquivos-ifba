#!/usr/bin/env python3
"""Executa o build do HUB na ordem canônica e valida o resultado final.

A normalização do cache ocorre *depois* da geração dos assets e *antes* do
validador. Assim, referências transitórias criadas pelo build nunca chegam à
validação nem ao GitHub Pages.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(root: Path, relative: str, *args: str, optional: bool = True) -> None:
    script = root / relative
    if not script.is_file():
        if optional:
            return
        raise SystemExit(f"Script obrigatório ausente: {relative}")
    command = [sys.executable, relative, *args]
    print("\n$", " ".join(command), flush=True)
    subprocess.run(command, cwd=root, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--skip-inline", action="store_true")
    parser.add_argument("--skip-manifest", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if not (root / "service-worker.js").is_file():
        raise SystemExit("Execute na raiz do HUB Arquivos IFBA.")

    run(root, "scripts/patch_build_production_assets.py", str(root), optional=False)
    run(root, "scripts/check_doom_runtime.py")
    if not args.skip_manifest:
        run(root, "scripts/generate_documents_manifest.py")
    run(root, "scripts/build_production_assets.py")
    run(root, "scripts/sync_assistente_offline_cache.py", str(root), optional=False)
    run(root, "scripts/check_index_status.py")
    run(root, "scripts/validate_site.py", optional=False)
    if not args.skip_inline:
        run(root, "scripts/check_inline_scripts.py")
    print("\nBuild canônico do HUB concluído e validado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
