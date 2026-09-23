import hashlib,json,os,subprocess,sys,time,unittest
from pathlib import Path
base=Path('/mnt/nfl-engine-profiles/prospective-canary-attempt2');root=base/'source';sys.path.insert(0,str(root))
props=dict(line.split('=',1) for line in subprocess.check_output(['systemctl','show','nfl-prospective-canary-attempt2.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes'
assert props['InvocationID']==os.environ['INVOCATION_ID']
(base/'live-properties.json').write_text(json.dumps(props,sort_keys=True)+'\n')
manifest=json.loads((base/'manifest.json').read_bytes())
for name,digest in manifest['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
live=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
protected=[p for kind in ['locks','grades'] for p in (live/'outputs/projection-v3'/kind).glob('*.json')]+[live/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
started=time.monotonic();suite=unittest.TestSuite()
for pattern in ['test_projection_prospective.py','test_projection_research_ledger.py','test_projection_bundle.py','test_projection_cutoff_publication.py']:
 suite.addTests(unittest.defaultTestLoader.discover(str(root/'tests'),pattern=pattern))
result=unittest.TextTestRunner(verbosity=1).run(suite)
assert result.wasSuccessful()
# Real captured production requests, immutable input bundles, current original fit.
from engine.projection import prospective as prospective,bundle
from engine.projection.lineage import read_artifact
from engine.projection.scoring import artifact_payload
import math
board=json.loads((live/'outputs/projection-v3/board.json').read_bytes())
checked=[];independent=0
for card in board['games']:
 if card.get('status')!='UPCOMING':continue
 b=bundle.verify_card(live,card)
 artifact=read_artifact(live,card['fit_artifact_ref']);shapes=read_artifact(live,card['calibration_ref'])
 plan={'reference':{'code':prospective.scorer_code(root),'environment':prospective.environment(),'artifact':artifact_payload(artifact),'shapes':shapes}}
 actual=prospective.frozen_score(plan,b['input'],root)
 assert actual['projection']==card['projection']
 for side in ('home','away'):
  f=artifact['fit'];features=b['input']['rows'][side]['features']
  independent_point=math.fsum([features['baseline']]+[(features[n]-m)/scale*c if features[n] is not None else 0 for n,m,scale,c in zip(f['names'],f['means'],f['scales'],f['coefficients'])]+([f['intercept']] if 'calibration' in f['groups'] else []))
  assert abs(independent_point-actual['projection'][side+'_points'])<=1e-12
  independent+=1
 checked.append(card['game_id'])
assert len(checked)==16 and independent==32
# Actual production admission remains closed. This is reconstruction, not enrollment.
try:prospective.admission(live)
except ValueError as e:admission_reason=str(e)
else:raise AssertionError('Unexpected production enrollment authority')
assert before=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
report={'status':'PASS','tests':result.testsRun,'files_verified':len(manifest['files']),'manifest_sha256':hashlib.sha256((base/'manifest.json').read_bytes()).hexdigest(),'elapsed_seconds':time.monotonic()-started,'original_records_and_pointer_unchanged':len(protected),'live_properties':props,'scope':'Synthetic lifecycle tests plus captured live input scoring; no enrollment, experiment, activation or deployment','captured_game_ids':checked,'independent_point_checks':independent,'production_admission_refusal':admission_reason,'provider_requests':0,'new_spending':0}
(base/'result.json').write_text(json.dumps(report,sort_keys=True)+'\n');print(json.dumps(report),flush=True)
