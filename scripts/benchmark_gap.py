"""Read-only paired benchmark decomposition. Never imports model fitting code."""
import collections,csv,hashlib,json,math,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/e-benchmark-gap'
def finite(value):
 try:return math.isfinite(float(value))
 except (ValueError,TypeError):return False

def margin_band(x):
 x=abs(x)
 return '<3' if x<3 else '3–<7' if x<7 else '7–<14' if x<14 else '14+'
def summary(rows):
 n=len(rows)
 if not n:return {'games':0}
 result={'games':n,**{name+'_mae':statistics.mean(r[name+'_loss'] for r in rows) for name in ['deployed','nfelo','closing','baseline']}}
 for name in ['nfelo','closing']:
  gap=[r['deployed_loss']-r[name+'_loss'] for r in rows];result[name+'_gap']=statistics.mean(gap);result[name+'_excess_loss']=sum(gap);result[name+'_gap_standard_error']=statistics.stdev(gap)/math.sqrt(n) if n>1 else None
 return result

def run():
 reg=json.loads((OUT/'registration.json').read_text())
 for name,h in reg['files'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==h,name
 paths=list(reg['files']);control=next(x for x in paths if 'deployed-oof' in x);np=next(x for x in paths if 'nfelo-historic' in x);sp=next(x for x in paths if 'schedules-' in x)
 deployed=json.loads((ROOT/control).read_text());base={r['game_id']:r for r in json.loads(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).read_text())};nf=list(csv.DictReader((ROOT/np).open()));schedule=list(csv.DictReader((ROOT/sp).open()));sch={r['game_id']:r for r in schedule};counts=collections.Counter(r['game_id'] for r in nf);nd={r['game_id']:r for r in nf if counts[r['game_id']]==1}
 # Observed starters, used solely for retrospective strata, no inferred QB status.
 previous={};changes={}
 for g in sorted((g for g in schedule if g['game_type']=='REG' and finite(g['home_score']) and finite(g['away_score'])),key=lambda g:(g['gameday'],g['gametime'],g['game_id'])):
  flags={};prior_ids={}
  for side in ['home','away']:
   team=g[side+'_team'];qb=g[side+'_qb_id'];prior=previous.get(team);flags[side]=None if not qb or not prior else qb!=prior;prior_ids[side]=prior;previous[team]=qb or None
  bucket='CHANGED' if any(v is True for v in flags.values()) else 'UNCHANGED' if all(v is False for v in flags.values()) else 'UNKNOWN'
  changes[g['game_id']]={'bucket':bucket,'flags':flags,'prior_ids':prior_ids}
 included=[];excluded=[]
 for d in sorted(deployed,key=lambda r:r['game_id']):
  if not 2021<=d['season']<=2025:continue
  gid=d['game_id'];s=sch.get(gid);n=nd.get(gid);reason=None
  if counts[gid]>1:reason='DUPLICATE_NFELO_GAME_ID'
  elif n is None:reason='MISSING_NFELO'
  elif s is None:reason='MISSING_SCHEDULE'
  elif s['game_type']!='REG':reason='NOT_REG'
  elif not finite(n['home_line_pre_regression']):reason='MISSING_NFELO_PRE_REGRESSION'
  elif not finite(s['spread_line']):reason='MISSING_CLOSING_LINE'
  if reason:excluded.append({'game_id':gid,'reason':reason});continue
  actual=d['actual_home']-d['actual_away'];assert actual==float(s['home_score'])-float(s['away_score'])
  pred=d['home']-d['away'];other=-float(n['home_line_pre_regression']);closing=float(s['spread_line']);b=base[gid]['home']-base[gid]['away'];roof=s['roof'].lower()
  r={'game_id':gid,'season':d['season'],'week':d['week'],'actual_margin':actual,'deployed_margin':pred,'nfelo_margin':other,'closing_margin':closing,'baseline_margin':b,'week_band':'1–5' if d['week']<=5 else '6+','favorite_band':margin_band(pred),'qb_change':changes[gid]['bucket'],'qb_flags':changes[gid]['flags'],'prior_qb_ids':changes[gid]['prior_ids'],'current_qb_ids':{side:s[side+'_qb_id'] or None for side in ['home','away']},'roof':'DOME' if roof in ['dome','closed'] else 'OUTDOOR' if roof in ['open','outdoors'] else 'UNKNOWN'}
  for name in ['deployed','nfelo','closing','baseline']:r[name+'_loss']=abs(actual-r[name+'_margin'])
  included.append(r)
 pooled=summary(included);buckets={}
 for dimension in ['season','week_band','favorite_band','qb_change','roof']:
  group=collections.defaultdict(list)
  for r in included:group[str(r[dimension])].append(r)
  buckets[dimension]={k:summary(v) for k,v in sorted(group.items())}
  for m in buckets[dimension].values():
   for comparator in ['nfelo','closing']:m[comparator+'_excess_loss_share']=m[comparator+'_excess_loss']/pooled[comparator+'_excess_loss'] if pooled[comparator+'_excess_loss'] else None
 result={'pooled':pooled,'buckets':buckets,'eligibility':{'deployed_2021_2025':sum(2021<=r['season']<=2025 for r in deployed),'matched':len(included),'excluded_counts':dict(collections.Counter(r['reason'] for r in excluded))},'audit_target':1177,'audit_population_reproduced':len(included)==1177,'qb_label':'Observed starter change versus previous played REG game; retrospective, not confirmed pregame'}
 for name,value in [('per-game.json',included),('excluded-games.json',excluded),('results.json',result)]: (OUT/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
 print(json.dumps(result,indent=2))
if __name__=='__main__':run()
