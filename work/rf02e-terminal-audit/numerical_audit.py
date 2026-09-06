from pathlib import Path
import json,hashlib,sys,time,math,resource
import numpy as np
from scipy.special import expit
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k'); W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6'); D=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02e-v1-b6a2bfb0ff2f0dd3');started=time.monotonic()
enc=lambda x:(json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
# Frozen encoded format is authenticated below before importing it.
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p,h=None):
 p=Path(p);assert p.is_file() and not p.is_symlink();b=p.read_bytes()
 if h:assert sha(b)==h,(str(p),'hash')
 return json.loads(b)
def ptr(p):
 b=Path(p['path']).read_bytes();assert sha(b)==p['sha256'];assert 'bytes' not in p or len(b)==p['bytes'];return json.loads(b)
M=read(D/'manifest.json','b6a2bfb0ff2f0dd300011816f2500cd94864d4ecab7db771461844b71ee3e4d8');I=read(D/'completion/artifact-index.json');T=read(D/'completion/terminal.json',I['files']['completion/terminal.json']['sha256'])
assert {str(p.relative_to(D)) for p in D.rglob('*') if p.is_file()}==set(I['files'])|{'completion/artifact-index.json'}
for n,p in I['files'].items():read(D/n,p['sha256']);assert (D/n).stat().st_size==p['bytes']
assert not I['uncommitted_artifacts'] and not I['uncommitted_staging']
assert len(M['code_hashes'])==45
for n,h in M['code_hashes'].items():assert sha((R/n).read_bytes())==h
sys.path.insert(0,str(R/'scripts'))
from research_score_contract import encoded
from research_score_conditional_inference import _decision
enc=encoded
assert sha(Path(M['protocol']['path']).read_bytes())==M['protocol']['sha256'];A=ptr(M['implementation_acceptance']);PA=ptr(M['protocol_acceptance'])
assert M['implementation_acceptance']['sha256']=='72aefcf0f0cb6ccfca7620bb2bc05902efbc092759505104a8034791c28e08f8'
assert A['code_hashes']==M['code_hashes'] and A['protocol']==M['protocol'] and A['status']=='accepted_for_one_bounded_derived_inference'
assert A['protocol_acceptance']==M['protocol_acceptance'] and PA['status']=='accepted_for_implementation_only'
# Protocol is text, so ptr above intentionally handled separately below in final script.
for p in M['fixed_inputs'].values():
 b=Path(p['path']).read_bytes();assert sha(b)==p['sha256'] and len(b)==p['bytes']
for p in A['implementation_reviews'].values():
 review=ptr(p);assert review['status']=='accepted' and review['blockers']==[] and review['source_hashes']==M['code_hashes'] and review['qualification_sha256']==A['qualification']['sha256']
Q=ptr(A['qualification']);assert Q['status']=='passed' and Q['source_hashes']==M['code_hashes']
F=M['fixed_inputs']; cfg=ptr(F['`config/research-team-score-conditional.v1.json`']);data=ptr(F['Admitted score data v2'])
source=Path(F['RF-02D `manifest.json`']['path']).parent;si=ptr(F['RF-02D `completion/artifact-index.json`']);sm=ptr(F['RF-02D `manifest.json`']);st=ptr(F['RF-02D `completion/terminal.json`']);assert st['status']=='protocol_invalid'
# Authenticate full source bytes without numerical reconstruction.
assert len(si['files'])==904
for n,p in si['files'].items():
 path=source/n;assert path.is_file() and not path.is_symlink();b=path.read_bytes();assert len(b)==p['bytes'] and sha(b)==p['sha256']
assert sum(p['bytes'] for p in si['files'].values())==1024286216
parent=Path(F['RF-02C parent manifest']['path']).parent;pi=ptr(F['RF-02C parent index']);L=read(D/'authenticated-inputs.json',I['files']['authenticated-inputs.json']['sha256']);au=read(D/'audit-inputs.json',I['files']['audit-inputs.json']['sha256']);E=read(D/'evaluation.json',I['files']['evaluation.json']['sha256'])
assert au['run_manifest_sha256']==sha((D/'manifest.json').read_bytes()) and au['input_ledger_sha256']==sha((D/'authenticated-inputs.json').read_bytes()) and all(au['checks'].values())
series=[tuple(x) for x in cfg['series']+cfg['raw_references']];mapped=[tuple(x) for x in cfg['series']];origins=[x for x in data['origins'] if 2013<=x['season']<=2025];records={x['gameId']:x for x in data['records']};metadata=[]; rows={k:[] for k in series};failures={k:[] for k in series};md={k:hashlib.sha256() for k in series};od={k:hashlib.sha256() for k in series};rawcount=0
for origin in origins:
 suffix=f"{origin['season']}-{origin['week']:02}.json";sn='scores-'+suffix;pn='outer-losses-'+suffix
 doc=read(source/sn,si['files'][sn]['sha256']);pl=read(parent/pn,pi['files'][pn]['sha256']);lookup={(x['family'],x['variant'],x['game_id']):x for x in pl}
 assert doc['origin']==origin and doc['run_manifest_sha256']==F['RF-02D `manifest.json`']['sha256']
 for sec,ss in [('mapped',mapped),('raw_references',[tuple(x) for x in cfg['raw_references']])]:
  assert [(x['family'],x['variant'],x['game_id']) for x in doc[sec]]==[(*k,g) for k in ss for g in origin['targetGameIds']]
  for x in doc[sec]:
   k=x['family'],x['variant'];g=x['game_id'];v=x['metrics'];rec=records[g]
   assert len(v)==(108 if sec=='mapped' else 104)
   assert all(type(z) in (int,float) and math.isfinite(z) for n,z in v.items() if n!='grid_cells')
   assert [v[t+'_observed'] for t in ('home','away','margin','total')]==[rec['homeScore'],rec['awayScore'],rec['homeScore']-rec['awayScore'],rec['homeScore']+rec['awayScore']]
   assert v['home_win_observed']==int(rec['homeScore']>rec['awayScore'])
   if sec=='raw_references':
    old=lookup[*k,g];assert enc(old['metrics'])==enc(v) and x['native_failure']==old['native_failure'];assert x['original_row_sha256']==sha(enc(old));rawcount+=1
   md[k].update(enc({'game_id':g,'metrics':v}));od[k].update(enc(x));rows[k].append(v);failures[k].append(x['native_failure'] is not None)
 metadata.extend({'game_id':g,'season':origin['season'],'week':origin['week']} for g in origin['targetGameIds'])
