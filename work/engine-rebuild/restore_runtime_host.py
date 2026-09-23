"""Bounded operator recovery qualification; fresh private output, no activation."""
import datetime as dt
import json
from pathlib import Path
import shutil
import sys
import time
sys.path.insert(0, '/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
from engine.projection import runtime_snapshot as rs
snapshot, destination, receipt_path = map(Path, sys.argv[1:])
start=time.monotonic()
manifest=json.loads((snapshot/'intent.json').read_bytes())
required=sum(x.get('size',0) for x in manifest['entries'].values())*2
if shutil.disk_usage(destination.parent).free < required: raise RuntimeError('Two-copy reserve unavailable')
if receipt_path.exists(): raise ValueError('Fresh terminal receipt required')
print('RESTORE_STARTED', dt.datetime.now(dt.timezone.utc).isoformat(), flush=True)
try:
    result=rs.restore(snapshot,destination)
    receipt={'status':'TREE_RESTORE_VERIFIED', 'manifest_sha256':rs.digest_file(snapshot/'intent.json'),
             'verified':result,'elapsed_seconds':time.monotonic()-start,
             'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
             'activation':False,'executable_recovery_qualified':False,'provider_requests':0,'new_spending':0}
    rs.save(receipt_path,receipt,immutable=True)
    print(json.dumps(receipt),flush=True)
except Exception as exc:
    rs.save(receipt_path,{'status':'FAILED','error_type':type(exc).__name__,'error':str(exc),
             'elapsed_seconds':time.monotonic()-start,'activation':False},immutable=True)
    raise
