#!/usr/bin/env python3
"""Executa o build canônico, reprodutível e validado do HUB.

Fedora e GitHub Actions chamam exatamente este arquivo. A geração documental é
executada duas vezes, com intervalo real, e precisa produzir bytes idênticos.
"""
from __future__ import annotations

import argparse
import os
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

    # Python é ferramenta de build: bytecode/cache local não pertence ao site
    # publicado nem pode sujar a árvore verificada pelo pipeline determinístico.
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True

    # Todos os geradores que precisem de uma data recebem a data estável do
    # commit, nunca o relógio da máquina que executa o build.
    if not os.environ.get("SOURCE_DATE_EPOCH"):
        try:
            epoch = subprocess.check_output(
                ["git", "log", "-1", "--format=%ct"],
                cwd=root, text=True, stderr=subprocess.DEVNULL
            ).strip()
        except (OSError, subprocess.CalledProcessError):
            epoch = "1785974400"  # 2026-08-06T00:00:00Z, fallback da release.
        os.environ["SOURCE_DATE_EPOCH"] = epoch
    print(f"SOURCE_DATE_EPOCH={os.environ['SOURCE_DATE_EPOCH']}", flush=True)

    run(root, "scripts/patch_build_production_assets.py", str(root), optional=False)
    run(root, "scripts/check_doom_runtime.py")
    if not args.skip_manifest:
        run(root, "scripts/verify_document_generation.py", str(root), optional=False)
    run(root, "scripts/build_production_assets.py")
    run(root, "scripts/normalize_document_manifests.py", str(root), optional=False)
    run(root, "scripts/sync_assistente_offline_cache.py", str(root), optional=False)
    run(root, "scripts/verify_assistente_offline_catalog.py", str(root), optional=False)
    run(root, "scripts/check_index_status.py")
    run(root, "scripts/validate_site.py", optional=False)
    if not args.skip_inline:
        run(root, "scripts/check_inline_scripts.py")
    print("\nBuild canônico e determinístico do HUB concluído e validado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
