#!/usr/bin/env python3
"""
Gera documents/manifest.json a partir dos arquivos colocados em documents/.

Diferente da primeira versão, este script agora tenta INDEXAR O CONTEÚDO
real dos documentos, não apenas nome, pasta e tags.

Uso:
  python3 scripts/generate_documents_manifest.py

Fluxo recomendado:
  1. Coloque PDFs/arquivos em subpastas de documents/.
  2. Rode este script.
  3. Faça git add/commit/push.

Dependências opcionais, mas recomendadas:
  pip install pymupdf pypdf openpyxl python-docx python-pptx

Observação importante:
  PDFs escaneados como imagem não têm texto extraível. Para eles, será preciso OCR.
  Se houver um arquivo .txt com o mesmo nome do PDF, ele será usado como texto auxiliar.
"""
from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

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
    "naes", "conaes", "mec", "ace", "ead"
}

MAX_CHUNK_CHARS = 1800
MIN_CHUNK_CHARS = 420
MAX_PREVIEW_SUMMARY = 360


@dataclass
class PageText:
    page: str
    text: str


def strip_accents(text: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )


def normalize_spaces(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


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
            words.append(raw.upper())
        elif re.fullmatch(r"\d{4}(?:\.\d)?", word):
            words.append(word)
        elif re.fullmatch(r"\d+", word):
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
    if "nde" in hay or "nucleo docente estruturante" in hay:
        return "NDE"
    if "colegiado" in hay:
        return "Colegiado de Curso"
    if "ifba" in hay or "naes" in hay:
        return "IFBA"
    if "ppc" in hay or "matriz" in hay or "tcc" in hay or "estagio" in hay:
        return "Coordenação de Sistemas de Informação"
    return "A definir"


def infer_tags(title: str, category: str, kind: str, rel: str, extracted_text: str = "") -> list[str]:
    hay = strip_accents(f"{title} {category} {kind} {rel} {extracted_text[:4000]}").lower()
    tags = [category, kind]
    rules = {
        "ppc": ["PPC", "projeto pedagógico", "currículo"],
        "projeto pedagogico": ["PPC", "projeto pedagógico", "currículo"],
        "matriz": ["matriz", "currículo", "disciplinas"],
        "fluxograma": ["fluxograma", "matriz", "currículo"],
        "optativa": ["optativas", "disciplinas"],
        "ementario": ["ementário", "bibliografia", "disciplinas"],
        "bibliografia": ["bibliografia", "disciplinas"],
        "migracao": ["migração", "equivalência", "currículo"],
        "equivalencia": ["equivalência", "aproveitamento"],
        "aproveitamento": ["aproveitamento", "disciplinas"],
        "tcc": ["TCC", "trabalho de conclusão"],
        "trabalho de conclusao": ["TCC", "trabalho de conclusão"],
        "estagio": ["estágio"],
        "extensao": ["extensão"],
        "curricularizacao": ["extensão", "curricularização"],
        "complementares": ["atividades complementares", "horas"],
        "libras": ["Libras", "acessibilidade"],
        "tea": ["TEA", "acessibilidade"],
        "deficiencia": ["acessibilidade", "inclusão"],
        "inclusao": ["inclusão", "acessibilidade"],
        "nde": ["NDE"],
        "nucleo docente estruturante": ["NDE"],
        "colegiado": ["colegiado"],
        "portaria": ["portaria"],
        "resolucao": ["resolução"],
        "regulamento": ["regulamento"],
        "regimento": ["regimento"],
        "naes": ["NAES", "normas acadêmicas"],
        "nome social": ["nome social", "inclusão"],
        "guarda religiosa": ["guarda religiosa", "atividades alternativas"],
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
        if key and key not in seen:
            seen.add(key)
            result.append(tag)
    return result[:18]


def read_sidecar(path: Path) -> list[PageText]:
    candidates = [path.with_suffix(".txt"), path.with_suffix(".md")]
    for candidate in candidates:
        if candidate.exists() and candidate != path:
            try:
                text = normalize_spaces(candidate.read_text(encoding="utf-8", errors="ignore"))
                if text:
                    return [PageText("—", text)]
            except Exception:
                pass
    return []


def extract_pdf_pymupdf(path: Path) -> list[PageText]:
    try:
        import fitz  # PyMuPDF
    except Exception:
        return []
    pages = []
    try:
        with fitz.open(path) as doc:
            for i, page in enumerate(doc, start=1):
                text = normalize_spaces(page.get_text("text") or "")
                if text:
                    pages.append(PageText(str(i), text))
    except Exception as exc:
        print(f"[aviso] PyMuPDF falhou em {path.name}: {exc}", file=sys.stderr)
    return pages


def extract_pdf_pypdf(path: Path) -> list[PageText]:
    try:
        from pypdf import PdfReader
    except Exception:
        return []
    pages = []
    try:
        reader = PdfReader(str(path))
        for i, page in enumerate(reader.pages, start=1):
            text = normalize_spaces(page.extract_text() or "")
            if text:
                pages.append(PageText(str(i), text))
    except Exception as exc:
        print(f"[aviso] pypdf falhou em {path.name}: {exc}", file=sys.stderr)
    return pages


def extract_pdf_pdftotext(path: Path) -> list[PageText]:
    if not shutil.which("pdftotext"):
        return []
    try:
        output = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], stderr=subprocess.DEVNULL, timeout=60)
        text = output.decode("utf-8", errors="ignore")
        parts = [normalize_spaces(part) for part in text.split("\f")]
        return [PageText(str(i), part) for i, part in enumerate(parts, start=1) if part]
    except Exception as exc:
        print(f"[aviso] pdftotext falhou em {path.name}: {exc}", file=sys.stderr)
        return []


