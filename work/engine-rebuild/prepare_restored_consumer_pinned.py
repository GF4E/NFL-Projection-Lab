"""Prepare a read-only isolated consumer check; never changes original mounts."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
sys.path.insert(0,'/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
from engine.projection.storage import save
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
parent=Path('/mnt/nfl-engine-profiles')
recovery=Path(sys.argv[1]).resolve();source=recovery/'source'
runtime=parent/'runtime-restored-20260923-attempt2'
base=recovery/'consumer'
uid=pwd.getpwnam('nflengine').pw_uid;gid=pwd.getpwnam('nflengine').pw_gid
receipt=json.loads((parent/'runtime-restore-attempt2.json').read_text())
if receipt['status']!='TREE_RESTORE_VERIFIED':raise ValueError('Runtime restore not verified')
source_receipt=json.loads((recovery/'source.json').read_text())
if source_receipt['source']['commit']!=json.loads((recovery/'record.json').read_text())['commit']:raise ValueError('Source commit differs')
# Exact fresh verification of both runtime trees before accepting reuse.
from engine.projection.runtime_snapshot import verify
raw=(parent/'runtime-restore-20260923/snapshot/intent.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!=receipt['manifest_sha256']:raise ValueError('Runtime manifest differs')
manifest=json.loads(raw)
summary={'installed':verify('/opt/nfl-runtime/env',manifest),'restored':verify(runtime,manifest)}
save(recovery/'runtime-reverified.json',{'manifest_sha256':receipt['manifest_sha256'],**summary},immutable=True)
# Permit service traversal of the otherwise private recovery parent.
os.chown(recovery,0,gid);os.chmod(recovery,0o710)
base.mkdir(mode=0o700);os.chown(base,uid,gid)
(base/'work').mkdir(mode=0o700);os.chown(base/'work',uid,gid)
# Git read-only identity checks run as the actual service user in the namespace.
subprocess.run(['chown','-R',f'{uid}:{gid}',str(source)],check=True)
source.chmod(0o755)
files=[p for kind in ('locks','grades') for p in (root/'outputs/projection-v3'/kind).glob('*.json')]
files.append(root/'work/in-season-learning-v1/active-fit-ref.json')
for name in ['outputs/projection-v3/pipeline-releases/active.json','work/projection-weekly-refit-v1/configuration.json']:
    if (root/name).exists():files.append(root/name)
value={'source_commit':source_receipt['source']['commit'],'uid':uid,'gid':gid,
 'runtime_manifest_sha256':receipt['manifest_sha256'],
 'namespaces':{k:os.readlink('/proc/self/ns/'+k) for k in ('mnt','net')},
 'restored_source':[source.stat().st_dev,source.stat().st_ino],
 'restored_runtime':[runtime.stat().st_dev,runtime.stat().st_ino],
 'original_source':[root.stat().st_dev,root.stat().st_ino],
 'original_runtime':[Path('/opt/nfl-runtime/env').stat().st_dev,Path('/opt/nfl-runtime/env').stat().st_ino],
 'original_records':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
save(base/'before.json',value,immutable=True)
os.chown(base/'before.json',uid,gid)
print(json.dumps({'source_commit':value['source_commit'],'immutable_records_and_pointers':len(files),'activation':False}))
