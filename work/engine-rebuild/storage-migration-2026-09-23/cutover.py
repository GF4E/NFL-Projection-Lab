"""One-time approved cutover. Run as root only after off-host restore receipt."""
import datetime,hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
from manifest import inventory
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
VOL=Path('/mnt');DEST=VOL/'nfl-engine-data/repo';REC=VOL/'migration-2026-09-23'
UUID='0c8e5d0e-4291-4f0a-af1d-b8b33f40b0e4'
NAMES=['nfl-engine-capture','nfl-engine-daily','nfl-cutoff-state','nfl-learning','nfl-engine-watchdog']
def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def save(name,v):
 p=REC/name
 with p.open('w') as f:json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.sync()
def available(p):s=os.statvfs(p);return s.f_bavail*s.f_frsize
assert os.geteuid()==0
assert run('findmnt','-n','-o','UUID','--target',str(DEST))==UUID
assert not os.path.ismount(ROOT)
proof=json.loads((REC/'off-host-restore.json').read_text())
expected=json.loads((REC/'source.json').read_text())
assert proof['manifest_sha256']==hashlib.sha256((REC/'source.json').read_bytes()).hexdigest()
assert proof['all_content_restored'] and proof['archive_metadata_matches']
for n in NAMES:
 assert run('systemctl','show',n+'.timer','--property=ActiveState','--value')=='inactive'
 assert run('systemctl','show',n+'.service','--property=ActiveState','--value') in ('inactive','failed')
print('Rechecking quiescent source and destination before cutover',flush=True)
assert inventory(ROOT)==expected
assert inventory(DEST)==expected
print('Pre-cutover content recheck passed',flush=True)
assert not run('rsync','-aHAXni','--numeric-ids',str(ROOT)+'/',str(DEST)+'/')
receipt={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_manifest_sha256':proof['manifest_sha256'],'root_available_before':available('/'),'volume_available_before':available(VOL),'files':sum(v['type']=='file' for v in expected.values()),'bytes':sum(v.get('bytes',0) for v in expected.values()),'volume_uuid':UUID}
# A nonrecursive root bind exposes the original checkout beneath the new bind.
under=Path('/run/nfl-root-underlay');under.mkdir(exist_ok=True)
run('mount','--bind','/',str(under))
# Shared root mount propagation must never mirror the new bind into this view.
run('mount','--make-rprivate',str(under))
old=under/ROOT.relative_to('/')
assert os.stat(old).st_dev!=os.stat(DEST).st_dev
run('mount','--bind',str(DEST),str(ROOT))
assert os.stat(ROOT).st_dev==os.stat(DEST).st_dev
assert (ROOT/'.git/HEAD').read_bytes()==(DEST/'.git/HEAD').read_bytes()
# Roll back to original root tree, verify, and reapply before any deletion.
run('umount',str(ROOT));assert os.stat(ROOT).st_dev==os.stat(old).st_dev
assert (ROOT/'.git/HEAD').read_bytes()==(DEST/'.git/HEAD').read_bytes()
run('mount','--bind',str(DEST),str(ROOT));assert os.stat(ROOT).st_dev==os.stat(DEST).st_dev
print('Bind switch and rollback verified',flush=True)
receipt['rollback_verified']=True;save('cutover-start.json',receipt)
# Recheck isolation after the bind operation, not only before it.
assert os.stat(old).st_dev==os.stat('/').st_dev
assert os.stat(old).st_dev!=os.stat(DEST).st_dev
assert not os.path.ismount(old)
# Free one verified redundant file so persistence configuration can be written.
large=max((k for k,v in expected.items() if v['type']=='file'),key=lambda k:expected[k]['bytes'])
h=hashlib.sha256()
with (old/large).open('rb') as f:
 for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
assert h.hexdigest()==expected[large]['sha256']
(old/large).unlink();os.sync();receipt['first_redundant_copy_removed']=large
assert available('/')>1024*1024
fstab=Path('/etc/fstab');shutil.copy2(fstab,REC/'fstab-before')
addition=f'\n# Approved NFL storage migration 2026-09-23\nUUID={UUID} /mnt ext4 defaults,nofail,discard,noatime,x-systemd.device-timeout=30s 0 2\n{DEST} {ROOT} none bind,nofail,x-systemd.requires-mounts-for=/mnt 0 0\n'
assert str(ROOT) not in fstab.read_text() and UUID not in fstab.read_text()
with fstab.open('a') as f:f.write(addition);f.flush();os.fsync(f.fileno())
for n in NAMES:
 p=Path('/etc/systemd/system')/(n+'.service.d');p.mkdir(exist_ok=True)
 (p/'storage.conf').write_text('[Unit]\nRequiresMountsFor=/mnt '+str(ROOT)+'\nConditionPathIsMountPoint='+str(ROOT)+'\n')
run('systemctl','daemon-reload');run('findmnt','--verify','--verbose')
# Every remaining source entry was verified above; only redundant root copies.
for p in list(old.iterdir()):
 if p.is_dir() and not p.is_symlink():shutil.rmtree(p)
 else:p.unlink()
os.sync();assert not list(old.iterdir())
run('umount',str(under))
print('Root copies reclaimed; verifying retained volume content',flush=True)
assert inventory(ROOT)==expected
receipt.update(completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),root_available_after=available('/'),volume_available_after=available(VOL),all_original_content_preserved=True,persistence_installed=True,root_copies_removed=True)
save('cutover-receipt.json',receipt)
print(json.dumps(receipt,indent=2))
