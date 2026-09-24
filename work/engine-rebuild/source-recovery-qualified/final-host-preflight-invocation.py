import datetime as dt,hashlib,json,os,resource,subprocess,sys,time
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from engine.projection import bundle,cutoff_worker,release_preflight
from engine.projection.storage import save
base=Path(sys.argv[1]);start=time.monotonic()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
assert os.getuid()==1000
props=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show','nfl-qualified-final-preflight.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID','-p','CPUQuotaPerSecUSec'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes'
assert props['InvocationID']==os.environ['INVOCATION_ID']
save(base/'live-properties.json',props,immutable=True)
protected=[p for kind in ('locks','grades') for p in (ROOT/'outputs/projection-v3'/kind).glob('*.json')]+[ROOT/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
ref=json.loads((ROOT/'work/engine-rebuild/release-review/current-ref.json').read_bytes())
assert ref['sha256']==sys.argv[2]
result=release_preflight.check(ROOT,ref,runtime_manifest=Path('/mnt/nfl-engine-profiles/source-recovery-qualified/initial-operator/runtime-manifest.json'))
assert len([c for c in result['checks'] if c['status']=='PASS'])==6
assert before=={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
code=bundle.capture_code(ROOT)
result.update(observed_at=dt.datetime.now(dt.timezone.utc).isoformat(),issuing_code_commit=code['commit'],host_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),issuing_files=code['files'],protected_records_unchanged=len(before),elapsed_seconds=time.monotonic()-start,live_properties=props,cutoff_health=cutoff_worker.health(ROOT,dt.datetime.now(dt.timezone.utc)),free_bytes={str(p):os.statvfs(p).f_bavail*os.statvfs(p).f_frsize for p in (Path('/'),Path('/mnt/nfl-engine-profiles'))})
assert result['elapsed_seconds']<570
save(base/'result.json',result,immutable=True)
print(json.dumps(result),flush=True)
