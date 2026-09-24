"""Isolated actual-host diagnostic qualification, captured inputs only."""
import hashlib,json,os,runpy,subprocess,sys,time,unittest
from pathlib import Path
base=Path(sys.argv[1]);root=base/'source';sys.path[:0]=[str(root),str(root/'tests')]
live=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
started=time.monotonic()
props=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show','nfl-qualified-diagnostics.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID','-p','CPUQuotaPerSecUSec','-p','KillMode','-p','KillSignal'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes' and props['InvocationID']==os.environ['INVOCATION_ID']
(base/'live-properties.json').write_text(json.dumps(props,indent=2))
manifest=json.loads((base/'manifest.json').read_bytes())
for name,digest in manifest['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
protected=[p for kind in ('locks','grades') for p in (live/'outputs/projection-v3'/kind).glob('*.json')]+[live/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p.relative_to(live)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
captured={}
def copy(name):
 p=(live/name).resolve();assert p.is_relative_to(live) and p.is_file()
 raw=p.read_bytes();dst=root/name;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(raw);captured[name]=hashlib.sha256(raw).hexdigest()
for name in ['outputs/projection-v3/board.json','work/engine-rebuild/legacy-calibration-map.json','work/in-season-learning-v1/reference.json',*before]:copy(name)
registry=json.loads((root/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
refs=[r for rr in registry['versions'].values() for r in rr]
for p in (root/'outputs/projection-v3/grades').glob('*.json'):
 c=json.loads(p.read_bytes());assert not c.get('forecast_bundle_ref'),'New bundle graph requires capture qualification'
 if c.get('fit_artifact_ref'):refs.append(c['fit_artifact_ref'])
for ref in refs:
 copy(ref['path']);assert captured[ref['path']]==ref['sha256']
 a=json.loads((root/ref['path']).read_bytes());copy(a['shapes']['path']);assert captured[a['shapes']['path']]==a['shapes']['sha256']
from engine.projection.source_archive import reference
copy('outputs/projection-v3/final-feed.json');feed=json.loads((root/'outputs/projection-v3/final-feed.json').read_bytes());copy(reference(feed)['path'])
for name in ['outputs/in-season-learning-v1/reference-sources/receipts.json','outputs/in-season-learning-v1/reference-sources/status.json']:
 if (live/name).exists():copy(name)
receipt='outputs/in-season-learning-v1/reference-sources/receipts.json'
if not (root/receipt).exists():receipt='work/reference-line-metric-v1/open-source-receipts.json';copy(receipt)
for ref in json.loads((root/receipt).read_bytes()):copy(ref['path'])
if (live/'.cloud-private/projection-entries.json').exists():copy('.cloud-private/projection-entries.json')
(base/'capture.json').write_text(json.dumps(captured,sort_keys=True))
suite=unittest.TestSuite()
for pattern in ('test_projection_diagnostic_qualification.py','test_projection_weekly_diagnostics.py','test_projection_learning.py','test_closeout_publish.py'):
 suite.addTests(unittest.defaultTestLoader.discover(str(root/'tests'),pattern=pattern))
result=unittest.TextTestRunner(verbosity=1).run(suite);assert result.wasSuccessful()
sys.argv=[str(root/'work/engine-rebuild/check_qualified_diagnostics.py'),str(base/'captured')]
runpy.run_path(sys.argv[0],run_name='__main__')
assert before=={str(p.relative_to(live)):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==h for name,h in captured.items())
receipt={'status':'PASS','tests':result.testsRun,'source_files':len(manifest['files']),'protected_originals_unchanged':len(before),'elapsed_seconds':time.monotonic()-started,'live_properties':props,'source_manifest_sha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),'capture_sha256':hashlib.sha256((base/'capture.json').read_bytes()).hexdigest(),'verification':json.loads((base/'captured/verification.json').read_bytes()),'scope':'Isolated Linux staged code on captured production inputs; no production writes, fitting or providers'}
assert receipt['elapsed_seconds']<570
(base/'result.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
