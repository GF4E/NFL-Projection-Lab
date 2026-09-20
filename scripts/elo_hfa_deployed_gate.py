"""HFA-only experiment under the pinned deployed feature and weekly ridge lineage."""
import collections,copy,csv,hashlib,json,sys,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import engine.elo as em
from engine.projection.features import build,DIV
from engine.projection_v3.model import fit,predict
from engine.projection_v3.qualify import paired
from scripts.elo_hfa_reproduce import summarize
O=ROOT/'work/e-elo-qb-hfa-v1'
def read(ref):
 raw=(ROOT/ref['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==ref['sha256'];return json.loads(raw)
def elo_features(schedule,hfa):
 e=em.Elo({t:1505 for t in DIV});groups=collections.defaultdict(list);out={}
 for g in sorted((g for g in schedule if g['game_type']=='REG'),key=lambda g:(int(g['season']),int(g['week']),g['game_id'])):groups[int(g['season']),int(g['week'])].append(g)
 for (year,week),slate in sorted(groups.items()):
  for t in DIV:e.prepare(t,year)
  for g in slate:
   h,a=g['home_team'],g['away_team']
   for t,o in [(h,a),(a,h)]:out[g['game_id'],t]={'elo':e.teams[t]['elo']-1505,'elo_difference':e.teams[t]['elo']-e.teams[o]['elo']}
  em.HFA=hfa.get(year,65.) if hfa else 65.
  for g in slate:
   if g.get('home_score') in ('',None) or g.get('away_score') in ('',None):continue
   h,a=g['home_team'],g['away_team'];f=e.forecast(h,a,g.get('location')=='Neutral',0.,0.);e.update(h,a,float(g['home_score']),float(g['away_score']),f)
 em.HFA=65.;return out

def run():
 start=time.monotonic();receipt=json.loads((ROOT/'work/projection-v2w/replay-receipt.json').read_text())
 for p,h in receipt['source_sha256'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
 reg=json.loads((O/'E-ELO-HFA.json').read_text());control=json.loads((ROOT/reg['control']).read_text());assert hashlib.sha256((ROOT/reg['control']).read_bytes()).hexdigest()==reg['files'][reg['control']]
 artifact=read(receipt['production_fit']);hist=read(receipt['historical_features']);v1=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));manifest=v1['source_manifest'];schedule=read(manifest['schedule']);tg=read(manifest['team_games']);stadiums=json.loads((ROOT/'config/stadiums.json').read_text());sg={g['game_id']:g for g in schedule}
 raw=list(csv.DictReader((ROOT/'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv').open()));hfa={};params=[]
 for y in range(2014,2026):
  prior=[g for g in raw if y-3<=int(g['season'])<y and g['game_type']=='REG' and g['location']!='Neutral' and g['home_score'] and g['away_score']];value=float(np.mean([float(g['home_score'])-float(g['away_score']) for g in prior]))*25;hfa[y]=value;params.append({'season':y,'hfa_elo':value,'points':value/25,'training_games':len(prior),'last_training_season':max(int(g['season']) for g in prior)})
 ordinary=elo_features(schedule,None);modified=elo_features(schedule,hfa);max_feature_diff=max(abs(r['features'][k]-ordinary[r['game_id'],r['team']][k]) for r in hist for k in ['elo','elo_difference']);assert max_feature_diff<1e-10,max_feature_diff
 repaired={}
 for repair in receipt['calendar_repairs']:
  gid=repair['game_id'];year=int(sg[gid]['season']);excluded=set(repair['withheld']);filtered=[dict(g,home_score=None,away_score=None) if g['game_id'] in excluded else g for g in schedule if int(g['season'])<=year];rebuilt=build([g for g in tg if g['game_id'] not in excluded],filtered,stadiums,None,manifest['roster_source_hashes']);pair=[r for r in rebuilt if r['game_id']==gid];mod=elo_features(filtered,hfa);repaired[gid]=(pair,mod);print('calendar repair',gid,flush=True)
  if time.monotonic()-start>2700:raise TimeoutError('45 minute gate ceiling')
 result={};foldfits={}
 for key in ['control','hfa']:
  rows=copy.deepcopy(hist)
  if key=='hfa':
   for r in rows:r['features'].update(modified[r['game_id'],r['team']])
  index=collections.defaultdict(list)
  for r in rows:index[r['game_id']].append(r)
  cache={};out=[];ff=[]
  for issuance in receipt['lineage']:
   gid=issuance['game_id'];year=int(sg[gid]['season']);through=issuance['through_week'];ck=(year,through)
   if ck not in cache:
    train=[r for r in rows if (r['season']<year or r['season']==year and r['week']<=through) and r['actual_points'] is not None and r['features']['baseline'] is not None];cache[ck]=fit(train,artifact['groups'],artifact['selected'][1]);ff.append({'season':year,'through_week':through,'fit_training_hash':cache[ck]['training_hash'],'training_team_rows':len(train)})
   pair=index[gid]
   if gid in repaired:
    original,mod=repaired[gid];pair=copy.deepcopy(original)
    if key=='hfa':
     for r in pair:r['features'].update(mod[gid,r['team']])
   out+=paired(pair,[predict(cache[ck],r['features'])['points'] for r in pair])
  result[key]=out;foldfits[key]=ff
 ref={r['game_id']:r for r in control};c={r['game_id']:r for r in result['control']};assert set(c)==set(ref)
 maxdiff=max(abs(c[gid][s]-ref[gid][s]) for gid in ref for s in ['home','away']);assert maxdiff<1e-10,maxdiff
 own={};point={}
 for key,features in [('control',ordinary),('hfa',modified)]:
  rr=[]
  for g in control:
   game=sg[g['game_id']];h=game['home_team'];year=g['season'];values=features[g['game_id'],h]
   if g['game_id'] in repaired:
    pair,mod=repaired[g['game_id']];values=next(r['features'] for r in pair if r['home']) if key=='control' else mod[g['game_id'],h]
   diff=values['elo_difference']+(0 if game.get('location')=='Neutral' else 65. if key=='control' else hfa[year]);prob=1/(1+10**(-diff/400));rr.append({'game_id':g['game_id'],'season':year,'actual':g['actual_home']-g['actual_away'],'outcome':1 if g['actual_home']>g['actual_away'] else 0 if g['actual_home']<g['actual_away'] else .5,key:diff/25,key+'_p':prob})
  own[key]=summarize(rr,key);point[key]={'games':len(result[key]),'team_mae':float(np.mean([abs(r[s]-r['actual_'+s]) for r in result[key] for s in ['home','away']])),'team_bias':float(np.mean([r[s]-r['actual_'+s] for r in result[key] for s in ['home','away']]))};(O/f'hfa-own-margin-{key}.json').write_text(json.dumps(rr,indent=2)+'\n')
 checks={'absolute_elo_bias_improves':abs(own['hfa']['bias'])<abs(own['control']['bias']),'reliability_03_08_improves':own['hfa']['reliability_squared_03_08']<own['control']['reliability_squared_03_08'],'elo_margin_mae_noninferior_0_1pct':own['hfa']['mae']<=own['control']['mae']*1.001,'deployed_team_mae_noninferior_0_1pct':point['hfa']['team_mae']<=point['control']['team_mae']*1.001}
 report={'premise':reg['control'],'generated_at':'2026-09-19 UTC','authoritative_control_verified':True,'control_max_abs_prediction_difference':maxdiff,'control_max_abs_feature_difference':max_feature_diff,'own_elo':own,'deployed_points':point,'checks':checks,'decision':'PROMOTION_ELIGIBLE' if all(checks.values()) else 'REJECTED','parameters':params,'elapsed_seconds':time.monotonic()-start,'population':'2639REGgames2016-2025; no2026orpostseason','source_commit':receipt['source_commit'],'method':'HFA prior-three-season nonneutralREGhome margin; exactweeklyproductionfeature/refit chronology','no_production_activation':True}
 (O/'hfa-deployed-gate.json').write_text(json.dumps(report,indent=2)+'\n');(O/'hfa-deployed-oof.json').write_text(json.dumps(result,indent=2)+'\n');(O/'hfa-ridge-lineage.json').write_text(json.dumps(foldfits,indent=2)+'\n');print(json.dumps({'checks':checks,'points':point,'own_elo':{k:{m:v[m] for m in ['mae','bias','reliability_squared_03_08']} for k,v in own.items()},'decision':report['decision'],'elapsed':report['elapsed_seconds']},indent=2))
if __name__=='__main__':run()
