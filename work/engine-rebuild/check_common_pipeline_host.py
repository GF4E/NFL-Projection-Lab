"""Verify candidate pipeline in the actual Linux runtime, with tmpfs-only writes."""
import base64
import gzip
import json
from pathlib import Path
import subprocess
import argparse

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--output',default='work/engine-rebuild/host-common-pipeline-canary.json')
args=parser.parse_args()
files={str(path.relative_to(ROOT)):path.read_text() for folder in ('engine','scripts')
       for path in (ROOT/folder).rglob('*.py') if '__pycache__' not in path.parts}
for name in ('tests/test_projection_cutoff_state.py','tests/test_projection_cutoff_pipeline.py',
             'tests/test_projection_bundle.py','work/engine-rebuild/check_common_pipeline.py'):
    files[name]=(ROOT/name).read_text()
program='PAYLOAD='+repr(base64.b64encode(gzip.compress(json.dumps(files).encode())).decode())+'\n'+r'''
import base64,contextlib,gzip,hashlib,importlib.util,io,json,os,platform,resource,subprocess,sys,tempfile,unittest
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
with tempfile.TemporaryDirectory(prefix='common-pipeline-code-',dir='/run/nfl-engine-monitor') as folder:
    candidate=Path(folder)
    for name,data in files.items():
        path=candidate/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(data)
    os.chdir(candidate);sys.path.insert(0,str(candidate));log=io.StringIO();noise=io.StringIO()
    suite=unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern='test_projection_cutoff_pipeline.py')
    with contextlib.redirect_stdout(noise):tests=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
    assert tests.wasSuccessful(),log.getvalue()
    path=candidate/'work/engine-rebuild/check_common_pipeline.py'
    spec=importlib.util.spec_from_file_location('common_canary',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with contextlib.redirect_stdout(noise):result=module.verify(root,'/run/nfl-engine-monitor')
    result.update(host_commit=commit,uid=os.getuid(),python=platform.python_version(),tests=tests.testsRun,
                  test_log=log.getvalue(),address_space_limit_bytes=4*1024**3)
    fs=os.statvfs(root);result['free_root_bytes']=fs.f_bavail*fs.f_frsize
    os.chdir(root)
print(json.dumps(result))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10',
                       'root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=600)
if result.returncode:raise RuntimeError('Host common-pipeline verification failed: '+result.stdout[-1600:]+result.stderr[-3000:])
body=json.loads(result.stdout)
(ROOT/args.output).write_text(json.dumps(body,indent=2)+'\n')
print(json.dumps({k:v for k,v in body.items() if k not in ('candidate_code','test_log')},indent=2))
