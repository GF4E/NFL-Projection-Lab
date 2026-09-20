"""Descriptive starter changes; missing T75 evidence remains unknown."""
import collections,csv,hashlib,json,statistics,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.experiment_premise import verify
OUT=ROOT/'work/e-qb-change'
def metrics(rows):
 if not rows:return {'games':0,'team_mae':None,'team_bias':None,'margin_mae':None,'margin_bias':None}
 team=[r['projection_'+s]-r['actual_'+s] for r in rows for s in ('home','away')];margin=[(r['projection_home']-r['projection_away'])-(r['actual_home']-r['actual_away']) for r in rows]
 return {'games':len(rows),'team_mae':statistics.mean(abs(x) for x in team),'team_bias':statistics.mean(team),'margin_mae':statistics.mean(abs(x) for x in margin),'margin_bias':statistics.mean(margin)}
def run():
 reg=json.loads((OUT/'registration.json').read_text());premise=verify(reg)
 for p,h in reg['files'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
 schedule=list(csv.DictReader((ROOT/next(p for p in reg['files'] if 'schedules-' in p)).open()));prior={};flags={}
 for g in sorted((g for g in schedule if g['game_type']=='REG' and g['home_score'] and g['away_score']),key=lambda g:(g['gameday'],g['gametime'],g['game_id'])):
  sideflags={}
  for side in ('home','away'):
   qb=g[side+'_qb_id'];team=g[side+'_team'];last=prior.get(team);sideflags[side]=None if not qb or not last else qb!=last;prior[team]=qb or None
  flags[g['game_id']]=sideflags
 rows=[]
 for g in json.loads((ROOT/reg['control']).read_text()):
  f=flags[g['game_id']];change='CHANGED' if any(v is True for v in f.values()) else 'STABLE' if all(v is False for v in f.values()) else 'UNKNOWN'
  rows.append({'game_id':g['game_id'],'season':g['season'],'week':g['week'],'starter_group':change,'changed_sides':f,**{'projection_'+s:g[s] for s in ('home','away')},**{'actual_'+s:g['actual_'+s] for s in ('home','away')},'known_before_T75':'UNKNOWN_ARCHIVED_KNOWLEDGE_NOT_QUALIFIED','backup_or_returning':'UNKNOWN_PREGAME_ROLE_NOT_QUALIFIED','quality_gap':'UNKNOWN_QUALIFIED_PREGAME_VALUE_NOT_AVAILABLE','correct_starter_at_lock':'UNKNOWN_NO_AS_ISSUED_PERSONNEL_LOCK'})
 groups={k:metrics([r for r in rows if r['starter_group']==k]) for k in ['CHANGED','STABLE','UNKNOWN']};changed=[r for r in rows if r['starter_group']=='CHANGED'];cells={dimension:[{'cell':value,**metrics([r for r in changed if r[dimension]==value])} for value in sorted({r[dimension] for r in changed})] for dimension in ['known_before_T75','backup_or_returning','quality_gap']}
 result={'premise':premise,'groups':groups,'changed_cells':cells,'season_groups':{str(y):{k:metrics([r for r in rows if r['season']==y and r['starter_group']==k]) for k in ['CHANGED','STABLE','UNKNOWN']} for y in range(2016,2026)},'lock_identity_counts_changed':{'correct':None,'incorrect':None,'unknown':len(changed),'verified_lock_records':0},'diagnosis':'UNRESOLVED_IDENTIFICATION_VERSUS_VALUE','retained_model_groups':['calibration','elo'],'candidates_registered':0}
 (OUT/'per-game-evidence.json').write_text(json.dumps(rows,indent=2)+'\n');(OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(groups,indent=2))
if __name__=='__main__':run()
