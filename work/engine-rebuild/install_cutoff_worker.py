"""Install the authorized inactive worker; never simulate a live cutoff."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
paths=('engine/projection/cutoff_state.py','engine/projection/cutoff_worker.py','scripts/cloud_scheduler.py',
       'scripts/projection_watchdog.py','engine/projection/watchdog.py','ops/cloud/nfl-cutoff-state.service','ops/cloud/nfl-cutoff-state.timer')
expected={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
program='EXPECTED='+repr(expected)+'\n'+r'''
import datetime,hashlib,json,os,subprocess,time
from pathlib import Path
root=Path.cwd()
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in EXPECTED.items()),'Host source differs'
assert not (root/'work/projection-cutoff-state-v1/current-ref.json').exists(),'Unexpected prior numerical state'
config=root/'work/projection-cutoff-state-v1/worker-config.json'
for attempt in range(30):
    run=subprocess.run(['runuser','-u','nflengine','--','env','OPENBLAS_NUM_THREADS=1','/opt/nfl-runtime/env/bin/python','-B','scripts/cloud_scheduler.py','cutoff-configure','--host','digitalocean:599707390'],text=True,capture_output=True,timeout=120)
    if run.returncode:raise RuntimeError('Owner-fenced configuration failed')
    if config.exists():break
    time.sleep(2+attempt%5)
else:raise RuntimeError('Owner lock remained busy; configuration not installed')
body=json.loads(config.read_bytes())['body'];now=datetime.datetime.now(datetime.timezone.utc)
assert datetime.datetime.fromisoformat(body['first_cutoff'])>now,'First cutoff must remain prospective at installation'
backups=[]
for name in ('nfl-cutoff-state.service','nfl-cutoff-state.timer'):
    source=root/'ops/cloud'/name;destination=Path('/etc/systemd/system')/name
    if destination.exists() and destination.read_bytes()!=source.read_bytes():
        data=destination.read_bytes();saved=root/'.cloud-private/cutoff-unit-backups'/(hashlib.sha256(data).hexdigest()+'-'+name)
        saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(data);backups.append(str(saved.relative_to(root)))
    subprocess.run(['install','-m','644',str(source),str(destination)],check=True)
subprocess.run(['systemd-analyze','verify','/etc/systemd/system/nfl-cutoff-state.service','/etc/systemd/system/nfl-cutoff-state.timer'],check=True,capture_output=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','nfl-cutoff-state.timer'],check=True,capture_output=True)
subprocess.run(['systemctl','start','nfl-cutoff-state.service'],check=True,timeout=180)
status=subprocess.check_output(['systemctl','show','nfl-cutoff-state.service','nfl-cutoff-state.timer','-p','Id','-p','ActiveState','-p','Result','-p','ExecMainStatus','-p','TimersCalendar','-p','TimersMonotonic','-p','NextElapseUSecRealtime','-p','MemoryMax','-p','TimeoutStartUSec'],text=True)
assert not (root/'work/projection-cutoff-state-v1/current-ref.json').exists()
fs=os.statvfs(root)
print(json.dumps({'status':'INSTALLED_WAITING_FOR_FIRST_REAL_CUTOFF','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'host_commit':subprocess.check_output(['runuser','-u','nflengine','--','git','rev-parse','HEAD'],text=True).strip(),'expected_source_hashes':EXPECTED,
 'installed_unit_hashes':{n:hashlib.sha256((Path('/etc/systemd/system')/n).read_bytes()).hexdigest() for n in ('nfl-cutoff-state.service','nfl-cutoff-state.timer')},
 'configuration':body,'configuration_sha256':hashlib.sha256(config.read_bytes()).hexdigest(),'unit_status':status,'backups':backups,
 'numerical_state_created':False,'forecast_activation':False,'free_root_bytes':fs.f_bavail*fs.f_frsize,'new_spending':0,'provider_requests':0}))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=600)
if r.returncode:raise RuntimeError('Cutoff worker installation failed: '+r.stderr[-1800:])
v=json.loads(r.stdout);(ROOT/'work/engine-rebuild/cutoff-worker-installed.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:v[k] for k in ('status','checked_at','host_commit','unit_status','numerical_state_created','forecast_activation','free_root_bytes')},indent=2))
