"""Read-only saved-evidence audit; writes only a review outside the run."""
import json, hashlib, math
from pathlib import Path
repo = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
work = Path(__file__).resolve().parent
attempt = work / 'profile-685708ac9c57a623'
observer = work / 'observer-685708ac9c57a623'
def read(p): return json.loads(p.read_bytes())
def pin(p):
    b=p.read_bytes(); return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def verify(p,v):
    actual=pin(p); assert all(actual[k]==v[k] for k in ('bytes','sha256')), str(p)

files=read(attempt/'artifact-index.json')['files']
for name,value in files.items(): verify(attempt/name,value)
assert {str(p.relative_to(attempt)) for p in attempt.rglob('*') if p.is_file()} == set(files)|{'artifact-index.json','completion.json'}
assert not any(p.is_symlink() for p in attempt.rglob('*'))
completion=read(attempt/'completion.json'); verify(attempt/'artifact-index.json',completion['artifact_index'])
process=read(attempt/'process.json'); watch=read(attempt/'watchdog.json')
assert process['exit_code']==0 and process['stop'] is process['source_error'] is None
assert process['conservative_combined_rss_mib']==293.0<1024 and process['elapsed_seconds_before_final_index']<60
assert completion['elapsed_seconds_before_completion']<3.043886166997254<60
assert watch==read(observer/'process-report.json') and watch['status']=='completed_process' and watch['exit_code']==0
assert watch['process_ownership_lost'] is False and not watch['kill_requests'] and not watch['observation_errors']
assert watch['limit_failure'] is False and watch['stop_reason'] is None
for name,value in watch['artifacts'].items(): verify(observer/name,value)
pins=read(work/'INPUT-PINS.v2.json')
assert pin(work/'INPUT-PINS.v2.json')['sha256']=='685708ac9c57a623aa22267c1ae5f88f4c08dc692f4fda73767e447fde9fa28e'
assert read(attempt/'source-map-before.json')==read(attempt/'source-map-after.json')==pins
for name,sha in pins['code_hashes'].items(): assert pin(repo/name)['sha256']==sha
for name,sha in pins['runtime_files'].items(): assert pin(Path(name))['sha256']==sha
for name,value in pins['inputs'].items(): verify(Path(name),value)
for sha in set(pins['code_hashes'].values())|{v['sha256'] for v in pins['inputs'].values() if v['snapshot']}:
    assert pin(attempt/'snapshots'/sha)['sha256']==sha

child=read(attempt/'child-result.json'); route_checks={}
for route in ('plain','profiled'):
    d=attempt/route; store=d/'origin-store'; idx=read(d/'origin-store-index.json')
    assert {p.name for p in store.iterdir() if p.is_file()}==set(idx)
    for name,value in idx.items(): verify(store/name,value)
    source_idx=read(d/'source-fixture-index.json')
    for name,value in source_idx.items(): verify(d/'source-fixture'/name,value)
    binding=read(store/'publication-binding-2013-01.json')
    provenance=read(store/'grading-provenance-2013-01.json'); evidence=read(store/'profile-origin-evidence.json')
    manifest=pin(store/'manifest.json')['sha256']
    assert binding['manifest_sha256']==provenance['manifest_sha256']==evidence['manifest_sha256']==manifest
    for key in ('state','ancestry','publication'): verify(store/binding[key]['name'],binding[key])
    assert binding['publication']==provenance['publication']==evidence['forecast']
    assert evidence['publication_binding']==dict(name='publication-binding-2013-01.json',**idx['publication-binding-2013-01.json'])
    assert binding['grading_plan']==read(d/'scientific-witness.json')['assembly']['grading_plan']
    assert binding['source_pointers']==provenance['source_pointers']==evidence['source_pointers']
    ledger=read(d/'accounting.json'); assert len(ledger['origins'])==1
    origin=ledger['origins'][0]
    assert origin['complete'] and origin['error_type'] is None and (origin['season'],origin['week'])==(2013,1)
    assert origin['game_ids']==['z-target','a-target'] and len(origin['callbacks'])==88
    last=origin['started_seconds']
    for call in origin['callbacks']:
        assert call['error_type'] is None and call['started_seconds']>=last and call['finished_seconds']<=origin['finished_seconds']
        assert call['seconds']==call['finished_seconds']-call['started_seconds']; last=call['finished_seconds']
    stages=read(d/'stages.json'); assert len(stages)==6
    for i,stage in enumerate(stages):
        assert stage['error'] is None and stage['seconds']==stage['finished_monotonic']-stage['started_monotonic']
        if i: assert stages[i-1]['finished_monotonic']<=stage['started_monotonic']
    assert stages[3]['name']=='durable_publication' and stages[4]['name']=='grade_and_saved_reload'
    report=read(d/'route-result.json'); assert report==child[route]
    fit=math.fsum(c['seconds'] for c in origin['callbacks'] if c['kind']=='fit')
    score=math.fsum(c['seconds'] for c in origin['callbacks'] if c['kind']=='score')
    assert report['B']==origin['seconds'] and report['F_total']==fit and report['S_total']==score
    assert report['remainder']==origin['seconds']-fit-score
    route_checks[route]={'store_files':len(idx),'source_files':len(source_idx),'callbacks':88,
        'source_manifest_sha256':manifest,'publication_precedes_grading_in_stage_log':True,'cost_arithmetic_exact':True}

result={'version':'rfcomp04.origin-profile-root-review.v1','status':'accepted_integrity_temporal_and_resource_scope',
    'tool_session':29297,'tool_exit_code':0,'actual_parent_seconds':3.043886166997254,
    'conservative_combined_rss_mib':293.0,'indexed_files':len(files),'indexed_bytes':sum(v['bytes'] for v in files.values()),
    'physical_membership_exact':True,'source_files_unchanged':79,'runtime_files_unchanged':7,'input_files_unchanged':len(pins['inputs']),
    'routes':route_checks,'qualitative_only':child['qualitative_only'],'profiled_plain_B_ratio':child['profiled_plain_B_ratio'],
    'artifact_index':pin(attempt/'artifact-index.json'),'completion':pin(attempt/'completion.json'),
    'process':pin(attempt/'process.json'),'observer':pin(observer/'process-report.json'),'auditor':pin(Path(__file__)),
    'audit_corrections':[
        'Initial membership check found post-run auditor reviews inside the sealed directory; diagnostic check raced the second review arriving. Both new review files moved unchanged to parent work directory; no indexed artifact changed. Membership is now exact.',
        'Auditor initially expected observer limit_failure=null; actual declared schema uses false and stop_reason=null. Corrected metadata assertion. No run evidence or scientific computation changed.'
    ],'limits':['Single genuine two-target synthetic path, not full controller or historical capacity.',
        'Phase timestamps and authenticated source/order support publication-before-grading; no independent syscall trace.',
        'Callback arithmetic/ordering checked without rerunning science; full scientific equality is separately reviewed.',
        'Sampled RSS plus worker high water and parent high water, not instantaneous kernel enforcement.',
        'Profiling/order effects exceed thresholds; timing shares qualitative only.']}
with (work/'actual-root-review.json').open('x') as f: f.write(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps({'review':pin(work/'actual-root-review.json'),'files':len(files),'bytes':sum(v['bytes'] for v in files.values())},indent=2))
