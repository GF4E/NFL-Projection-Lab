"""Run the same full lifecycle in host tmpfs under the actual service runtime."""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import bundle
source = (ROOT/'work/engine-rebuild/check_full_lifecycle.py').read_text()
expected = {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in bundle.CODE_PATHS}
program = 'expected='+repr(expected)+'\n'+r'''
import hashlib,json,os,resource,sys
from pathlib import Path
root=Path.cwd()
for name,sha in expected.items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha:
        raise ValueError('Actual host source differs: '+name)
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
script=sys.stdin.read()
namespace={'__name__':'full_lifecycle_harness','__file__':str(root/'work/engine-rebuild/check_full_lifecycle.py')}
exec(compile(script,namespace['__file__'],'exec'),namespace)
result=namespace['verify'](root,temp_parent='/run/nfl-engine-monitor')
result['harness_sha256']=hashlib.sha256(script.encode()).hexdigest()
result['actual_service_uid']=os.getuid()
result['externally_enforced_deadline_seconds']=570
fs=os.statvfs(root)
result['root_free_bytes']=fs.f_bavail*fs.f_frsize
print(json.dumps(result))
'''
command = 'cd '+shlex.quote(str(ROOT))+' && timeout --kill-after=5s 570s runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -u -B -c '+shlex.quote(program)
result = subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10',
                         'root@159.89.185.88',command],input=source,text=True,capture_output=True,timeout=600)
folder=ROOT/'work/engine-rebuild'
(folder/'full-lifecycle-host-attempt1.log').write_text(result.stderr)
(folder/'full-lifecycle-host-attempt1.json').write_text(result.stdout)
if result.returncode:
    raise RuntimeError('Host canary failed with exit '+str(result.returncode)+': '+result.stderr[-4000:])
value=json.loads(result.stdout)
if value['code']['files']!=expected or value['harness_sha256']!=hashlib.sha256(source.encode()).hexdigest():
    raise ValueError('Host verification source identity differs')
print(json.dumps({k:v for k,v in value.items() if k!='code'}))
