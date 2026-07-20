#!/usr/bin/env python3
"""Atualiza e valida o conteúdo público do HUB Arquivos IFBA.

Uso recomendado, a partir da raiz do projeto:

    python3 scripts/update_content.py

Opções:
    --check-only   Não recria o manifesto; apenas confere o estado atual.
    --skip-inline  Não executa a validação dos scripts inline.
    --json-report       Salva um resumo em documents/_manifest_reports/update-summary.json.
    --allow-remote-doom Permite atualizar sem runtime local do DOOM (não recomendado para publicação).

O script não faz commit nem push. Ele mantém essa decisão sob controle do mantenedor.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "documents" / "manifest.json"
REPORT = ROOT / "documents" / "_manifest_reports" / "update-summary.json"


def run(command: list[str]) -> None:
    print("\n$", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def load_entries() -> list[dict]:
    if not MANIFEST.exists():
        raise SystemExit("Manifesto ausente. Execute sem --check-only para criá-lo.")
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("documents", "items", "entries"):
            if isinstance(payload.get(key), list):
                return payload[key]
    raise SystemExit("Formato de documents/manifest.json não reconhecido.")


def summary(entries: list[dict]) -> dict:
    categories = Counter(str(item.get("group") or item.get("category") or "Sem categoria") for item in entries)
    formats = Counter(str(item.get("fileFormat") or item.get("format") or item.get("extension") or "Desconhecido") for item in entries)
    missing = {
        "title": sum(not str(item.get("title") or "").strip() for item in entries),
        "path": sum(not str(item.get("path") or item.get("fileUrl") or item.get("pdfUrl") or "").strip() for item in entries),
        "date": sum(not str(item.get("docDate") or item.get("date") or item.get("modifiedDate") or "").strip() for item in entries),
        "size": sum(not item.get("size") and not item.get("sizeBytes") for item in entries),
        "status": sum(not str(item.get("validityStatus") or item.get("status") or "").strip() for item in entries),
    }
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "documentCount": len(entries),
        "categories": dict(categories.most_common()),
        "formats": dict(formats.most_common()),
        "missingMetadata": missing,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--skip-inline", action="store_true")
    parser.add_argument("--json-report", action="store_true")
    parser.add_argument("--allow-remote-doom", action="store_true")
    args = parser.parse_args()

    if not args.check_only and not args.allow_remote_doom:
        run([sys.executable, "scripts/check_doom_runtime.py"])

    if not args.check_only:
        run([sys.executable, "scripts/generate_documents_manifest.py"])
        run([sys.executable, "scripts/build_production_assets.py"])

    entries = load_entries()
    report = summary(entries)
    print("\nResumo do conteúdo")
    print(f"- Documentos: {report['documentCount']}")
    print(f"- Categorias: {len(report['categories'])}")
    print(f"- Formatos: {len(report['formats'])}")
    for field, count in report["missingMetadata"].items():
        if count:
            print(f"- Atenção: {count} item(ns) sem {field}")

    run([sys.executable, "scripts/check_index_status.py"])
    run([sys.executable, "scripts/validate_site.py"])
    if not args.skip_inline:
        run([sys.executable, "scripts/check_inline_scripts.py"])

    if args.json_report:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nRelatório salvo em {REPORT.relative_to(ROOT)}")

    print("\nConteúdo atualizado e validado. Revise git diff antes de publicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
