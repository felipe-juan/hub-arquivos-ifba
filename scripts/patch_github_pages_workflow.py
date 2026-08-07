#!/usr/bin/env python3
"""Instala um workflow mínimo do GitHub Pages.

O build e os testes acontecem no Fedora antes do commit. O Actions só transporta
os arquivos já validados para o GitHub Pages: checkout -> upload -> deploy.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
WORKFLOWS = ROOT / ".github" / "workflows"
DISABLED = ROOT / ".github" / "workflows-disabled"
CANONICAL = WORKFLOWS / "pages.yml"

WORKFLOW = r'''name: Deploy HUB to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  deploy:
    name: Deploy prebuilt site
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout validated files
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload prebuilt site
        uses: actions/upload-pages-artifact@v4
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
'''


def is_pages_workflow(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in (
        "actions/deploy-pages@",
        "actions/upload-pages-artifact@",
        "actions/configure-pages@",
        "name: github-pages",
    ))


def main() -> None:
    if not (ROOT / "VERSION").exists():
        raise SystemExit("Execute na raiz do HUB Arquivos IFBA.")
    WORKFLOWS.mkdir(parents=True, exist_ok=True)
    DISABLED.mkdir(parents=True, exist_ok=True)

    for path in sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")]):
        if path == CANONICAL:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if not is_pages_workflow(text):
            continue
        destination = DISABLED / f"{path.name}.disabled-oneclick-v2"
        if destination.exists():
            destination.unlink()
        shutil.move(str(path), str(destination))

    CANONICAL.write_text(WORKFLOW, encoding="utf-8")
    print("Workflow mínimo do Pages instalado: checkout -> upload -> deploy")


if __name__ == "__main__":
    main()
