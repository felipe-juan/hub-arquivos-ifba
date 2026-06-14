#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 scripts/generate_documents_manifest.py
git add documents scripts README.md app.js data.js index.html styles.css
git commit -m "Update document manifest" || true
git push
