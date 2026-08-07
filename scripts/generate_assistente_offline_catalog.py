#!/usr/bin/env python3
"""Gera o catálogo offline exclusivamente de fontes centrais do HUB."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
TARGET = ROOT / "apps" / "assistente" / "offline-data.json"
PREFIX = "window.HUB_DATA = "


def load_json(path: Path, default: Any) -> Any:
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return default


def load_hub_data() -> dict[str, Any]:
    path = ROOT / "data.js"
    if not path.is_file(): return {}
    text = path.read_text(encoding="utf-8").strip()
    if not text.startswith(PREFIX) or not text.endswith(";"):
        raise SystemExit("data.js não possui o formato determinístico esperado.")
    parsed = json.loads(text[len(PREFIX):-1])
    return parsed if isinstance(parsed, dict) else {}


def compact(value: Any, size: int = 600) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:size]


def internal_url(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw: return ""
    if re.match(r"^(?:https?:|mailto:)", raw, re.I): return raw
    return "../../" + raw.lstrip("./")


def item_from_entry(entry: dict[str, Any], kind: str, position: int) -> dict[str, Any] | None:
    title = compact(entry.get("title") or entry.get("name"), 160)
    if not title: return None
    description = compact(entry.get("description") or entry.get("summary") or entry.get("text"), 700)
    tags = [compact(tag, 80) for tag in (entry.get("tags") or []) if compact(tag, 80)]
    return {
        "id": compact(entry.get("id") or f"{kind}-{position}", 120),
        "kind": kind,
        "title": title,
        "summary": description or f"{title} disponível no HUB.",
        "category": compact(entry.get("category") or ("Aplicativos" if kind == "app" else "Links"), 100),
        "tags": tags,
        "url": internal_url(entry.get("url") or entry.get("href")),
        "source": "hub-data",
    }


def main() -> None:
    data = load_hub_data()
    items: list[dict[str, Any]] = []
    for index, entry in enumerate(data.get("apps") or []):
        if isinstance(entry, dict):
            value = item_from_entry(entry, "app", index)
            if value: items.append(value)
    for index, entry in enumerate(data.get("usefulLinks") or data.get("links") or []):
        if isinstance(entry, dict):
            value = item_from_entry(entry, "link", index)
            if value: items.append(value)

    metadata = load_json(ROOT / "documents" / "document-metadata.json", {})
    for index, document in enumerate(metadata.get("documents") or []):
        if not isinstance(document, dict): continue
        title = compact(document.get("title"), 180)
        if not title: continue
        path = str(document.get("path") or "").lstrip("./")
        summary_parts = [document.get("documentType"), document.get("campus"), document.get("course")]
        summary = " · ".join(compact(part, 100) for part in summary_parts if part)
        items.append({
            "id": compact(document.get("id") or f"document-{index}", 120),
            "kind": "document",
            "title": title,
            "summary": summary or "Documento indexado no HUB.",
            "category": "Documentos",
            "tags": [compact(tag, 80) for tag in [document.get("documentType"), document.get("campus"), document.get("course"), document.get("inferredYear")] if tag],
            "url": internal_url(path),
            "source": "document-metadata",
            "status": document.get("status") or "unknown",
            "citationPolicy": document.get("citationPolicy") or "related-only",
            "updatedAt": document.get("lastReviewedAt") or document.get("publishedAt"),
        })

    # Deduplicação estável por id/url/título, preservando a ordem da fonte central.
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = str(item.get("id") or item.get("url") or item.get("title")).casefold()
        if not key or key in seen: continue
        seen.add(key); unique.append(item)

    # Data estável da revisão do conteúdo. Não usamos o relógio do build, pois
    # o mesmo commit precisa produzir exatamente os mesmos bytes no Fedora e no Actions.
    reviewed_dates = [str(item.get("updatedAt") or "")[:10] for item in unique if item.get("updatedAt")]
    reviewed_iso = max(reviewed_dates, default="2026-08-06")
    year, month, day = reviewed_iso.split("-") if reviewed_iso.count("-") == 2 else ("2026", "08", "06")
    payload = {
        "schemaVersion": 2,
        "version": "1.5.11",
        "updatedAt": f"{day}/{month}/{year}",
        "sourcePolicy": "central-records-only",
        "items": unique[:500],
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Catálogo offline central gerado: {len(payload['items'])} item(ns).")

if __name__ == "__main__": main()
