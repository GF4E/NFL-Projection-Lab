"""Independent explicit HFA reproduction; gate stays shut on reference mismatch."""
import csv,json,sys,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import engine.elo as em
O=ROOT/'work/e-elo-qb-hfa-v1';SP=ROOT/'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv'
def summarize(rows,key):
 a=np.array([r[key]-r['actual'] for r in rows]);p=np.array([r[key+'_p'] for r in rows]);y=np.array([r['outcome'] for r in rows]);bins=[]
 for i in range(10):
  m=(p>=i/10)&(p<(i+1)/10 if i<9 else p<=1);bins.append({'lower':i/10,'n':int(m.sum()),'forecast':float(p[m].mean()) if m.any() else None,'observed':float(y[m].mean()) if m.any() else None})
 v=[b for b in bins if .3<=b['lower']<.8 and b['n']];den=sum(b['n'] for b in v)
 return {'games':len(rows),'mae':float(abs(a).mean()),'bias':float(a.mean()),'brier':float(((p-y)**2).mean()),'slope':float(np.polyfit([r[key] for r in rows],[r['actual'] for r in rows],1)[0]),'reliability':bins,'reliability_squared_03_08':sum(b['n']*(b['forecast']-b['observed'])**2 for b in v)/den if den else None}
def run():
 games=[g for g in csv.DictReader(SP.open()) if g['home_score'] and g['away_score'] and int(g['season'])<=2025];games.sort(key=lambda g:(g['gameday'],g['gametime'],g['game_id']))
 selected=[g for g in games if g['game_type']=='REG'];states=[em.Elo({}),em.Elo({})];result=[];hfas={}
 for g in selected:
  year=int(g['season']);h,a=g['home_team'],g['away_team'];hs,aws=float(g['home_score']),float(g['away_score']);neutral=g.get('location')=='Neutral'
  if year not in hfas:
   hist=[r for r in selected if year-3<=int(r['season'])<year and r.get('location')!='Neutral'];hfas[year]=sum(float(r['home_score'])-float(r['away_score']) for r in hist)/len(hist)*25 if hist else 65.
  v={'game_id':g['game_id'],'season':year,'actual':hs-aws,'outcome':1 if hs>aws else 0 if hs<aws else .5,'hfa_elo':hfas[year]}
  for key,model in zip(['control','hfa'],states):
   em.HFA=65. if key=='control' else hfas[year];model.prepare(h,year);model.prepare(a,year);f=model.forecast(h,a,neutral,0.,0.);v[key]=f['margin_location'];v[key+'_p']=f['home_win_probability'];model.update(h,a,hs,aws,f)
  result.append(v)
 em.HFA=65.
 scope=[r for r in result if 2016<=r['season']<=2025];folds=[r for r in scope if r['season']>=2017]
 report={'source':str(SP.relative_to(ROOT)),'source_sha256':hashlib.sha256(SP.read_bytes()).hexdigest(),'population':'REG; chronological; earliest available schedule warmup','counts_2016_2025':{'REG':len(scope),'ALL_GAME_TYPES':sum(2016<=int(g['season'])<=2025 for g in games)},'hfa_elo_by_season':{str(y):v for y,v in hfas.items() if 2016<=y<=2025},'pooled_2016_2025':{k:summarize(scope,k) for k in ['control','hfa']},'reproduction_2017_2025':{k:summarize(folds,k) for k in ['control','hfa']},'by_season':{str(y):{k:summarize([r for r in scope if r['season']==y],k) for k in ['control','hfa']} for y in range(2016,2026)},'reported_targets':{'n':2244,'control_mae':10.2748,'hfa_mae':10.2524,'control_bias':.999,'hfa_bias':.221},'reference_tolerance_mae':.01,'status':'REPRODUCTION_RECONCILIATION_REQUIRED_NO_GATE'}
 report['reference_deltas']={k:report['reproduction_2017_2025'][k]['mae']-report['reported_targets'][k+'_mae'] for k in ['control','hfa']}
 report['reproduction_matches']=len(folds)==2244 and all(abs(v)<=.01 for v in report['reference_deltas'].values())
 if report['reproduction_matches']:report['status']='REPRODUCED_READY_FOR_DEPLOYED_GATE'
 report['home_actual_margin_by_season']={str(y):float(np.mean([r['actual'] for r in scope if r['season']==y])) for y in range(2016,2026)}
 (O/'hfa-reproduction.json').write_text(json.dumps(report,indent=2)+'\n');(O/'hfa-reproduction-rows.json').write_text(json.dumps(scope,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['counts_2016_2025','home_actual_margin_by_season','reference_deltas','status']},indent=2));print('control,hfa:',[(k,report['reproduction_2017_2025'][k]['games'],report['reproduction_2017_2025'][k]['mae'],report['reproduction_2017_2025'][k]['bias']) for k in ['control','hfa']])
if __name__=='__main__':run()
