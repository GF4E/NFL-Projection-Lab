"""Candidate scoring/bundle tests in disposable tmpfs under the Linux service user."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[2]
files={str(p.relative_to(ROOT)):p.read_text() for parent in ('engine','scripts') for p in (ROOT/parent).rglob('*.py') if '__pycache__' not in p.parts}
files['tests/test_projection_bundle.py']=(ROOT/'tests/test_projection_bundle.py').read_text()
encoded=base64.b64encode(gzip.compress(json.dumps(files).encode())).decode()
program='PAYLOAD='+repr(encoded)+'\n'+'''
import base64,datetime,gzip,hashlib,io,json,os,platform,resource,subprocess,sys,tempfile,time,unittest
from pathlib import Path
root=Path.cwd();host_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
with tempfile.TemporaryDirectory(prefix='bundle-candidate-',dir='/run/nfl-engine-monitor') as temporary:
 candidate=Path(temporary)
 for name,text in files.items():
  path=candidate/name
  if not path.resolve().is_relative_to(candidate.resolve()):raise ValueError('Invalid candidate path')
  path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 os.chdir(candidate);sys.path.insert(0,str(candidate))
 from engine.projection.bundle import CODE_PATHS
 start=time.monotonic();log=io.StringIO()
 suite=unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern='test_projection_bundle.py')
 result=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
 output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'scope':'Candidate source in disposable tmpfs; actual Linux service identity/runtime; synthetic fixtures and isolated scorer; no production records or provider calls',
         'host_commit':host_commit,'uid':os.getuid(),'python':platform.python_version(),
         'tests':result.testsRun,'success':result.wasSuccessful(),'wall_seconds':time.monotonic()-start,
         'parent_peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
         'child_peak_rss_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
         'candidate_hashes':{p:hashlib.sha256(files[p].encode()).hexdigest() for p in CODE_PATHS},
         'output':log.getvalue()}
 os.chdir(root)
print(json.dumps(output))
raise SystemExit(not result.wasSuccessful())
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if result.returncode:raise RuntimeError('Host candidate tests failed: '+result.stdout[-2500:]+result.stderr[-1200:])
value=json.loads(result.stdout);(ROOT/'work/engine-rebuild/host-bundle-candidate.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps({k:v for k,v in value.items() if k not in ('output','candidate_hashes')},indent=2))
