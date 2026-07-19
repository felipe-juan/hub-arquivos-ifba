#!/usr/bin/env python3
"""Unit checks for production-host response decoding and cache parsing."""
from __future__ import annotations
import gzip
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hub_host_verifier",ROOT/"scripts/verify_production_host.py")
module=importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(module)
raw=b'<script src="assets/build/app.0123456789ab.js"></script>'
assert module.decoded_body(gzip.compress(raw),{"content-encoding":"gzip"})==raw
assert module.decoded_body(raw,{})==raw
assert module.cache_max_age("public, max-age=31536000, immutable")==31536000
assert module.cache_max_age("no-cache") is None
assert module.VERSION==(ROOT/"VERSION").read_text().strip()
print("Production host verifier unit test: OK")
