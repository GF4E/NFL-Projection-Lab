"""Prepare a fresh isolated initial-operator invocation; no production mutation."""
import hashlib,json,os,pwd,subprocess,sys
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from engine.projection import bundle,release_preflight
from engine.projection.storage import save
recovery=Path(sys.argv[1]);base=recovery/'initial-operator';packet_ref=json.loads(Path(sys.argv[2]).read_bytes())
release_preflight.read(ROOT,packet_ref)
record=json.loads((recovery/'source.json').read_bytes());source=recovery/'source'
code=json.loads(subprocess.check_output(['runuser','-u','nflengine','--',sys.executable,'-B','-c',
    'import json,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from engine.projection.bundle import capture_code;print(json.dumps(capture_code(Path(sys.argv[1]))))',str(ROOT)],text=True))
assert len(code['files'])==50
for name,digest in code['files'].items():assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest,name
uid=pwd.getpwnam('nflengine').pw_uid;gid=pwd.getpwnam('nflengine').pw_gid
base.mkdir(mode=0o700);os.chown(base,uid,gid)
for name in ('work','source-data'):
 (base/name).mkdir(mode=0o700);os.chown(base/name,uid,gid)
files=[p for kind in ('locks','grades') for p in (ROOT/'outputs/projection-v3'/kind).glob('*.json')]
files.append(ROOT/'work/in-season-learning-v1/active-fit-ref.json')
for name in ('outputs/projection-v3/pipeline-releases/active.json','work/projection-weekly-refit-v1/configuration.json'):
 if (ROOT/name).exists():files.append(ROOT/name)
runtime=Path('/mnt/nfl-engine-profiles/runtime-restored-20260923-attempt2')
before={'source_commit':record['source']['commit'],'issuing_files':code['files'],'issuing_code_commit':code['commit'],'uid':uid,'gid':gid,
 'unit':'nfl-initial-operator-diagnostics.service','namespaces':{k:os.readlink('/proc/self/ns/'+k) for k in ('mnt','net')},
 'restored_source':[source.stat().st_dev,source.stat().st_ino],'restored_runtime':[runtime.stat().st_dev,runtime.stat().st_ino],
 'original_source':[ROOT.stat().st_dev,ROOT.stat().st_ino],'original_runtime':[Path('/opt/nfl-runtime/env').stat().st_dev,Path('/opt/nfl-runtime/env').stat().st_ino],
 'original_records':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
save(base/'before.json',before,immutable=True);save(base/'packet-ref.json',packet_ref,immutable=True)
manifest=Path('/mnt/nfl-engine-profiles/runtime-restore-20260923/snapshot/intent.json').read_bytes()
assert hashlib.sha256(manifest).hexdigest()==json.loads((recovery/'runtime-reverified.json').read_bytes())['manifest_sha256']
(base/'runtime-manifest.json').write_bytes(manifest)
(base/'run.py').write_bytes((recovery/'run_initial_operator_restored.py').read_bytes())
for p in base.iterdir():os.chown(p,uid,gid)
print(json.dumps({'state':'PREPARED','base':str(base),'source_commit':before['source_commit'],'source_files':len(code['files']),'records_preserved':len(files),'packet_ref':packet_ref}))
