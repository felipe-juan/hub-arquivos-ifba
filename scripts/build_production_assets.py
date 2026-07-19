#!/usr/bin/env python3
"""Create content-hashed JS/CSS assets and rewrite production HTML references.

Source files remain readable at their original paths. Pages load the hashed copies, so
those copies can safely use Cache-Control: immutable.
"""
from __future__ import annotations
import hashlib, json, re, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ROOT_BUILD=ROOT/'assets'/'build'
APP_BUILD=ROOT/'apps'/'build'
MANIFEST=ROOT/'assets'/'build-manifest.json'
VERSION=(ROOT/'VERSION').read_text().strip()

ROOT_LEAVES=[
 'data.js','js/storage.js','js/design-system.js','js/where-data.js',
 'js/enhancements.js','js/experience.js','js/sidebar-quick-search.js',
 'js/pdf-runtime.js','js/search-engine.js','js/performance-monitor.js',
 'styles.css','css/enhancements.css','css/sidebar-quick-search.css','css/design-system.css',
]
APP_LEAVES=[
 'apps/app-shell.js','apps/app-shell.css','apps/doom/doom.js','apps/doom/doom.css',
 'apps/calendario/data/calendar-data.js','apps/fluxogramas/data/fluxogramas-data.js',
 'apps/barema/data/barema-data.js',
]
HTML_FILES=[ROOT/'index.html',ROOT/'apps/calendario/index.html',ROOT/'apps/fluxogramas/index.html',ROOT/'apps/barema/index.html',ROOT/'apps/doom/index.html']

def digest(data:bytes)->str:return hashlib.sha256(data).hexdigest()[:12]
def hashed_name(source:str,data:bytes)->str:
    stem=Path(source).stem; suffix=Path(source).suffix
    return f'{stem}.{digest(data)}{suffix}'
def read_text(path:str)->str:return (ROOT/path).read_text(encoding='utf-8')

def restore_previous():
    if not MANIFEST.exists(): return
    try: old=json.loads(MANIFEST.read_text(encoding='utf-8')).get('files',{})
    except Exception:return
    import os
    for path in [*HTML_FILES,ROOT/'service-worker.js']:
        if not path.exists():continue
        text=path.read_text(encoding='utf-8')
        for source,built in sorted(old.items(),key=lambda item:-len(item[1])):
            built_ref=Path(os.path.relpath(ROOT/built,path.parent)).as_posix()
            source_ref=Path(os.path.relpath(ROOT/source,path.parent)).as_posix()
            pattern=re.compile(r"(?<![A-Za-z0-9_-])"+re.escape(built_ref)+r"(?=$|[?#\"'\s<>)\],;])")
            text=pattern.sub(f"{source_ref}?v={VERSION}",text)
        path.write_text(text,encoding='utf-8')

def write_hashed(source:str,target_dir:Path,content:bytes|None=None)->str:
    data=content if content is not None else (ROOT/source).read_bytes()
    target_dir.mkdir(parents=True,exist_ok=True)
    target=target_dir/hashed_name(source,data)
    target.write_bytes(data)
    return target.relative_to(ROOT).as_posix()

def html_relative(html:Path,built:str)->str:
    import os
    return Path(os.path.relpath(ROOT/built,html.parent)).as_posix()

def replace_ref(text:str,source:str,built:str,html:Path|None=None)->str:
    replacement=html_relative(html,built) if html else built
    variants={source,f'./{source}',f'{source}?v={VERSION}',f'./{source}?v={VERSION}'}
    if html:
        import os
        rel=Path(os.path.relpath(ROOT/source,html.parent)).as_posix()
        variants.update({rel,f'{rel}?v={VERSION}'})
    for value in sorted(variants,key=len,reverse=True):
        pattern=re.compile(r"(?<![A-Za-z0-9_-])"+re.escape(value)+r"(?=$|[?#\"'\s<>)\],;])")
        text=pattern.sub(replacement,text)
    return text

def main():
    restore_previous()
    shutil.rmtree(ROOT_BUILD,ignore_errors=True);shutil.rmtree(APP_BUILD,ignore_errors=True)
    files={}
    for source in ROOT_LEAVES:files[source]=write_hashed(source,ROOT_BUILD)
    for source in APP_LEAVES:files[source]=write_hashed(source,APP_BUILD)

    # Worker must import the hashed engine from the same build directory.
    worker_source=read_text('js/search-worker.js')
    worker_source=re.sub(r'importScripts\(["\']search-engine\.js(?:\?v=[^"\']+)?["\']\)',f'importScripts("{Path(files["js/search-engine.js"]).name}")',worker_source)
    files['js/search-worker.js']=write_hashed('js/search-worker.js',ROOT_BUILD,worker_source.encode())

    # The hashed app copy points to hashed lazy modules and Worker.
    app_source=read_text('app.js')
    for source in ['js/pdf-runtime.js','js/search-engine.js','js/search-worker.js','js/enhancements.js','js/experience.js','js/sidebar-quick-search.js','js/performance-monitor.js']:
        app_source=replace_ref(app_source,source,files[source])
    # Dynamic imports are resolved relative to the hashed app file inside
    # assets/build/, not relative to index.html. Keep lazy modules beside it.
    for source in ['js/pdf-runtime.js','js/search-engine.js']:
        built=files[source]
        filename=Path(built).name
        app_source=app_source.replace(f'import("{built}")', f'import("./{filename}")')
        app_source=app_source.replace(f'import("./{built}")', f'import("./{filename}")')
    files['app.js']=write_hashed('app.js',ROOT_BUILD,app_source.encode())

    # Rewrite pages to load hashed copies.
    for html in HTML_FILES:
        text=html.read_text(encoding='utf-8')
        for source,built in sorted(files.items(), key=lambda item: -len(item[0])):
            text=replace_ref(text,source,built,html)
        html.write_text(text,encoding='utf-8')

    # Precache exactly the files loaded by the pages; keep source files out of immutable cache paths.
    sw=read_text('service-worker.js')
    for source,built in sorted(files.items(), key=lambda item: -len(item[0])): sw=replace_ref(sw,source,built)
    (ROOT/'service-worker.js').write_text(sw,encoding='utf-8')

    payload={'version':VERSION,'generatedBy':'scripts/build_production_assets.py','files':dict(sorted(files.items()))}
    MANIFEST.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Generated {len(files)} content-hashed assets.')
    print(f'Manifest: {MANIFEST.relative_to(ROOT)}')

if __name__=='__main__':main()
