"""Recompute report bucket statistics from raw first grades with pandas/NumPy."""
import hashlib,json,math,sys
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from scripts import projection_learning as runtime
DEST=Path(sys.argv[1]).resolve();DEST.mkdir(parents=True,exist_ok=True)
originals=[p for kind in ('locks','grades') for p in (ROOT/'outputs/projection-v3'/kind).glob('*.json')]+[ROOT/'work/in-season-learning-v1/active-fit-ref.json']
before={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
with patch.object(runtime,'OUT',DEST),patch.object(runtime,'initialize',side_effect=AssertionError('Report initialized fitting evidence')),patch.object(runtime,'fit',side_effect=AssertionError('Report fit model')):
 report=runtime.report()
records=report['forecast_diagnostics']['records'];raw=[]
for rec in records:
 ref=rec['first_grade_ref'];data=(ROOT/ref['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==ref['sha256'];c=json.loads(data)
 for side in ('home','away'):
  value={'game_id':c['game_id'],'team':c[side],'error':c['grades']['PROJECTION']['actual'][side+'_points']-c['projection'][side+'_points'],'evidence':c['evidence']}
  assert abs(value['error']-c['grades']['PROJECTION']['errors'][side+'_points'])<1e-10
  row=(c.get('learning_features') or {}).get(side,{})
  terms=pd.DataFrame(c.get('contributions',{}).get(side,[]))
  for name in ('momentum','luck_index','rest_days','wind','elo_difference','divisional','dome'):
   x=np.nan
   if name in row.get('features',{}):
    if row.get('metadata',{}).get(name,{}).get('status')=='ACTIVE':x=row['features'][name]
   elif not terms.empty:
    t=terms[(terms['input']==name)&(terms['status']=='ACTIVE')]
    if len(t):x=t.iloc[-1]['value']
   if name=='dome':x={'dome':1,'closed':1,'outdoors':0,'open':0}.get(row.get('game',{}).get('roof'),np.nan)
   if name=='wind':
    x=np.nan;f=c.get('forecast') or {}
    try:
     issued=pd.Timestamp(f.get('forecast_issued_at'));received=pd.Timestamp(f.get('received_at'));cutoff=pd.Timestamp(c.get('cutoff_at'))
     if f.get('status')=='FORECAST' and len(f.get('source_sha256',''))==64 and all(t.tz is not None for t in (issued,received,cutoff)) and issued<=received<cutoff:x=f['wind_mph']
    except (TypeError,ValueError):pass
   value[name]=x
  value['projected_margin']=abs(c['projection']['margin']);raw.append(value)
frame=pd.DataFrame(raw);edges={'momentum':[-.5,.5],'luck_index':[-.5,.5],'rest_days':[6,8,14],'wind':[10,20],'elo_difference':[-100,0,100],'projected_margin':[3,7,14]}
comparisons=0;maximum=0.;summary={}
for evidence,pop in report['populations'].items():
 data=frame[frame['evidence']==evidence];selected={}
 for name in list(edges)+['divisional','dome','team']:
  if name in edges:
   e=edges[name];labels=['['+('-inf' if i==0 else str(e[i-1]))+','+('inf' if i==len(e) else str(e[i]))+')' for i in range(len(e)+1)]
   bands=pd.cut(data[name],[-np.inf]+e+[np.inf],labels=labels,right=False).astype(object).fillna('unavailable')
  elif name=='team':bands=data[name]
  else:bands=data[name].map({0:'false',1:'true'}).fillna('unavailable')
  for label,positions in bands.groupby(bands).groups.items():selected[(name,label)]=data.loc[positions]
 flags=0
 for bucket in pop['diagnostics']['buckets']:
  rows=selected[(bucket['input'],bucket['band'])];n=len(rows);g=rows['game_id'].nunique();mean=rows['error'].mean()
  se=None
  if g>1:
   centered=(rows['error']-mean).groupby(rows['game_id']).sum().to_numpy()
   se=float(np.sqrt(np.dot(centered,centered)*g/(g-1)/(n*n)))
  assert bucket['count']==n and bucket['games']==g
  flag=g>1 and bucket['band']!='unavailable' and abs(mean)>2*se
  assert bucket['flag']==flag
  for expected,actual in ((mean,bucket['mean_signed_error']),(se,bucket['standard_error'])):
   assert (expected is None)==(actual is None)
   if expected is not None:
    diff=abs(expected-actual);maximum=max(maximum,diff);assert diff<1e-10
   comparisons+=1
  flags+=flag
 summary[evidence]={'graded_games':pop['graded'],'pending':pop['pending'],'unverified_final':pop['unverified_final'],'buckets':len(pop['diagnostics']['buckets']),'flags':int(flags),'input_coverage':pop['diagnostics']['input_coverage']}
assert before=={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
# Pure diagnostics and edit selection must not depend on card order.
from engine.projection.weekly_diagnostics import original_cards
from engine.projection_learning import build_report
cards=original_cards(ROOT,json.loads((ROOT/'outputs/projection-v3/board.json').read_bytes())['games'],report['forecast_diagnostics'])
reference=json.loads((ROOT/'work/in-season-learning-v1/reference.json').read_bytes())
assert build_report(cards,reference)==build_report(list(reversed(cards)),reference)
result={'status':'PASS','first_grades':len(records),'team_rows':len(frame),'independent_bucket_metric_checks':comparisons,'maximum_absolute_difference':maximum,'populations':summary,'original_records_and_pointer_unchanged':len(originals),'row_order_invariant':True,'edit_rows':len(report['learning']['rows']),'edit_evidence':'No local real edit observations; chronology behavior is fixture-verified','report_sha256':hashlib.sha256((DEST/'trend.json').read_bytes()).hexdigest(),'scope':'Report-only first-grade diagnostic qualification, no fit or gate','provider_requests':0}
(DEST/'verification.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(json.dumps(result,indent=2))
