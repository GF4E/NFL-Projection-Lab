"""Run inactive state canary and recovery fixtures in Linux tmpfs, not production."""
import base64,gzip,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
files={str(p.relative_to(ROOT)):p.read_text() for p in (ROOT/'engine').rglob('*.py') if '__pycache__' not in p.parts}
for name in ('tests/test_projection_cutoff_state.py','tests/test_projection_cutoff_features.py','tests/test_projection_observations.py','work/engine-rebuild/check_cutoff_state.py'):
    files[name]=(ROOT/name).read_text()
# Observation tests import preparation/bundle helpers; code only, no provider calls.
files.update({str(p.relative_to(ROOT)):p.read_text() for p in (ROOT/'scripts').rglob('*.py') if '__pycache__' not in p.parts})
program='PAYLOAD='+repr(base64.b64encode(gzip.compress(json.dumps(files).encode())).decode())+'\n'+r'''
import base64,contextlib,datetime,gzip,hashlib,importlib.util,io,json,os,platform,resource,subprocess,sys,tempfile,time,unittest
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
with tempfile.TemporaryDirectory(prefix='cutoff-state-code-',dir='/run/nfl-engine-monitor') as folder:
    candidate=Path(folder)
    for name,data in files.items():
        p=candidate/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data)
    os.chdir(candidate);sys.path.insert(0,str(candidate));log=io.StringIO();noise=io.StringIO()
    suite=unittest.TestSuite()
    for pattern in ('test_projection_cutoff_state.py','test_projection_cutoff_features.py','test_projection_observations.py'):
        suite.addTests(unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern=pattern))
    with contextlib.redirect_stdout(noise):tests=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
    assert tests.wasSuccessful(),log.getvalue()
    p=candidate/'work/engine-rebuild/check_cutoff_state.py'
    spec=importlib.util.spec_from_file_location('canary',p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with contextlib.redirect_stdout(noise):result=module.verify(root,'/run/nfl-engine-monitor',verify_remote=False)
    result.update(host_commit=commit,uid=os.getuid(),python=platform.python_version(),tests=tests.testsRun,test_log=log.getvalue(),address_space_limit_bytes=4*1024**3)
    fs=os.statvfs(root);result['free_root_bytes']=fs.f_bavail*fs.f_frsize
    os.chdir(root)
print(json.dumps(result))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=600)
if r.returncode:raise RuntimeError('Host cutoff candidate failed: '+r.stdout[-1400:]+r.stderr[-2800:])
result=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-cutoff-state-canary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('candidate_code','test_log')},indent=2))
