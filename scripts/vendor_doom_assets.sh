#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/apps/doom"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

JS_DOS_VERSION="8.4.1"
EMULATORS_VERSION="8.4.0"
BUNDLE_URL="https://v8.js-dos.com/bundles/doom.jsdos"

command -v npm >/dev/null 2>&1 || { echo "Erro: npm não encontrado." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Erro: curl não encontrado." >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "Erro: tar não encontrado." >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "Erro: unzip não encontrado." >&2; exit 1; }

mkdir -p "$TARGET/vendor/js-dos" "$TARGET/vendor/emulators" "$TARGET/game"
rm -rf "$TARGET/vendor/js-dos"/* "$TARGET/vendor/emulators"/*

printf 'Baixando js-dos %s...\n' "$JS_DOS_VERSION"
JS_TGZ="$(npm pack --silent --pack-destination "$TMP" "js-dos@$JS_DOS_VERSION")"
printf 'Baixando emulators %s...\n' "$EMULATORS_VERSION"
EMU_TGZ="$(npm pack --silent --pack-destination "$TMP" "emulators@$EMULATORS_VERSION")"

mkdir -p "$TMP/js" "$TMP/emulators"
tar -xzf "$TMP/$JS_TGZ" -C "$TMP/js"
tar -xzf "$TMP/$EMU_TGZ" -C "$TMP/emulators"

JS_DIST="$(find "$TMP/js/package" -type f -name 'js-dos.js' -printf '%h\n' | head -n 1)"
EMU_DIST="$(find "$TMP/emulators/package" -type f -name 'emulators.js' -printf '%h\n' | head -n 1)"

[[ -n "$JS_DIST" && -f "$JS_DIST/js-dos.js" ]] || { echo "Erro: js-dos.js não encontrado no pacote." >&2; exit 1; }
[[ -n "$EMU_DIST" && -f "$EMU_DIST/emulators.js" ]] || { echo "Erro: emulators.js não encontrado no pacote." >&2; exit 1; }

cp -a "$JS_DIST"/. "$TARGET/vendor/js-dos/"
cp -a "$EMU_DIST"/. "$TARGET/vendor/emulators/"
for license in "$TMP/js/package/LICENSE"* "$TMP/emulators/package/LICENSE"*; do
  [[ -f "$license" ]] && cp "$license" "$TARGET/vendor/$(basename "$(dirname "$license")")-$(basename "$license")"
done

printf 'Baixando o bundle público do DOOM clássico...\n'
curl -fL --retry 4 --retry-delay 2 --connect-timeout 20 \
  "$BUNDLE_URL" -o "$TARGET/game/doom.jsdos"

unzip -t "$TARGET/game/doom.jsdos" >/dev/null
unzip -Z1 "$TARGET/game/doom.jsdos" | grep -qx '.jsdos/dosbox.conf' || {
  echo "Erro: bundle sem .jsdos/dosbox.conf." >&2
  exit 1
}

cat > "$TARGET/vendor/ASSET_VERSIONS.txt" <<VERSIONS
js-dos=$JS_DOS_VERSION
emulators=$EMULATORS_VERSION
bundle=$BUNDLE_URL
fetched_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSIONS

printf '\nAssets locais instalados em apps/doom/.\n'
du -sh "$TARGET/vendor" "$TARGET/game/doom.jsdos"
printf '\nAntes de publicar o bundle do jogo, confira os termos de redistribuição aplicáveis.\n'
