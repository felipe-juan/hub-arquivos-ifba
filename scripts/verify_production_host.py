#!/usr/bin/env python3
"""Verify compression and cache headers on a deployed HUB instance.

Usage:
  python3 scripts/verify_production_host.py --url https://example.org/hub/
"""
from __future__ import annotations
import argparse, gzip, json, re, sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls=[]
    def handle_starttag(self, tag, attrs):
        data=dict(attrs)
        if tag=="script" and data.get("src"): self.urls.append(data["src"])
        if tag=="link" and data.get("href") and "stylesheet" in data.get("rel",""): self.urls.append(data["href"])


def fetch(url: str, method="GET", accept_encoding="br, gzip"):
    request=Request(url, method=method, headers={
        "User-Agent":f"HUB-Production-Header-Check/{VERSION}",
        "Accept-Encoding":accept_encoding,
        "Cache-Control":"no-cache",
    })
    with urlopen(request, timeout=20) as response:
        return response.status, {k.lower():v for k,v in response.headers.items()}, response.read() if method=="GET" else b""



def decoded_body(body: bytes, headers: dict[str, str]) -> bytes:
    encoding = headers.get("content-encoding", "").lower().strip()
    if encoding == "gzip":
        return gzip.decompress(body)
    if encoding == "br":
        try:
            import brotli
        except Exception as exc:
            raise RuntimeError("Resposta Brotli recebida, mas o módulo Python 'brotli' não está instalado") from exc
        return brotli.decompress(body)
    return body

def cache_max_age(cache_control: str) -> int | None:
    match = re.search(r"(?:^|,)\s*max-age=(\d+)", cache_control or "", re.I)
    return int(match.group(1)) if match else None

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Base URL of the deployed HUB")
    parser.add_argument("--json", action="store_true")
    args=parser.parse_args()
    base=args.url.rstrip("/")+"/"
    errors=[]; warnings=[]; checks=[]
    try:
        status, headers, body=fetch(base, accept_encoding="gzip")
        body=decoded_body(body, headers)
    except Exception as exc:
        print(f"ERRO: não foi possível acessar {base}: {exc}")
        return 2
    cache=headers.get("cache-control","")
    checks.append({"url":base,"status":status,"cacheControl":cache,"contentEncoding":headers.get("content-encoding","")})
    if "no-cache" not in cache and "no-store" not in cache and "max-age=0" not in cache:
        errors.append("A página raiz deve exigir revalidação (no-cache/no-store/max-age=0)")
    parser_html=Assets(); parser_html.feed(body.decode("utf-8","ignore"))
    local_assets=[]
    for ref in parser_html.urls:
        url=urljoin(base,ref)
        if urlparse(url).netloc==urlparse(base).netloc: local_assets.append(url)
    mutable_resources=(
        "index.html","offline.html","document-viewer.html",
        "apps/calendario/index.html","apps/fluxogramas/index.html","apps/barema/index.html","apps/doom/index.html",
        "VERSION","documents/manifest-summary.json","documents/search-index.json",
    )
    for name in mutable_resources:
        url=urljoin(base,name)
        try:
            status,h,_=fetch(url)
            cc=h.get("cache-control","")
            checks.append({"url":url,"status":status,"cacheControl":cc,"contentEncoding":h.get("content-encoding","")})
            if "no-cache" not in cc and "no-store" not in cc and "max-age=0" not in cc:
                errors.append(f"{name} deve exigir revalidação")
            if name.endswith(".json") and h.get("content-encoding","") not in {"br","gzip"}:
                warnings.append(f"{name} não foi entregue com Brotli/gzip")
        except Exception as exc: errors.append(f"falha ao verificar {name}: {exc}")
    hashed_pattern=re.compile(r"\.[0-9a-f]{8,}\.(?:js|css)$",re.I)
    for url in local_assets:
        try:
            status,h,_=fetch(url)
            cc=h.get("cache-control",""); encoding=h.get("content-encoding","")
            checks.append({"url":url,"status":status,"cacheControl":cc,"contentEncoding":encoding})
            path=urlparse(url).path
            if hashed_pattern.search(path):
                if "immutable" not in cc or (cache_max_age(cc) or 0) < 31536000:
                    errors.append(f"asset hash sem cache immutable de um ano: {path}")
            else:
                warnings.append(f"asset inicial sem hash de conteúdo: {path}")
            if path.endswith((".js",".css")) and encoding not in {"br","gzip"}:
                errors.append(f"asset textual sem Brotli/gzip: {path}")
        except Exception as exc: errors.append(f"falha ao verificar asset {url}: {exc}")
    report={"baseUrl":base,"checks":checks,"errors":errors,"warnings":warnings}
    if args.json: print(json.dumps(report,ensure_ascii=False,indent=2))
    else:
        print(f"Host verificado: {base}")
        for item in checks: print(f"- {item['status']} {item['url']} | {item['contentEncoding'] or 'sem compressão'} | {item['cacheControl'] or 'sem cache-control'}")
        for warning in warnings: print("AVISO:",warning)
        for error in errors: print("ERRO:",error)
    return 1 if errors else 0

if __name__=="__main__": raise SystemExit(main())
