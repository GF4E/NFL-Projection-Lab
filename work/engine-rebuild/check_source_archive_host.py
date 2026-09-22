"""Lossless archive/recovery fixtures and a real-source round trip in host tmpfs."""
import base64,gzip,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TESTS=['test_projection_source_archive.py','test_projection_recovery.py','test_projection_watchdog.py']
files={str(p.relative_to(ROOT)):p.read_text() for parent in ('engine','scripts') for p in (ROOT/parent).rglob('*.py') if '__pycache__' not in p.parts}
files.update({'tests/'+name:(ROOT/'tests'/name).read_text() for name in TESTS})
program='PAYLOAD='+repr(base64.b64encode(gzip.compress(json.dumps(files).encode())).decode())+'\nTESTS='+repr(TESTS)+'\n'+'''
import base64,datetime,gzip,hashlib,io,json,os,platform,resource,subprocess,sys,tempfile,time,unittest
from pathlib import Path
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
with tempfile.TemporaryDirectory(prefix='source-archive-',dir='/run/nfl-engine-monitor') as temporary:
 candidate=Path(temporary)
 for name,text in files.items():
  path=candidate/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 os.chdir(candidate);sys.path.insert(0,str(candidate));log=io.StringIO();noise=io.StringIO()
 suite=unittest.TestSuite()
 for name in TESTS:suite.addTests(unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern=name))
 import contextlib
 start=time.monotonic()
 with contextlib.redirect_stdout(noise):result=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
 from engine.projection.source_archive import read_source,store_source,FOLDER
 from engine.projection.finals import parse
 feed=json.loads((root/'outputs/projection-v3/final-feed.json').read_bytes());raw=read_source(root,feed)
 audit=candidate/'roundtrip';ref=store_source(audit,raw);decoded=read_source(audit,{'source_sha256':feed['source_sha256'],'source_ref':ref})
 assert decoded==raw and parse(decoded)==parse(raw)
 stored=(audit/ref['path']).stat().st_size
 existing=[p for p in (root/FOLDER).iterdir() if p.is_file() and (p.name.endswith('.csv') or p.name.endswith('.csv.gz'))]
 stat=os.statvfs(root)
 names=['engine/projection/source_archive.py','engine/projection/finals.py','scripts/projection_watchdog.py','scripts/board_v9_publish.py','scripts/reference_lines.py']
 output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,'uid':os.getuid(),'python':platform.python_version(),
 'scope':'Candidate code/tests and one exact current-source round trip in disposable tmpfs. Existing production archives read only; no provider call or publication.',
 'tests':result.testsRun,'success':result.wasSuccessful(),'wall_seconds':time.monotonic()-start,
 'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
 'candidate_hashes':{p:hashlib.sha256(files[p].encode()).hexdigest() for p in names},
 'roundtrip':{'source_sha256':feed['source_sha256'],'raw_bytes':len(raw),'stored_bytes':stored,'bytes_saved':len(raw)-stored,'raw_and_parsed_finals_identical':True,'finals':len(parse(raw))},
 'existing_archive_files':len(existing),'existing_archive_bytes':sum(p.stat().st_size for p in existing),'free_root_bytes':stat.f_bavail*stat.f_frsize,'output':log.getvalue()}
 os.chdir(root)
print(json.dumps(output));raise SystemExit(not result.wasSuccessful())
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if r.returncode:raise RuntimeError('Host archive candidate failed: '+r.stdout[-1800:]+r.stderr[-1400:])
v=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-source-archive-candidate.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:x for k,x in v.items() if k not in ('output','candidate_hashes')},indent=2))
