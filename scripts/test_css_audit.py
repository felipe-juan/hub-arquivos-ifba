#!/usr/bin/env python3
"""Ensure CSS audit counts selectors, not hexadecimal color values."""
from pathlib import Path
source = Path("scripts/audit_css.py").read_text(encoding="utf-8")
assert 'for selector in re.findall' in source
assert 'counts["ids"] += len(re.findall' in source
selector_pos = source.index('for selector in re.findall')
id_pos = source.index('counts["ids"] += len(re.findall')
assert id_pos > selector_pos, "ID count must happen inside the selector loop"
print("CSS audit regression test: OK")
