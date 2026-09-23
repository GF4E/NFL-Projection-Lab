"""Independent post-job verification; never invokes fitting or activation."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from engine.projection.storage import save
from verify_job_journal import verify
base=Path(sys.argv[1]);invocation=sys.argv[2]
before=json.loads((base/'before.json').read_bytes());r=json.loads((base/'result.json').read_bytes())
rows=[json.loads(line) for line in subprocess.check_output(['journalctl','-u',before['unit'],'-o','json','--no-pager'],text=True).splitlines()]
terminal=verify(rows,before['unit'],invocation)
assert r['status']=='PASS' and r['live_activation'] is False
assert r['executed_restored_source_commit']==before['source_commit']
assert r['code']['files']==before['issuing_files'] and len(r['code']['files'])==50
assert r['read_only_restored_mounts_verified'] and r['live_properties']['InvocationID']==invocation
assert r['live_properties']['MemoryMax']=='4294967296' and r['live_properties']['RuntimeMaxUSec']=='9min 30s'
assert r['elapsed_seconds']<570 and r['peak_rss_bytes']<4*1024**3
assert r['slate_games']==16 and r['training_games']==2928
assert r['legacy_thursday_games']==['2026_03_ATL_GB'] and len(r['friday_state_games'])==14
for key in ('INITIAL_PLAN_STAGED','INITIAL_PLAN_ACTIVATED_AND_RETRIED','INITIAL_ROLLBACK_PRESERVED_THURSDAY'):
 assert key in r['phase_seconds'],key
for label,path in [('original_source',ROOT),('original_runtime',Path('/opt/nfl-runtime/env'))]:
 assert [path.stat().st_dev,path.stat().st_ino]==before[label]
for k,v in before['namespaces'].items():assert os.readlink('/proc/self/ns/'+k)==v
assert not os.path.ismount(base/'source-data')
for name,digest in before['original_records'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
for name in ('outputs/projection-v3/pipeline-releases/active.json','work/projection-weekly-refit-v1/configuration.json'):
 if name not in before['original_records']:assert not (ROOT/name).exists(),name
for name,digest in before['issuing_files'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
result={'status':'RESTORED_INITIAL_OPERATOR_VERIFIED','source_commit':before['source_commit'],
 'issuing_code_commit':before['issuing_code_commit'],'source_files':len(before['issuing_files']),
 'terminal_journal':terminal,'result_sha256':hashlib.sha256((base/'result.json').read_bytes()).hexdigest(),
 'original_records_and_pointer_unchanged':len(before['original_records']),
 'original_mounts_and_namespaces_unchanged':True,'activation':False,
 'scope':'Captured initial transition on restored executable/runtime with current data aliased read-only; simulated calendar and availability; no live activation or control-authority claim'}
save(base/'accepted.json',result,immutable=True);print(json.dumps(result),flush=True)
