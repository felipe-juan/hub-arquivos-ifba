#!/usr/bin/env python3
"""Validate that generated production references resolve from their real referrers."""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "assets/build-manifest.json").read_text(encoding="utf-8"))
files = manifest.get("files", {})
failures: list[str] = []

def local_path(referrer: Path, value: str) -> Path | None:
    path = urlsplit(value).path
    if not path or path.startswith(("http:", "https:")):
        return None
    return (ROOT / path.lstrip("/")) if path.startswith("/") else (referrer.parent / path)

app_rel = files.get("app.js")
if not app_rel:
    failures.append("build-manifest.json não contém app.js")
else:
    app_path = ROOT / app_rel
    source = app_path.read_text(encoding="utf-8")
    for specifier in re.findall(r'import\(\s*["\']([^"\']+)["\']\s*\)', source):
        target = local_path(app_path, specifier)
        if target and not target.resolve().is_file():
            failures.append(f"Import dinâmico quebrado em {app_rel}: {specifier} -> {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}")
    for specifier in re.findall(r'new\s+Worker\(\s*["\']([^"\']+)["\']', source):
        # Worker() in a classic script resolves against the document, here index.html.
        target = local_path(ROOT / "index.html", specifier)
        if target and not target.resolve().is_file():
            failures.append(f"Worker quebrado em {app_rel}: {specifier}")

worker_rel = files.get("js/search-worker.js")
if worker_rel:
    worker_path = ROOT / worker_rel
    source = worker_path.read_text(encoding="utf-8")
    for specifier in re.findall(r'importScripts\(\s*["\']([^"\']+)["\']\s*\)', source):
        target = local_path(worker_path, specifier)
        if target and not target.resolve().is_file():
            failures.append(f"importScripts quebrado em {worker_rel}: {specifier}")

for html_rel in ["index.html", "apps/calendario/index.html", "apps/fluxogramas/index.html", "apps/barema/index.html", "apps/doom/index.html"]:
    html = ROOT / html_rel
    source = html.read_text(encoding="utf-8")
    for value in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', source):
        if value.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:")):
            continue
        target = local_path(html, value)
        if target and not target.resolve().exists():
            failures.append(f"Referência quebrada em {html_rel}: {value}")

if failures:
    print(f"Asset resolution test failed with {len(failures)} issue(s):", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)
print("Production asset resolution test: OK")
