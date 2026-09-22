"""Run candidate recovery code in memory under the actual service runtime."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
files={'engine.projection.watchdog':'engine/projection/watchdog.py',
       'scripts.projection_watchdog':'scripts/projection_watchdog.py'}
modules={name:{'path':path,'source':base64.b64encode((ROOT/path).read_bytes()).decode()} for name,path in files.items()}
tests=(ROOT/'tests/test_projection_watchdog.py').read_bytes()
program='MODULES='+repr(modules)+'\nTESTS='+repr(base64.b64encode(tests).decode())+'\n'+'''
import base64,contextlib,datetime,hashlib,importlib,io,json,subprocess,types,sys,unittest
from pathlib import Path
root=Path.cwd()
for name,item in MODULES.items():
 parent,leaf=name.rsplit('.',1);package=importlib.import_module(parent)
 module=types.ModuleType(name);module.__file__=str(root/item['path']);module.__package__=parent
 sys.modules[name]=module;setattr(package,leaf,module)
 exec(compile(base64.b64decode(item['source']),module.__file__,'exec'),module.__dict__)
space={'__name__':'recovery_candidate_tests','__file__':str(root/'tests/test_projection_watchdog.py')}
exec(compile(base64.b64decode(TESTS),space['__file__'],'exec'),space)
log=io.StringIO();noise=io.StringIO()
with contextlib.redirect_stdout(noise):result=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(space['WatchdogTests']))
print(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Candidate modules loaded in memory under service identity/runtime; tests use temporary files and mocked HTTP/publication; no live source or state mutated','checkout_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'candidate_hashes':{v['path']:hashlib.sha256(base64.b64decode(v['source'])).hexdigest() for v in MODULES.values()},'test_sha256':hashlib.sha256(base64.b64decode(TESTS)).hexdigest(),'tests':result.testsRun,'success':result.wasSuccessful(),'output':log.getvalue()},indent=2))
raise SystemExit(not result.wasSuccessful())
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,cwd=ROOT)
if r.returncode:raise RuntimeError('Candidate host tests failed: '+r.stdout[-1500:]+r.stderr[-1000:])
value=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-watchdog-candidate.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps({k:v for k,v in value.items() if k!='output'},indent=2))
