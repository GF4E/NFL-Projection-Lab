import hashlib,json,os,subprocess,sys,time,unittest
from pathlib import Path
base=Path('/mnt/nfl-engine-profiles/prospective-collector-attempt3');root=base/'source';sys.path.insert(0,str(root))
props=dict(line.split('=',1) for line in subprocess.check_output(['systemctl','show','nfl-prospective-collector-attempt3.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes'
assert props['InvocationID']==os.environ['INVOCATION_ID']
(base/'live-properties.json').write_text(json.dumps(props,sort_keys=True)+'\n')
manifest=json.loads((base/'manifest.json').read_bytes())
for name,digest in manifest['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
live=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
protected=[p for kind in ['locks','grades'] for p in (live/'outputs/projection-v3'/kind).glob('*.json')]+[live/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
started=time.monotonic();suite=unittest.TestSuite()
for pattern in ['test_projection_prospective_worker.py']:
 suite.addTests(unittest.defaultTestLoader.discover(str(root/'tests'),pattern=pattern))
result=unittest.TextTestRunner(verbosity=1).run(suite)
assert result.wasSuccessful()
assert before=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
report={'status':'PASS','tests':result.testsRun,'files_verified':len(manifest['files']),'manifest_sha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),'elapsed_seconds':time.monotonic()-started,'original_records_and_pointer_unchanged':len(protected),'live_properties':props,'scope':'Synthetic 16-game interrupted-slate drain and collector lifecycle/resource tests; no production enrollment or writes','provider_requests':0,'new_spending':0}
(base/'result.json').write_text(json.dumps(report,sort_keys=True)+'\n');print(json.dumps(report),flush=True)
