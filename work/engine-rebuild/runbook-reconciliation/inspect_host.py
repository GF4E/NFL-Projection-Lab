"""Read-only operational evidence; no provider, fit, or scheduler invocation."""
import datetime as dt,hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from engine.projection import bundle,cutoff_worker

def read(path):
 p=Path(path)
 return json.loads(p.read_bytes()) if p.exists() else None

def ref(path):
 p=Path(path)
 return {'path':str(p),'exists':p.exists(),**({'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} if p.is_file() else {})}
units={}
for stem in ('nfl-engine-capture','nfl-engine-daily','nfl-learning','nfl-cutoff-state','nfl-engine-watchdog'):
 for suffix in ('service','timer'):
  name=stem+'.'+suffix
  props=['LoadState','ActiveState','SubState','FragmentPath','DropInPaths']
  props+=['User','WorkingDirectory','TimeoutStartUSec','RuntimeMaxUSec','MemoryMax','CPUQuotaPerSecUSec'] if suffix=='service' else ['TimersCalendar','TimersMonotonic','Persistent']
  args=['systemctl','show',name]+[v for prop in props for v in ('-p',prop)]
  units[name]=dict(x.split('=',1) for x in subprocess.check_output(args,text=True).splitlines())
code=bundle.capture_code(ROOT);packet_ref=read(ROOT/'work/engine-rebuild/release-review/current-ref.json');packet=read(ROOT/packet_ref['path'])
assert hashlib.sha256((ROOT/packet_ref['path']).read_bytes()).hexdigest()==packet_ref['sha256']
consumer=read(ROOT/packet['evidence']['restored_consumer']['path'])
assert code['files']==consumer['lifecycle']['code']['files']
paths=['work/in-season-learning-v1/active-fit-ref.json','outputs/projection-v3/pipeline-releases/active.json','work/projection-weekly-refit-v1/configuration.json','work/projection-cutoff-state-v1/worker-config.json','work/projection-cutoff-state-v1/current-ref.json']
protection={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for kind in ('locks','grades') for p in (ROOT/'outputs/projection-v3'/kind).glob('*.json')}
recovery=Path('/mnt/nfl-engine-profiles/source-recovery-diagnostics');runtime=Path('/mnt/nfl-engine-profiles/runtime-restored-20260923-attempt2')
source_json=read(recovery/'source.json')
mounts={str(p):subprocess.check_output(['findmnt','--noheadings','--output','SOURCE,TARGET,FSTYPE,OPTIONS','--target',str(p)],text=True).strip() for p in (ROOT,Path('/mnt/nfl-engine-profiles'))}
result={'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),'actual_uid':os.getuid(),'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'issuing_code':code,'packet_ref':packet_ref,'pointers':{p:read(ROOT/p) for p in paths},'cutoff_health':cutoff_worker.health(ROOT,dt.datetime.now(dt.timezone.utc)),'units':units,'mounts':mounts,'storage':{str(p):{'available_bytes':os.statvfs(p).f_bavail*os.statvfs(p).f_frsize,'available_inodes':os.statvfs(p).f_favail} for p in (Path('/'),Path('/mnt/nfl-engine-profiles'))},'recovery':{'source_receipt':ref(recovery/'source.json'),'source_commit':source_json['source']['commit'],'source_exists':(recovery/'source/.git').is_dir(),'runtime_exists':runtime.is_dir(),'retired_source_76_exists':Path('/mnt/nfl-engine-profiles/source-recovery-76f840b0/source').exists(),'retired_source_1c34_exists':Path('/mnt/nfl-engine-profiles/source-restored-20260923').exists()},'protected_records':protection,'writes':False,'provider_requests':0}
print(json.dumps(result,indent=2))
