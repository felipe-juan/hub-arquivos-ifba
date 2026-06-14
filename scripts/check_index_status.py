#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "documents" / "manifest.json"

if not manifest_path.exists():
    raise SystemExit("documents/manifest.json não encontrado. Rode: python3 scripts/generate_documents_manifest.py")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
docs = manifest.get("documents", [])
print(f"Documentos no manifesto: {len(docs)}")
print(f"Indexados: {sum(1 for d in docs if d.get('indexed'))}")
print(f"Sem texto extraído: {sum(1 for d in docs if not d.get('indexed'))}")
print()

for doc in docs:
    status = "OK" if doc.get("indexed") else "SEM TEXTO"
    print(f"[{status}] {doc.get('title')} | chars={doc.get('contentLength', 0)} | chunks={len(doc.get('chunks', []))} | método={doc.get('extractionMethod')}")
