"""Create and validate the RF-COMP-08 pre-fit receipt after actual reviews."""
import time
STARTED=time.monotonic()
import hashlib,json,resource,signal,sys
from pathlib import Path
ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-resource-policy')
BASE=ROOT/'.planning/engine-os/research-first'
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'scripts'))
def check():
    assert time.monotonic()-STARTED<120,'metadata_validation_deadline'
    assert resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20<1024,'metadata_validation_memory'
def raw(p):check();return p.read_bytes()
def sha(p):return hashlib.sha256(raw(p)).hexdigest()
def pointer(p,relative=False):return {'path':str(p.relative_to(ROOT) if relative else p),'sha256':sha(p),'bytes':p.stat().st_size}
def write(p,x):
    with p.open('x') as f:json.dump(x,f,sort_keys=True,indent=2,allow_nan=False);f.write('\n')
    check()
import research_score_resource_preflight as preflight
old=json.loads(raw(BASE/'RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'))
qual_path=WORK/'qualification.v1.json';qual=json.loads(raw(qual_path))
assert sha(qual_path)=='300f5c7bcfb343e4273ba3e31e94d7fd0237b995fb0506ff0f9c131cbfd1c763'
assert qual['status']=='passed' and qual['tests']=={'run':23,'passed':23}
reviews={}
for role in ('numerical','temporal'):
    path=WORK/(role+'-review.v1.json');value=json.loads(raw(path))
    preflight._evidence_result(value,qual['code_hashes'],qual['runtime'],qual['protocol_sha256'],qual['config_sha256'],role=role,qualification_sha=sha(qual_path),compute_sha=qual['compute_protocol_sha256'],runtime_files=qual['runtime_files'],resource_sha=qual['resource_protocol_sha256'],policy_sha=qual['resource_policy_sha256'])
    for p in value['evidence']:assert pointer(Path(p['path']))==p
    reviews[role]=pointer(path)
acceptance={**old,'version':preflight.VERSION,'code_hashes':qual['code_hashes'],
 'qualification':pointer(qual_path),'independent_reviews':reviews,
 'resource_protocol':pointer(ROOT/preflight.RESOURCE_PROTOCOL_PATH,True),
 'resource_policy':pointer(ROOT/preflight.RESOURCE_POLICY_PATH,True),
 'baseline_acceptance':preflight.BASELINE_ACCEPTANCE}
# Validate the fully assembled object before committing the unique final receipt.
body=preflight.encoded(acceptance);acceptance_sha=hashlib.sha256(body).hexdigest()
ready=preflight._validate(ROOT,acceptance,acceptance_sha,preflight.actual_runtime(),check,read=preflight._file,
 frozen=preflight.FROZEN_CODE_HASHES,candidates=preflight.CANDIDATE_FILES,stages=preflight.STAGES,
 compute_sha=preflight.COMPUTE_PROTOCOL_SHA,runtime_files=preflight.RUNTIME_FILES,
 terminal_pointers=preflight.TERMINAL_POINTERS,resource_sha=preflight.RESOURCE_PROTOCOL_SHA,
 policy_sha=preflight.RESOURCE_POLICY_SHA,baseline_pointer=preflight.BASELINE_ACCEPTANCE)
assert ready['manifest']['budget']['seconds']==ready['manifest']['budget']['projected_seconds']==9000
from research_score_run import OUTPUT_PARENT
assert not (OUTPUT_PARENT/ready['identity']).exists(),'new_run_identity_already_exists'
observer=ROOT/'work'/('rfcomp08-observer-'+acceptance_sha[:16])
assert not observer.exists(),'observer_identity_already_exists'
path=BASE/'RF-COMP-08-PREFIT-ACCEPTANCE.v1.json'
with path.open('xb') as f:f.write(body)
assert sha(path)==acceptance_sha
write(WORK/'prefit-validation.json',{'status':'accepted_current_prefit_metadata_only',
 'acceptance':pointer(path),'manifest_sha256':ready['manifest_sha256'],'run_identity':ready['identity'],
 'run_directory':str(OUTPUT_PARENT/ready['identity']),'observer_directory':str(observer),
 'budget':ready['manifest']['budget'],'seconds':time.monotonic()-STARTED,
 'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20,
 'historical_execution':False,'actual_result_acceptance':'pending','owner_approval':'explicit_Approved_2026_09_06'})
print(json.dumps({'acceptance':pointer(path),'manifest_sha256':ready['manifest_sha256'],
 'run_identity':ready['identity'],'run_directory':str(OUTPUT_PARENT/ready['identity']),
 'observer_directory':str(observer),'seconds':time.monotonic()-STARTED}))
