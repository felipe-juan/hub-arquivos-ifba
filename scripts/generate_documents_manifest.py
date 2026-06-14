#!/usr/bin/env python3
"""
Gera documents/manifest.json a partir dos arquivos colocados em documents/.

Uso:
  python3 scripts/generate_documents_manifest.py

Fluxo recomendado:
  1. Coloque PDFs/arquivos em subpastas de documents/, por exemplo:
       documents/ppcs/ppc-2024.pdf
       documents/matrizes-curriculares/matriz-2024.pdf
       documents/regulamentos-bsi/regulamento-tcc.pdf
  2. Rode este script.
  3. Faça git add/commit/push.
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "documents"
MANIFEST_JSON = DOCS_DIR / "manifest.json"
MANIFEST_CSV = DOCS_DIR / "manifest.csv"

SUPPORTED = {
    ".pdf": "PDF",
    ".png": "Imagem",
    ".jpg": "Imagem",
    ".jpeg": "Imagem",
    ".webp": "Imagem",
    ".gif": "Imagem",
    ".txt": "Texto",
    ".md": "Texto",
    ".doc": "Word/Writer",
    ".docx": "Word/Writer",
    ".odt": "Word/Writer",
    ".xls": "Excel/Calc",
    ".xlsx": "Excel/Calc",
    ".ods": "Excel/Calc",
    ".ppt": "PowerPoint/Impress",
    ".pptx": "PowerPoint/Impress",
    ".odp": "PowerPoint/Impress",
}

CATEGORY_LABELS = {
    "ppcs": "PPCs",
    "ppc": "PPCs",
    "matrizes-curriculares": "Matrizes curriculares",
    "matrizes": "Matrizes curriculares",
    "regulamentos-bsi": "Regulamentos BSI",
    "regulamentos": "Regulamentos",
    "portarias": "Portarias",
    "normas-ifba": "Normas IFBA",
    "normas": "Normas IFBA",
    "diretrizes-cne": "Diretrizes CNE/MEC",
    "diretrizes": "Diretrizes CNE/MEC",
    "resolucoes": "Resoluções",
    "resoluções": "Resoluções",
}

ACRONYMS = {
    "ppc", "nde", "cne", "ces", "consepe", "consup", "concam", "ifba",
    "bsi", "si", "vca", "ldb", "sinaes", "pne", "tea", "libras", "tcc",
    "naes", "conaes", "mec"
}


def strip_accents(text: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


def slugify(text: str) -> str:
    text = strip_accents(text).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "documento"


def pretty_title(path: Path) -> str:
    stem = re.sub(r"[_-]+", " ", path.stem).strip()
    words = []
    for word in stem.split():
        raw = strip_accents(word).lower()
        if raw in ACRONYMS:
            words.append(word.upper())
        elif re.fullmatch(r"\d{4}(?:\.\d)?", word):
            words.append(word)
        else:
            words.append(word[:1].upper() + word[1:])
    return " ".join(words) or path.stem


def category_for(rel: Path) -> str:
    if len(rel.parts) <= 1:
        return "Documentos"
    first = rel.parts[0]
    return CATEGORY_LABELS.get(first.lower(), re.sub(r"[-_]+", " ", first).title())


def infer_kind(text: str) -> str:
    hay = strip_accents(text).lower()
    if "ppc" in hay or "projeto pedagogico" in hay:
        return "PPC"
    if "matriz" in hay or "fluxograma" in hay:
        return "Matriz curricular"
    if "ementario" in hay or "bibliografia" in hay:
        return "Ementário"
    if "regulamento" in hay or "regimento" in hay:
        return "Regulamento"
    if "resolucao" in hay:
        return "Resolução"
    if "portaria" in hay:
        return "Portaria"
    if "lei" in hay or "ldb" in hay:
        return "Lei"
    if "diretriz" in hay:
        return "Diretriz"
    if "barema" in hay:
        return "Barema"
    if "formulario" in hay:
        return "Formulário"
    return "Documento"


def infer_correspondent(text: str) -> str:
    hay = strip_accents(text).lower()
    if "consepe" in hay:
        return "CONSEPE"
    if "consup" in hay:
        return "CONSUP"
    if "concam" in hay:
        return "CONCAM"
    if "conaes" in hay:
        return "CONAES"
    if "cne" in hay or "mec" in hay or "ldb" in hay or "sinaes" in hay or "pne" in hay:
        return "MEC/CNE"
    if "nde" in hay:
        return "NDE"
    if "colegiado" in hay:
        return "Colegiado de Curso"
    if "ifba" in hay or "naes" in hay:
        return "IFBA"
    if "ppc" in hay or "matriz" in hay or "tcc" in hay or "estagio" in hay:
        return "Coordenação de Sistemas de Informação"
    return "A definir"


def infer_tags(title: str, category: str, kind: str, rel: str) -> list[str]:
    hay = strip_accents(f"{title} {category} {kind} {rel}").lower()
    tags = [category, kind]
    rules = {
        "ppc": ["PPC", "projeto pedagógico", "currículo"],
        "matriz": ["matriz", "currículo", "disciplinas"],
        "optativa": ["optativas", "disciplinas"],
        "ementario": ["ementário", "bibliografia", "disciplinas"],
        "migracao": ["migração", "equivalência", "currículo"],
        "equivalencia": ["equivalência", "aproveitamento"],
        "tcc": ["TCC", "trabalho de conclusão"],
        "estagio": ["estágio"],
        "extensao": ["extensão"],
        "complementares": ["atividades complementares", "horas"],
        "libras": ["Libras", "acessibilidade"],
        "tea": ["TEA", "acessibilidade"],
        "nde": ["NDE"],
        "colegiado": ["colegiado"],
        "portaria": ["portaria"],
        "resolucao": ["resolução"],
        "regulamento": ["regulamento"],
        "regimento": ["regimento"],
        "naes": ["NAES", "normas acadêmicas"],
    }
    for key, values in rules.items():
        if key in hay:
            tags.extend(values)
    years = re.findall(r"20\d{2}|19\d{2}", hay)
    tags.extend(years)
    result = []
    seen = set()
    for tag in tags:
        key = strip_accents(tag).lower()
        if key not in seen:
            seen.add(key)
            result.append(tag)
    return result[:14]


def sidecar_text(path: Path) -> str:
    candidates = [path.with_suffix(".txt"), path.with_suffix(".md")]
    for candidate in candidates:
        if candidate.exists() and candidate != path:
            try:
                text = candidate.read_text(encoding="utf-8", errors="ignore")
                return re.sub(r"\s+", " ", text).strip()[:2500]
            except Exception:
                pass
    if path.suffix.lower() in {".txt", ".md"}:
        try:
            return re.sub(r"\s+", " ", path.read_text(encoding="utf-8", errors="ignore")).strip()[:2500]
        except Exception:
            return ""
    return ""


def build_document(path: Path, index: int) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    rel_docs = path.relative_to(DOCS_DIR)
    category = category_for(rel_docs)
    title = pretty_title(path)
    kind = infer_kind(f"{title} {category} {rel}")
    correspondent = infer_correspondent(f"{title} {category} {rel}")
    fmt = SUPPORTED.get(path.suffix.lower(), path.suffix.upper().replace(".", ""))
    tags = infer_tags(title, category, kind, rel)
    text = sidecar_text(path)
    summary = text[:260] + ("…" if len(text) > 260 else "") if text else f"{kind} em {category}."
    doc_id = f"doc-{slugify(str(rel_docs.with_suffix('')))}"
    return {
        "id": doc_id,
        "title": title,
        "category": category,
        "group": category,
        "kind": kind,
        "documentType": kind,
        "correspondent": correspondent,
        "fileFormat": fmt,
        "pdfUrl": rel,
        "sourceUrl": rel,
        "tags": tags,
        "summary": summary,
        "chunks": [
            {
                "id": f"{doc_id}-arquivo",
                "page": "—",
                "heading": title,
                "semanticTags": tags,
                "text": text or f"{title}. {kind} em {category}. Arquivo disponível em {rel}."
            }
        ]
    }


def main() -> None:
    docs = []
    for path in sorted(DOCS_DIR.rglob("*")):
        if not path.is_file():
            continue
        if path.name.lower() in {"manifest.json", "manifest.csv", "readme.md"}:
            continue
        if path.suffix.lower() not in SUPPORTED:
            continue
        # Ignore sidecar TXT/MD when a same-name document exists.
        if path.suffix.lower() in {".txt", ".md"}:
            has_primary = any(path.with_suffix(ext).exists() for ext in SUPPORTED if ext not in {".txt", ".md"})
            if has_primary:
                continue
        docs.append(build_document(path, len(docs)))

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(docs),
        "documents": docs,
    }
    MANIFEST_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    with MANIFEST_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "title", "category", "kind", "correspondent", "fileFormat", "path", "tags", "summary"])
        writer.writeheader()
        for doc in docs:
            writer.writerow({
                "id": doc["id"],
                "title": doc["title"],
                "category": doc["category"],
                "kind": doc["kind"],
                "correspondent": doc["correspondent"],
                "fileFormat": doc["fileFormat"],
                "path": doc["pdfUrl"],
                "tags": "; ".join(doc["tags"]),
                "summary": doc["summary"],
            })

    print(f"Generated {MANIFEST_JSON.relative_to(ROOT)} with {len(docs)} document(s).")
    print(f"Generated {MANIFEST_CSV.relative_to(ROOT)} for review.")


if __name__ == "__main__":
    main()
