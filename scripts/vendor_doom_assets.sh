#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/apps/doom"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

JS_DOS_VERSION="8.4.1"
EMULATORS_VERSION="8.4.1"
BUNDLE_URLS=(
  "https://v8.js-dos.com/bundles/doom.jsdos"
)

for command in npm curl tar unzip sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Erro: $command não encontrado." >&2
    exit 1
  }
done

export npm_config_fetch_retries=5
export npm_config_fetch_retry_factor=2
export npm_config_fetch_retry_mintimeout=2000
export npm_config_fetch_retry_maxtimeout=20000
export npm_config_fetch_timeout=120000

printf 'Baixando js-dos %s pelo registro npm...\n' "$JS_DOS_VERSION"
JS_TGZ="$(npm pack --silent --pack-destination "$TMP" "js-dos@$JS_DOS_VERSION")"
printf 'Baixando emulators %s pelo registro npm...\n' "$EMULATORS_VERSION"
EMU_TGZ="$(npm pack --silent --pack-destination "$TMP" "emulators@$EMULATORS_VERSION")"

mkdir -p "$TMP/js" "$TMP/emulators" "$TMP/stage/vendor/js-dos" "$TMP/stage/vendor/emulators" "$TMP/stage/game"
tar -xzf "$TMP/$JS_TGZ" -C "$TMP/js"
tar -xzf "$TMP/$EMU_TGZ" -C "$TMP/emulators"

JS_DIST="$(find "$TMP/js/package" -type f -name 'js-dos.js' -printf '%h\n' | head -n 1)"
EMU_DIST="$(find "$TMP/emulators/package" -type f -name 'emulators.js' -printf '%h\n' | head -n 1)"

[[ -n "$JS_DIST" && -f "$JS_DIST/js-dos.js" && -f "$JS_DIST/js-dos.css" ]] || {
  echo "Erro: o pacote js-dos não contém js-dos.js e js-dos.css no mesmo diretório." >&2
  exit 1
}
[[ -n "$EMU_DIST" && -f "$EMU_DIST/emulators.js" ]] || {
  echo "Erro: emulators.js não foi encontrado no pacote emulators." >&2
  exit 1
}
find "$EMU_DIST" -maxdepth 1 -type f -name '*.wasm' -print -quit | grep -q . || {
  echo "Erro: nenhum WebAssembly foi encontrado no runtime emulators." >&2
  exit 1
}

cp -a "$JS_DIST"/. "$TMP/stage/vendor/js-dos/"
cp -a "$EMU_DIST"/. "$TMP/stage/vendor/emulators/"

bundle_ok=false
for bundle_url in "${BUNDLE_URLS[@]}"; do
  printf 'Baixando bundle do DOOM de %s...\n' "$bundle_url"
  if curl -fL --retry 6 --retry-all-errors --retry-delay 3 --connect-timeout 20 --max-time 300 \
      "$bundle_url" -o "$TMP/stage/game/doom.jsdos"; then
    if unzip -t "$TMP/stage/game/doom.jsdos" >/dev/null 2>&1 \
      && unzip -Z1 "$TMP/stage/game/doom.jsdos" | grep -qx '.jsdos/dosbox.conf'; then
      bundle_ok=true
      BUNDLE_URL="$bundle_url"
      break
    fi
  fi
done
$bundle_ok || {
  echo "Erro: não foi possível obter um bundle .jsdos válido do DOOM." >&2
  exit 1
}

JS_SHA="$(sha256sum "$TMP/stage/vendor/js-dos/js-dos.js" | awk '{print $1}')"
EMU_SHA="$(sha256sum "$TMP/stage/vendor/emulators/emulators.js" | awk '{print $1}')"
BUNDLE_SHA="$(sha256sum "$TMP/stage/game/doom.jsdos" | awk '{print $1}')"

cat > "$TMP/stage/vendor/ASSET_VERSIONS.txt" <<VERSIONS
js-dos=$JS_DOS_VERSION
emulators=$EMULATORS_VERSION
bundle=$BUNDLE_URL
js_dos_sha256=$JS_SHA
emulators_sha256=$EMU_SHA
bundle_sha256=$BUNDLE_SHA
fetched_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSIONS

cat > "$TMP/stage/vendor/runtime-manifest.json" <<MANIFEST
{
  "localAssets": true,
  "runtimeVersion": "$JS_DOS_VERSION",
  "jsDosVersion": "$JS_DOS_VERSION",
  "emulatorsVersion": "$EMULATORS_VERSION",
  "bundle": "game/doom.jsdos",
  "checksums": {
    "js-dos.js": "$JS_SHA",
    "emulators.js": "$EMU_SHA",
    "doom.jsdos": "$BUNDLE_SHA"
  }
}
MANIFEST

# Só substitui uma instalação anterior depois de todos os downloads e testes passarem.
rm -rf "$TARGET/vendor/js-dos" "$TARGET/vendor/emulators" "$TARGET/game"
mkdir -p "$TARGET/vendor" "$TARGET/game"
mv "$TMP/stage/vendor/js-dos" "$TARGET/vendor/js-dos"
mv "$TMP/stage/vendor/emulators" "$TARGET/vendor/emulators"
mv "$TMP/stage/vendor/ASSET_VERSIONS.txt" "$TARGET/vendor/ASSET_VERSIONS.txt"
mv "$TMP/stage/vendor/runtime-manifest.json" "$TARGET/vendor/runtime-manifest.json"
mv "$TMP/stage/game/doom.jsdos" "$TARGET/game/doom.jsdos"

printf '\nRuntime local instalado e validado.\n'
du -sh "$TARGET/vendor/js-dos" "$TARGET/vendor/emulators" "$TARGET/game/doom.jsdos"
printf '\nO HUB usará estes arquivos locais antes de qualquer CDN.\n'
printf 'Confira os termos de redistribuição do bundle antes de publicar os arquivos do jogo.\n'
