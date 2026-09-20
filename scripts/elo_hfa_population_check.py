"""Reconcile the supplied audit population; never a replacement gate control."""
import csv,gzip,json,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));import engine.elo as em
from scripts.elo_hfa_reproduce import summarize
O=ROOT/'work/e-elo-qb-hfa-v1'
def run():
 ref=json.loads((O/'fresh-schedule-ref.json').read_text());allgames=[g for g in csv.DictReader(gzip.open(ROOT/ref['compressed_path'],'rt')) if g['home_score'] and g['away_score']];allgames.sort(key=lambda g:(g['gameday'],g['gametime'],g['game_id']));results=[]
 # Population definitions from the arithmetic mismatch, not an accuracy search.
 for warmup in [1999,2015]:
  games=[g for g in allgames if int(g['season'])>=warmup];models=[em.Elo({}),em.Elo({})];rows=[];means={}
  for g in games:
   year=int(g['season']);h,a=g['home_team'],g['away_team'];hs,aws=float(g['home_score']),float(g['away_score'])
   if year not in means:
    hist=[r for r in games if year-3<=int(r['season'])<year];means[year]=float(np.mean([float(r['home_score'])-float(r['away_score']) for r in hist]))*25 if hist else 65.
   r={'game_id':g['game_id'],'season':year,'actual':hs-aws,'outcome':1 if hs>aws else 0 if hs<aws else .5}
   for key,m in zip(['control','hfa'],models):
    em.HFA=65. if key=='control' else means[year];m.prepare(h,year);m.prepare(a,year);f=m.forecast(h,a,g['location']=='Neutral',0.,0.);r[key]=f['margin_location'];r[key+'_p']=f['home_win_probability'];m.update(h,a,hs,aws,f)
   rows.append(r)
  pop=[r for r in rows if r['season']>=2018];era=[r for r in rows if r['season']>=2016]
  results.append({'warmup_start':warmup,'all_types_2016_and_later_n':len(era),'all_types_2018_and_later_n':len(pop),'season_counts':{str(y):sum(r['season']==y for r in pop) for y in sorted({r['season'] for r in pop})},'reproduction':{k:summarize(pop,k) for k in ['control','hfa']},'own_margin_2016_and_later':{k:summarize(era,k) for k in ['control','hfa']},'rows':rows})
 em.HFA=65.;(O/'hfa-population-reconciliation.json').write_text(json.dumps(results,indent=2)+'\n');print([(r['warmup_start'],r['all_types_2016_and_later_n'],r['all_types_2018_and_later_n'],[(k,r['reproduction'][k]['mae'],r['reproduction'][k]['bias']) for k in ['control','hfa']]) for r in results])
if __name__=='__main__':run()
