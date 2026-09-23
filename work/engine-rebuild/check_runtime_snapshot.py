"""Private on-host capture/restore qualification; does not execute restored code."""
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import time

repo = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0, str(repo))
module_path, base = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('engine.projection.runtime_snapshot', module_path)
rs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rs)
source = Path('/opt/nfl-runtime/env')
start = time.monotonic()
manifest = rs.inventory(source)
logical_bytes = sum(v.get('size', 0) for v in manifest.values())
free_before = shutil.disk_usage(base.parent).free
if free_before < 3 * logical_bytes: raise RuntimeError('Three-copy reserve unavailable')
base.mkdir(mode=0o700)
print('CAPTURE_STARTED', flush=True)
captured = rs.capture(source, base/'snapshot')
print('CAPTURE_VERIFIED', flush=True)
restored = rs.restore(base/'snapshot', base/'restored')
source_unchanged = rs.inventory(source) == manifest
if not source_unchanged: raise RuntimeError('Original runtime changed')
result = {
    'status': 'TREE_VERIFIED_EXECUTION_PENDING',
    'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
    'module_sha256': hashlib.sha256(module_path.read_bytes()).hexdigest(),
    'capture': captured, 'restore': restored,
    'source_unchanged': source_unchanged,
    'free_bytes_before': free_before, 'free_bytes_after': shutil.disk_usage(base).free,
    'elapsed_seconds': time.monotonic()-start,
    'activation': False, 'provider_requests': 0, 'new_spending': 0,
    'remaining': ['OS/native-library compatibility', 'Complete source recovery', 'Isolated consumer execution and rollback'],
}
rs.save(base/'receipt.json', result, immutable=True)
print(json.dumps(result, indent=2), flush=True)
