#!/usr/bin/env python3
"""Catch common static markup/accessibility regressions in public HTML files."""
from __future__ import annotations
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "index.html", *sorted((ROOT / "apps").glob("*/index.html")), ROOT / "document-viewer.html", ROOT / "offline.html"]
issues: list[str] = []

class AuditParser(HTMLParser):
    def __init__(self, path: Path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids: set[str] = set()
        self.label_targets: list[tuple[str, int]] = []
        self.control_targets: list[tuple[str, int]] = []
        self.anchor_targets: list[tuple[str, int]] = []
    def handle_starttag(self, tag: str, attrs):
        values = dict(attrs)
        line, _ = self.getpos()
        where = f"{self.path.relative_to(ROOT)}:{line}"
        element_id = values.get("id")
        if element_id:
            if element_id in self.ids: issues.append(f"{where}: id duplicado: {element_id}")
            self.ids.add(element_id)
        if tag == "label" and values.get("for"):
            self.label_targets.append((values["for"], line))
        for target in (values.get("aria-controls") or "").split():
            if target:
                self.control_targets.append((target, line))
        href = values.get("href") or ""
        if tag == "a" and href.startswith("#") and len(href) > 1:
            self.anchor_targets.append((href[1:], line))
        if tag == "button" and values.get("type") not in {"button", "submit", "reset"}:
            issues.append(f"{where}: <button> sem type explícito")
        if tag == "img" and "alt" not in values:
            issues.append(f"{where}: <img> sem alt")
        if values.get("target", "").lower() == "_blank":
            rel = set((values.get("rel") or "").lower().split())
            if "noopener" not in rel: issues.append(f"{where}: target=_blank sem rel=noopener")
        for name, _ in attrs:
            if name.lower().startswith("on"):
                issues.append(f"{where}: handler inline proibido: {name}")

for path in FILES:
    if not path.exists():
        issues.append(f"Arquivo público ausente: {path.relative_to(ROOT)}")
        continue
    parser = AuditParser(path)
    try:
        parser.feed(path.read_text(encoding="utf-8"))
        for target, line in parser.label_targets:
            if target not in parser.ids:
                issues.append(f"{path.relative_to(ROOT)}:{line}: label aponta para id ausente: {target}")
        for target, line in parser.control_targets:
            if target not in parser.ids:
                issues.append(f"{path.relative_to(ROOT)}:{line}: aria-controls aponta para id ausente: {target}")
        for target, line in parser.anchor_targets:
            if target not in parser.ids:
                issues.append(f"{path.relative_to(ROOT)}:{line}: âncora aponta para id ausente: #{target}")
    except Exception as exc: issues.append(f"{path.relative_to(ROOT)}: HTML não pôde ser analisado: {exc}")

if issues:
    print(f"Markup safety test failed with {len(issues)} issue(s):", file=sys.stderr)
    for issue in issues: print(f"- {issue}", file=sys.stderr)
    raise SystemExit(1)
print("Markup safety test: OK")