def extract_docx(path: Path) -> list[PageText]:
    try:
        import docx
    except Exception:
        return []
    try:
        document = docx.Document(str(path))
        text = "\n".join(p.text for p in document.paragraphs if p.text)
        return [PageText("—", normalize_spaces(text))] if text.strip() else []
    except Exception as exc:
        print(f"[aviso] docx falhou em {path.name}: {exc}", file=sys.stderr)
        return []


def extract_xlsx(path: Path) -> list[PageText]:
    try:
        import openpyxl
    except Exception:
        return []
    try:
        wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
        pages = []
        for sheet in wb.worksheets:
            rows = []
            for row in sheet.iter_rows(values_only=True):
                values = [str(cell).strip() for cell in row if cell is not None and str(cell).strip()]
                if values:
                    rows.append(" | ".join(values))
            text = normalize_spaces("\n".join(rows))
            if text:
                pages.append(PageText(sheet.title, text))
        return pages
    except Exception as exc:
        print(f"[aviso] xlsx falhou em {path.name}: {exc}", file=sys.stderr)
        return []


def extract_pptx(path: Path) -> list[PageText]:
    try:
        from pptx import Presentation
    except Exception:
        return []
    try:
        prs = Presentation(str(path))
        pages = []
        for i, slide in enumerate(prs.slides, start=1):
            parts = []
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text:
                    parts.append(shape.text)
            text = normalize_spaces("\n".join(parts))
            if text:
                pages.append(PageText(str(i), text))
        return pages
    except Exception as exc:
        print(f"[aviso] pptx falhou em {path.name}: {exc}", file=sys.stderr)
        return []


def extract_plain(path: Path) -> list[PageText]:
    try:
        text = normalize_spaces(path.read_text(encoding="utf-8", errors="ignore"))
        return [PageText("—", text)] if text else []
    except Exception:
        return []


def extract_pages(path: Path) -> tuple[list[PageText], str]:
    suffix = path.suffix.lower()

    sidecar = read_sidecar(path)
    if sidecar:
        return sidecar, "sidecar"

    if suffix == ".pdf":
        pages = extract_pdf_pymupdf(path)
        method = "pymupdf"
        if not pages:
            pages = extract_pdf_pypdf(path)
            method = "pypdf"
        if not pages:
            pages = extract_pdf_pdftotext(path)
            method = "pdftotext"
        return pages, method if pages else "no_text"

    if suffix in {".txt", ".md"}:
        return extract_plain(path), "plain"
    if suffix == ".docx":
        return extract_docx(path), "docx"
    if suffix == ".xlsx":
        return extract_xlsx(path), "xlsx"
    if suffix == ".pptx":
        return extract_pptx(path), "pptx"

    return [], "unsupported_text_extraction"


def split_text_into_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    text = normalize_spaces(text)
    if not text:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paragraphs) <= 1:
        paragraphs = [p.strip() for p in re.split(r"(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÃÕÂÊÔÇ0-9])", text) if p.strip()]

    chunks = []
    current = ""
    for paragraph in paragraphs:
        paragraph = compact(paragraph)
        if not paragraph:
            continue
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for start in range(0, len(paragraph), max_chars):
                chunks.append(paragraph[start:start + max_chars].strip())
            continue
        if current and len(current) + len(paragraph) + 1 > max_chars and len(current) >= MIN_CHUNK_CHARS:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = f"{current} {paragraph}".strip()
    if current:
        chunks.append(current.strip())
    return chunks