assert len(origins)==226 and len(metadata)==3407 and rawcount==20442
assert L['metadata_sha256']==sha(enc(metadata)) and L['ordered_games_sha256']==sha(enc([x['game_id'] for x in metadata]))
assert [(x['family'],x['variant']) for x in L['series']]==series
for x in L['series']:
 k=x['family'],x['variant'];assert x['rows']==len(rows[k])==3407 and x['metrics_sha256']==md[k].hexdigest() and x['ordered_rows_sha256']==od[k].hexdigest()
print('authenticated complete source and all88582 row digests',flush=True)
# Independently aggregate every reported scalar mean/median, RMSE and PIT histogram.
cohorts={'development':[i for i,x in enumerate(metadata) if x['season']<=2024], 'exposed_2025':[i for i,x in enumerate(metadata) if x['season']==2025], 'development_2014_2024_descriptive':[i for i,x in enumerate(metadata) if 2014<=x['season']<=2024]}; scalar_checks=0;maxerr=0.;calibration_checks=0;max_normalized_score_gradient=0.
for k,values in rows.items():
 for cn,inds in cohorts.items():
  card=E['scorecards'][':'.join(k)][cn];assert card['games']==len(inds)
  for name,observed in card['metrics'].items():
   if name.endswith('_rmse'):expected=float(np.sqrt(np.mean([values[i][name[:-5]+'_squared_error'] for i in inds])));pairs=[(expected,observed)]
   else:
    a=np.array([values[i][name] for i in inds]);pairs=[(float(a.mean()),observed['mean']),(float(np.median(a)),observed['median'])]
   for a,b in pairs: maxerr=max(maxerr,abs(a-b));assert a==b,(k,cn,name,a,b);scalar_checks+=1
  for target in ('home','away','margin','total'):
   a=np.array([values[i][target+'_pit'] for i in inds]);counts=np.histogram(a,bins=np.linspace(0,1,11))[0];pit=card['pit'][target];assert counts.tolist()==pit['counts'] and (counts/len(inds)).tolist()==pit['proportions'];assert float(np.max(np.abs(counts/len(inds)-.1)))==pit['maximum_uniform_bin_deviation']
  # Verify reported calibration coefficients satisfy their estimating equations;
  # no new regression fit or parameter update is performed.
  for target,cal in card['calibration'].items():
   assert cal['status']=='available', (k,cn,target,cal)
   if target=='home_win':
    prob=np.array([values[i]['home_win_probability'] for i in inds]);x=np.column_stack([np.ones(len(inds)),np.log(prob)-np.log1p(-prob)]);y=np.array([values[i]['home_win_observed'] for i in inds]);res=expit(x@np.array([cal['intercept'],cal['slope']]))-y
   else:
    x=np.column_stack([np.ones(len(inds)),[values[i][target+'_mean'] for i in inds]]);y=np.array([values[i][target+'_observed'] for i in inds]);res=x@np.array([cal['intercept'],cal['slope']])-y
   err=float(np.max(np.abs(x.T@res)))/len(inds);max_normalized_score_gradient=max(err,max_normalized_score_gradient);assert err<1e-6,(k,cn,target,err);calibration_checks+=1
inf=E['inference'];assert inf['games']==3135 and inf['comparison_order']==[x['id'] for x in cfg['comparisons']] and inf['calibration_cell_order']==cfg['calibration_cells'];assert set(inf['blocks'])=={'1','3','6'}
def mean(k,n,ids=cohorts['development']):return float(np.mean([rows[tuple(k)][i][n] for i in ids]))
for comp in cfg['comparisons']:
 v=inf['comparisons'][comp['id']];gain=1-mean(comp['candidate'],'joint_energy_score')/mean(comp['reference'],'joint_energy_score');assert abs(gain-v['gain'])<1e-14;assert v['reference']==comp['reference'] and v['candidate']==comp['candidate']
 for b in v['blocks'].values():assert all(math.isfinite(z) for z in b.values()) and b['lower']<=b['upper']
