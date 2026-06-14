"""
Script simples para uma etapa futura.

Ele lê arquivos .txt em uma pasta e gera objetos JSON parecidos com os de data.js.
Não faz OCR. A ideia é usar depois que você já tiver extraído texto dos PDFs.

Uso:
    python scripts/build_index_from_txt.py caminho/para/txts > generated_documents.json
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:70]


def chunk_text(text: str, max_chars: int = 900) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 > max_chars and current:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        chunks.append(current.strip())
    return chunks


def main(folder: str) -> None:
    base = Path(folder)
    docs = []
    for txt_file in sorted(base.glob("*.txt")):
        title = txt_file.stem.replace("-", " ").title()
        chunks = chunk_text(txt_file.read_text(encoding="utf-8"))
        doc_id = f"doc-{slugify(txt_file.stem)}"
        docs.append({
            "id": doc_id,
            "title": title,
            "kind": "Documento",
            "status": "review",
            "trust": "Texto gerado automaticamente; revisar antes de publicar",
            "course": "Sistemas de Informação",
            "year": str(date.today().year),
            "docDate": "",
            "collectedDate": date.today().isoformat(),
            "sourceUrl": "#",
            "pdfUrl": "#",
            "tags": [],
            "summary": "Documento importado automaticamente a partir de arquivo TXT.",
            "chunks": [
                {
                    "id": f"{doc_id}-{i+1}",
                    "page": i + 1,
                    "heading": f"Trecho {i+1}",
                    "semanticTags": [],
                    "text": chunk,
                }
                for i, chunk in enumerate(chunks)
            ],
        })
    print(json.dumps(docs, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python scripts/build_index_from_txt.py pasta_txt")
    main(sys.argv[1])
