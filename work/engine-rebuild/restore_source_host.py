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
base=Path('/mnt/nfl-engine-profiles')
record={'path':str(base/'040630d494d75d26f4ff0c9bd3e0a4fa87d887e62dd655a15e33585e4870af3b.bundle'),
 'sha256':'040630d494d75d26f4ff0c9bd3e0a4fa87d887e62dd655a15e33585e4870af3b',
 'bytes':550563892,'commit':'1c34bd80e53b806db2f1cf6607f210493375b943',
 'ref':'refs/rebuild-backups/1c34bd80e53b806db2f1cf6607f210493375b943'}
# Tracked tree is 2,949,738,715 bytes; reserve double, including object store.
if shutil.disk_usage(base).free<2*2949738715:raise RuntimeError('Source restore reserve unavailable')
start=time.monotonic()
result=restore(record,base/'source-restored-20260923')
# GNU sync -f invokes syncfs for the restored filesystem; acceptance follows it.
subprocess.run(['sync','-f',str(base/'source-restored-20260923')],check=True)
save(base/'source-restored-20260923.json',{'source':record,'result':result,'elapsed_seconds':time.monotonic()-start,'activation':False},immutable=True)
print(json.dumps(result),flush=True)
