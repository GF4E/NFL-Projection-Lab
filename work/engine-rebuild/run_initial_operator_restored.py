"""Run captured handoff using restored code/runtime and explicitly aliased data."""
import hashlib,importlib.util,json,os,resource,subprocess,sys,time
from pathlib import Path
ROOT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');sys.path.insert(0,str(ROOT))
from engine.projection import bundle
from engine.projection.storage import save
base=Path(sys.argv[1]);before=json.loads((base/'before.json').read_bytes())
assert os.getuid()==before['uid']
for kind in ('mnt','net'):assert os.readlink('/proc/self/ns/'+kind)!=before['namespaces'][kind]
assert [ROOT.stat().st_dev,ROOT.stat().st_ino]==before['restored_source']
assert [Path(sys.prefix).stat().st_dev,Path(sys.prefix).stat().st_ino]==before['restored_runtime']
assert os.statvfs(ROOT).f_flag & os.ST_RDONLY
assert os.statvfs(sys.prefix).f_flag & os.ST_RDONLY
assert os.statvfs(base/'source-data').f_flag & os.ST_RDONLY
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==before['source_commit']
for name,digest in before['issuing_files'].items():
 assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
 assert hashlib.sha256((base/'source-data'/name).read_bytes()).hexdigest()==digest,name
assert set(before['issuing_files'])==set(bundle.CODE_PATHS)
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
props=dict(line.split('=',1) for line in subprocess.check_output(['systemctl','show',before['unit'],'-p','LoadState','-p','RuntimeMaxUSec','-p','MemoryMax','-p','PrivateNetwork','-p','InvocationID'],text=True).splitlines())
assert props['LoadState']=='loaded' and props['RuntimeMaxUSec']=='9min 30s' and props['MemoryMax']=='4294967296' and props['PrivateNetwork']=='yes'
assert props['InvocationID']==os.environ['INVOCATION_ID']
save(base/'live-properties.json',props,immutable=True)
spec=importlib.util.spec_from_file_location('initial_restored',ROOT/'work/engine-rebuild/check_initial_operator.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
result=module.verify(source_root=base/'source-data',temp_parent=base/'work',packet_ref=json.loads((base/'packet-ref.json').read_bytes()),runtime_manifest=base/'runtime-manifest.json')
assert result['elapsed_seconds']<570 and result['code']['files']==before['issuing_files']
result['executed_restored_source_commit']=before['source_commit']
result['read_only_restored_mounts_verified']=True
result['current_data_alias']='Read-only current production data under held dispatch lock; exact new packet is external to the earlier source archive'
result['live_properties']=props
save(base/'result.json',result,immutable=True);print(json.dumps(result),flush=True)
