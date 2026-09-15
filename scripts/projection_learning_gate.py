"""One evidenced input-group change per week; immutable comparisons and decision log."""
import copy,json
from engine.projection_v3.model import GROUPS,fit,predict
from engine.projection_v3.qualify import paired,prior_shapes,read
from engine.projection.distribution import summarize
from engine.projection.grade import grade
from engine.projection_learning import metrics
from scripts.projection_learning import ROOT,WORK,OUT,active_artifact,pinned
from scripts.projection_publish import save
ALIASES={'roll':'momentum','roll index':'momentum','momentum':'momentum','luck':'turnovers_luck','luck index':'turnovers_luck','rest':'rest_travel','wind':'wind','elo':'elo','elo gap':'elo','divisional':'venue','dome':'venue'}

def passes(before,after):
 if not before.get('team_points_mae') or after.get('team_points_mae') is None:return False
 coverage=[after.get(t+'_coverage_'+level) for t in ['margin','total'] for level in ['50','80']]
 return (before['team_points_mae']-after['team_points_mae'])/before['team_points_mae']>=.01-1e-12 and all(v is not None and abs(v-int(level)/100)<=.03+1e-12 for v,level in zip(coverage,['50','80','50','80']))

def evaluate(rows,groups,penalty):
 predictions=[];cards=[]
 calibration_history=read(json.loads((WORK/'reference.json').read_text())['oof'])
 for year in range(2016,2026):
  train=[r for r in rows if r['season']<year and r.get('actual_points') is not None and r['features'].get('baseline') is not None];test=[r for r in rows if r['season']==year and r.get('actual_points') is not None and r['features'].get('baseline') is not None];f=fit(train,groups,penalty);predictions+=paired(test,[predict(f,r['features'])['points'] for r in test])
 for p in predictions:
  shapes=prior_shapes(calibration_history,p['season'])
  # All-year MAE, strictly prior-season interval reference where available.
  use=shapes or read(active_artifact()['shapes']);projection=summarize(p['away'],p['home'],use)
  cards.append({'season':p['season'],'projection':projection,'grades':{'PROJECTION':grade(projection,p['actual_away'],p['actual_home'])}})
 result=metrics(cards);covered=metrics([c for c in cards if c['season']>2016])
 for k in result:
  if '_coverage_' in k:result[k]=covered[k]
 return result,predictions

def counterfactual(cards,historical,groups,penalty,shapes):
 out=[];seen=[]
 for week in sorted({c['week'] for c in cards}):
  training=[r for r in historical+seen if r.get('actual_points') is not None and r['features'].get('baseline') is not None];f=fit(training,groups,penalty)
  for c in [c for c in cards if c['week']==week]:
   pair=c.get('learning_features')
   if not pair or not c.get('grades') or c.get('evidence')!='AS_ISSUED':continue
   p=summarize(predict(f,pair['away']['features'])['points'],predict(f,pair['home']['features'])['points'],shapes);a=c['grades']['PROJECTION']['actual'];out.append({'game_id':c['game_id'],'projection':p,'grades':{'PROJECTION':grade(p,a['away_points'],a['home_points'])}})
   for side in ['home','away']:
    row=copy.deepcopy(pair[side]);row['actual_points']=a[side+'_points'];seen.append(row)
 return metrics(out),out

def log(decision):
 p=ROOT/'CHANGELOG.md';prior=p.read_text() if p.exists() else '# Projection change log\n'
 marker=f"<!-- learning-2026-{decision['week']} -->"
 if marker in prior:return
 lines=['',marker,f"## Learning proposal · Week {decision['week']} · {decision['state']}",decision.get('reason',''),f"Evidence: `{decision['evidence_ref']['path']}`",'']
 for population,table in decision.get('tables',{}).items():
  lines += [f'### {population}','| Metric | Before | After |','|---|---|---|']
  for key in table['before']:lines.append(f"| {key} | {table['before'][key]} | {table['after'].get(key)} |")
 if not decision.get('tables'):lines+=['| Comparison | Before | After |','|---|---|---|','| Not tested: no supported candidate | unchanged | unchanged |']
 lines+=['',f"Decision receipt: `{decision['receipt_path']}`",''];p.write_text(prior+'\n'.join(lines))

def propose(week,now):
 """Compatibility endpoint: automated method selection and activation are retired.

 Existing historical decision receipts remain evidence, never executable commands.
 Registered experiment runners own future method decisions under Governance §2.5.
 """
 return {'state':'METHOD_PROMOTION_DISABLED','week':week,'at':now.isoformat(),
         'reason':'Registered experiment release decision required; automatic loop is weight-only.'}
