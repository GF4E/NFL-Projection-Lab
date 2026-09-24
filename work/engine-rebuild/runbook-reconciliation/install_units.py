"""Install only reviewed oneshot limits, with timers restored and no job start."""
import datetime as dt,fcntl,hashlib,json,os,subprocess,time
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
BASE=Path('/mnt/nfl-engine-profiles/runbook-unit-install')
NAMES=['nfl-engine-capture','nfl-engine-daily','nfl-learning','nfl-cutoff-state']
def command(*args):return subprocess.check_output(args,text=True).strip()
def props(unit,keys):return dict(l.split('=',1) for l in command('systemctl','show',unit,*[a for k in keys for a in ('-p',k)]).splitlines())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,v):
 with p.open('x') as f:json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def replace(p,raw):
 staged=p.with_name(p.name+'.rebuild-limits-stage')
 with staged.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 os.chmod(staged,0o644);os.replace(staged,p)
 fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
assert not (BASE/'receipt.json').exists()
command('systemd-analyze','verify',*[str(BASE/(n+'.service')) for n in NAMES])
old={n:(Path('/etc/systemd/system')/(n+'.service')).read_bytes() for n in NAMES}
for n,b in old.items():
 with (BASE/(n+'.before')).open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
timers={n:props(n+'.timer',['ActiveState','UnitFileState']) for n in NAMES}
protected={p:sha(p) for kind in ('locks','grades') for p in (ROOT/'outputs/projection-v3'/kind).glob('*.json')}
protected[ROOT/'work/in-season-learning-v1/active-fit-ref.json']=sha(ROOT/'work/in-season-learning-v1/active-fit-ref.json')
started=dt.datetime.now(dt.timezone.utc).isoformat();changed=[];failure=None;handle=None
try:
 command('systemctl','stop',*[n+'.timer' for n in NAMES])
 handle=(ROOT/'outputs/model-pick-v1/.cloud-dispatch.lock').open('a+')
 deadline=time.monotonic()+30
 while True:
  try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB);break
  except BlockingIOError:
   if time.monotonic()>=deadline:raise RuntimeError('Existing worker still owns dispatch; no service files changed')
   time.sleep(.2)
 for n in NAMES:
  state=props(n+'.service',['ActiveState'])['ActiveState']
  if state not in ('inactive','failed'):raise RuntimeError('Worker not terminal: '+n)
 for n in NAMES:
  replace(Path('/etc/systemd/system')/(n+'.service'),(BASE/(n+'.service')).read_bytes());changed.append(n)
 command('systemctl','daemon-reload')
 keys=['LoadState','TimeoutStartUSec','KillSignal','KillMode','MemoryMax','CPUQuotaPerSecUSec','DropInPaths']
 applied={n:props(n+'.service',keys) for n in NAMES}
 for n,p in applied.items():
  assert p['LoadState']=='loaded' and p['KillSignal']=='9' and p['KillMode']=='control-group' and p['CPUQuotaPerSecUSec']=='1s'
  assert p['TimeoutStartUSec']==('4min' if n=='nfl-engine-capture' else '9min 30s')
  assert p['MemoryMax']==('419430400' if n in ('nfl-engine-capture','nfl-engine-daily') else '4294967296')
  assert 'storage.conf' in p['DropInPaths']
  assert sha(Path('/etc/systemd/system')/(n+'.service'))==sha(BASE/(n+'.service'))
 assert all(sha(p)==v for p,v in protected.items())
except BaseException as exc:
 failure=type(exc).__name__+': '+str(exc)
 for n in changed:replace(Path('/etc/systemd/system')/(n+'.service'),old[n])
 if changed:command('systemctl','daemon-reload')
finally:
 if handle:handle.close()
 for n,p in timers.items():
  if p['ActiveState']=='active':command('systemctl','start',n+'.timer')
result={'status':'FAILED_RESTORED_OLD_UNITS' if failure else 'INSTALLED_VERIFIED','failure':failure,'started_at':started,'finished_at':dt.datetime.now(dt.timezone.utc).isoformat(),'timers_before':timers,'timers_after':{n:props(n+'.timer',['ActiveState','UnitFileState']) for n in NAMES},'before_sha256':{n:hashlib.sha256(v).hexdigest() for n,v in old.items()},'installed_sha256':{n:sha(Path('/etc/systemd/system')/(n+'.service')) for n in NAMES},'applied':applied if not failure else None,'protected_records_and_pointer':len(protected),'originals_unchanged':all(sha(p)==v for p,v in protected.items()),'manual_worker_runs':0,'provider_requests':0}
save(BASE/'receipt.json',result);print(json.dumps(result,indent=2))
if failure:raise SystemExit(1)
