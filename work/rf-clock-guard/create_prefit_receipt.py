"""Metadata-only root acceptance assembly; no historical admission or callbacks."""
from pathlib import Path
import sys,json,hashlib,time,resource
ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k');WORK=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard');started=time.monotonic()
sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'scripts'))
import research_score_clock_guard_preflight as p
def check():
 assert time.monotonic()-started<120,'metadata_prefit_timeout'
 assert resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20<1024,'metadata_prefit_memory'
def pointer(path,relative=False):
 path=Path(path);raw=path.read_bytes();check();return {'path':str(path.relative_to(ROOT)) if relative else str(path),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
def read(path):return json.loads(Path(path).read_bytes())
q=read(WORK/'qualification.v1.json');assert q['status']=='passed' and q['tests']=={'run':27,'passed':27} and q['actual_tool_exit_code']==0
old=read(ROOT/'.planning/engine-os/research-first/RF-COMP-08-PREFIT-ACCEPTANCE.v1.json')
acceptance={**old,'version':p.VERSION,'status':'accepted_for_one_historical_invocation','code_hashes':q['code_hashes'],
'baseline_acceptance':p.BASELINE_ACCEPTANCE,'guard_protocol':pointer(ROOT/p.GUARD_PROTOCOL_PATH,True),'predecessor_terminal':p.PREDECESSOR_TERMINAL,
'qualification':pointer(WORK/'qualification.v1.json'),'independent_reviews':{role:pointer(WORK/(role+'-review.v1.json')) for role in ('numerical','temporal')}}
raw=p.encoded(acceptance);sha=p.digest(raw)
ready=p._validate(ROOT,acceptance,sha,p.actual_runtime(),check,read=p._file,frozen=p.FROZEN_CODE_HASHES,candidates=p.CANDIDATE_FILES,stages=p.STAGES,
compute_sha=p.COMPUTE_PROTOCOL_SHA,runtime_files=p.RUNTIME_FILES,terminal_pointers=p.TERMINAL_POINTERS,resource_sha=p.RESOURCE_PROTOCOL_SHA,policy_sha=p.RESOURCE_POLICY_SHA,
baseline_pointer=p.BASELINE_ACCEPTANCE,guard_sha=p.GUARD_PROTOCOL_SHA,predecessor_pointer=p.PREDECESSOR_TERMINAL,predecessor_artifacts=p.PREDECESSOR_ARTIFACTS)
path=ROOT/'.planning/engine-os/research-first/RF-COMP-09-PREFIT-ACCEPTANCE.v1.json'
with path.open('xb') as f:f.write(raw)
record={'version':'rfcomp09.root-prefit-validation.v1','status':'ready_for_one_historical_invocation','prefit':pointer(path),'identity':ready['identity'],'manifest_sha256':ready['manifest_sha256'],'budget':ready['manifest']['budget'],'source_files':len(ready['manifest']['code_hashes']),'runtime_files':len(ready['manifest']['runtime_files']),'guard_protocol':ready['manifest']['guard_protocol'],'seconds':time.monotonic()-started,'historical_execution':False}
with (WORK/'prefit-validation.json').open('x') as f:json.dump(record,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps(record))
