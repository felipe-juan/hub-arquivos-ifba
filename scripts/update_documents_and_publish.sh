#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 scripts/update_content.py --json-report
python3 scripts/check_performance_budget.py
python3 scripts/audit_css.py
python3 scripts/test_markup_safety.py
python3 scripts/test_production_asset_resolution.py
python3 scripts/test_host_verifier.py
node scripts/test_internal_navigation.cjs
node scripts/test_doom_mobile_controls.cjs
node scripts/test_links_columns.cjs
node scripts/test_search_engine.cjs
node scripts/test_runtime_regressions.cjs

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find . \
  -path './assets/build' -prune -o \
  -path './apps/build' -prune -o \
  -path './documents' -prune -o \
  -name '*.js' -print0)
python3 -m compileall -q scripts

VERSION="$(tr -d '\r\n' < VERSION)"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Release HUB Arquivos IFBA v${VERSION}"
else
  echo "Nenhuma alteração para commit."
fi
git push
