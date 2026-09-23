import hashlib,importlib.util,json,os,resource,shutil,subprocess,sys,time,unittest
from pathlib import Path
base=Path(sys.argv[1]);root=base/'source';sys.path.insert(0,str(root));sys.path.insert(0,str(root/'tests'))
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
props=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show','nfl-weekly-diagnostics.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes' and props['InvocationID']==os.environ['INVOCATION_ID']
(base/'live-properties.json').write_text(json.dumps(props))
manifest=json.loads((base/'manifest.json').read_bytes())
for name,digest in manifest['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
live=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
protected=[p for kind in ('locks','grades') for p in (live/'outputs/projection-v3'/kind).glob('*.json')]+[live/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p.relative_to(live)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
captured={}
def copy(name):
 p=(live/name).resolve();assert p.is_relative_to(live) and p.is_file()
 raw=p.read_bytes();dst=root/name;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(raw);captured[name]=hashlib.sha256(raw).hexdigest()
copy('outputs/projection-v3/board.json');copy('work/engine-rebuild/legacy-calibration-map.json')
for name in before:copy(name)
registry=json.loads((root/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
refs=[r for rr in registry['versions'].values() for r in rr]
for p in (root/'outputs/projection-v3/grades').glob('*.json'):
 c=json.loads(p.read_bytes())
 assert not c.get('forecast_bundle_ref'),'Capture needs new protected-bundle graph qualification'
 if c.get('fit_artifact_ref'):refs.append(c['fit_artifact_ref'])
for ref in refs:
 copy(ref['path']);assert captured[ref['path']]==ref['sha256']
 a=json.loads((root/ref['path']).read_bytes());copy(a['shapes']['path']);assert captured[a['shapes']['path']]==a['shapes']['sha256']
(base/'capture.json').write_text(json.dumps(captured,sort_keys=True))
started=time.monotonic();suite=unittest.TestSuite()
for pattern in ('test_projection_weekly_diagnostics.py','test_projection_learning.py','test_closeout_publish.py'):
 suite.addTests(unittest.defaultTestLoader.discover(str(root/'tests'),pattern=pattern))
result=unittest.TextTestRunner(verbosity=1).run(suite);assert result.wasSuccessful()
spec=importlib.util.spec_from_file_location('independent_weekly',root/'work/engine-rebuild/check_weekly_diagnostics.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.check(root,base/'captured')
assert before=={str(p.relative_to(live)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==h for name,h in captured.items())
from engine.projection.storage import save
receipt={'status':'PASS','tests':result.testsRun,'source_files':len(manifest['files']),'source_manifest_sha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),
 'captured_files':len(captured),'capture_sha256':hashlib.sha256((base/'capture.json').read_bytes()).hexdigest(),'protected_originals_unchanged':len(before),'elapsed_seconds':time.monotonic()-started,'live_properties':props,
 'captured_verification_sha256':hashlib.sha256((base/'captured/verification.json').read_bytes()).hexdigest(),'scope':'Isolated staged report code on actual Linux runtime and captured immutable production inputs; no fitting, provider request, activation or production report write'}
assert receipt['elapsed_seconds']<570
save(base/'result.json',receipt,immutable=True);print(json.dumps(receipt),flush=True)
