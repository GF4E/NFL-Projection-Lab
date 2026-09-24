"""Retire one obsolete expanded restore, preserving its standalone archive/receipts.

One named regenerable cache only; no production path, runtime, newer restore or
unique evidence is eligible. Off-host archive verification is required first.
"""
import datetime,hashlib,json,os,shutil,stat,subprocess,sys,time
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from scripts import projection_backup as b
from engine.projection.storage import save
BASE=Path('/mnt/nfl-engine-profiles');CACHE=BASE/'source-recovery-76f840b0/source'
OUT=BASE/'cache-retirement-76f840b0';OUT.mkdir(mode=0o700,exist_ok=True)
props=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show','nfl-source-cache-retire-76f840b0.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes' and props['InvocationID']==os.environ['INVOCATION_ID']
save(OUT/'live-properties.json',props,immutable=True)
b.CONFIG += ['-c','safe.directory='+str(CACHE)]
receipt=json.loads((BASE/'source-recovery-76f840b0/source.json').read_bytes())
off=json.loads(Path(sys.argv[1]).read_bytes());record=receipt['source']
assert off['status']=='OFF_HOST_ARCHIVE_HASH_VERIFIED' and off['source_commit']==record['commit']=='76f840b0569d29043eec83acab0270dd003143f0'
assert off['sha256']==record['sha256']==b.digest_file(record['path'])
assert CACHE.resolve()==CACHE and not os.path.ismount(CACHE) and CACHE!=ROOT
for file in Path('/proc').glob('[0-9]*/mountinfo'):
 try:data=file.read_text()
 except (FileNotFoundError,PermissionError,ProcessLookupError):continue
 if 'source-recovery-76f840b0/source' in data:raise RuntimeError('Obsolete cache is still mounted by a process')
assert b.git(CACHE,'rev-parse','HEAD').decode().strip()==record['commit']
assert not b.git(CACHE,'status','--porcelain=v1','--untracked-files=all')
assert not b.git(CACHE,'clean','-ndx'), 'Ignored or untracked cache content must be reported, not deleted'
b.git(CACHE,'fsck','--full','--strict')
start=time.monotonic();verified=b.verify_tree(CACHE,record['commit'])
assert verified==receipt['result']
entries=[]
for path in sorted(CACHE.rglob('*')):
 s=path.lstat();v={'path':str(path.relative_to(CACHE)),'mode':stat.S_IMODE(s.st_mode)}
 if stat.S_ISREG(s.st_mode):v.update(kind='file',bytes=s.st_size,sha256=b.digest_file(path))
 elif stat.S_ISLNK(s.st_mode):v.update(kind='symlink',target=os.readlink(path))
 elif stat.S_ISDIR(s.st_mode):v.update(kind='directory')
 else:raise ValueError('Special file in source cache')
 entries.append(v)
manifest={'cache':str(CACHE),'archive':record,'entries':entries,'verified_tree':verified,'off_host':off}
save(OUT/'removed-manifest.json',manifest,immutable=True)
before=os.statvfs(BASE).f_bavail*os.statvfs(BASE).f_frsize
# Recheck tracked state immediately before retiring this verified duplicate.
assert not b.git(CACHE,'status','--porcelain=v1','--untracked-files=all')
shutil.rmtree(CACHE)
subprocess.run(['sync','-f',str(BASE)],check=True)
after=os.statvfs(BASE).f_bavail*os.statvfs(BASE).f_frsize
assert not CACHE.exists() and Path(record['path']).is_file()
assert (BASE/'source-recovery-50/source').is_dir()
result={'state':'VERIFIED_REGENERABLE_CACHE_RETIRED','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'removed_directory':str(CACHE),'removed_entries':len(entries),'source_commit':record['commit'],
 'tracked_files':verified['verified_entries'],'tracked_bytes':verified['verified_file_bytes'],
 'retained_archive_sha256':record['sha256'],'retained_archive_bytes':record['bytes'],
 'removed_manifest_sha256':b.digest_file(OUT/'removed-manifest.json'),'before_available_bytes':before,
 'after_available_bytes':after,'reclaimed_bytes':after-before,'elapsed_seconds':time.monotonic()-start,
 'off_host_archive_verified':True,'newer_recovery_retained':True,'production_records_removed':0,
 'retention_note':'Only independently regenerable expanded checkout retired; original archive and all verification receipts retained'}
save(OUT/'receipt.json',result,immutable=True);print(json.dumps(result),flush=True)
