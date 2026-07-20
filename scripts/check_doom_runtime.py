#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOOM = ROOT / "apps" / "doom"
MANIFEST = DOOM / "vendor" / "runtime-manifest.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    allow_missing = "--allow-missing" in sys.argv[1:]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("localAssets") is not True:
        print("Runtime local do DOOM ainda não foi instalado.")
        print("Execute: bash scripts/vendor_doom_assets.sh")
        return 0 if allow_missing else 2

    required = {
        "js-dos.js": DOOM / "vendor" / "js-dos" / "js-dos.js",
        "js-dos.css": DOOM / "vendor" / "js-dos" / "js-dos.css",
        "emulators.js": DOOM / "vendor" / "emulators" / "emulators.js",
        "doom.jsdos": DOOM / "game" / "doom.jsdos",
    }
    failures: list[str] = []
    for label, path in required.items():
        if not path.is_file() or path.stat().st_size == 0:
            failures.append(f"ausente ou vazio: {path.relative_to(ROOT)}")

    wasm_files = list((DOOM / "vendor" / "emulators").glob("*.wasm"))
    if not wasm_files:
        failures.append("nenhum arquivo .wasm encontrado em apps/doom/vendor/emulators")

    bundle = required["doom.jsdos"]
    if bundle.is_file():
        try:
            with zipfile.ZipFile(bundle) as archive:
                bad = archive.testzip()
                if bad:
                    failures.append(f"bundle corrompido em {bad}")
                if ".jsdos/dosbox.conf" not in archive.namelist():
                    failures.append("bundle sem .jsdos/dosbox.conf")
        except Exception as exc:
            failures.append(f"bundle inválido: {exc}")

    checksums = manifest.get("checksums") or {}
    for label in ("js-dos.js", "emulators.js", "doom.jsdos"):
        expected = checksums.get(label)
        path = required[label]
        if expected and path.is_file() and sha256(path) != expected:
            failures.append(f"checksum divergente: {path.relative_to(ROOT)}")

    if failures:
        print(f"Runtime local do DOOM inválido: {len(failures)} problema(s).", file=sys.stderr)
        for item in failures:
            print(f"- {item}", file=sys.stderr)
        return 1

    print("Runtime local do DOOM: OK")
    print(f"js-dos: {manifest.get('jsDosVersion', 'desconhecido')}")
    print(f"emulators: {manifest.get('emulatorsVersion', 'desconhecido')}")
    print(f"WASM encontrados: {len(wasm_files)}")
    print(f"Bundle: {bundle.stat().st_size / 1024 / 1024:.2f} MiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
