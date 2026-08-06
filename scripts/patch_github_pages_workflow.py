#!/usr/bin/env python3
"""Instala um workflow único e determinístico para o GitHub Pages.

Fluxos antigos de Pages são retirados de .github/workflows para impedir
publicações concorrentes. O workflow de validação comum é preservado.
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
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  build:
    name: Build deterministic Pages artifact
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Build and validate through the canonical pipeline
        shell: bash
        run: |
          set -Eeuo pipefail
          python3 scripts/build_and_validate_hub.py .
          node --check service-worker.js
          for file in apps/assistente/*.js sidebar/sidebar.js; do node --check "$file"; done
          python3 scripts/test_assistente_web.py .

      - name: Verify deterministic build
        shell: bash
        run: |
          set -Eeuo pipefail
          git diff --exit-code
          STATUS="$(git status --porcelain=v1 --untracked-files=all)"
          if [[ -n "$STATUS" ]]; then
            printf '%s\n' "$STATUS"
            echo "The production build generated uncommitted files." >&2
            exit 1
          fi

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: .

  deploy:
    name: Deploy to GitHub Pages
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
        with:
          timeout: 1200000
          error_count: 30
          reporting_interval: 10000
'''


def is_pages_workflow(text: str) -> bool:
    lowered = text.lower()
    markers = (
        "actions/deploy-pages@",
        "actions/upload-pages-artifact@",
        "actions/configure-pages@",
        "environment:\n      name: github-pages",
        "environment:\r\n      name: github-pages",
    )
    return any(marker in lowered for marker in markers)


def unique_destination(name: str) -> Path:
    DISABLED.mkdir(parents=True, exist_ok=True)
    candidate = DISABLED / f"{name}.disabled-v1.5.0"
    index = 2
    while candidate.exists():
        candidate = DISABLED / f"{name}.disabled-v1.5.0-{index}"
        index += 1
    return candidate


def main() -> None:
    if not (ROOT / "VERSION").exists():
        raise SystemExit("Execute na raiz do HUB Arquivos IFBA.")
    WORKFLOWS.mkdir(parents=True, exist_ok=True)

    disabled: list[str] = []
    for path in sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")]):
        if path == CANONICAL:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if not is_pages_workflow(text):
            continue
        destination = unique_destination(path.name)
        shutil.move(str(path), str(destination))
        disabled.append(path.name)

    CANONICAL.write_text(WORKFLOW, encoding="utf-8")
    print("Workflow canônico do GitHub Pages instalado: .github/workflows/pages.yml")
    if disabled:
        print("Workflows antigos de Pages desativados: " + ", ".join(disabled))
    else:
        print("Nenhum workflow duplicado de Pages permaneceu ativo.")


if __name__ == "__main__":
    main()
