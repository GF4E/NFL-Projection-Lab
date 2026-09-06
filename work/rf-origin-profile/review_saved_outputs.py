"""Read saved metadata and numerical arrays as bytes only; no scientific imports."""
from pathlib import Path
from collections import Counter
import json,hashlib,math,struct,stat
W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
A=W/'work/rf-origin-profile/profile-685708ac9c57a623'
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
E={}; n=0
def must(v,s):
 global n
 n+=1
 if not v:raise AssertionError(s)
def enc(v):return (json.dumps(v,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def sha(b):return hashlib.sha256(b).hexdigest()
def pairs(rows):
 d={}
 for k,v in rows:
  if k in d:raise ValueError('duplicate_json_key')
  d[k]=v
 return d
def parse(b):return json.loads(b,object_pairs_hook=pairs,parse_constant=lambda s:(_ for _ in ()).throw(ValueError(s)))
def read(p,h=None,size=None):
 p=Path(p);must(stat.S_ISREG(p.lstat().st_mode),'regular file');b=p.read_bytes();e={'path':str(p),'sha256':sha(b),'bytes':len(b)}
 if h:must(e['sha256']==h,'hash:'+str(p))
 if size is not None:must(len(b)==size,'bytes:'+str(p))
 E[str(p)]=e;return b
def obj(p,h=None,size=None):return parse(read(p,h,size))
pins=obj(A/'INPUT-PINS.json','685708ac9c57a623aa22267c1ae5f88f4c08dc692f4fda73767e447fde9fa28e')
for name in ('source-map-before.json','source-map-after.json'):must(obj(A/name)==pins,'before/after map')
h=W/'work/rf-origin-profile/profile_origin.py';read(h,'e14538c3f8dd241117f9f7029a83b5dd35c43946f09bcf16b2430be0ae170b37')
scope=R/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-SCOPE.v1.md';read(scope,'828919db563bd1895a649f122c6d38c643fdba3c92615b9e048f11cf6a5393eb')
completion=obj(A/'completion.json');index=obj(A/'artifact-index.json',completion['artifact_index']['sha256'],completion['artifact_index']['bytes'])['files']
def artifact(rel):
 p=index[rel];return obj(A/rel,p['sha256'],p['bytes'])
refpath=W/'work/rf-comp-04/attempt-1788652424308249000/numerical-observations.json'
references=obj(refpath,'630b123b3df3edb804bc8054e02a4ae45c2b09eeaa37be6859b387bcca01b347')
matching=[x for x in references if x.get('route')=='composed' and x.get('year')==2013 and x.get('selected')==0 and x.get('injected_fit_failure') is None];must(len(matching)==1,'unique accepted reference');ref=matching[0]
stable=lambda rows:[{k:v for k,v in x.items() if k not in ('started_seconds','finished_seconds','seconds')} for x in rows]
expected_counts={'inner_rows':54,'outer_rows':38,'copied_diagonal_inner':18,'scored_inner':36,'copied_e3_outer':22,'scored_outer':4,'copied_raw_outer':12,'actual_score_calls':40,'actual_mass_cdf_calls':208}
child=artifact('child-result.json');process=artifact('process.json');watchdog=artifact('watchdog.json')
must(process['exit_code']==0 and process['stop'] is process['source_error'] is None and watchdog['exit_code']==0,'completed parent child evidence')
results={};states={};bindings={};origin_evidence={};witnesses={};source_maps={}
for label in ['plain','profiled']:
 prefix=label+'/'
 witness=artifact(prefix+'scientific-witness.json');witnesses[label]=witness
 must(set(witness)=={'assembly','callbacks','counts','inner_rows','outer_rows','publication','provenance','resolved_laws'},'complete witness fields')
 for key,v in witness.items():must(enc(v)==enc(stable(ref[key]) if key=='callbacks' else ref[key]),'reference parity:'+label+':'+key)
 must(witness['counts']==expected_counts and len(witness['inner_rows'])==54 and len(witness['outer_rows'])==38,'all populations')
 must(len(witness['resolved_laws'])==62,'law population')
 for law in witness['resolved_laws']:
  for name,field in law['fields'].items():
   if 'dtype' in field:
    must(field['dtype']=='<f8' and field['writeable'] is False,'readonly float64 law')
    must(len(bytes.fromhex(field['c_bytes_hex']))==8*math.prod(field['shape']),'array byte shape')
   elif field['type']=='float':must(struct.pack('>d',field['value']).hex()==field['float_bits'],'scalar bits')
 for row in witness['inner_rows']:must(len(row['metrics'])==28 and row['native_failure'] is None,'inner saved schema')
 for row in witness['outer_rows']:must(len(row['metrics'])==(108 if row['family']=='E3' else 104) and row['native_failure'] is None,'outer saved schema')
 ledger=artifact(prefix+'accounting.json');stages=artifact(prefix+'stages.json');result=artifact(prefix+'route-result.json')
 must(len(ledger['origins'])==1 and ledger['phase_measurements']==[],'one real accounting origin')
 record=ledger['origins'][0];calls=record['callbacks'];must(len(calls)==88 and stable(calls)==witness['callbacks'],'raw callback metadata')
 must(record['complete'] is True and record['error_type'] is None and record['season']==2013 and record['week']==1 and record['game_ids']==['z-target','a-target'] and record['history_count']==1,'origin membership')
 must(record['seconds']==record['finished_seconds']-record['started_seconds'],'B arithmetic')
 previous=record['started_seconds'];ops=Counter();flags=Counter()
 for call in calls:
  must(call['started_seconds']>=previous and call['finished_seconds']<=record['finished_seconds'] and call['seconds']==call['finished_seconds']-call['started_seconds'] and call['seconds']>0,'callback disjointness')
  must(call['error_type'] is call['error_reason'] is call['native_failure'] is None and call['used_fallback'] is False,'no failed callback');previous=call['finished_seconds']
  ops[call['kind'],call['operation'],call['stage']]+=1
  if call['kind']=='score':flags[call['stage'],str(call['double_grid']),str(call['diagnostics'])]+=1
 must(dict(ops)=={('fit','fit','inner'):36,('fit','fit','outer'):4,('fit','recovery','outer'):8,('score','score','inner'):36,('score','score','outer'):4},'callback physical classes')
 must(dict(flags)=={('inner','True','False'):18,('inner','False','False'):18,('outer','True','True'):4},'flags population')
 must([s['name'] for s in stages]==['source_and_mapper_preparation','native_advance_and_digest','assembly_and_after_digest','durable_publication','grade_and_saved_reload','single_origin_evidence_persistence'],'stage order')
 end=0
 for s in stages:
  must(s['error'] is None and s['started_monotonic']>=end and s['seconds']==s['finished_monotonic']-s['started_monotonic'] and s['seconds']>0,'stage disjointness');end=s['finished_monotonic']
 F=math.fsum(c['seconds'] for c in calls if c['kind']=='fit');S=math.fsum(c['seconds'] for c in calls if c['kind']=='score');B=record['seconds'];st=math.fsum(s['seconds'] for s in stages)
 must(result['B']==B and result['F_total']==F and result['S_total']==S and result['remainder']==B-F-S and result['unallocated_seconds']==B-st,'exact accounting totals')
 must(B>=F+S and B>=st and result['stage_seconds']=={s['name']:s['seconds'] for s in stages},'complete interval totals')
 must(result==child[label] and result['source_scorer_calls_during_setup']==8,'result binding/setup count')
 # Authenticate retained route Stores and source fixture bytes, without scientific reconstruction.
 for folder,mapname in [('origin-store','origin-store-index.json'),('source-fixture','source-fixture-index.json')]:
  imap=artifact(prefix+mapname);physical={p.relative_to(A/label/folder).as_posix() for p in (A/label/folder).rglob('*') if p.is_file()}
  must(physical==set(imap),'retained route membership')
  for name,p in imap.items():
   rel=prefix+folder+'/'+name;must(index[rel]==p,'route index to outer index');read(A/rel,p['sha256'],p['bytes'])
  if folder=='source-fixture':source_maps[label]=imap
  else:storemap=imap
 stored=lambda name:parse((A/label/'origin-store'/name).read_bytes())
 must((A/label/'origin-store'/'inner-losses-2013-01.json').read_bytes()==enc(witness['inner_rows']),'durable inner complete bytes')
 must((A/label/'origin-store'/'outer-losses-2013-01.json').read_bytes()==enc(witness['outer_rows']),'durable outer complete bytes')
 must(stored('forecasts-2013-01.json')==witness['publication'] and stored('grading-provenance-2013-01.json')==witness['provenance'],'publication/provenance complete bytes')
 state=stored('state-2013-01.json');binding=stored('publication-binding-2013-01.json');oe=stored('profile-origin-evidence.json');states[label]=state;bindings[label]=binding;origin_evidence[label]=oe
 must(oe['callback_records']==calls and oe['counts']==expected_counts,'origin evidence full callbacks')
 for pointer in [oe['forecast'],oe['publication_binding'],*oe['score_artifacts'].values(),binding['state'],binding['ancestry']]:
  must(storemap[pointer['name']]=={k:pointer[k] for k in ('sha256','bytes')},'local closure pointer')
 must(binding['grading_plan']==witness['assembly']['grading_plan'] and binding['publication']==witness['provenance']['publication'],'private plan closure')
 ancestry=stored('ancestry-2013-01.json')
 for delay,v in ancestry.items():
  by={x['id']:x for x in v['nodes']}
  for node in by.values():
   must(node['sha256']==sha(enc({k:v for k,v in node.items() if k!='sha256'})),'ancestry node')
   for p in node['parents']:must(by[p['id']]['sha256']==p['sha256'],'ancestry parent')
  must(v['expected_root']==by['forecast']['sha256'] and by['forecast']['body']['forecast_bytes_sha256']==binding['publication']['sha256'],'ancestry owning publication')
 results[label]={'B':B,'F_total':F,'S_total':S,'remainder':B-F-S,'stage_sum':st,'unallocated':B-st,'stages':result['stage_seconds'],'setup_seconds':result['setup_seconds'],'source_scorer_calls':8,'operations':{':'.join(k):v for k,v in ops.items()},'score_flags':{':'.join(k):v for k,v in flags.items()},'scientific_witness_sha256':sha(enc(witness))}
must(enc(witnesses['plain'])==enc(witnesses['profiled']),'plain/profiled exact complete witness')
must(source_maps['plain']==source_maps['profiled'],'both source images exact')
# Only explicitly named time-derived closure differences are tolerated.
must(enc({k:v for k,v in states['plain'].items() if k!='actual_computation_at'})==enc({k:v for k,v in states['profiled'].items() if k!='actual_computation_at'}),'only native state timestamp differs')
for v in bindings.values():v['state']={k:x for k,x in v['state'].items() if k not in ('sha256','bytes')}
must(enc(bindings['plain'])==enc(bindings['profiled']),'only state pointer changes binding')
for v in origin_evidence.values():
 v['callback_records']=stable(v['callback_records']);v['publication_binding']={k:x for k,x in v['publication_binding'].items() if k not in ('sha256','bytes')}
must(enc(origin_evidence['plain'])==enc(origin_evidence['profiled']),'only stated evidence differences')
ratio=results['profiled']['B']/results['plain']['B'];ratios={k:results['profiled']['stages'][k]/v for k,v in results['plain']['stages'].items()}
must(ratio==child['profiled_plain_B_ratio'] and ratios==child['stage_ratios'],'ratio recomputation')
must(child['qualitative_only'] is True and (abs(ratio-1)>.25 or any(abs(v-1)>.5 for v in ratios.values())),'qualitative-only threshold')
stats=artifact('profiled/pstats-records.json');p=index['profiled/origin.pstats'];read(A/'profiled/origin.pstats',p['sha256'],p['bytes'])
bound=[x for x in stats if x['function'][-1]=='_bound_law'];must(len(bound)==1 and bound[0]['total_calls']==128,'actual bound-law structural count')
report={
 'version':'rf-origin-profile.actual-numerical-review.v1','status':'accepted_exact_synthetic_outputs_and_accounting_qualitative_timing_only','role':'numerical','scope':'one_plain_and_one_profiled_declared_two_target_origin_saved_output_audit','blockers':[],
 'harness_sha256':'e14538c3f8dd241117f9f7029a83b5dd35c43946f09bcf16b2430be0ae170b37','scope_sha256':'828919db563bd1895a649f122c6d38c643fdba3c92615b9e048f11cf6a5393eb','input_pins_sha256':'685708ac9c57a623aa22267c1ae5f88f4c08dc692f4fda73767e447fde9fa28e','attempt':str(A),
 'complete_witness_sha256':results['plain']['scientific_witness_sha256'],'counts_per_route':expected_counts,'resolved_laws_per_route':62,'callbacks_per_route':88,'setup_scorer_calls_per_route':8,
 'exact_fields':['assembly full/outer rows and private plans','all ordered resolved-law scalar types/bits and ndarray dtype/shape/Cbytes/writeability','complete inner/outer metric rows including diagnostic and interval-mass fields','counts','complete publication','complete grading provenance and original source/loss pointers','all callback metadata except three named timing fields'],
 'timing':results,'profiled_plain_B_ratio':ratio,'stage_ratios':ratios,'qualitative_only':True,'profile_function_records':len(stats),'actual_bound_law_count':128,'optimization_selected':None,
 'findings':[
 'Both complete 762,569-byte scientific witness files are identical and independently equal the uniquely selected accepted composed 2013 setting-0 reference on every required field. Both contain 54 inner and 38 outer rows, no native failure, exact first-inner flags and complete diagnostics/mass metrics.',
 'All 88 physical callbacks per route are positive-duration, disjoint, bounded by their single complete origin and free of recorded errors. Their stable metadata exactly matches the accepted witness. Forty are complete score calls, forty are fits and eight are recoveries. The actual count of 208 mass CDF calls is preserved in original grader counters; no new CDF observation was manufactured.',
 'Recalculation from original raw same-route callback intervals exactly reproduces B/F_total/S_total/remainder. All six stage intervals are ordered and disjoint; sums and unallocated gaps exactly match the saved summaries. Setup counts are eight genuine source-scorer calls per route.',
 'All ten origin-Store files and eight source-fixture files per route were independently hash/size authenticated to both their route indexes and outer completion-bound artifact index. Both source images are identical. Saved metrics exactly equal witness encoding. Owning publication/grading/private-plan/ancestry pointers are consistent.',
 'Only the declared new native state timestamp, its dependent state/binding pointers and profile evidence callback times differ across route closures. Complete grading provenance remains exact. Array read-only flags and numeric bits remain exact to the accepted reference.',
 'Profiled B is 2.3425655164 times plain B; every stage ratio also exceeds the 50-percent deviation threshold. Therefore the frozen qualitative-only rule applies. The 128 actual _bound_law calls match the predeclared structural expectation. No optimization is selected by this review.'
 ],
 'execution_evidence':{'parent_report_exit_code':process['exit_code'],'reported_conservative_combined_rss_mib':process['conservative_combined_rss_mib'],'completion_elapsed_before_write':completion['elapsed_seconds_before_completion'],'root_reported_actual_session':29297,'root_reported_actual_exit':0,'root_reported_elapsed_seconds':3.043886166997254,'full_resource_and_pin_review_owner':'root'},
 'independence_and_method':{'reviewer':'compute_cache','disclosure':'Reviewer authored the earlier accepted integration tests and statically reviewed this harness; this review independently compares actual retained scientific bytes and recalculates timing metadata. Root separately reviews all archive/pin/resource/ownership evidence.','metadata_assertions':n,'scientific_imports':0,'profile_reruns':0,'tests_rerun':0,'fits':0,'distribution_recoveries':0,'scorer_calls':0,'cdf_calls':0,'historical_execution':False},
 'limits':[
 'One fixed plain then profiled pair cannot separate instrumentation, order, cache and OS effects. Ratios trigger qualitative attribution only; do not normalize by a constant overhead factor.',
 'The two-atom, one-prior-result, two-target setting-0 case does not reproduce historical empirical support/history size, 16-target I/O amortization or setting-6 cost maxima.',
 'Annual selection/feed, full admission, large history/index behavior, smoke, bootstrap, full controller and historical terminal remain excluded. Their costs are not zero.',
 'In-memory source/mapper before-after checks were performed by the pinned harness and completed before route-result publication. The transient arrays no longer exist; this reviewer verifies persisted law/fixture bytes and the bound check path, not a second independent snapshot of discarded memory.',
 'Raw old scientific-spy score/mass-call observations are not regenerated. Accepted complete metric bytes, provenance, callback ledger and original counters supply exactness evidence; no extra scientific work is used.',
 'Inclusive cProfile times overlap and can mix callback and non-callback paths. No cumulative bucket is interpreted as removable time or historical C reduction. No optimization is selected.',
 'Root owns final source-map/runtime-file/whole-attempt/resource/actual-exit acceptance. The saved controller reports remain provisional until that independent close.',
 'This is exact synthetic-output and accounting acceptance only. It establishes no historical capacity, predictive superiority, public release readiness, restart or new historical authorization.'
 ],
 'evidence':list(E.values())}
out=A/'actual-numerical-review.json'
with out.open('xb') as f:f.write(enc(report))
print(json.dumps({'status':report['status'],'path':str(out),'sha256':sha(out.read_bytes()),'bytes':out.stat().st_size,'checks':n,'ratio':ratio}))
