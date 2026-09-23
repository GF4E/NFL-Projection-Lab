"""Season reports, immutable training snapshots and Tuesday refits (no paid API)."""
import argparse,copy,datetime as dt,gzip,hashlib,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection_learning import build_report,markdown,metrics
from engine.projection_v3.qualify import read,prior_shapes
from engine.projection_v3.model import fit
from engine.projection.grade import grade
from engine.projection.distribution import summarize
from scripts.projection_publish import save
from engine.projection import prepared
OUT=ROOT/'outputs/in-season-learning-v1';WORK=ROOT/'work/in-season-learning-v1'

def pinned(name,value):
 raw=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();sha=hashlib.sha256(raw).hexdigest();p=WORK/f'{name}-{sha}.json';save(p,value,True);return {'path':str(p.relative_to(ROOT)),'sha256':sha}

METHOD_FILES=['engine/elo_hfa.py','engine/projection/features.py','engine/projection_v3/personnel.py','engine/projection_v3/model.py','scripts/projection_prepare.py']

def method_signature():return {f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in METHOD_FILES}

def initialize():
 if (WORK/'baseline-ref.json').exists():return
 from engine.projection_v3.qualify import load_prepared
 save(WORK/'method-signature.json',method_signature(),True)
 a_ref=json.loads((ROOT/'work/projection-v3/fit-ref.json').read_text());a=read(a_ref);prepared,_,_=load_prepared();rows=prepared[a['selected'][0]]
 # Public sanitized football features, no raw provider bodies or credentials.
 ref=pinned('historical-features',[{k:r[k] for k in ['row_id','game_id','season','week','team','home','features','actual_points']} for r in rows if r['season']<2026]);save(WORK/'historical-ref.json',ref,True);save(WORK/'trajectory-history.json',[{k:r[k] for k in ['game_id','season','week','team','home','features']} for r in rows if r['season']==2025 and r['week']>=12],True);save(WORK/'baseline-ref.json',a_ref,True)
 exp=read(json.loads((ROOT/'work/projection-v3/record-ref.json').read_text()));predictions=read(exp['oof']);cards=[]
 for r in predictions:
  shapes=prior_shapes(predictions,r['season'])
  if shapes:p=summarize(r['away'],r['home'],shapes);g=grade(p,r['actual_away'],r['actual_home'])
  else:
   p={'home_points':r['home'],'away_points':r['away'],'margin':r['home']-r['away'],'total':r['home']+r['away']};g={'actual':{'home_points':r['actual_home'],'away_points':r['actual_away'],'margin':r['actual_home']-r['actual_away'],'total':r['actual_home']+r['actual_away']},'errors':{},'interval_hits':{'margin':{'50':False,'80':False},'total':{'50':False,'80':False}}};g['errors']={k:g['actual'][k]-p[k] for k in p}
  cards.append({'projection':p,'grades':{'PROJECTION':g},'season':r['season']})
 reference=metrics(cards);covered=metrics([c for c in cards if c['season']>2016])
 for k in reference:
  if '_coverage_' in k:reference[k]=covered[k]
 save(WORK/'reference.json',{'metrics':reference,'oof':exp['oof'],'games':len(cards),'coverage_games':sum(c['season']>2016 for c in cards),'version':a['version']},True)

def active_artifact_with_ref():
 refpath=WORK/'active-fit-ref.json'
 ref=json.loads((refpath if refpath.exists() else WORK/'baseline-ref.json').read_text())
 return ref,read(ref)

def active_artifact():
 return active_artifact_with_ref()[1]

def current_rows():return prepared.load(ROOT)[0]

def feature_snapshot(pair):
 result={}
 for side in ['home','away']:
  r=copy.deepcopy(pair[side]);r['features']['dome']=str(r['game'].get('roof','')).lower() in ['dome','closed'];result[side]=r
 return result

def trajectories(rows):
 # Opponent defense in this row belongs to opponent; use reverse matchup for own defense.
 bygame={}
 for r in rows:bygame.setdefault(r['game_id'],{})[r['home']]=r
 history={}
 for r in rows:
  opponent=bygame[r['game_id']].get(not r['home']);history.setdefault(r['team'],[]).append({'season':r['season'],'week':r['week'],'game_id':r['game_id'],'for':r['features'].get('off_off_ppd'),'against':opponent['features'].get('def_off_ppd') if opponent else None,'roll':r['features'].get('momentum')})
 return history

def report():
 initialize();board=json.loads((ROOT/'outputs/projection-v3/board.json').read_text());cache=ROOT/'.cloud-private/projection-entries.json';entries=json.loads(cache.read_text()) if cache.exists() else {};b=build_report(board['games'],json.loads((WORK/'reference.json').read_text()),entries.get('history',[]));by={c['game_id']:c for c in board['games']};ledger=[{**e,'actual':by.get(e.get('game_id'),{}).get('grades',{}).get('PROJECTION',{}).get('actual') if by.get(e.get('game_id'),{}).get('grades') else None} for e in entries.get('history',[])];save(OUT/'edit-history.json',ledger);b['board_sha256']=board['content_sha256'];b['published_at']=board['published_at'];
 from scripts.reference_lines import weekly_report,render
 b['reference_lines']=weekly_report(board['games'],ROOT)
 save(OUT/'reference-lines.json',b['reference_lines']);(OUT/'reference-lines.md').write_text(render(b['reference_lines'],weekly=True))
 save(OUT/'trend.json',b);(OUT/'trend.md').write_text(markdown(b)+'\n'+render(b['reference_lines'],weekly=True)+'\nConfidence: near-total — reported errors and diagnostics are arithmetic on saved projections and grades. Move down to high if a source or lineage mismatch invalidates those rows.\n');return b

