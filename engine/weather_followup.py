"""Offline, immutable seasonal and multiplicity follow-up; no provider calls."""
import argparse,json
from pathlib import Path
from collections import defaultdict
import numpy as np
from engine.harvest import read,digest
from engine.qb_history import put,encoded
B=Path('work/harvest-weather-followup-v1')
def in_bucket(wind):return 10<=float(wind)<15

def record(rows):
 residual=[float(r['actual_total'])-float(r['market_total']) for r in rows]
 w=sum(x<0 for x in residual);l=sum(x>0 for x in residual);p=sum(x==0 for x in residual)
 return dict(n=len(rows),under_w=w,under_l=l,push=p,under_rate=w/(w+l) if w+l else None)

def interval(rows,reps=100000,alpha=.05/4):
 rng=np.random.default_rng(20260908);counts=np.zeros((reps,2));groups=defaultdict(list)
 for r in rows:groups[int(r['season'])].append(r)
 for year,rs in sorted(groups.items()):
  weeks=sorted({int(r['week']) for r in rs});sums=np.zeros((len(weeks),2))
  for r in rs:
   if not in_bucket(r['wind_mph']):continue
   d=float(r['actual_total'])-float(r['market_total'])
   if d: sums[weeks.index(int(r['week'])),int(d>0)]+=1
  sample=rng.integers(0,len(weeks),size=(reps,len(weeks)));counts+=sums[sample].sum(axis=1)
 den=counts.sum(axis=1);rates=np.divide(counts[:,0],den,out=np.full(reps,np.nan),where=den>0)
 return np.nanquantile(rates,[alpha/2,1-alpha/2]).tolist()

def run(output):
 protocol=json.loads((B/'protocol.json').read_text())
 for path,sha in protocol['inputs'].items():
  if digest(Path(path))!=sha:raise ValueError('Pinned input changed')
 m=json.loads(Path('work/harvest-weather-v1/weather-manifest.json').read_text());assert digest(Path(m['table']))==m['sha256']
 old=json.loads(Path('work/harvest-weather-v1/protocol.json').read_text());assert digest(Path(old['schedule']))==old['schedule_sha256'];games={r['game_id']:r for r in read(old['schedule'])}
 observed=[]
 for r in read(m['table']):
  if int(r['season'])<2016 or r['dome']=='1':continue
  g=games[r['game_id']];observed.append(dict(r,actual_total=float(g['home_score'])+float(g['away_score']),market_total=g['total_line']))
 seasonal=[dict(season=y,**record([r for r in observed if int(r['season'])==y and in_bucket(r['wind_mph'])])) for y in range(2016,2026)]
 fm=json.loads((B/'forecast-manifest.json').read_text());assert digest(Path(fm['table']))==fm['sha256'];forecast=read(fm['table']);available=[r for r in forecast if r['wind_mph']!='']
 proxy=[dict(season=y,**record([r for r in available if (y=='ALL' or int(r['season'])==y) and in_bucket(r['wind_mph'])])) for y in ['ALL',2022,2023,2024,2025]]
 subset=record([r for r in observed if int(r['season'])>=2022 and in_bucket(r['wind_mph'])])
 result=dict(experiment_id='harvest-weather-followup-v1',protocol_sha256=digest(B/'protocol.json'),code_sha256=digest(Path(__file__)),seasonal=seasonal,seasons_above_524=sum(r['under_rate']>.524 for r in seasonal),observed_all=record([r for r in observed if in_bucket(r['wind_mph'])]),bonferroni_interval=interval(observed),family_size=4,individual_confidence=.9875,forecast_diagnostic=proxy,forecast_missing=fm['missing'],observed_2022_2025=subset,forecast_t60=dict(status='UNAVAILABLE_ISSUANCE_HISTORY',paired_n=0,under_rate=None,conclusion='Cannot determine whether rate holds using closest publicly available T60 issuance. Stitched forecast diagnostic does not pass chronology qualification.'),evidence='POST_HOC_FOUR_WIND_BUCKET_FAMILY_ONLY; does not correct all earlier weather exploration',forecast_sha256=fm['sha256'],credits_spent=0)
 out=Path(output);put(out/'seasonal.csv',encoded(seasonal));put(out/'forecast-diagnostic.csv',encoded(proxy));put(out/'experiment.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode());return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(run(a.output),indent=2))
