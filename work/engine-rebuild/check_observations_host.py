"""Actual-runtime collection and preparation parity, isolated in host tmpfs."""
import base64,gzip,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TESTS=['test_projection_observations.py']
files={str(p.relative_to(ROOT)):p.read_text() for parent in ('engine','scripts') for p in (ROOT/parent).rglob('*.py') if '__pycache__' not in p.parts}
files.update({'tests/'+name:(ROOT/'tests'/name).read_text() for name in TESTS})
program='PAYLOAD='+repr(base64.b64encode(gzip.compress(json.dumps(files).encode())).decode())+'\n'+r'''
import base64,contextlib,datetime,gzip,hashlib,io,json,os,platform,resource,subprocess,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
files=json.loads(gzip.decompress(base64.b64decode(PAYLOAD)))
start=time.monotonic()
with tempfile.TemporaryDirectory(prefix='observation-candidate-',dir='/run/nfl-engine-monitor') as temporary:
 candidate=Path(temporary)
 for name,text in files.items():
  p=candidate/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 os.chdir(candidate);sys.path.insert(0,str(candidate));log=io.StringIO();noise=io.StringIO()
 suite=unittest.defaultTestLoader.discover(str(candidate/'tests'),pattern='test_projection_observations.py')
 with contextlib.redirect_stdout(noise):result=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
 assert result.wasSuccessful(),log.getvalue()
 from engine.projection import observations,prepared,bundle
 from engine.projection_v3 import qualify
 qualify.ROOT=root
 from scripts import projection_v3_prepare as new
 old=types.ModuleType('prior_preparation');old.__file__=str(root/'scripts/projection_v3_prepare.py')
 exec(compile((root/'scripts/projection_v3_prepare.py').read_text(),old.__file__,'exec'),old.__dict__)
 historical_personnel=old.current_personnel
 def personnel(artifact):
  with patch.object(old,'ROOT',root),patch.object(old,'read',side_effect=qualify.read):return historical_personnel(artifact)
 manifest=json.loads((root/'work/projection-v1/source-manifest.json').read_bytes())
 fit=prepared.active_fit(root)
 frozen={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for kind in ('locks','grades') for p in (root/'outputs/projection-v3'/kind).glob('*.json')}
 references=['work/projection-v1/source-manifest.json','work/in-season-learning-v1/active-fit-ref.json','config/stadiums.json','outputs/iron-man-v1/source-manifest.json',manifest['schedule']['path'],manifest['team_games']['path'],'engine/projection/features.py','engine/projection_v3/personnel.py','scripts/projection_v3_sources.py']
 values=[];raws=[];metas=[]
 for label,module in [('old',old),('new',new)]:
  target=candidate/label
  for name in references:
   p=target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((root/name).read_bytes())
  with patch.object(module,'ROOT',target),patch.object(module,'read',side_effect=qualify.read),patch.object(module,'current_personnel',side_effect=personnel),contextlib.redirect_stdout(noise):
   rows=module.prepare()
  values.append(rows);_,metadata,data=prepared.load(target);raws.append(data);metas.append(metadata)
 assert values[0]==values[1] and raws[0]==raws[1],'Numerical preparation changed'
 snapshot,records=observations.load(candidate/'new')
 before=sum(p.stat().st_size for p in (candidate/'new'/observations.BASE).rglob('*') if p.is_file())
 first=observations.current(candidate/'new');again=observations.capture(candidate/'new',manifest)
 assert first==again
 assert sum(p.stat().st_size for p in (candidate/'new'/observations.BASE).rglob('*') if p.is_file())==before
 assert metas[1]['observation_snapshot_ref']==first
 assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==value for name,value in frozen.items())
 stat=os.statvfs(root)
 output={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_commit':commit,'uid':os.getuid(),'python':platform.python_version(),'tests':result.testsRun,'success':result.wasSuccessful(),'scope':'Actual Linux runtime and captured host sources; all writes in tmpfs. No active state, forecast, fit, provider or publication mutation.',
 'candidate_hashes':{p:hashlib.sha256(files[p].encode()).hexdigest() for p in ('engine/projection/observations.py','scripts/projection_v3_prepare.py','tests/test_projection_observations.py')},
 'fit_ref':fit,'source_manifest':{'sha256':hashlib.sha256((root/'work/projection-v1/source-manifest.json').read_bytes()).hexdigest(),'schedule':manifest['schedule'],'team_games':manifest['team_games']},'prepared_rows':len(values[1]),'prepared_bytes':len(raws[1]),'prepared_sha256':hashlib.sha256(raws[1]).hexdigest(),'old_new_preparation_exact':True,'collected_games':len(records),'unknown':snapshot['unknown'],'by_season':{str(y):sum(r['game']['season']==y for r in records.values()) for y in sorted({r['game']['season'] for r in records.values()})},'observation_snapshot_ref':first,'collection_bytes':before,'unchanged_collection_growth_bytes':0,'collected_at':sorted({r['collected_at'] for r in records.values()}),'frozen_records_unchanged':len(frozen),'wall_seconds':time.monotonic()-start,'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'address_space_limit_bytes':4*1024**3,'free_root_bytes':stat.f_bavail*stat.f_frsize,'provider_credits':0,'test_log':log.getvalue()}
 os.chdir(root)
print(json.dumps(output))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=600)
if r.returncode:raise RuntimeError('Host observation candidate failed: '+r.stdout[-1200:]+r.stderr[-1800:])
v=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-observations-candidate.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:x for k,x in v.items() if k not in ('test_log','candidate_hashes','source_manifest')},indent=2))
