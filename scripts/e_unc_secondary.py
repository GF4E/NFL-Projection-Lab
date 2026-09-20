"""Non-gated, fixed 2024-training/2025-testing wind comparison."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import sys,json,gzip
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.reference_reports import report_file
from collections import defaultdict
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.e_unc_evaluate import score,summarize
OUT=ROOT/'work/e-unc';E1=ROOT/'work/projection-governance-v2/e1-calendar-corrected'
def main():
 weather=json.loads((OUT/'qualified-wind.json').read_text());wind={r['game_id']:r for r in weather['rows'] if r['status']=='QUALIFIED_PREVIOUS_DAY1'}
 rows=json.loads((E1/'oof.json').read_text())['linear'];f=json.loads(gzip.decompress((E1/'features.json.gz').read_bytes()))['linear']
 pairs=defaultdict(dict)
 for r in rows:
  if r['season'] in (2024,2025) and r['game_id'] in wind:pairs[r['game_id']][r['home']]=r
 fits={r['season']:r for r in json.loads((OUT/'fits.json').read_text())}
 import csv
 ref=json.loads((ROOT/'work/projection-v2/phase-a/features-ref.json').read_text())['schedule_ref'];schedule={r['game_id']:r for r in csv.DictReader(open(ref['path']))}
 games=[]
 for gid,p in sorted(pairs.items()):
  h,a=p[True],p[False];prior=[r for r in f if r['season']==h['season'] and r['assimilation_available_at']<h['issuance_at']]
  x=np.array([1,h['week'],*[sum(r['team']==t for r in prior) for t in (h['team'],a['team'])],int(schedule[gid]['roof'] in ('closed','dome'))],float)
  games.append({'id':gid,'season':h['season'],'week':h['week'],'x':x,'wind':wind[gid]['effective_wind_mph'],'point':np.array([h['point'],a['point']]),'actual':np.array([h['actual'],a['actual']])})
 train=[g for g in games if g['season']==2024];test=[g for g in games if g['season']==2025]
 if len(train)<6 or not test:raise ValueError('Insufficient qualified secondary data')
 y=np.log(np.maximum([np.mean(abs(g['actual']-g['point'])) for g in train],1e-6))
 X=np.array([g['x'] for g in train]);Xw=np.array([np.r_[g['x'],g['wind']] for g in train])
 beta=np.linalg.lstsq(X,y,rcond=None)[0];betaw=np.linalg.lstsq(Xw,y,rcond=None)[0]
 z=np.array([(g['actual']-g['point'])/np.exp(g['x']@np.array(fits[2024]['coefficients'])) for g in train])
 records={n:[] for n in ['b_matched','b_plus_wind']}
 for g in test:
  for name,b,x in [('b_matched',beta,g['x']),('b_plus_wind',betaw,np.r_[g['x'],g['wind']])]:
   scale=float(np.exp(np.clip(x@b,-20,20)));h,a=g['point'];ah,aa=g['actual']
   samples=[h+z.flatten()*scale,a+z.flatten()*scale,h-a+(z[:,0]-z[:,1])*scale,h+a+(z[:,0]+z[:,1])*scale]
   for i,t in enumerate(['team','team','margin','total']):
    actual=[ah,aa,ah-aa,ah+aa][i];point=[h,a,h-a,h+a][i]
    r={'game_id':g['id'],'season':2025,'week':g['week'],'target':t,'side':i,'point':float(point),'actual':float(actual),**score(samples[i],actual)}
    if t=='margin':r.update(probability=float(np.mean(samples[i]>0)+.5*np.mean(samples[i]==0)),outcome=1 if actual>0 else .5 if actual==0 else 0)
    records[name].append(r)
 summary={n:summarize(r) for n,r in records.items()}
 report={'label':'SECONDARY PARTIAL_PERIOD — NOT GATED','status':'INSUFFICIENT','analysis_execution_status':'SCORED_2025_WITH_2024_TRAINING','interpretation':'One training season and one test season cannot overturn the 2,639-game bucket study. Insufficient evidence, not negative.','return_requires':'Qualified 2021–2023 forecast history','requested_years':[2021,2025],'year_coverage':{str(y):{'qualified_wind_games':sum(g['season']==y for g in games),'scored_games':len(test) if y==2025 else 0,'status':'SCORED' if y==2025 else 'WARMUP' if y==2024 else 'NO_DOCUMENTED_GFS_WIND_ARCHIVE'} for y in range(2021,2026)},'training_games':len(train),'scored_games':len(test),'point_invariance_max':0,'primary_gate_affected':False,'coefficients':{'b_matched':beta.tolist(),'b_plus_wind':betaw.tolist()},'games_per_parameter':{'b_matched':len(train)/5,'b_plus_wind':len(train)/6},'pooled':summary,'weekly':{n:{str(w):summarize([r for r in rr if r['week']==w]) for w in sorted({r['week'] for r in rr})} for n,rr in records.items()},'team_CRPS_relative_change':1-summary['b_plus_wind']['team']['crps']/summary['b_matched']['team']['crps']}
 (OUT/'secondary.json').write_text(json.dumps(report,indent=2)+'\n');(OUT/'secondary-games.json.gz').write_bytes(gzip.compress(json.dumps(records).encode(),mtime=0))
 lines=['# Secondary wind result — INSUFFICIENT, not gated','',f"INSUFFICIENT, not negative: one training season and one test season cannot overturn the 2,639-game bucket study. Return when 2021–2023 forecast history is qualified. Requested 2021–2025; qualified 2024 training ({len(train)} games), 2025 test ({len(test)} games). No documented GFS wind history for 2021–2023; these years are explicitly unscored. This is not a complete five-year result. Primary experiment and gate remain unchanged.",'',f"Team CRPS relative improvement: {report['team_CRPS_relative_change']:.4%}. No tuning or promotion.",'','|Candidate|Target|N|MAE|CRPS|50 hit/n|50 width|50 Winkler|80 hit/n|80 width|80 Winkler|','|---|---|---:|---:|---:|---|---:|---:|---|---:|---:|']
 for n,s in summary.items():
  for t in ('team','margin','total'):
   r=s[t];a,b=r['50'],r['80'];lines.append(f"|{n}|{t}|{r['n']}|{r['mae']:.6f}|{r['crps']:.6f}|{a['hits']}/{a['n']}|{a['width']:.4f}|{a['winkler']:.4f}|{b['hits']}/{b['n']}|{b['width']:.4f}|{b['winkler']:.4f}|")
  lines.append(f"\n{n} Brier: {s['winner']['brier']:.6f}\n")
 lines+=['','secondary.json contains all weekly scores, 50/80 counts, widths, CRPS, Winkler, midpoint PIT, spread-skill bins and ten-bin reliability. Six versus five fitted coefficients; identical training/test games and point forecasts. Fixed 24-hour-lead wind from Previous Runs, not reanalysis or stitched day-zero values.']
 report_file(OUT/'SECONDARY-REPORT.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps({k:report[k] for k in ['status','training_games','scored_games','team_CRPS_relative_change']}))
if __name__=='__main__':main()
