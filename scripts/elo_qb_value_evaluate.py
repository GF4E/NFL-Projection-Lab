"""Registered QB VALUE replay on the released deployed lineage; one worker, no activation."""
import collections,copy,hashlib,json,math,sys,time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize_scalar
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));O=ROOT/'work/e-elo-qb-value-v2'
from engine.elo_hfa import SeasonElo
from engine.projection.features import DIV,build
from engine.projection_v3.model import fit,predict
from engine.projection_v3.qualify import paired,prior_shapes,block_interval
from engine.projection.distribution import summarize as distribution
from scripts.elo_hfa_deployed_gate import read
from scripts.experiment_premise import verify
START=None

def elapsed():
 if START is not None and time.monotonic()-START>2700:raise TimeoutError('45 minute gate budget')

def replay(schedule,values,scale,hfa=None,identity='rule',component='epa',through=2025):
 e=SeasonElo({t:1505 for t in DIV},65);groups=collections.defaultdict(list);features={};own=[]
 for g in sorted((g for g in schedule if g['game_type']=='REG' and int(g['season'])<=through),key=lambda g:(int(g['season']),int(g['week']),g['game_id'])):groups[int(g['season']),int(g['week'])].append(g)
 for (y,w),slate in sorted(groups.items()):
  for t in DIV:e.prepare(t,y)
  e.hfa=hfa.get(y,65.) if hfa else 65.;adjustments={}
  for g in slate:
   h,a=g['home_team'],g['away_team'];adj={}
   for t in [h,a]:
    v=values.get((g['game_id'],t));d=v['values'][identity][component]['difference'] if v else None;adj[t]=3.3*scale*d if d is not None else 0.
   adjustments[g['game_id']]=adj
   for t,o in [(h,a),(a,h)]:features[g['game_id'],t]={'elo':e.teams[t]['elo']-1505+adj[t],'elo_difference':e.teams[t]['elo']-e.teams[o]['elo']+adj[t]-adj[o]}
   f=e.forecast(h,a,g.get('location')=='Neutral',adj[h],adj[a])
   if g.get('home_score') not in ('',None) and g.get('away_score') not in ('',None):own.append({'game_id':g['game_id'],'season':y,'week':w,'margin':f['margin_location'],'probability':f['home_win_probability'],'actual_margin':float(g['home_score'])-float(g['away_score'])})
  for g in slate:
   if g.get('home_score') in ('',None) or g.get('away_score') in ('',None):continue
   h,a=g['home_team'],g['away_team'];adj=adjustments[g['game_id']];f=e.forecast(h,a,g.get('location')=='Neutral',adj[h],adj[a]);actual=float(g['home_score'])-float(g['away_score']);den=2.2+(.001*f['elo_difference'] if actual>0 else -.001*f['elo_difference'] if actual<0 else 0)
   if den<=0:raise ArithmeticError('Elo MOV multiplier outside defined positive domain')
   e.update(h,a,float(g['home_score']),float(g['away_score']),f)
 return features,own

def fit_scale(schedule,values,season,hfa,component):
 cache={};bad=0
 def objective(s):
  nonlocal bad
  elapsed()
  if s<0:return math.inf
  if s not in cache:
   try:
    _,own=replay(schedule,values,float(s),hfa,component=component,through=season-1);prior=[r for r in own if r['season']<season];cache[s]=float(np.mean([abs(r['margin']-r['actual_margin']) for r in prior]))
   except (ArithmeticError,OverflowError,ValueError):cache[s]=math.inf;bad+=1
  return cache[s]
 grid=[0.,1.];loss=[objective(s) for s in grid];rises=0
 for _ in range(30):
  grid.append(grid[-1]*2);loss.append(objective(grid[-1]));rises=rises+1 if loss[-1]>=loss[-2] and loss[-1]>min(loss) else 0
  if not math.isfinite(loss[-1]):break
 else:raise TimeoutError('Scale not bracketed; no arbitrary endpoint selected')
 candidates=[(l,s) for l,s in zip(loss,grid)]
 for lo,hi in zip(grid[:-1],grid[1:]):
  opt=minimize_scalar(objective,bounds=(lo,hi),method='bounded',options={'xatol':1e-5,'maxiter':120});candidates.append((float(opt.fun),float(opt.x)))
 bestloss,bests=min(candidates);return {'season':season,'scale':bests,'elo_margin_mae_training':bestloss,'training_seasons':sorted({int(g['season']) for g in schedule if g['game_type']=='REG' and int(g['season'])<season}),'last_training_season':season-1,'bracket':grid,'bracket_losses':[x if math.isfinite(x) else None for x in loss],'evaluations':len(cache),'invalid_domain_evaluations':bad,'parameters_added':1}

