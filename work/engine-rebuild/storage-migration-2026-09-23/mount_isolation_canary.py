"""Exercise shared-mount isolation in a disposable Linux mount namespace."""
import subprocess
program=r'''
import json,os,subprocess,tempfile
from pathlib import Path
def run(*a):subprocess.run(a,check=True,capture_output=True)
with tempfile.TemporaryDirectory(prefix='nfl-mount-canary-',dir='/run') as t:
 base=Path(t);source=base/'source';under=base/'under';dest=base/'destination'
 for p in (source,under,dest):p.mkdir()
 run('mount','-t','tmpfs','-o','size=1m','tmpfs',str(source))
 run('mount','--make-shared',str(source))
 (source/'repo').mkdir();(source/'repo/record').write_text('original')
 (dest/'record').write_text('replacement')
 run('mount','--bind',str(source),str(under))
 run('mount','--make-rprivate',str(under))
 run('mount','--bind',str(dest),str(source/'repo'))
 assert (source/'repo/record').read_text()=='replacement'
 assert (under/'repo/record').read_text()=='original'
 assert not os.path.ismount(under/'repo')
 assert os.stat(under/'repo').st_dev!=os.stat(source/'repo').st_dev
 run('umount',str(source/'repo'));run('umount',str(under));run('umount',str(source))
print(json.dumps({'shared_mount_isolation_verified':True,'scope':'Disposable private mount namespace only'}))
'''
subprocess.run(['unshare','--mount','--propagation','private','python3','-B','-c',program],check=True)
