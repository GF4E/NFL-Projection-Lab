import json,os,runpy,subprocess,sys
from pathlib import Path
base=Path(sys.argv[1])
props=dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show','nfl-source-qualified-restore.service','-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','CPUQuotaPerSecUSec','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='45min' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes' and props['InvocationID']==os.environ['INVOCATION_ID']
(base/'source-live-properties.json').write_text(json.dumps(props,indent=2)+'\n')
sys.argv=[str(base/'restore_source_pinned.py'),str(base)]
runpy.run_path(sys.argv[0],run_name='__main__')