def point_summary(rows):
 p=np.array([r[s] for r in rows for s in ['home','away']]);y=np.array([r['actual_'+s] for r in rows for s in ['home','away']]);return {'games':len(rows),'team_mae':float(abs(p-y).mean()),'team_bias':float((p-y).mean()),'slope':float(np.linalg.lstsq(np.column_stack([np.ones(len(y)),p]),y,rcond=None)[0][1]),'projected_sd':float(p.std()),'margin_mae':float(np.mean([r['loss'][1] for r in rows])),'total_mae':float(np.mean([r['loss'][2] for r in rows]))}

def coverage(rows):
 hits=collections.defaultdict(list)
 for y in range(2016,2026):
  shapes=prior_shapes(rows,y)
  if shapes is None:continue
  for r in rows:
   if r['season']!=y:continue
   d=distribution(r['away'],r['home'],shapes)
   for k,actual in [('margin',r['actual_home']-r['actual_away']),('total',r['actual_home']+r['actual_away'])]:
    for lev in ['50','80']:
     lo,hi=d['intervals'][k][lev];hits[k+'_'+lev].append(lo<=actual<=hi)
 return {k:{'coverage':float(np.mean(v)),'games':len(v),'nominal':int(k.split('_')[1])/100} for k,v in hits.items()}

def own_summary(rows):
 p=np.array([r['margin'] for r in rows]);y=np.array([r['actual_margin'] for r in rows]);prob=np.array([r['probability'] for r in rows]);win=np.where(y>0,1,np.where(y<0,0,.5));bins=[]
 for lo in np.arange(0,1,.1):
  mask=(prob>=lo)&(prob<lo+.1 if lo<.9 else prob<=1)
  if mask.any():bins.append({'lower':round(float(lo),1),'n':int(mask.sum()),'predicted':float(prob[mask].mean()),'actual':float(win[mask].mean())})
 return {'games':len(rows),'mae':float(abs(p-y).mean()),'bias':float((p-y).mean()),'slope':float(np.linalg.lstsq(np.column_stack([np.ones(len(y)),p]),y,rcond=None)[0][1]),'win_brier':float(((prob-win)**2).mean()),'reliability':bins}

