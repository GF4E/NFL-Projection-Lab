"""Independent host-side acceptance after the restored consumer exits."""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
sys.path.insert(0,'/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
from engine.projection.storage import save
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
base=Path('/mnt/nfl-engine-profiles/restored-consumer-20260923')
before=json.loads((base/'before.json').read_text())
unit={}
for line in subprocess.check_output(['systemctl','show','nfl-restored-consumer-20260923.service',
 '-p','ActiveState','-p','SubState','-p','Result','-p','ExecMainStatus','-p','MemoryPeak'],text=True).splitlines():
    k,v=line.split('=',1);unit[k]=v
if unit['ActiveState']!='inactive' or unit['Result']!='success' or unit['ExecMainStatus']!='0':
    raise ValueError('Consumer is not terminal-success: '+json.dumps(unit))
result=json.loads((base/'consumer.json').read_text())
if result['status']!='RESTORED_CONSUMER_PASS':raise ValueError('Consumer did not pass')
for label,path in [('original_source',root),('original_runtime',Path('/opt/nfl-runtime/env'))]:
    if [path.stat().st_dev,path.stat().st_ino]!=before[label]:raise ValueError('Original mount changed')
for kind,namespace in before['namespaces'].items():
    if os.readlink('/proc/self/ns/'+kind)!=namespace:raise ValueError('Host namespace changed')
for name,sha in before['original_records'].items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha:raise ValueError('Original record changed: '+name)
for name,sha in result['external_native_files'].items():
    if hashlib.sha256(Path(name).read_bytes()).hexdigest()!=sha:raise ValueError('Host native library differs: '+name)
if platform.release()!=result['kernel'] or hashlib.sha256(Path('/etc/os-release').read_bytes()).hexdigest()!=result['os_release_sha256']:
    raise ValueError('Host OS identity differs')
report={'status':'SAME_HOST_EXECUTABLE_RESTORE_VERIFIED','source_commit':result['source_commit'],
 'runtime_manifest_sha256':result['runtime_manifest_sha256'],'unit':unit,
 'original_records_and_pointers_unchanged':len(before['original_records']),
 'original_mounts_and_namespaces_unchanged':True,'external_native_files_verified':len(result['external_native_files']),
 'parity':result['parity'],'lifecycle':result['lifecycle'],
 'consumer_receipt_sha256':hashlib.sha256((base/'consumer.json').read_bytes()).hexdigest(),
 'activation':False,'whole_machine_recovery':False,'provider_requests':0,'new_spending':0}
save(base/'accepted.json',report,immutable=True)
print(json.dumps(report,indent=2))
