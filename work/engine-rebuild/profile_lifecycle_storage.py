"""Isolated existing lifecycle, profiled at fully written atomic staging boundaries."""
import importlib.util,json,os,sys,time,hashlib
from pathlib import Path
from unittest.mock import patch
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0,str(root))
from engine.projection import storage
parent=Path(sys.argv[1]);parent.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('lifecycle',root/'work/engine-rebuild/check_full_lifecycle.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
state={'sample_count':0,'peak_allocated_bytes':0,'peak_logical_bytes':0,'peak_files':0,'largest_staging_bytes':0,'observed_namespace_operations':0}
def sample():
    allocated=logical=files=0;seen=set()
    for path in parent.rglob('*'):
        if path.is_symlink() or not path.is_file():continue
        try:s=path.stat()
        except FileNotFoundError:continue
        key=(s.st_dev,s.st_ino)
        if key in seen:continue
        seen.add(key);files+=1;logical+=s.st_size;allocated+=s.st_blocks*512
        if path.name.endswith('.pending'):state['largest_staging_bytes']=max(state['largest_staging_bytes'],s.st_size)
    state['sample_count']+=1
    for k,v in [('peak_allocated_bytes',allocated),('peak_logical_bytes',logical),('peak_files',files)]:state[k]=max(state[k],v)
replace,link=storage.os.replace,storage.os.link

def watched(operation):
    def call(src,dst,*args,**kwargs):
        target=Path(src).resolve()
        if target.is_relative_to(parent.resolve()):sample();state['observed_namespace_operations']+=1
        return operation(src,dst,*args,**kwargs)
    return call
started=time.monotonic()
with patch.object(storage.os,'replace',side_effect=watched(replace)),patch.object(storage.os,'link',side_effect=watched(link)):
    result=module.verify(source_root=root,temp_parent=parent)
print(json.dumps({'status':result['status'],'profile':state,'lifecycle':result,'elapsed_seconds':time.monotonic()-started,'actual_service_uid':os.getuid(),'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'Isolated captured full slate, simulated cutoffs/finals, no production writes or provider calls','limitations':['Atomic namespace boundary peaks; uninstrumented short-lived files, Git repack and historical experiments are not covered.','Do not treat this single workload as the complete storage reserve.']},indent=2))