def run():
 global START
 START=time.monotonic();reg=json.loads((O/'registration.json').read_text());print(verify(reg),flush=True)
 for p,h in reg['files'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
 receipt=json.loads((ROOT/'work/projection-v2w/replay-receipt.json').read_text());artifact=read(receipt['production_fit']);hist=read(receipt['historical_features']);v1=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));m=v1['source_manifest'];schedule=read(m['schedule']);sg={g['game_id']:g for g in schedule};tg=read(m['team_games']);stadiums=json.loads((ROOT/'config/stadiums.json').read_text());vr=json.loads((O/'value-data-ref.json').read_text());values={(r['game_id'],r['team']):r for r in read(vr['values'])};release=read(json.loads((ROOT/'work/e-elo-hfa-release/release-ref.json').read_text()));hfa={int(k):v for k,v in read(release['fit'])['elo_hfa'].items()}
 repaired={}
 for r in receipt['calendar_repairs']:
  excluded=set(r['withheld']);y=int(sg[r['game_id']]['season']);filtered=[dict(g,home_score=None,away_score=None) if g['game_id'] in excluded else g for g in schedule if int(g['season'])<=y];pair=[x for x in build([x for x in tg if x['game_id'] not in excluded],filtered,stadiums,None,m['roster_source_hashes']) if x['game_id']==r['game_id']];repaired[r['game_id']]=(pair,filtered)
 primary=reg['primary_component'];config=[('c_original',None,None,primary),('deployed_hfa',hfa,None,primary),('a_qb',None,'rule',primary),('b_qb_hfa',hfa,'rule',primary),('oracle_a',None,'oracle',primary)]
 if reg['secondary_component']:config.append(('secondary_combined',None,'rule',reg['secondary_component']))
 allpoints={};allown={};scales={};lineages={}
 for name,h,ident,component in config:
  out=[];ownrows=[];params=[];fitlog=[]
  for year in range(2016,2026):
   elapsed()
   if ident=='oracle':param=next(p for p in scales['a_qb'] if p['season']==year)
   elif ident: param=fit_scale(schedule,values,year,h,component)
   else:param={'season':year,'scale':0.,'parameters_added':0}
   params.append(param);scale=param['scale'];effective_identity=ident or 'rule';features,own=replay(schedule,values,scale,h,identity=effective_identity,component=component,through=year);rows=copy.deepcopy([r for r in hist if r['season']<=year])
   for r in rows:r['features'].update(features[r['game_id'],r['team']])
   index=collections.defaultdict(list)
   for r in rows:index[r['game_id']].append(r)
   cache={};ownby={r['game_id']:r for r in own}
   for issuance in receipt['lineage']:
    gid=issuance['game_id']
    if int(sg[gid]['season'])!=year:continue
    through=issuance['through_week']
    if through not in cache:
     train=[r for r in rows if (r['season']<year or r['season']==year and r['week']<=through) and r['actual_points'] is not None and r['features']['baseline'] is not None];cache[through]=fit(train,artifact['groups'],artifact['selected'][1]);fitlog.append({'season':year,'through_week':through,'training_hash':cache[through]['training_hash'],'team_rows':len(train)})
    pair=index[gid];ownrow=ownby[gid]
    if gid in repaired:
     original,filtered=repaired[gid];fm,oo=replay(filtered,values,scale,h,identity=effective_identity,component=component,through=year);pair=copy.deepcopy(original)
     for r in pair:r['features'].update(fm[gid,r['team']])
     ownrow=next(r for r in oo if r['game_id']==gid)
    out+=paired(pair,[predict(cache[through],r['features'])['points'] for r in pair]);ownrows.append(ownrow)
   print(name,year,'s=',round(scale,6),flush=True)
  allpoints[name]=sorted(out,key=lambda r:(r['season'],r['week'],r['game_id']));allown[name]=ownrows;scales[name]=params;lineages[name]=fitlog
  (O/'scales-partial.json').write_text(json.dumps(scales,indent=2)+'\n')
 for name,path in [('c_original',reg['original_control']),('deployed_hfa',reg['control'])]:
  expected={r['game_id']:r for r in json.loads((ROOT/path).read_text())};observed={r['game_id']:r for r in allpoints[name]};assert expected.keys()==observed.keys();diff=max(abs(expected[g][s]-observed[g][s]) for g in expected for s in ['home','away']);assert diff<1e-10,(name,diff)
 summaries={k:point_summary(v) for k,v in allpoints.items()};covers={k:coverage(v) for k,v in allpoints.items()};comparisons={}
 for name in allpoints:
  comparisons[name]={}
  for base in ['deployed_hfa','c_original']:
   gains=np.array([c['loss'][0]-a['loss'][0] for a,c in zip(allpoints[name],allpoints[base])]);gain=float(gains.mean()/summaries[base]['team_mae']);cv=covers[name];ok=bool(len(cv)==4 and all(abs(v['coverage']-v['nominal'])<=.03 for v in cv.values()));comparisons[name][base]={'relative_team_mae_improvement':gain,'paired_team_point_gain_interval':block_interval(allpoints[name],gains),'coverage_pass':ok,'gate_pass':bool(name in ['a_qb','b_qb_hfa'] and gain>=.01 and ok)}
 report={'premise':verify(reg),'registration_sha256':hashlib.sha256((O/'registration.json').read_bytes()).hexdigest(),'summary':summaries,'coverage':covers,'comparison':comparisons,'own_elo':{k:own_summary(v) for k,v in allown.items()},'by_season':{k:{str(y):point_summary([r for r in v if r['season']==y]) for y in range(2016,2026)} for k,v in allpoints.items()},'scales':scales,'elapsed_seconds':time.monotonic()-START,'decision':'PROMOTION_ELIGIBLE' if any(comparisons[k]['deployed_hfa']['gate_pass'] for k in ['a_qb','b_qb_hfa']) else 'REJECTED','control_max_difference_tolerance':1e-10}
 for filename,obj in [('gate.json',report),('oof.json',allpoints),('own-elo.json',allown),('ridge-lineage.json',lineages)]: (O/filename).write_text(json.dumps(obj,indent=2,allow_nan=False)+'\n')
 print(json.dumps({'decision':report['decision'],'summary':summaries,'seconds':report['elapsed_seconds']},indent=2))
if __name__=='__main__':run()
