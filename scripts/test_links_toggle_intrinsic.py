#!/usr/bin/env python3
"""Prevent the Rápida/Detalhada pill from stretching on wide or zoomed-out desktops."""
from pathlib import Path
import re

css = Path("styles.css").read_text(encoding="utf-8")
html = Path("index.html").read_text(encoding="utf-8")

marker = "v0.2.36 — seletor Rápida/Detalhada usa largura intrínseca"
assert marker in css
release_css = css[css.index(marker):]
controls = re.search(
    r"\.links-section \.links-controls\s*\{\s*"
    r"display:\s*grid;\s*"
    r"grid-template-columns:\s*([^;]+);",
    release_css,
    re.S,
)
assert controls, "Desktop Links controls grid was not found"
columns = controls.group(1).strip()
assert columns.startswith("max-content "), f"View toggle column is not intrinsic: {columns}"
assert "fr" not in columns, f"Links controls still contain fractional columns: {columns}"

view = re.search(
    r"\.links-section \.links-controls \.view-toggle\s*\{(?P<rules>.*?)\}",
    release_css,
    re.S,
)
assert view, "Desktop view-toggle override was not found"
rules = view.group("rules")
assert re.search(r"width:\s*fit-content", rules)
assert re.search(r"white-space:\s*nowrap", rules)

assert '<span id="linksColumnsLabel">Colunas</span>' in html
print("Links intrinsic toggle regression test: OK")
