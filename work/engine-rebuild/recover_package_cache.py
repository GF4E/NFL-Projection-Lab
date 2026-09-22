"""One-shot, authorized APT-cache-only recovery. Run on host; emit full receipt."""
import datetime as dt,fcntl,json,os,stat
from pathlib import Path
locks=[]
for p in ['/var/lib/apt/lists/lock','/var/cache/apt/archives/lock']:
 f=open(p,'a');fcntl.lockf(f,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(f)
before=os.statvfs('/');removed=[]
paths=list(Path('/var/lib/apt/lists').glob('*'))+list(Path('/var/lib/apt/lists/partial').glob('*'))+[Path('/var/cache/apt/pkgcache.bin'),Path('/var/cache/apt/srcpkgcache.bin')]
for p in paths:
 if p.name=='lock' or p.is_symlink():continue
 try:s=p.stat()
 except FileNotFoundError:continue
 if not stat.S_ISREG(s.st_mode):continue
 p.unlink();removed.append({'path':str(p),'bytes':s.st_size})
after=os.statvfs('/')
print(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'Previously authorized regenerable APT indexes and binary caches only; no repository record removed','removed':removed,'bytes_removed':sum(x['bytes'] for x in removed),'free_before':before.f_bavail*before.f_frsize,'free_after':after.f_bavail*after.f_frsize},indent=2))
