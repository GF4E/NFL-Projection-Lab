"""Closed COMP09 archive integrity only; no scientific code or callbacks."""
from pathlib import Path
import hashlib,json,time,resource
began=time.monotonic();repo=Path('/private/tmp/os01-gen15-rebuild.9ny71k');work=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard')
run=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rfcomp09-v1-d78471e3d2ffdb18');observer=repo/'work/rfcomp09-observer-ba46aa5fdb0df76a'
def check():assert time.monotonic()-began<120 and resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20<1024

def ptr(p):
 p=Path(p);h=hashlib.sha256();size=0
 with p.open('rb') as f:
  while b:=f.read(1048576):check();h.update(b);size+=len(b)
 return {'path':str(p),'sha256':h.hexdigest(),'bytes':size}
def read(p):check();return json.loads(Path(p).read_bytes())
pinned={'manifest.json':'d78471e3d2ffdb182266939ee13403a19b894261d9fe67ef47570f3d82d662de','completion/artifact-index.json':'d9c6742f28e144c2c641cd97034b9ccf72645baf33de772b7e2f3a9530d98220','completion/terminal.json':'0fe65f37d0739074b48d79a18636636176f062c22c98404ea51515cf949abc20','evaluation.json':'83fd47af1839660d47c4aca0053a32f509dcc23c9faa6cff175bff0cd05e6101'}
for name,sha in pinned.items():assert ptr(run/name)['sha256']==sha,name
idx=read(run/'completion/artifact-index.json');assert idx['uncommitted_artifacts']==[] and idx['uncommitted_staging']==[]
for name,item in idx['files'].items():
 p=run/name;assert not p.is_symlink() and p.is_file() and '..' not in Path(name).parts
 current=ptr(p);assert current['sha256']==item['sha256'] and current['bytes']==item['bytes'],name
physical={str(p.relative_to(run)) for p in run.rglob('*') if p.is_file()};assert physical==set(idx['files'])|{'completion/artifact-index.json'}
m=read(run/'manifest.json');t=read(run/'completion/terminal.json');obs=read(observer/'process-report.json')
assert obs['status']=='completed_process' and obs['exit_code']==0 and not obs['kill_requests'] and not obs['limit_failure'] and not obs['observation_errors'] and not obs['process_ownership_lost']
for name,item in obs['artifacts'].items():
 p=ptr(observer/name);assert p['sha256']==item['sha256'] and p['bytes']==item['bytes'],name
assert m['budget']=={'seconds':9000,'projected_seconds':9000,'rss_mib':4096,'complete_smoke_seconds':120,'invalid_metadata_seconds':30,'external_worker_grace_seconds':0,'model_workers':1}
assert t['manifest_sha256']==pinned['manifest.json'] and t['status']=='reject_all' and t['completed_origins']==277
assert t['seconds']<=9000 and t['peak_rss_mib']<=4096 and t['counts']['outer_rows']==19*3407
for name,sha in m['code_hashes'].items():assert ptr(repo/name)['sha256']==sha,name
for name,sha in m['runtime_files'].items():assert ptr(name)['sha256']==sha,name
for field in ('guard_protocol','resource_protocol','resource_policy','compute_protocol','predecessor_terminal','baseline_acceptance'):
 p=m[field];target=Path(p['path']);target=target if target.is_absolute() else repo/target;assert ptr(target)['sha256']==p['sha256'],field
record={'version':'rfcomp09.root-terminal-integrity.v1','status':'passed_closed_full_archive_integrity_pending_scientific_reviews','actual_tool_session':34188,'actual_tool_exit_code':0,
 'manifest':ptr(run/'manifest.json'),'terminal':ptr(run/'completion/terminal.json'),'index':ptr(run/'completion/artifact-index.json'),'evaluation':ptr(run/'evaluation.json'),'observer':ptr(observer/'process-report.json'),
 'run_directory':str(run),'indexed_files':len(idx['files']),'indexed_bytes':sum(p['bytes'] for p in idx['files'].values()),'physical_files':len(physical),'physical_bytes':sum(p['bytes'] for p in idx['files'].values())+(run/'completion/artifact-index.json').stat().st_size,'exact_membership':True,
 'current_source_files':len(m['code_hashes']),'runtime_files':len(m['runtime_files']),'completed_origins':277,'outer_games':3407,'counts':t['counts'],'worker_seconds':t['seconds'],'observer_seconds':obs['elapsed_seconds'],'worker_peak_rss_mib':t['peak_rss_mib'],'public_inference_seconds':t['public_inference_seconds'],
 'reported_result':'reject_all','root_audit_seconds':time.monotonic()-began,'scope':'Allindexedbyte/membership and criticalbinding/ownership/currentpin checks only. No fitting,forecasting,scoring orbootstrap. Separateactualnumerical/temporalreviewsrequired.'}
with (work/'actual-root-integrity.v1.json').open('x') as f:json.dump(record,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps({'audit':ptr(work/'actual-root-integrity.v1.json'),'files':record['indexed_files'],'bytes':record['indexed_bytes'],'physical_files':record['physical_files'],'physical_bytes':record['physical_bytes'],'seconds':record['root_audit_seconds']}))
