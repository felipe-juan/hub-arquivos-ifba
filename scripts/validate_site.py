#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
warnings: list[str] = []


def check_file(path: str) -> None:
    if not (ROOT / path).exists():
        errors.append(f"Arquivo ausente: {path}")


required = [
    "index.html", "app.js", "data.js", "styles.css", "service-worker.js", "offline.html",
    "css/enhancements.css", "js/storage.js", "js/where-data.js", "js/enhancements.js",
    "scripts/check_inline_scripts.py", "scripts/responsive_smoke_test.mjs",
    "apps/catalog.json", "apps/README.md",
    "apps/barema/index.html", "apps/barema/data/barema-data.js", "apps/barema/data/source-metadata.json",
    "apps/calendario/index.html", "apps/calendario/data/calendar-data.js", "apps/calendario/data/source-metadata.json",
    "apps/fluxogramas/index.html", "apps/fluxogramas/data/fluxogramas-data.js", "apps/fluxogramas/data/source-metadata.json",
]
for item in required:
    check_file(item)

html_files = [
    ROOT / "index.html",
    ROOT / "apps/barema/index.html",
    ROOT / "apps/calendario/index.html",
    ROOT / "apps/fluxogramas/index.html",
]

for html_path in html_files:
    text = html_path.read_text(encoding="utf-8")
    ids = re.findall(r'\bid=["\']([^"\']+)', text)
    for item in sorted(set(ids)):
        if "${" in item:
            continue
        if ids.count(item) > 1:
            errors.append(f"ID HTML duplicado em {html_path.relative_to(ROOT)}: {item}")

    for ref in re.findall(r'(?:href|src)=["\']([^"\']+)', text):
        if not ref or ref.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:", "blob:", "javascript:")):
            continue
        clean = ref.split("#")[0].split("?")[0]
        target = (html_path.parent / clean).resolve()
        if clean and not target.exists():
            warnings.append(f"Referência não encontrada em {html_path.relative_to(ROOT)}: {ref}")

try:
    catalog = json.loads((ROOT / "apps/catalog.json").read_text(encoding="utf-8"))
    for app in catalog.get("apps", []):
        check_file(app["url"].rstrip("/") + "/index.html")
        for source in app.get("sourceFiles", []):
            check_file(source)
except Exception as exc:
    errors.append(f"apps/catalog.json inválido: {exc}")

# Verifica caminhos internos declarados no catálogo principal de dados.
data_js = (ROOT / "data.js").read_text(encoding="utf-8")
for ref in re.findall(r'["\']url["\']\s*:\s*["\']([^"\']+)', data_js):
    if ref.startswith(("#", "http:", "https:", "mailto:", "tel:")):
        continue
    clean = ref.split("#")[0].split("?")[0]
    target = (ROOT / clean).resolve()
    if clean.endswith("/"):
        target = target / "index.html"
    if clean and not target.exists():
        errors.append(f"URL interna ausente em data.js: {ref}")


# Consolidação da Média e Prova Final e arquivos essenciais do modo offline.
for stale in ("app-media\"", "app-tabela-final"):
    if stale in data_js:
        errors.append(f"Identificador antigo ainda presente em data.js: {stale}")
if data_js.count('"id": "app-media-final"') != 2:
    warnings.append("A referência app-media-final deveria aparecer no catálogo e no grupo principal.")

sw_text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
core_match = re.search(r"const CORE = \[(.*?)\];", sw_text, re.S)
if not core_match:
    errors.append("Lista CORE não encontrada no service-worker.js")
else:
    for ref in re.findall(r'"([^"]+)"', core_match.group(1)):
        clean = ref.split("?")[0].split("#")[0].removeprefix("./")
        target = ROOT / clean
        if ref.split("?")[0].endswith("/"):
            target = target / "index.html"
        if not target.exists():
            errors.append(f"Arquivo do cache offline ausente: {ref}")

# Verificação simples dos pré-requisitos dentro de cada matriz externalizada.
flux = (ROOT / "apps/fluxogramas/data/fluxogramas-data.js").read_text(encoding="utf-8")
for matrix, body in re.findall(r"(\w+):\{course:.*?semesters:\[(.*?)\]\s*\}", flux, re.S):
    names = set(re.findall(r"c\('([^']+)'", body))
    prerequisites: list[str] = []
    for raw in re.findall(r"c\('[^']+'[^\n]*?\[([^\]]+)\]\)", body):
        prerequisites.extend(re.findall(r"'([^']+)'", raw))
    for requirement in prerequisites:
        if requirement not in names:
            warnings.append(f"Pré-requisito possivelmente ausente em {matrix}: {requirement}")

# Os arquivos versionados mantidos devem ser redirecionamentos pequenos, não cópias antigas completas.
for redirect in [
    ROOT / "apps/barema-explorer-v0.1.9.html",
    ROOT / "apps/calendario-academico-ifba-vca-2026-v0.1.15.html",
    ROOT / "apps/fluxogramas-curriculares-v0.1.20.html",
]:
    if redirect.exists() and redirect.stat().st_size > 5000:
        errors.append(f"Redirecionamento versionado grande demais: {redirect.relative_to(ROOT)}")

print(f"Validação concluída: {len(errors)} erro(s), {len(warnings)} aviso(s).")
for message in warnings[:100]:
    print("AVISO:", message)
for message in errors:
    print("ERRO:", message)
sys.exit(1 if errors else 0)
