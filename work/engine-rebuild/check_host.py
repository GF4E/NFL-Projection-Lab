"""Read actual service checkout and source hashes without exposing environment."""
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
program='''import datetime,hashlib,json,os,subprocess
from pathlib import Path
root=Path(subprocess.check_output(['systemctl','show','nfl-engine-capture.service','--value','-p','WorkingDirectory'],text=True).strip())
base=['git','-c','safe.directory='+str(root),'-C',str(root)]
def git(*args):return subprocess.check_output(base+list(args),text=True).strip()
paths=['engine/projection/storage.py','engine/projection/lineage.py','engine/forecast_system/calendar.py','scripts/projection_publish.py','scripts/projection_v3_publish.py','engine/projection_experiments.py']
fitref=json.loads((root/'work/in-season-learning-v1/active-fit-ref.json').read_text());raw=(root/fitref['path']).read_bytes()
disk=os.statvfs(root)
services={name:subprocess.check_output(['systemctl','show',name,'-p','ActiveState','-p','SubState','-p','Result','-p','ExecMainStatus','-p','ExecMainExitTimestamp'],text=True).strip().splitlines() for name in ['nfl-engine-capture.service','nfl-engine-daily.service']}
print(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'working_directory':str(root),'repository_commit':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'foundation_is_ancestor':subprocess.run(base+['merge-base','--is-ancestor','9c8a88e061b5b3d319b539473209559881e2011d','HEAD']).returncode==0,'source_hashes':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() if (root/p).exists() else None for p in paths},'tracked_modified_paths':git('diff','--name-only').splitlines(),'active_fit_ref':fitref,'active_fit_verified':hashlib.sha256(raw).hexdigest()==fitref['sha256'],'free_bytes':disk.f_bavail*disk.f_frsize,'free_inodes':disk.f_favail,'services':services},indent=2))
'''
result=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88','python3 -B -'],input=program,text=True,capture_output=True,cwd=ROOT)
if result.returncode:
    raise RuntimeError('Read-only host verification failed: '+result.stderr[-1000:])
value=json.loads(result.stdout)
(ROOT/'work/engine-rebuild/host-verification.json').write_text(json.dumps(value,indent=2)+'\n')
print(json.dumps(value,indent=2))
