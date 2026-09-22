"""Run storage fault fixtures in a disposable host directory, never live paths."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
module = (ROOT/'engine/projection/storage.py').read_bytes()
tests = (ROOT/'tests/test_projection_storage.py').read_text().replace('from engine.projection import storage\nfrom scripts.projection_publish import save as production_save', 'production_save = storage.save')
program = '''import base64, contextlib, datetime, hashlib, importlib.util, io, json, os, platform, tempfile, unittest
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='projection-storage-canary-') as folder:
 p=Path(folder)/'storage.py'; p.write_bytes(base64.b64decode(MODULE))
 spec=importlib.util.spec_from_file_location('storage',p); storage=importlib.util.module_from_spec(spec);spec.loader.exec_module(storage)
 space={'storage':storage,'__name__':'storage_canary'}
 exec(compile(base64.b64decode(TESTS),'storage_canary','exec'),space)
 log=io.StringIO()
 result=unittest.TextTestRunner(stream=log,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(space['DurableProjectionTests']))
 disk=os.statvfs(folder)
 print(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Disposable host files only; not a live publication or whole-system canary','module_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'python':platform.python_version(),'platform':platform.platform(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'success':result.wasSuccessful(),'filesystem_block_size':disk.f_frsize,'test_output':log.getvalue()},indent=2))
 if not result.wasSuccessful():raise SystemExit(1)
'''
program = 'MODULE='+repr(base64.b64encode(module).decode())+'\nTESTS='+repr(base64.b64encode(tests.encode()).decode())+'\n'+program
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88','python3 -B -'],input=program,text=True,capture_output=True,check=True,cwd=ROOT)
receipt=json.loads(result.stdout)
(ROOT/'work/engine-rebuild/host-storage-canary.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='test_output'},indent=2))
