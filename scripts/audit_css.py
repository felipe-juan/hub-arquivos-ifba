#!/usr/bin/env python3
"""Congela a dívida de especificidade e impede que novos ajustes a aumentem."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "styles.css", ROOT / "css/enhancements.css", ROOT / "css/sidebar-quick-search.css", ROOT / "css/design-system.css", ROOT / "apps/app-shell.css"]
BASELINE_PATH = ROOT / "css/specificity-baseline.json"
counts = {"ids": 0, "important": 0, "deep": 0}

for path in FILES:
    text = path.read_text(encoding="utf-8")
    counts["important"] += text.count("!important")
    # Count ID selectors only in selector preambles. Scanning the entire CSS also
    # mistakes hexadecimal colors such as #f8fbff for ID selectors.
    for selector in re.findall(r"([^{}]+)\{", text):
        clean = re.sub(r"/\*.*?\*/", "", selector, flags=re.S).strip()
        if clean.startswith("@"): continue
        counts["ids"] += len(re.findall(r"(^|[\s,>+~])#[A-Za-z_-][\w-]*", clean))
        if max((len(part.split()) for part in clean.split(",")), default=0) > 5:
            counts["deep"] += 1

baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
print("Auditoria CSS:", ", ".join(f"{key}={value} (limite {baseline[key]})" for key, value in counts.items()))
regressions = [f"{key}: {counts[key]} > {baseline[key]}" for key in counts if counts[key] > baseline[key]]
if regressions:
    print("ERRO: a dívida de especificidade aumentou:", "; ".join(regressions))
    sys.exit(1)
print("Sem aumento da dívida de especificidade. Use o design system em novos componentes.")
