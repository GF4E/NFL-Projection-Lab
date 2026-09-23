"""Read-only restored source/runtime canary inside isolated Linux namespaces."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import resource
import socket
import subprocess
import sys
import time
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0,str(ROOT))
from engine.projection.storage import save
from scripts.projection_backup import reproduce
base=Path(sys.argv[1]);expected=json.loads((base/'before.json').read_text())
if os.getuid()!=expected['uid']:raise ValueError('Wrong service identity')
for kind in ('mnt','net'):
    if os.readlink('/proc/self/ns/'+kind)==expected['namespaces'][kind]:raise ValueError('Namespace isolation absent')
if sys.prefix!='/opt/nfl-runtime/env':raise ValueError('Restored fixed prefix required')
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()!=expected['source_commit']:
    raise ValueError('Restored source identity differs')
for p,k in [(ROOT,'restored_source'),(Path(sys.prefix),'restored_runtime')]:
    if [p.stat().st_dev,p.stat().st_ino]!=expected[k]:raise ValueError('Expected restored mount absent')
    if not (os.statvfs(p).f_flag & os.ST_RDONLY):raise ValueError('Restored source/runtime must be read only')
if sorted(name for _,name in socket.if_nameindex())!=['lo']:raise ValueError('Unexpected network interface')
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
started=time.monotonic()
parity=reproduce(ROOT)
# The existing helper's legacy runtime label is not correct in this restored namespace.
parity['runtime']='Restored Linux interpreter/native environment at its original prefix'
save(base/'parity.json',parity,immutable=True)
print('RESTORED_FORECAST_PARITY',json.dumps(parity),flush=True)
spec=importlib.util.spec_from_file_location('restored_lifecycle',ROOT/'work/engine-rebuild/check_full_lifecycle.py')
lifecycle=importlib.util.module_from_spec(spec);spec.loader.exec_module(lifecycle)
result=lifecycle.verify(ROOT,temp_parent=base/'work')
native={}
for line in Path('/proc/self/maps').read_text().splitlines():
    columns=line.split(maxsplit=5)
    if len(columns)!=6 or not columns[5].startswith('/'):continue
    path=Path(columns[5])
    if not path.is_file():raise ValueError('Unresolved mapped native dependency')
    if not path.is_relative_to(Path(sys.prefix)):
        native[str(path)]=hashlib.sha256(path.read_bytes()).hexdigest()
report={'status':'RESTORED_CONSUMER_PASS','source_commit':expected['source_commit'],
 'runtime_manifest_sha256':expected['runtime_manifest_sha256'],'parity':parity,'lifecycle':result,
 'external_native_files':native,'os_release_sha256':hashlib.sha256(Path('/etc/os-release').read_bytes()).hexdigest(),
 'kernel':platform.release(),'namespace_isolation_verified':True,'read_only_restored_mounts':True,
 'actual_uid':os.getuid(),'elapsed_seconds':time.monotonic()-started,'activation':False,
 'scope':'Same-host restored executable and native runtime; simulated lifecycle; no OS/machine disaster recovery claim'}
save(base/'consumer.json',report,immutable=True)
print(json.dumps(report),flush=True)
