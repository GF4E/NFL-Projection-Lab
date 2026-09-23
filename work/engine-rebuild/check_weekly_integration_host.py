"""Run isolated handoff fixtures using the actual service Python; no activation."""
import hashlib,io,json,shlex,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
files={str(p.relative_to(ROOT)):p.read_bytes() for folder in ('engine','scripts','tests')
       for p in (ROOT/folder).rglob('*.py') if '__pycache__' not in p.parts}
archive=io.BytesIO()
with tarfile.open(fileobj=archive,mode='w:gz') as tar:
    for name,data in sorted(files.items()):
        item=tarfile.TarInfo(name);item.size=len(data);item.mtime=0;tar.addfile(item,io.BytesIO(data))
program=r'''
import hashlib,io,json,os,platform,resource,sys,tarfile,tempfile,time,unittest
from pathlib import Path
start=time.monotonic();resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
with tempfile.TemporaryDirectory(prefix='nfl-weekly-integration-',dir='/dev/shm') as tmp:
    root=Path(tmp)
    with tarfile.open(fileobj=sys.stdin.buffer,mode='r|gz') as tar:
        for item in tar:
            path=root/item.name
            if not item.isfile() or not path.resolve().is_relative_to(root):raise ValueError('Unsafe source archive')
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(tar.extractfile(item).read())
    os.chdir(root);sys.path.insert(0,str(root));sys.path.insert(0,str(root/'tests'))
    tempfile.tempdir=tmp
    loader=unittest.TestLoader();suite=unittest.TestSuite()
    for name in ('test_projection_refit_release','test_projection_pipeline_release','test_projection_weekly_refit'):
        suite.addTests(loader.loadTestsFromName(name))
    log=io.StringIO();result=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
    names=['engine/projection/refit_release.py','engine/projection/pipeline_release.py',
           'engine/projection/prepared.py','engine/projection/bundle.py','scripts/projection_v3_prepare.py',
           'engine/projection/weekly_refit.py','engine/projection/public_closeout.py','scripts/projection_learning.py','scripts/cloud_scheduler.py',
           'tests/test_projection_refit_release.py','tests/test_projection_pipeline_release.py','tests/test_projection_weekly_refit.py']
    print(json.dumps({'status':'PASS' if result.wasSuccessful() else 'FAIL',
      'scope':'Actual Linux service runtime; synthetic source rows and public HTTP response fixtures; real refit, staging and switch. Full ledger validation mocked in weekly fixture, separately tested. No captured-slate or live-cycle claim.',
      'uid':os.getuid(),'python':platform.python_version(),'tests':result.testsRun,'log':log.getvalue(),
      'elapsed_seconds':time.monotonic()-start,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
      'source_sha256':{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names}},indent=2))
    ok=result.wasSuccessful()
sys.exit(0 if ok else 1)
'''
command='timeout --kill-after=5s 120s runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -u -B -c '+shlex.quote(program)
run=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=archive.getvalue(),capture_output=True,timeout=150)
(ROOT/'work/engine-rebuild/host-weekly-integration.stderr.log').write_bytes(run.stderr)
(ROOT/'work/engine-rebuild/host-weekly-integration.json').write_bytes(run.stdout)
if run.returncode:raise SystemExit(run.returncode)
result=json.loads(run.stdout)
for name,digest in result['source_sha256'].items():
    if hashlib.sha256(files[name]).hexdigest()!=digest:raise ValueError('Tested source differs: '+name)
print(json.dumps({k:v for k,v in result.items() if k!='log'}))