def make_chunks(doc_id: str, title: str, pages: list[PageText], tags: list[str]) -> list[dict]:
    chunks = []
    for page in pages:
        for idx, chunk_text in enumerate(split_text_into_chunks(page.text), start=1):
            chunks.append({
                "id": f"{doc_id}-p{slugify(str(page.page))}-{idx}",
                "page": page.page,
                "heading": title if idx == 1 else f"{title} — trecho {idx}",
                "semanticTags": tags,
                "text": chunk_text,
            })
    return chunks


def first_summary(text: str, fallback: str) -> str:
    clean = compact(text)
    if not clean:
        return fallback
    return clean[:MAX_PREVIEW_SUMMARY] + ("…" if len(clean) > MAX_PREVIEW_SUMMARY else "")


def build_document(path: Path, index: int) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    rel_docs = path.relative_to(DOCS_DIR)
    category = category_for(rel_docs)
    title = pretty_title(path)
    pages, extraction_method = extract_pages(path)
    full_text = compact(" ".join(page.text for page in pages))
    kind = infer_kind(f"{title} {category} {rel} {full_text[:4000]}")
    correspondent = infer_correspondent(f"{title} {category} {rel} {full_text[:5000]}")
    fmt = SUPPORTED.get(path.suffix.lower(), path.suffix.upper().replace(".", ""))
    tags = infer_tags(title, category, kind, rel, full_text)
    doc_id = f"doc-{slugify(str(rel_docs.with_suffix('')))}"

    if pages:
        chunks = make_chunks(doc_id, title, pages, tags)
    else:
        tags = list(dict.fromkeys([*tags, "sem texto extraível"]))
        chunks = [{
            "id": f"{doc_id}-arquivo",
            "page": "—",
            "heading": title,
            "semanticTags": tags,
            "text": f"{title}. {kind} em {category}. Arquivo disponível em {rel}. Atenção: não foi possível extrair texto automaticamente deste arquivo; se for PDF escaneado, gere OCR ou adicione um .txt com o mesmo nome."
        }]

    summary = first_summary(full_text, f"{kind} em {category}.")
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
        "contentLength": len(full_text),
        "indexed": bool(full_text),
        "extractionMethod": extraction_method,
        "chunks": chunks,
    }


def should_ignore(path: Path) -> bool:
    if not path.is_file():
        return True
    if path.name.lower() in {"manifest.json", "manifest.csv", "readme.md"}:
        return True
    if path.suffix.lower() not in SUPPORTED:
        return True
    # Ignore sidecar TXT/MD when a same-name document exists.
    if path.suffix.lower() in {".txt", ".md"}:
        has_primary = any(path.with_suffix(ext).exists() for ext in SUPPORTED if ext not in {".txt", ".md"})
        if has_primary:
            return True
    return False


def main() -> None:
    docs = []
    for path in sorted(DOCS_DIR.rglob("*")):
        if should_ignore(path):
            continue
        docs.append(build_document(path, len(docs)))

    indexed = sum(1 for doc in docs if doc.get("indexed"))
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(docs),
        "indexedCount": indexed,
        "unindexedCount": len(docs) - indexed,
        "documents": docs,
    }
    MANIFEST_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    with MANIFEST_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "title", "category", "kind", "correspondent", "fileFormat", "path",
            "indexed", "contentLength", "extractionMethod", "chunks", "tags", "summary"
        ])
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
                "indexed": doc.get("indexed", False),
                "contentLength": doc.get("contentLength", 0),
                "extractionMethod": doc.get("extractionMethod", ""),
                "chunks": len(doc.get("chunks", [])),
                "tags": "; ".join(doc["tags"]),
                "summary": doc["summary"],
            })

    print(f"Generated {MANIFEST_JSON.relative_to(ROOT)} with {len(docs)} document(s).")
    print(f"Indexed content in {indexed}/{len(docs)} document(s).")
    if indexed < len(docs):
        print("Some files have no extractable text. If they are scanned PDFs, add OCR or a same-name .txt sidecar.")
    print(f"Generated {MANIFEST_CSV.relative_to(ROOT)} for review.")


if __name__ == "__main__":
    main()
