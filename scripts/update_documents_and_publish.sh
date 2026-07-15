#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 scripts/update_content.py --json-report
git add -A
git commit -m "Update document manifest" || true
git push
