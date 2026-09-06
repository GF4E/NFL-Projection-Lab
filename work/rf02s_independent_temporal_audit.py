import json, hashlib, math, itertools, copy, sys
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
RUN=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02s-v1-c4fc78f7beb8c9ee')
OUT=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02s_independent_temporal_audit.json')
def sha(b): return hashlib.sha256(b).hexdigest()
def enc(v): return (json.dumps(v,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def read(p): return json.loads(p.read_bytes())
idx=read(RUN/'artifact-index.json')['files']; cache={}; total=0
for name,v in idx.items():
 assert '/' not in name and name not in ('.','..')
 p=RUN/name; assert p.is_file() and not p.is_symlink()
 b=p.read_bytes(); assert sha(b)==v['sha256'] and len(b)==v['bytes'],name
 cache[name]=json.loads(b); total+=len(b)
manifest=cache['manifest.json']; msh=sha((RUN/'manifest.json').read_bytes())
assert msh.startswith('c4fc78f7beb8c9ee')
for name,h in manifest['code_hashes'].items(): assert sha((ROOT/name).read_bytes())==h,name
receipt=read(ROOT/'.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json')
assert sha((ROOT/'.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json').read_bytes())==manifest['accepted_receipt_sha256']
for k,h in manifest['bound_hashes'].items():
 p=Path(receipt[k]['path']); p=p if p.is_absolute() else ROOT/p
 assert sha(p.read_bytes())==h,k
D=read(Path(receipt['admittedData']['path'])); rows=D['records']; byid={r['gameId']:r for r in rows}; teams=sorted({r['homeTeam'] for r in rows}|{r['awayTeam'] for r in rows}); ti={t:i for i,t in enumerate(teams)}
config=read(ROOT/receipt['config']['path']); m=config['models']; settings={
 'E1':[dict(k=k,retention=r,home_points=h) for k,r,h in itertools.product(m['E1']['kGridInTieOrder'],m['E1']['retentionGridInTieOrder'],m['E1']['homePointsGridInTieOrder'])],
 'E2':[dict(k=k,retention=r) for k,r in itertools.product(m['E2']['kGridInTieOrder'],m['E2']['retentionGridInTieOrder'])]}
states={}; stored={}; delivered={}; earlier_ids={12:set(),24:set()}; counts={'indexed_files':len(idx),'indexed_bytes':total,'origin_windows':0,'trajectory_delivery_ledgers':0,'lineage_closures':0,'full_requested_mean_comparisons':0,'dynamic_state_transitions':0,'dynamic_requested_means':0}; maxima={'requested_fit':0.,'dynamic_state':0.,'dynamic_requested':0.}; omission_counts={12:0,24:0}; evidence2011={}
for name in sorted(n for n in idx if n.startswith('state-')):
 s=cache[name]; o=s['origin']; key=(o['season'],o['week']); states[key]=s; cut=datetime.fromisoformat(o['originAt']); prefix=f'{key[0]}-{key[1]:02}'
 assert s['historical_status']=='retrospective_inferred' and s['prospective'] is False
 assert o==next(z for z in D['origins'] if (z['season'],z['week'])==key)
 inputs={}; features={}
 for delay in (12,24):
  eligible=[r for r in sorted(rows,key=lambda r:(r['season'],r['week'],r['gameId'])) if (r['season'],r['week'])<key and datetime.fromisoformat(r['kickoffAt'])+timedelta(hours=delay)<cut]
  ids=[r['gameId'] for r in eligible]; w=o['windows'][str(delay)]
  assert ids==w['eligibleInputIds']; assert sha(enc(ids))==w['inputIdSha256']
  assert set(w['firstDeliveryIds'])==set(ids)-earlier_ids[delay]
  prior={r['gameId'] for r in rows if (r['season'],r['week'])<key}
  assert prior-set(ids)==set(w['omittedPriorInputIds'])
  assert not set(ids)&set(o['targetGameIds']); assert all(datetime.fromisoformat(byid[x]['kickoffAt'])>cut for x in o['targetGameIds'])
  for r in eligible:
   assert r['availability'][str(delay)]==(datetime.fromisoformat(r['kickoffAt'])+timedelta(hours=delay)).isoformat()
  inputs[delay]=ids; earlier_ids[delay]=set(ids); omission_counts[delay]+=len(w['omittedPriorInputIds']); counts['origin_windows']+=1
  features[delay]=[{'context':{'game_id':r['gameId'],'season':r['season'],'week':r['week'],'home':r['homeTeam'],'away':r['awayTeam'],'neutral':r['neutral']},'home_score':r['homeScore'],'away_score':r['awayScore']} for r in eligible]
  if f'ancestry-{prefix}.json' in idx:
   a=cache[f'ancestry-{prefix}.json'][str(delay)]; nodes={n['id']:n for n in a['nodes']}; seen=set(); active=set()
   def visit(k,h):
    assert k not in active and k in nodes
    n=nodes[k]; assert n['sha256']==h==sha(enc({kk:vv for kk,vv in n.items() if kk!='sha256'}))
    assert n['kind'] in {'football_source','feature_schema','target_schema','configuration','transform','model','forecast'}
    assert n.get('available_at') is None or datetime.fromisoformat(n['available_at'])<=cut
    if k in seen:return
    active.add(k)
    for p in n['parents']:visit(p['id'],p['sha256'])
    active.remove(k);seen.add(k)
   visit('forecast',a['expected_root']); assert len(seen)==6
   assert nodes['eligible-football']['body']['ids']==ids
   assert nodes['eligible-football']['body']['input_sha256']==sha(enc(features[delay]))
   assert nodes['eligible-football']['body']['admission_manifest']==msh
   assert nodes['model']['body']['code_sha256']==sha(enc(manifest['code_hashes']))
   assert nodes['configuration']['body']['sha256']==manifest['bound_hashes']['config']
   assert nodes['forecast']['body']=={'delay_hours':delay,'forecast_bytes_sha256':idx[f'forecasts-{prefix}.json']['sha256']}
   counts['lineage_closures']+=1
  if key==(2011,8):evidence2011[str(delay)]={'inputs':len(ids),'new_deliveries':len(w['firstDeliveryIds']),'omitted':w['omittedPriorInputIds'],'input_sha256':sha(enc(features[delay]))}
 tr={tuple(t['key']):t for t in s['trajectory_state']}; assert len(tr)==352
 for tk,t in tr.items():
  fam,setting,var=tk; delay=24 if var=='availability_24h' else 12; out=t['output']; ev=out['events']; prevdel=delivered.get(tk,set()); new=set(inputs[delay])-prevdel
  assert len(ev['delivered'])==len(set(ev['delivered'])) and set(ev['delivered'])==new
  assert set(ev['initialization_only'])<=new
  assert {f['game_id'] for f in out['forecasts']}==set(o['targetGameIds'])
  delivered[tk]=set(inputs[delay]); counts['trajectory_delivery_ledgers']+=1
  if fam not in ('E1','E2') or var not in ('full','availability_24h'):continue
  param=settings[fam][setting]; saved=stored.setdefault(tk,{}); prevkey=max((k for k in states if k<key),default=None); prevtr=None if prevkey is None else {tuple(t['key']):t for t in states[prevkey]['trajectory_state']}[tk]
  rating=np.full(32,1500.) if prevtr is None else np.array(prevtr['ratings']); off=np.zeros(32) if prevtr is None else np.array(prevtr['offense']); defense=np.zeros(32) if prevtr is None else np.array(prevtr['defense'])
  # Use only immutable original-origin expectations. No model fit or trajectory runner.
  def apply(ids):
   nonlocal_placeholder=None
   rd=np.zeros(32);od=np.zeros(32);dd=np.zeros(32)
   for gid in sorted(ids):
    r=byid[gid];h,a=ti[r['homeTeam']],ti[r['awayTeam']]; assert gid in saved
    pr=saved[gid];k=param['k']*(.5 if r['season']==2020 else 1.)
    if fam=='E1':
     y=1. if r['homeScore']>r['awayScore'] else .5 if r['homeScore']==r['awayScore'] else 0.;d=k*(y-pr['expected']);rd[h]+=d;rd[a]-=d
    elif pr['mean'] is not None:
     error=np.array([r['homeScore'],r['awayScore']])-pr['mean'];od[h]+=k*error[0]/2;od[a]+=k*error[1]/2;dd[a]-=k*error[0]/2;dd[h]-=k*error[1]/2
    else:assert gid in ev['initialization_only']
   rating[:]+=rd;off[:]+=od;defense[:]+=dd;off[:]-=off.mean();defense[:]-=defense.mean()
  boundary=prevkey is not None and key[0]>prevkey[0]
  if boundary:
   apply([g for g in new if byid[g]['season']<key[0]])
   retain=param['retention']**(key[0]-prevkey[0]);rating[:]=1500+(rating-1500)*retain;off[:]*=retain;defense[:]*=retain
   apply([g for g in new if byid[g]['season']==key[0]])
  else:apply(new)
  assert ev['offseason_retention_applied']==boundary
  err=max(float(np.max(np.abs(rating-t['ratings']))),float(np.max(np.abs(off-t['offense']))),float(np.max(np.abs(defense-t['defense'])))); maxima['dynamic_state']=max(maxima['dynamic_state'],err);assert err<1e-10,(key,tk,err)
  counts['dynamic_state_transitions']+=1
  for f in out['forecasts']:
   r=byid[f['game_id']];h,a=ti[r['homeTeam']],ti[r['awayTeam']];home=0 if r['neutral'] else 1;b=out['league_mean']
   if fam=='E1':
    x=(t['ratings'][h]-t['ratings'][a]+param['home_points']*home)/400; expected=1/(1+10**(-x));mu=None if b is None else np.array([b+out['elo_score_slope']*x/2,b-out['elo_score_slope']*x/2]);saved[f['game_id']]={'expected':expected,'mean':f['mean']}
   else:
    mu=None if b is None else np.array([b+out['home_effect']*home/2+t['offense'][h]-t['defense'][a],b-out['home_effect']*home/2+t['offense'][a]-t['defense'][h]]);saved[f['game_id']]={'mean':f['mean']}
   assert (mu is None)==(f['mean'] is None)
   if mu is not None:
    err=float(np.max(np.abs(mu-f['mean'])));maxima['dynamic_requested']=max(maxima['dynamic_requested'],err);assert err<1e-12,(key,tk,err);counts['dynamic_requested_means']+=1
 if f'forecasts-{prefix}.json' in idx:
  F=cache[f'forecasts-{prefix}.json']; assert F['manifest_sha256']==msh
  full=F['full_setting_forecasts'];assert len(full)==43*len(o['targetGameIds'])
  for f in full:
   requested=next(p for p in tr[(f['family'],f['setting'],'full')]['output']['forecasts'] if p['game_id']==f['game_id'])
   assert f['native_failure'] is None
   err=float(np.max(np.abs(np.array(requested['mean'])-f['distribution']['mean'])));maxima['requested_fit']=max(maxima['requested_fit'],err);assert err<=1e-7
   counts['full_requested_mean_comparisons']+=1
   ptr=f['distribution']['mapper']; assert ptr['sha256']==idx[ptr['name']]['sha256']; mapper=cache[ptr['name']]; assert mapper['input_sha256']==sha(enc(features[12]))
# Feature-layer falsification on original admitted rows: no model fitting.
sys.path.insert(0,str(ROOT/'scripts'))
from research_score_contract import prepare_origin
origin=states[(2011,8)]['origin']; baseline={d:prepare_origin(rows,origin,d) for d in (12,24)}
mutated=copy.deepcopy(rows)
for r in mutated:
 r['spread']=-1234;r['recorded_selection']='injected-control'
 if (r['season'],r['week'])>=(2011,8):r['homeScore']=201;r['awayScore']=177;r['overtime']=99
for d in (12,24):
 assert baseline[d]==prepare_origin(mutated,origin,d)
 assert baseline[d]==prepare_origin([r for r in rows if (r['season'],r['week'])<=(2011,8)][::-1],origin,d)
report={'status':'terminal_prefix_temporal_checks_pass','run_manifest_sha256':msh,'artifact_index_sha256':sha((RUN/'artifact-index.json').read_bytes()),'terminal':cache['terminal-failure.json'],'counts':counts,'max_abs_differences':maxima,'omitted_prior_occurrences':omission_counts,'2011_week8':evidence2011,'feature_falsification':'12h and24h actual2011week8 features unchanged under current/future score+OT mutation, injected market/selection fields, future truncation, source reversal','limitations':['No full research leakage/promotion acceptance: only53 origins through2013week2;32 outer games.','No model fitted/replayed by this audit; E1/E2 delayed state equations checked from immutable original-origin snapshots.','E1 score-slope fitting and S1/N0 coefficients were inspected in source, not independently refit.','Ancestor available_at fields are null; independent admitted kickoff+delay computation supplies retrospective cutoff evidence, not original publication evidence.','Full scorecards,12-season paired uncertainty, full calibrations and all-game falsification are absent after terminal budget halt.']}
OUT.write_bytes(enc(report));print(json.dumps(report,indent=2))
