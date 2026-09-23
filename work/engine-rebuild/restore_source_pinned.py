"""Restore a standalone committed source bundle; no providers or activation."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
sys.path.insert(0,'/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
from scripts.projection_backup import restore
from engine.projection.storage import save
base=Path(sys.argv[1]).resolve()
record=json.loads((base/'record.json').read_text())
record['path']=str(base/(record['sha256']+'.bundle'))
if shutil.disk_usage(base).free<2*record['tracked_tree_bytes']:
    raise RuntimeError('Source restore reserve unavailable')
start=time.monotonic()
result=restore(record,base/'source')
# GNU sync -f invokes syncfs for the restored filesystem; acceptance follows it.
subprocess.run(['sync','-f',str(base/'source')],check=True)
save(base/'source.json',{'source':record,'result':result,'elapsed_seconds':time.monotonic()-start,'activation':False},immutable=True)
print(json.dumps(result),flush=True)
