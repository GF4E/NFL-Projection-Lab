"""Restore and exercise candidate executable packages in host tmpfs only."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
files = {name: (ROOT/name).read_text() for name in (
    'engine/projection/executable.py', 'tests/test_projection_executable.py',
    'tests/test_projection_bundle.py')}
program = 'FILES=' + repr(files) + '\n' + r'''
import base64,datetime,hashlib,importlib.util,io,json,os,platform,resource,subprocess,sys,tempfile,time,unittest
from pathlib import Path
root=Path.cwd();start=time.monotonic()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
from engine.projection.bundle import CODE_PATHS,resolve,verify_card
before={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('locks','grades') for p in (root/'outputs/projection-v3'/folder).glob('*.json')}
board_path=root/'outputs/projection-v3/board.json';board_raw=board_path.read_bytes();board=json.loads(board_raw)
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
with tempfile.TemporaryDirectory(prefix='executable-',dir='/run/nfl-engine-monitor') as temporary:
 base=Path(temporary)
 for name,source in FILES.items():
  path=base/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(source)
 spec=importlib.util.spec_from_file_location('engine.projection.executable',base/'engine/projection/executable.py')
 e=importlib.util.module_from_spec(spec);sys.modules[spec.name]=e;spec.loader.exec_module(e)
 sys.path.insert(0,str(base/'tests'));import test_projection_executable as tests
 def source_fixture(cls):
  ref=json.loads((root/'outputs/projection-v3/current-release-ref.json').read_bytes());release=resolve(root,ref,'releases')
  cls.original=root;cls.code=e.code_closure(root,release['code']['commit'])
  for p in CODE_PATHS:cls.code.setdefault(p,e.git(root,'show',release['code']['commit']+':'+p).decode())
 tests.ExecutableTests.setUpClass=classmethod(source_fixture)
 log=io.StringIO();result=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(tests.ExecutableTests))
 if not result.wasSuccessful():raise ValueError(log.getvalue())
 groups={}
 for card in board['games']:
  bundle=verify_card(root,card)
  if bundle:groups.setdefault(card['release_ref']['sha256'],[]).append((card,bundle))
 if not groups:raise ValueError('No saved bundle-backed forecasts')
 packages=[]
 for key,pairs in groups.items():
  package=e.build(root,pairs[0][0]['release_ref'],base/('build-'+key))
  reference=e.store(base,package);restored=e.load(base,reference)
  dest=base/('restored-'+key);e.unpack_code(restored['code']['files'],dest)
  # Every input manifest is checked before sharing its exact fit across the batch.
  manifests=[resolve(root,b['prepared_manifest_ref'],'input-manifests') for _,b in pairs]
  assert all(m.get('fit')==restored['release']['fit_artifact_ref'] for m in manifests)
  outputs=e.execute(restored,dest,[b['input'] for _,b in pairs],manifests[0])
  for card,b in pairs:assert outputs[card['game_id']]=={name:card[name] for name in ('projection','contributions','why')}
  e.verify_code(restored,dest)
  raw=(base/reference['path']).read_bytes()
  packages.append({'reference':reference,'release_ref':restored['release_ref'],'code_commit':restored['code']['commit'],
    'code_members':len(restored['code']['files']),'runtime_identity':restored['runtime']['identity'],
    'runtime_files':len(restored['runtime']['files']),'mapped_native_files':len(restored['runtime']['mapped_native_files']),
    'runtime_manifest_sha256':hashlib.sha256(e.raw(restored['runtime'])).hexdigest(),'bytes':len(raw),
    'exact_reproductions':len(pairs),'game_ids':[c['game_id'] for c,_ in pairs],
    'encoded_package':base64.b64encode(raw).decode()})
 for path,digest in before.items():assert hashlib.sha256((root/path).read_bytes()).hexdigest()==digest
 stat=os.statvfs(root)
 output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,'uid':os.getuid(),
 'scope':'Actual Linux service runtime; candidate code and restored executables in tmpfs only. No active release switch, fit, provider call or publication.',
 'tests':result.testsRun,'success':True,'test_log':log.getvalue(),'packages':packages,
 'board_sha256':hashlib.sha256(board_raw).hexdigest(),'board_cards':len(board['games']),
 'frozen_records_unchanged':len(before),'elapsed_seconds':time.monotonic()-start,
 'peak_rss_self_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
 'peak_rss_children_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
 'free_root_bytes':stat.f_bavail*stat.f_frsize,'provider_credits':0,
 'candidate_hashes':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in FILES.items()}}
print(json.dumps(output))
'''
command = 'cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
result = subprocess.run(['ssh', '-i', str(ROOT/'.cloud-private/admin_key'), '-o', 'BatchMode=yes',
                         '-o', 'ConnectTimeout=10', 'root@159.89.185.88', command],
                        input=program, text=True, capture_output=True, timeout=180)
if result.returncode:
    raise RuntimeError('Host executable verification failed: ' + result.stderr[-2400:])
value = json.loads(result.stdout)
import sys
sys.path.insert(0,str(ROOT))
from engine.projection.executable import load
from engine.projection.storage import write_bytes, save
for package in value['packages']:
    data=base64.b64decode(package.pop('encoded_package'));ref=package['reference']
    if hashlib.sha256(data).hexdigest()!=ref['sha256']:raise ValueError('Returned executable hash differs')
    write_bytes(ROOT/ref['path'],data,immutable=True)
    load(ROOT,ref)
save(ROOT/'work/engine-rebuild/host-executable-verification.json',value)
print(json.dumps({k:v for k,v in value.items() if k not in ('test_log','candidate_hashes')},indent=2))
