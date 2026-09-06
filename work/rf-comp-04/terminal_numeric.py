import pathlib,json,hashlib,math,collections
W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');R=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k');BASE=pathlib.Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data');P=BASE/'rfcomp04-v1-b7fd5fb240c6cfa8';OLD=BASE/'rf02f-v1-7b400dec97ab30c1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def raw(p):return json.loads(p.read_bytes())
def enc(x):return (json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def ptr(p):return dict(path=str(p),sha256=sha(p),bytes=p.stat().st_size)
assert sha(P/'completion/terminal.json')=='b52a904de1aad0303c1b662eec2bb4a9624695344991a94949248fd2048c170d';assert sha(P/'completion/artifact-index.json')=='1bc24410a4049fe3754e7ce944ab43bc34f311edc2f0bcd7b1f7eaf6d99d4dd9'
ix=raw(P/'completion/artifact-index.json')['files'];ox=raw(OLD/'completion/artifact-index.json')['files']
def get(root,index,n):
 p=root/n;assert sha(p)==index[n]['sha256'] and p.stat().st_size==index[n]['bytes'];return raw(p)
m=get(P,ix,'manifest.json');t=raw(P/'completion/terminal.json');pil=get(P,ix,'pilot.json');oldpil=get(OLD,ox,'pilot.json');pr=pil['projection'];orig=pil['accounting']['origins'];assert len(orig)==53
assert hashlib.sha256(enc(pil['accounting'])).hexdigest()==pr['accounting_sha256']
fits=[];scores=[];rema=[];anchors=collections.Counter()
for actual,view in zip(orig[-2:],pr['pilot']):
 assert actual['season']==2013 and actual['week']==view['week'];assert actual['seconds']==view['seconds']
 assert len(actual['game_ids'])==view['games']==16 and actual['history_count']==view['history_games']
 calls=actual['callbacks'];assert all(c['error_type'] is None for c in calls)
 for kind,arr in [('fit',fits),('score',scores)]:
  cs=[c for c in calls if c['kind']==kind];assert [c['seconds'] for c in cs]==[c['seconds'] for c in view[kind+'_calls']]
  arr.extend(cs)
 remainder=(actual['seconds']-math.fsum(c['seconds'] for c in calls))/16;assert remainder>=0;rema.append(remainder)
 for c in calls:
  if c['kind']=='fit' and c['operation']=='fit' and c['setting']>=9 and c['variant']=='full' and not c['used_fallback']:anchors['fit']+=1
  if c['kind']=='score' and c['stage']=='outer' and c['double_grid'] and c['diagnostics'] and not c['used_fallback']:anchors['score']+=1
F=max(c['seconds'] for c in fits);S=max(c['seconds'] for c in scores);C=max(rema);WG=pr['remaining_weighted_games'];E=pil['accounting']['elapsed_seconds'];ph={x['name']:x['seconds'] for x in pil['accounting']['phase_measurements']};A=ph['admission'];T=ph['inference_smoke'];assert E==pr['elapsed_seconds'] and A==pr['admission_seconds'] and T==pr['public_evaluator_seconds']
assert WG==oldpil['projection']['remaining_weighted_games'];assert pr['remaining_origins']==224 and pr['remaining_games']==3375
calc=E+WG*(C+31*(2*F+2*S))+2*T+max(60.,A)
assert calc==pr['projected_total_seconds'];assert F==pr['maximum_fit_seconds'] and S==pr['maximum_score_seconds'] and C==pr['maximum_remainder_seconds_per_game'];assert len(fits)==976 and len(scores)==640 and all(anchors.values())
assert pr['callback_counts']=={'fit':len(fits),'score':len(scores)}
for k,a in [('fit',fits),('score',scores)]:assert math.isclose(math.fsum(c['seconds'] for c in a),pr['callback_totals'][k],rel_tol=0,abs_tol=1e-12)
limit=((7200-E-2*T-max(60.,A))/WG-C)/62
count=collections.Counter();lossfiles=0;rows=0;forecastfiles=0;descriptors=0;different=[]
for n in ix:
 if n.startswith(('inner-losses-','outer-losses-')):
  a=get(P,ix,n);b=get(OLD,ox,n);assert enc(a)==enc(b),n;lossfiles+=1;rows+=len(a)
 if n.startswith('forecasts-'):
  a=get(P,ix,n);b=get(OLD,ox,n)
  for field in ['full_setting_forecasts','outer_selected_forecasts']:
   assert enc(a[field])==enc(b[field]),(n,field);descriptors+=len(a[field])
  forecastfiles+=1
 if n.startswith('origin-evidence-'):
  ev=get(P,ix,n);count.update(ev['counts']);assert all(c['error_type'] is None for c in ev['callback_records'])
assert dict(count)==t['counts'] and t['completed_origins']==53 and t['status']=='protocol_invalid';assert calc>7200 and not pr['passed'] and not pr['within_time_screen']
assert enc(get(P,ix,'selection-2013.json'))==enc(get(OLD,ox,'selection-2013.json'))
acceptance=R/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json';assert sha(acceptance)==m['implementation_acceptance_sha256'];a=raw(acceptance);assert a['code_hashes']==m['code_hashes']
O=R/'work'/('rfcomp04-observer-'+m['implementation_acceptance_sha256'][:16]);ob=raw(O/'process-report.json');assert ob['exit_code']==1 and not ob['kill_requests'] and not ob['automatic_restart']
report={'version':'rfcomp04.terminal-numerical-review.v1','status':'accepted_retained_protocol_invalid_cost_screen_only','run_status':'protocol_invalid','reason':t['reason'],'blockers':[],'evidence':[ptr(P/'manifest.json'),ptr(P/'completion/artifact-index.json'),ptr(P/'completion/terminal.json'),ptr(P/'pilot.json'),ptr(O/'process-report.json'),ptr(acceptance),ptr(OLD/'completion/artifact-index.json'),ptr(OLD/'pilot.json')],'pilot_arithmetic':{'projected_seconds':calc,'cap_seconds':7200,'excess_seconds':calc-7200,'elapsed_seconds':E,'admission_seconds':A,'evaluator_seconds':T,'maximum_fit_seconds':F,'maximum_score_seconds':S,'maximum_remainder_seconds_per_game':C,'remainders_by_pilot':rema,'remaining_weighted_games':WG,'fit_calls':len(fits),'score_calls':len(scores),'native_anchors':dict(anchors),'F_plus_S_seconds':F+S,'required_F_plus_S_holding_other_terms_fixed':limit,'required_fractional_reduction_F_plus_S':1-limit/(F+S)},'exact_original_prefix':{'loss_files':lossfiles,'loss_rows':rows,'forecast_files':forecastfiles,'forecast_rows_descriptors':descriptors,'selection2013_exact':True,'comparison':'canonical full rows/metrics including signed zero; forecast scientific populations only; manifest/provenance intentionally differ'},'counts':dict(count),'retained_origins':53,'unstarted_origins':224,'process_seconds':ob['elapsed_seconds'],'limitations':['No fitting, distribution recovery, scorer/CDF, bootstrap, tests or source-admission rerun. Arithmetic uses saved timing metadata and compares existing scientific bytes.','Remaining weighted-game total is cross-checked against authenticated original RF02F ledger and previously accepted calendar scope; future224-origin calendar not newly reconstructed here.','Root separately authenticates full431-file archive; this review hashes every compared forecast/loss/origin-evidence file plus bound metadata, not all unrelated files.','Matching15300 scored rows across both stopped prefixes supports computational equivalence only for available prefix; no full historical evaluation or predictive decision exists.','Residual callback requirement is algebra conditional on unchanged other observed projection terms, not a measured feasible optimization or new permission. No automatic restart.']}
out=W/'work/rf-comp-04/terminal-numerical-review.json';out.write_bytes(enc(report));print(ptr(out));print(report['pilot_arithmetic']);print(report['exact_original_prefix'])