def due_week(rows,now):
 local=now.astimezone(ZoneInfo('America/Los_Angeles'));games={r['game_id']:r for r in rows};due=[]
 for week in sorted({r['week'] for r in rows}):
  slate=[r for r in games.values() if r['week']==week];last=min(dt.date.fromisoformat(r['game']['gameday']) for r in slate) # Postponed games defer completion, not the scheduled Tuesday.
  tuesday=last+dt.timedelta(days=(1-last.weekday())%7 or 7);deadline=dt.datetime.combine(tuesday,dt.time(6),ZoneInfo('America/Los_Angeles'))
  if local>=deadline:due.append(week)
 return max(due) if due else None

def _weekly_refit(rows,previous_week,now):
 receipt=OUT/'refits'/f'2026-w{previous_week+1}.json'
 if receipt.exists():
  result=json.loads(receipt.read_text())
  if active_artifact()['version']==result['parent_version']:save(WORK/'active-fit-ref.json',result['fit'])
  return result
 expected=WORK/'method-signature.json'
 if expected.exists() and json.loads(expected.read_text())!=method_signature():raise ValueError('Input or fitting settings code changed; v2 harvest required')
 a=active_artifact();slate=[r for r in rows if r['week']==previous_week];finished=all(r.get('actual_points') is not None for r in rows if r['week']<=previous_week)
 # Require results and current PBP for every prior-week game, including grades for all issued cards.
 source=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_text());team_games=read(source['team_games']);available={r['game_id'] for r in team_games}
 board=json.loads((ROOT/'outputs/projection-v3/board.json').read_text());missing_grades=[g['game_id'] for g in board['games'] if g['week']<=previous_week and g.get('projection') and not g.get('grades')]
 missing_pbp=sorted({r['game_id'] for r in rows if r['week']<=previous_week}-available)
 if not slate or not finished or missing_pbp or missing_grades:return {'state':'WAITING_FOR_FINALS_AND_PBP','through_week':previous_week,'missing_pbp':missing_pbp,'missing_grades':missing_grades}
 historical=read(a.get('historical_features') or json.loads((WORK/'historical-ref.json').read_text()));training=[r for r in historical+rows if r['season']<2026 or r['week']<=previous_week];training=[r for r in training if r.get('actual_points') is not None and r['features'].get('baseline') is not None]
 updated=copy.deepcopy(a);updated['fit']=fit(training,a['groups'],a['selected'][1]);updated['parent_version']=a['version'];updated['version']=f'projection-v1.w{previous_week+1}' if not a.get('learning_method') else f"{a.get('version_prefix','projection-v2')}.w{previous_week+1}";updated['through_week']=previous_week;updated['issued_at']=now.isoformat();ref=pinned('fit',updated)
 result={'state':'REFIT_COMPLETE','version':updated['version'],'fit':ref,'parent_version':a['version'],'through_week':previous_week,'issued_at':now.isoformat(),'training_rows':len(training),'settings':a['selected'],'groups':a['groups']}
 save(receipt,result,True);save(WORK/'active-fit-ref.json',ref);return result

def weekly_refit(rows,previous_week,now):
 with prepared.writer(ROOT):
  from engine.projection.pipeline_release import guard
  if guard(ROOT):raise ValueError('Activated pipeline weekly refit requires qualified release handoff')
  return _weekly_refit(rows,previous_week,now)

def closeout_for_refit(week,season,now):
 from scripts.closeout_publish import require_published
 local=now.astimezone(ZoneInfo('America/Los_Angeles'))
 tuesday=local.date()-dt.timedelta(days=(local.weekday()-1)%7)
 receipt=ROOT/'outputs/cadence-v2/closeouts'/f'{tuesday}.json'
 if not receipt.exists():return False
 closed=require_published(ROOT,receipt,now)
 return closed['week']==week and closed['season']==season

def run_weekly(now=None):
 initialize();now=now or dt.datetime.now(dt.timezone.utc);rows=current_rows();week=due_week(rows,now)
 if week is None:return {'state':'NOT_DUE'}
 if week>=18:return {'state':'SEASON_COMPLETE'}
 if not closeout_for_refit(week,max(r['season'] for r in rows),now):return {'state':'WAITING_FOR_PUBLISHED_CLOSEOUT','through_week':week}
 result=weekly_refit(rows,week,now)
 if result['state']=='REFIT_COMPLETE':
  result['improvement']={'state':'METHOD_PROMOTION_DISABLED','reason':'Registered experiment release decision required; automatic loop is weight-only.'}
 save(OUT/'weekly-status.json',result);return result

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--trend',action='store_true');parser.add_argument('--weekly',action='store_true');args=parser.parse_args()
 if args.weekly:print(json.dumps(run_weekly()))
 if args.trend or not args.weekly:
  report();print((OUT/'trend.md').read_text())
