"""Prepared-state faults and actual saved forecast reproduction in host tmpfs."""
import base64,gzip,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TESTS=['test_projection_prepared.py','test_projection_storage.py']
files={str(p.relative_to(ROOT)):p.read_text() for parent in ('engine','scripts') for p in (ROOT/parent).rglob('*.py') if '__pycache__' not in p.parts}
files.update({'tests/'+name:(ROOT/'tests'/name).read_text() for name in TESTS})
program='PAYLOAD='+repr(base64.b64encode(gzip.compress(json.dumps(files).encode())).decode())+'\nTESTS='+repr(TESTS)+'\n'+'''
import base64,datetime,gzip,hashlib,io,json,os,platform,resource,subprocess,sys,tempfile,time,unittest
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
with tempfile.TemporaryDirectory(prefix='prepared-state-',dir='/run/nfl-engine-monitor') as temporary:
 candidate=Path(temporary)
 for name,text in files.items():
  path=candidate/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 os.chdir(candidate);sys.path.insert(0,str(candidate));log=io.StringIO();noise=io.StringIO()
 suite=unittest.TestSuite()
 for name in TESTS:suite.addTests(unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern=name))
 import contextlib
 start=time.monotonic()
 with contextlib.redirect_stdout(noise):result=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
 from engine.projection import prepared,bundle,executable
 from engine.projection.storage import save
 from engine.projection.scoring import prepare_pair
 from engine.projection.train import paired
 before={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('locks','grades') for p in (root/'outputs/projection-v3'/folder).glob('*.json')}
 rows,manifest,raw=prepared.load(root)
 fit=prepared.active_fit(root);assert manifest['fit']==fit
 audit=candidate/'snapshot';save(audit/'work/in-season-learning-v1/active-fit-ref.json',fit)
 with prepared.writer(audit):pointer=prepared.commit(audit,raw,manifest)
 loaded,_,restored_raw=prepared.load(audit,ref=pointer['prepared_manifest_ref'])
 assert restored_raw==raw and loaded==rows
 board=json.loads((root/'outputs/projection-v3/board.json').read_bytes());pairs=paired(loaded)
 package_ref={'path':'outputs/projection-v3/executables/89ce079cce81d50b435fd547320c391c96bbf4b993dd97f08079f0619ae453c2.json.gz','sha256':'89ce079cce81d50b435fd547320c391c96bbf4b993dd97f08079f0619ae453c2'}
 package=executable.load(root,package_ref);destination=candidate/'restored-executable';executable.unpack_code(package['code']['files'],destination)
 requests=[];cards=[]
 for card in board['games']:
  b=bundle.verify_card(root,card)
  if b and card['release_ref']==package['release_ref']:
   request=prepare_pair(pairs[card['game_id']],b['input']['forecast'])
   assert request==b['input'],card['game_id']
   requests.append(request);cards.append(card)
 assert cards
 scored=executable.execute(package,destination,requests,pointer)
 for card in cards:assert scored[card['game_id']]=={k:card[k] for k in ('projection','contributions','why')}
 assert all(hashlib.sha256((root/path).read_bytes()).hexdigest()==digest for path,digest in before.items())
 stat=os.statvfs(root)
 names=['engine/projection/prepared.py','engine/projection/bundle.py','scripts/projection_v3_prepare.py','scripts/projection_v3_publish.py','scripts/projection_learning.py','scripts/cloud_scheduler.py']
 output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,'uid':os.getuid(),'python':platform.python_version(),
 'scope':'Candidate prepared-state tests and snapshot plus archived scorer in host tmpfs. Actual production inputs read only; no fit, provider call, active pointer switch or publication.',
 'tests':result.testsRun,'success':result.wasSuccessful(),'wall_seconds':time.monotonic()-start,
 'peak_rss_self_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'peak_rss_children_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
 'candidate_hashes':{p:hashlib.sha256(files[p].encode()).hexdigest() for p in names},
 'prepared':{'legacy_sha256':manifest['sha256'],'snapshot':pointer,'bytes':len(raw),'rows':len(rows),'exact_bytes_and_rows':True},
 'exact_restored_forecasts':len(cards),'input_requests_equal_saved_bundles':len(requests),'frozen_records_unchanged':len(before),
 'package_ref':package_ref,'free_root_bytes':stat.f_bavail*stat.f_frsize,'provider_credits':0,'output':log.getvalue()}
 os.chdir(root)
print(json.dumps(output));raise SystemExit(not result.wasSuccessful())
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=180)
if r.returncode:raise RuntimeError('Host prepared candidate failed: '+r.stdout[-1800:]+r.stderr[-1400:])
v=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-prepared-candidate.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:x for k,x in v.items() if k not in ('output','candidate_hashes')},indent=2))
