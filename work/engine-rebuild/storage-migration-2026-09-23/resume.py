"""Verify persisted mount configuration and restore original timer states."""
import datetime,json,os,subprocess
from pathlib import Path
ROOT='/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6'
REC=Path('/mnt/migration-2026-09-23');UUID='0c8e5d0e-4291-4f0a-af1d-b8b33f40b0e4'
def run(*a):return subprocess.check_output(a,text=True).strip()
assert json.loads((REC/'cutover-receipt.json').read_text())['all_original_content_preserved']
original=json.loads((REC/'timer-before.json').read_text())['timers']
for n in original:assert run('systemctl','show',n+'.timer','--property=ActiveState','--value')=='inactive'
# Exercise the exact persisted configuration, without a host reboot.
run('umount',ROOT);run('umount','/mnt');run('mount','-a');run('systemctl','daemon-reload')
assert run('findmnt','-n','-o','UUID','--target',ROOT)==UUID
assert os.path.ismount(ROOT) and os.path.ismount('/mnt')
program='''import json,os,tempfile,hashlib
from pathlib import Path
result=[]
for root in ['/tmp',ROOT]:
 with tempfile.TemporaryDirectory(prefix='storage-write-canary-',dir=root) as t:
  p=Path(t)/'canary';data=b'NFL storage recovery verification\\n'*32768
  with p.open('wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  q=p.with_name('committed');os.replace(p,q)
  d=os.open(t,os.O_RDONLY);os.fsync(d);os.close(d)
  assert q.read_bytes()==data
  result.append({'filesystem_path':root,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'write_fsync_atomic_rename_readback':True})
print(json.dumps(result))
'''
canary=json.loads(run('runuser','-u','nflengine','--','/opt/nfl-runtime/env/bin/python','-B','-c','ROOT='+repr(ROOT)+'\n'+program))
tests=subprocess.run(['runuser','-u','nflengine','--','/opt/nfl-runtime/env/bin/python','-B','-m','unittest','discover','-s','tests','-p','test_projection_storage.py'],cwd=ROOT,text=True,capture_output=True,check=True)
(REC/'host-storage-tests.log').write_text(tests.stdout+tests.stderr)
requirements={n:run('systemctl','show',n+'.service','--property=RequiresMountsFor','--property=Conditions') for n in original}
for n,s in original.items():
 if s=='active':run('systemctl','start',n+'.timer')
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'persisted_mount_remount_verified':True,'service_user_canaries':canary,'storage_tests_passed':True,'requirements':requirements,'timers_after':{n:run('systemctl','show',n+'.timer','--property=ActiveState','--value') for n in original},'root_available_bytes':os.statvfs('/').f_bavail*os.statvfs('/').f_frsize,'artifact_available_bytes':os.statvfs(ROOT).f_bavail*os.statvfs(ROOT).f_frsize}
(REC/'resume-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');os.sync();print(json.dumps(receipt,indent=2))
