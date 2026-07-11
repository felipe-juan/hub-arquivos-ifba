#!/usr/bin/env python3
"""Extrai JavaScript inline dos apps e verifica a sintaxe com Node.js."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = [
    ROOT / "apps/barema/index.html",
    ROOT / "apps/calendario/index.html",
    ROOT / "apps/fluxogramas/index.html",
]
errors: list[str] = []

for html_path in HTML_FILES:
    text = html_path.read_text(encoding="utf-8")
    scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", text, re.I | re.S)
    for index, script in enumerate(scripts, start=1):
        if not script.strip():
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
            handle.write(script)
            temp_path = Path(handle.name)
        try:
            result = subprocess.run(["node", "--check", str(temp_path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(f"{html_path.relative_to(ROOT)} · script inline {index}: {result.stderr.strip()}")
        finally:
            temp_path.unlink(missing_ok=True)

if errors:
    print(f"Verificação inline falhou com {len(errors)} erro(s).")
    for error in errors:
        print("ERRO:", error)
    sys.exit(1)
print("JavaScript inline dos apps: sintaxe válida.")
