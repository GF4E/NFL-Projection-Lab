"""Read-only root integrity audit; no project imports or serializer calls."""
import hashlib,json
from pathlib import Path
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-bank-snapshot')
A=W/'attempt-0aad650afed462a2'
O=W/'observer-0aad650afed462a2'
def fp(p):
 h=hashlib.sha256(); size=0
 with p.open('rb') as f:
  while b:=f.read(1048576):h.update(b);size+=len(b)
 return {'sha256':h.hexdigest(),'bytes':size}
def read(p):return json.loads(p.read_bytes())
idx=read(A/'artifact-index.json')['files']
actual={str(p.relative_to(A)) for p in A.rglob('*') if p.is_file()}
assert actual==set(idx)|{'artifact-index.json','completion.json'}
assert all(not p.is_symlink() for p in A.rglob('*'))
for n,pin in idx.items():assert fp(A/n)==pin,n
completion=read(A/'completion.json');assert fp(A/'artifact-index.json')==completion['artifact_index']
pins=read(W/'INPUT-PINS.v1.json');assert fp(W/'INPUT-PINS.v1.json')['sha256']=='0aad650afed462a2ea23552f9ae6f4f08d4fc05bcf64f3a4ce2df1d9b306b7fb'
for n in ('INPUT-PINS.json','source-map-before.json','source-map-after.json'):assert read(A/n)==pins,n
accepted=read(R/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json')
for k in ('code_hashes','runtime_files','runtime'):assert pins[k]==accepted[k],k
for n,h in pins['code_hashes'].items():
 assert fp(R/n)['sha256']==h,n
 assert fp(A/'snapshots'/h)['sha256']==h,n
for n,h in pins['runtime_files'].items():assert fp(Path(n))['sha256']==h,n
for n,pin in pins['inputs'].items():
 assert fp(Path(n))=={k:pin[k] for k in ('sha256','bytes')},n
 if pin['snapshot']:assert fp(A/'snapshots'/pin['sha256'])=={k:pin[k] for k in ('sha256','bytes')},n
profile=W.parent/'rf-origin-profile/profile-685708ac9c57a623'
profile_index=read(profile/'artifact-index.json')['files']
expected=profile_index['plain/origin-store/state-2013-01.json']
state_path=profile/'plain/origin-store/state-2013-01.json'
assert pins['state']=={'path':str(state_path),**expected}
assert fp(state_path)==fp(A/'saved-inputs/state-2013-01.json')==expected
process=read(A/'process.json');watch=read(A/'watchdog.json');child=read(A/'child-result.json')
assert process['stop'] is process['source_error'] is None
assert process['exit_code']==watch['exit_code']==0
assert watch==read(O/'process-report.json')
assert watch['status']=='completed_process' and watch['limit_failure'] is False and watch['stop_reason'] is None
assert watch['kill_requests']==watch['observation_errors']==[] and watch['process_ownership_lost'] is False
assert process['command']==watch['command']
for n,pin in watch['artifacts'].items():assert fp(O/n)==pin,n
for n in ('stdout.log','stderr.log'):assert (A/n).read_bytes()==(O/n).read_bytes(),n
assert process['parent_peak_rss_mib']<128 and process['child_group_peak_rss_mib']<896
assert process['conservative_combined_rss_mib']==process['parent_peak_rss_mib']+process['child_group_peak_rss_mib']<1024
assert completion['elapsed_seconds_before_completion']<8.136566542001674<60
assert child['tests']=={'count':29,'errors':0,'failures':0,'skipped':0,'seconds':0.3795782499946654}
assert child['test_observation_count']==len(list((A/'test-observations').glob('*.json')))==135
assert child['parity_pairs']==child['pair_count_per_route']==10
names=['unchanged','last_rating','last_output_mean','last_origin','forecast_order','dict_insertion_order','signed_zero','numeric_type','array_list','unicode_equivalence']
answers=[True,False,False,False,False,True,False,False,True,True]
assert read(A/'pair-definitions.json')==[{'name':n,'expected_equal':v} for n,v in zip(names,answers)]
assert [(t['route'],t['name']) for t in child['timings']]==[(label,n) for label in ('original','candidate') for n in names]
for t in child['timings']:
 assert t['seconds']==t['finished_monotonic']-t['started_monotonic']
 assert read(A/'timed'/t['route']/t['name']/'outcome.json')==t
 assert t['actual']['outcome']=={'kind':'comparison','type':'bool','equal':answers[names.index(t['name'])]}
for a,b in zip(child['timings'],child['timings'][1:]):assert a['finished_monotonic']<=b['started_monotonic']
for label in ('original','candidate'):
 assert sum(t['seconds'] for t in child['timings'] if t['route']==label)==child['aggregate_seconds'][label]
assert child['candidate_original_ratio']==child['aggregate_seconds']['candidate']/child['aggregate_seconds']['original']<1
ratios={name:child['timings'][i+10]['seconds']/child['timings'][i]['seconds'] for i,name in enumerate(names)}
report={'version':'rfcomp06.root-integrity-review.v1','status':'accepted_integrity_resources_and_isolated_faster_result','blockers':[],
 'root_observed_tool_session':87991,'root_observed_actual_exit':0,'root_observed_full_command_seconds':8.136566542001674,
 'conservative_combined_rss_mib':process['conservative_combined_rss_mib'],'attempt_identity':A.name,
 'indexed_files':len(idx),'indexed_bytes':sum(v['bytes'] for v in idx.values()),'physical_membership_exact':True,
 'frozen_code_files_unchanged':len(pins['code_hashes']),'runtime_files_unchanged':len(pins['runtime_files']),
 'input_files_and_required_snapshots_unchanged':len(pins['inputs']),'saved_state_files_unchanged':1,
 'tests':child['tests'],'observations':135,'timing_items_per_route':10,'individual_candidate_original_ratios':ratios,'aggregate_seconds':child['aggregate_seconds'],
 'candidate_original_ratio':child['candidate_original_ratio'],'decision':'retain_as_isolated_partial_cost_candidate_pending_independent_numerical_review',
 'index':fp(A/'artifact-index.json'),'completion':fp(A/'completion.json'),'process':fp(A/'process.json'),
 'child_result':fp(A/'child-result.json'),'pins':fp(W/'INPUT-PINS.v1.json'),'audit_source':fp(Path(__file__).resolve()),
 'scientific_rerun':False,'candidate_or_test_execution':False,'numerical_review':'separate independent saved-output review',
 'historical_capacity_accepted':False,'predictive_accepted':False}
with (W/'actual-root-review.json').open('x') as f:f.write(json.dumps(report,indent=2,sort_keys=True)+'\n')
print(json.dumps(report,sort_keys=True))