for family,var,target,level in cfg['calibration_cells']:
 v=inf['calibration_cells'][f'{family}:{var}:{target}:{level}'];res=float(np.mean([rows[family,var][i][target+'_coverage_80']-rows[family,var][i][target+'_interval_mass_80'] for i in cohorts['development']]));assert abs(res-v['residual'])<1e-14
 for b in v['blocks'].values():assert all(math.isfinite(z) for z in b.values()) and b['lower']<=b['upper']
for b in inf['blocks'].values():
 assert b['members']==10000 and b['energy_critical_max_standardized']>=0 and b['calibration_critical_max_standardized']>=0
 for name,v in b['coverage'].items():
  f,var,target,level=name.split(':');assert v['point']==mean((f,var),f'{target}_coverage_{level}') and 0<=v['lower']<=v['upper']<=1
# Exact frozen decision helper on independently assembled inputs; no evaluate/_infer/bootstrap.
decision=_decision(metadata,rows,failures,mapped,inf)
for k,v in decision.items():assert enc(v)==enc(E[k]),k
for k,v in E.items():
 if k not in ('scorecards','inference','version'):assert enc(v)==enc(T[k]),k
assert E['status']=='reject_all' and not E['mapping_supported'] and not E['candidate_qualified']
print('scorecard and frozen decision checks complete',flush=True)
report={'version':'rf02e-numerical-terminal-review.v1','status':'accepted_derived_retrospective_numerical_evidence_only','scope':'actual_saved_score_ledger_scorecards_and_frozen_decision_audit','manifest_sha256':sha((D/'manifest.json').read_bytes()),'index_sha256':sha((D/'completion/artifact-index.json').read_bytes()),'terminal_sha256':sha((D/'completion/terminal.json').read_bytes()),'evaluation_sha256':sha((D/'evaluation.json').read_bytes()),'implementation_acceptance_sha256':M['implementation_acceptance']['sha256'],'protocol_sha256':M['protocol']['sha256'],'source_hashes':M['code_hashes'],'run_directory':str(D),'blockers':[],'checks':{'derived_index_files':len(I['files']),'derived_indexed_bytes':sum(p['bytes'] for p in I['files'].values()),'rf02d_index_files_reauthenticated':904,'rf02d_indexed_bytes_reauthenticated':1024286216,'origins':226,'games':3407,'mapped_rows':68140,'raw_reference_rows':20442,'complete_series_digests_verified':26,'cohort_sizes':{k:len(v) for k,v in cohorts.items()},'scorecards_verified':78,'scalar_summary_values_exactly_recomputed':scalar_checks,'maximum_scalar_summary_absolute_error':maxerr,'calibration_equations_checked_without_fitting':calibration_checks,'maximum_per_game_normalized_calibration_gradient':max_normalized_score_gradient,'comparison_points_verified':28,'calibration_residual_points_verified':16,'bootstrap_lengths_inspected':[1,3,6],'bootstrap_members_each':10000,'full_decision_helper_exact_match':True,'terminal_evaluation_fields_exact_match':True},'outcome':{'status':E['status'],'mapping_supported':E['mapping_supported'],'candidate_qualified':E['candidate_qualified'],'failed_mapping_checks':[k for k,v in E['mapping_checks'].items() if not v],'failed_candidate_checks':[k for k,v in E['candidate_checks'].items() if not v],'stability':E['stability'],'N0_mapping_gains':E['N0_mapping_gains']},'limits_and_execution':{'reported_terminal_seconds':T['seconds'],'reported_peak_rss_mib':T['peak_rss_mib'],'execution_counts':T['execution_counts'],'audit_seconds':time.monotonic()-started,'audit_peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2},'limitations':['All complete scorecard mean/median/RMSE/PIT arithmetic independently recomputed from authenticated saved rows; calibration coefficients checked through estimating equations without a new fit.','Bootstrap interval endpoints were authenticated and inspected for exact family/order/member counts, finite ordering and correct point statistics; no count matrices or interval endpoints were regenerated.','Frozen _decision helper was reused on independently reconstructed complete inputs and authenticated reported intervals. This is exact decision reproduction, not a separate bootstrap or independent replacement decision implementation.','RF-02D remains protocol_invalid. Prior full receipt/law provenance checks and six-scalar/twelve-score sampled numerical audit are reused within their accepted scope; this audit performs no scalar fit, distribution transform or scoring.','Original historical forecast publication remains unverified; this is exposed retrospective evidence, not prospective confirmation, external5percent evidence, model promotion or production authority.','Temporal reviewer independently audits timing/persistence. Reported execution counts are artifact claims bound to accepted source and run evidence, not independently instrumented process measurements.']}
(W/'work/rf02e-terminal-audit/numerical-terminal-review.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n');print(json.dumps({'status':report['status'],'seconds':time.monotonic()-started,'checks':report['checks']}))
