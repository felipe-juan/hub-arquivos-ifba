#!/usr/bin/env python3
"""Enriquece metadados documentais de modo conservador e tenta extrair texto ausente.

Nunca marca um documento como vigente apenas pelo nome/ano. Metadados explícitos em
`documents/document-metadata.overrides.json` sempre têm prioridade.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
DOCS = ROOT / "documents"
MANIFEST = DOCS / "manifest.json"
OVERRIDES = DOCS / "document-metadata.overrides.json"
OUTPUT = DOCS / "document-metadata.json"
REPORT = DOCS / "_manifest_reports" / "assistant-metadata-report.json"

DATE_PATTERNS = [
    re.compile(r"(?<!\d)(20\d{2})[-_.](0[1-9]|1[0-2])[-_.]([0-2]\d|3[01])(?!\d)"),
    re.compile(r"(?<!\d)([0-2]\d|3[01])[-_.](0[1-9]|1[0-2])[-_.](20\d{2})(?!\d)"),
]
YEAR_RE = re.compile(r"(?<!\d)(20\d{2})(?!\d)")


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def find_date(text: str) -> str | None:
    for index, pattern in enumerate(DATE_PATTERNS):
        match = pattern.search(text)
        if not match:
            continue
        if index == 0:
            year, month, day = match.groups()
        else:
            day, month, year = match.groups()
        try:
            return datetime(int(year), int(month), int(day)).date().isoformat()
        except ValueError:
            pass
    return None


def infer_type(name: str) -> str:
    low = name.casefold()
    for needle, kind in (
        ("ppc", "PPC"), ("projeto pedagogico", "PPC"),
        ("regulamento", "regulamento"), ("resolucao", "resolução"),
        ("portaria", "portaria"), ("edital", "edital"),
        ("calendario", "calendário"), ("norma", "norma"),
        ("manual", "manual"), ("horario", "horário"),
    ):
        if needle in low:
            return kind
    return "documento"


def infer_scope(name: str) -> tuple[str | None, str | None]:
    low = name.casefold()
    campus = "Vitória da Conquista" if any(token in low for token in ("vitoria da conquista", "vitória da conquista", "vca", "conquista")) else None
    course = "Sistemas de Informação" if any(token in low for token in ("sistemas de informacao", "sistemas de informação", " bsi", "si ")) else None
    return campus, course


def possible_text_sidecars(pdf: Path) -> list[Path]:
    return [pdf.with_suffix(".txt"), pdf.with_name(pdf.name + ".txt"), pdf.with_suffix(".ocr.txt")]


def usable_text(path: Path) -> bool:
    try:
        return path.is_file() and len(path.read_text(encoding="utf-8", errors="ignore").strip()) >= 80
    except OSError:
        return False


def extract_pdf_text(pdf: Path) -> tuple[Path | None, str]:
    for candidate in possible_text_sidecars(pdf):
        if usable_text(candidate):
            return candidate, "sidecar-existing"
    target = pdf.with_suffix(".txt")
    if shutil.which("pdftotext"):
        proc = subprocess.run(["pdftotext", "-layout", str(pdf), str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if proc.returncode == 0 and usable_text(target):
            return target, "pdftotext"
        target.unlink(missing_ok=True)
    # OCR é último recurso e limitado para não tornar uma atualização infinita.
    if shutil.which("pdftoppm") and shutil.which("tesseract"):
        tmp = DOCS / ".assistant-ocr" / hashlib.sha256(str(pdf).encode()).hexdigest()[:12]
        tmp.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(["pdftoppm", "-f", "1", "-l", "40", "-jpeg", "-r", "150", str(pdf), str(tmp / "page")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            parts: list[str] = []
            for image in sorted(tmp.glob("page-*.jpg")):
                base = image.with_suffix("")
                proc = subprocess.run(["tesseract", str(image), str(base), "-l", "por+eng"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                txt = base.with_suffix(".txt")
                if proc.returncode == 0 and txt.is_file():
                    parts.append(txt.read_text(encoding="utf-8", errors="ignore"))
            combined = "\n\n".join(parts).strip()
            if len(combined) >= 80:
                target.write_text(combined + "\n", encoding="utf-8")
                return target, "ocr"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return None, "unresolved"


def manifest_documents() -> list[dict[str, Any]]:
    raw = load_json(MANIFEST, {})
    values = raw.get("documents", []) if isinstance(raw, dict) else raw if isinstance(raw, list) else []
    output: list[dict[str, Any]] = []
    for item in values:
        if not isinstance(item, dict):
            continue
        source = item.get("path") or item.get("file") or item.get("url") or item.get("relativePath")
        if source:
            output.append(dict(item))
    known = {str(item.get("path") or item.get("file") or item.get("url") or item.get("relativePath")) for item in output}
    for pdf in DOCS.rglob("*.pdf") if DOCS.exists() else []:
        path = rel(pdf)
        if path not in known and path.removeprefix("documents/") not in known:
            output.append({"path": path, "title": pdf.stem})
    return output


def main() -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    overrides_raw = load_json(OVERRIDES, {})
    overrides = overrides_raw.get("documents", overrides_raw) if isinstance(overrides_raw, dict) else {}
    previous_raw = load_json(OUTPUT, {})
    previous_items = previous_raw.get("documents", []) if isinstance(previous_raw, dict) else []
    previous = {str(item.get("path") or item.get("id")): item for item in previous_items if isinstance(item, dict)}
    enriched: list[dict[str, Any]] = []
    unresolved: list[str] = []
    extraction: dict[str, int] = {}

    for item in manifest_documents():
        raw_path = str(item.get("path") or item.get("file") or item.get("url") or item.get("relativePath"))
        normalized = raw_path.lstrip("./")
        disk = ROOT / normalized
        if not disk.exists() and not normalized.startswith("documents/"):
            disk = DOCS / normalized
        title = str(item.get("title") or disk.stem or raw_path)
        key_options = [raw_path, normalized, rel(disk), disk.name]
        explicit: dict[str, Any] = {}
        for key in key_options:
            if isinstance(overrides, dict) and isinstance(overrides.get(key), dict):
                explicit.update(overrides[key])
        old = previous.get(raw_path) or previous.get(normalized) or previous.get(rel(disk)) or {}

        publication = explicit.get("publishedAt") or item.get("publishedAt") or old.get("publishedAt") or find_date(title) or find_date(raw_path)
        year_match = YEAR_RE.search(f"{title} {raw_path}")
        inferred_year = int(year_match.group(1)) if year_match else None
        campus, course = infer_scope(f"{title} {raw_path}")
        text_sidecar = None
        extraction_method = "not-pdf"
        text_extracted = bool(item.get("textExtracted") or item.get("indexed"))
        if disk.suffix.casefold() == ".pdf" and disk.is_file():
            text_sidecar, extraction_method = extract_pdf_text(disk)
            text_extracted = text_sidecar is not None
            extraction[extraction_method] = extraction.get(extraction_method, 0) + 1
            if not text_extracted:
                unresolved.append(rel(disk))

        status = str(explicit.get("status") or item.get("status") or old.get("status") or "unknown").casefold()
        if status not in {"active", "vigente", "revoked", "revogado", "historical", "histórico", "unknown", "desconhecido"}:
            status = "unknown"
        status = {"active": "vigente", "revoked": "revogado", "historical": "histórico", "desconhecido": "unknown"}.get(status, status)
        record = {
            "id": explicit.get("id") or item.get("id") or hashlib.sha256(normalized.encode()).hexdigest()[:16],
            "path": rel(disk) if disk.exists() else normalized,
            "title": title,
            "publishedAt": publication,
            "effectiveFrom": explicit.get("effectiveFrom") or item.get("effectiveFrom") or old.get("effectiveFrom"),
            "effectiveUntil": explicit.get("effectiveUntil") or item.get("effectiveUntil") or old.get("effectiveUntil"),
            "status": status,
            "supersedes": explicit.get("supersedes") or item.get("supersedes") or old.get("supersedes"),
            "issuer": explicit.get("issuer") or item.get("issuer") or old.get("issuer"),
            "campus": explicit.get("campus") or item.get("campus") or old.get("campus") or campus,
            "course": explicit.get("course") or item.get("course") or old.get("course") or course,
            "documentType": explicit.get("documentType") or item.get("documentType") or old.get("documentType") or infer_type(title),
            "officialUrl": explicit.get("officialUrl") or item.get("officialUrl") or old.get("officialUrl"),
            "lastReviewedAt": explicit.get("lastReviewedAt") or item.get("lastReviewedAt") or old.get("lastReviewedAt"),
            "reviewedBy": explicit.get("reviewedBy") or item.get("reviewedBy") or old.get("reviewedBy"),
            "inferredYear": inferred_year,
            "textExtracted": text_extracted,
            "textSidecar": rel(text_sidecar) if text_sidecar else None,
            "extractionMethod": extraction_method,
        }
        required = [record["publishedAt"], record["status"] != "unknown", record["issuer"], record["documentType"], record["officialUrl"], record["lastReviewedAt"], record["textExtracted"]]
        score = round(sum(bool(value) for value in required) / len(required), 3)
        record["metadataCompleteness"] = score
        record["metadataComplete"] = score == 1.0 and record["status"] in {"vigente", "revogado", "histórico"}
        record["citationPolicy"] = "verified-eligible" if record["metadataComplete"] and record["status"] == "vigente" else "related-only"
        enriched.append(record)

    enriched.sort(key=lambda item: (str(item.get("path") or ""), str(item.get("id") or "")))
    unresolved.sort()
    output = {"schemaVersion": 1, "policy": "unknown-until-explicitly-reviewed", "documents": enriched}
    write_json(OUTPUT, output)

    # Propaga metadados conservadores para os índices consumidos pelo backend.
    by_key: dict[str, dict[str, Any]] = {}
    for record in enriched:
        for key in (record.get("path"), Path(str(record.get("path") or "")).name, record.get("id")):
            if key: by_key[str(key).lstrip("./")] = record
    for index_path in (MANIFEST, DOCS / "search-index.json"):
        raw_index = load_json(index_path, None)
        if raw_index is None: continue
        values = raw_index.get("documents") if isinstance(raw_index, dict) else raw_index if isinstance(raw_index, list) else None
        if not isinstance(values, list): continue
        changed = False
        for item in values:
            if not isinstance(item, dict): continue
            source = str(item.get("path") or item.get("file") or item.get("url") or item.get("relativePath") or item.get("id") or "").lstrip("./")
            record = by_key.get(source) or by_key.get(Path(source).name)
            if not record: continue
            for field in ("publishedAt", "effectiveFrom", "effectiveUntil", "status", "supersedes", "issuer", "campus", "course", "documentType", "officialUrl", "lastReviewedAt", "reviewedBy", "textExtracted", "textSidecar", "metadataCompleteness", "metadataComplete", "citationPolicy"):
                if item.get(field) != record.get(field):
                    item[field] = record.get(field); changed = True
        if changed: write_json(index_path, raw_index)
    write_json(REPORT, {"documents": len(enriched), "metadataComplete": sum(bool(item["metadataComplete"]) for item in enriched), "relatedOnly": sum(item["citationPolicy"] == "related-only" for item in enriched), "unresolvedText": unresolved, "extraction": extraction})
    print(f"Metadados documentais: {len(enriched)} documento(s); completos: {sum(bool(item['metadataComplete']) for item in enriched)}; texto pendente: {len(unresolved)}.")


if __name__ == "__main__":
    main()
