#!/usr/bin/env python3
from __future__ import annotations
import json, math, sys, unicodedata
from pathlib import Path

ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
CATALOG=ROOT/'apps/assistente/offline-data.json'
REGISTRY=ROOT/'sidebar/hub-registry.json'
METADATA=ROOT/'documents/document-metadata.json'

def load(path, default):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception: return default

def norm(value):
    text=unicodedata.normalize('NFD',str(value or ''))
    return ''.join(c for c in text if unicodedata.category(c)!='Mn').casefold()

catalog=load(CATALOG,{})
items=[x for x in catalog.get('items',[]) if isinstance(x,dict)]
registry=load(REGISTRY,{})
metadata=load(METADATA,{})
expected=len(registry.get('apps') or [])+len(registry.get('links') or [])+len(registry.get('externalLinks') or [])+len(metadata.get('documents') or [])
minimum=max(20,min(60,math.floor(expected*0.65))) if expected else 20
errors=[]
if len(items)<minimum: errors.append(f'catálogo offline caiu para {len(items)} item(ns); mínimo calculado={minimum}, fontes centrais={expected}')
if catalog.get('sourcePolicy')!='hub-registry-and-document-metadata': errors.append('sourcePolicy offline não aponta para hub-registry + document-metadata')
text=lambda item: norm(' '.join([str(item.get('id') or ''),str(item.get('title') or ''),str(item.get('summary') or ''),' '.join(map(str,item.get('tags') or []))]))
sentinels={
    'Calendário': lambda x:'calendario' in text(x),
    'PPC': lambda x:'ppc' in text(x) or 'projeto pedagogico' in text(x),
    'Barema': lambda x:'barema' in text(x),
    'SUAP': lambda x:'suap' in text(x),
    'Fluxograma': lambda x:'fluxograma' in text(x),
}
for label,match in sentinels.items():
    found=[item for item in items if match(item)]
    if not found: errors.append(f'item-sentinela ausente: {label}')
    elif not any(str(item.get('url') or '').strip() for item in found): errors.append(f'item-sentinela sem URL: {label}')
for item in items:
    url=str(item.get('url') or '')
    if url.startswith('../../'): errors.append(f'URL não canônica no catálogo: {item.get("id")}: {url}')
keys=[]
for item in items:
    key=norm(item.get('id') or item.get('url') or item.get('title'))
    if key: keys.append(key)
if len(keys)!=len(set(keys)): errors.append('catálogo offline contém ids/chaves duplicadas')
if errors:
    print('Quality gate do catálogo offline: FALHOU',file=sys.stderr)
    for error in errors: print(f'- {error}',file=sys.stderr)
    raise SystemExit(1)
print(f'Quality gate do catálogo offline: OK ({len(items)} itens; mínimo {minimum}; sentinelas: {", ".join(sentinels)})')
