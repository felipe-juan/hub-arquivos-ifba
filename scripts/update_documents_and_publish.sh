#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 scripts/generate_documents_manifest.py
python3 scripts/check_index_status.py
git add -A
git commit -m "Update document manifest" || true
git push
