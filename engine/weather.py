"""Offline weather totals research. Inputs are hash-pinned retrospective observations."""
import argparse,json,math
from collections import Counter,defaultdict
from pathlib import Path
import numpy as np
from scipy.stats import t
from engine.harvest import read,digest,crps
from engine.harvest_comparison import shift
from engine.market_distribution import integer
from engine.qb_history import put,encoded
BASE=Path('work/harvest-weather-v1')
FEATURES=('intercept','market_total','wind','precip','dome')
def exposure(row):
 dome=int(row['dome'])
 if dome:return 0.,0.,1.
 if row['wind_mph']=='' or row['precip_mm']=='':raise ValueError('Missing outdoor observation')
 return float(row['wind_mph']),float(row['precip_mm']),0.
def design(rows):
 return np.array([[1.,float(r['market_total']),*exposure(r)] for r in rows])
def fit(rows):
 X=design(rows);y=np.array([float(r['total']) for r in rows]);n,k=X.shape
 if np.linalg.matrix_rank(X)!=k:raise ValueError('Rank deficient weather regression')
 beta=np.linalg.lstsq(X,y,rcond=None)[0];residual=y-X@beta;groups=defaultdict(list)
 for i,r in enumerate(rows):groups[(int(r['season']),int(r['week']))].append(i)
 g=len(groups)
 if g<2 or n<=k:raise ValueError('Insufficient training clusters')
 meat=np.zeros((k,k))
 for idx in groups.values():
  score=X[idx].T@residual[idx];meat+=np.outer(score,score)
 bread=np.linalg.inv(X.T@X);cov=bread@meat@bread*g/(g-1)*(n-1)/(n-k)
 se=np.sqrt(np.maximum(0,np.diag(cov)));width=t.ppf(.975,g-1)*se
 return beta,[dict(feature=name,coefficient=float(b),lower95=float(b-w),upper95=float(b+w),se=float(s),training_n=n,week_clusters=g) for name,b,w,s in zip(FEATURES,beta,width,se)]
def wind_bucket(x):return '<10' if x<10 else '10–<15' if x<15 else '15–20' if x<=20 else '>20'
def study(rows,kind,reps=5000):
 labels={'wind':['<10','10–<15','15–20','>20'],'precip':['dry','wet'],'dome':['outdoor','indoor']}[kind]
 groups=defaultdict(list)
 for r in rows:
  if kind!='dome' and int(r['dome']):continue
  label=wind_bucket(float(r['wind_mph'])) if kind=='wind' else ('wet' if float(r['precip_mm'])>0 else 'dry') if kind=='precip' else ('indoor' if int(r['dome']) else 'outdoor')
  groups[int(r['season'])].append((r,label))
 obs=np.zeros((len(labels),5));boot=np.zeros((reps,len(labels),2));rng=np.random.default_rng(20260908)
 for year,rs in sorted(groups.items()):
  weeks=sorted({int(r['week']) for r,l in rs});sums=np.zeros((len(weeks),len(labels),5))
  for r,l in rs:
   d=float(r['total'])-float(r['market_total']);v=sums[weeks.index(int(r['week'])),labels.index(l)];v[0]+=1;v[1 if d<0 else 2 if d>0 else 3]+=1;v[4]+=d
  obs+=sums.sum(axis=0);sample=rng.integers(0,len(weeks),size=(reps,len(weeks)));boot+=sums[sample][:,:,:,1:3].sum(axis=1)
 out=[]
 for i,label in enumerate(labels):
  n,w,l,p,res=obs[i];den=boot[:,i,0]+boot[:,i,1];rates=np.divide(boot[:,i,0],den,out=np.full(reps,np.nan),where=den>0);ci=np.nanquantile(rates,[.025,.975]) if n else [None,None]
  out.append(dict(group=kind,bucket=label,n=int(n),under_w=int(w),under_l=int(l),push=int(p),mean_total_residual=res/n if n else None,under_rate=w/(w+l) if w+l else None,lower95=float(ci[0]) if n else None,upper95=float(ci[1]) if n else None))
 return out

def run(output):
 protocol=json.loads((BASE/'protocol.json').read_text());manifest=json.loads((BASE/'weather-manifest.json').read_text())
 if digest(Path(protocol['schedule']))!=protocol['schedule_sha256'] or digest(Path(manifest['table']))!=manifest['sha256']:raise ValueError('Input hash changed')
 if digest(BASE/'protocol.json')!=manifest['protocol_sha256']:raise ValueError('Protocol changed')
 schedule={r['game_id']:r for r in read(protocol['schedule'])};rows=[]
 for w in read(manifest['table']):
  g=schedule[w['game_id']];rows.append({**w,'market_total':float(g['total_line']),'total':float(g['home_score'])+float(g['away_score'])})
 evaluation=[r for r in rows if int(r['season'])>=2016]
 if len(evaluation)!=2639 or len({r['game_id'] for r in evaluation})!=2639:raise ValueError('Evaluation population changed')
 coefficients=[];models={}
 for year in range(2016,2026):
  train=[r for r in rows if int(r['season'])<year];beta,coefs=fit(train);models[year]=beta
  coefficients.extend(dict(evaluation_season=year,training_max_season=max(int(r['season']) for r in train),**c) for c in coefs)
 stable={}
 for name in ('wind','precip','dome'):
  cs=[r['coefficient'] for r in coefficients if r['feature']==name];positive=sum(c>0 for c in cs);negative=sum(c<0 for c in cs)
  stable[name]=dict(positive=positive,negative=negative,qualifies=max(positive,negative)>=8)
 enabled=any(v['qualifies'] for v in stable.values());losses=[]
 if enabled:
  saved={r['game_id']:r for r in read('work/harvest-elo-v2/run-2/paired-losses.csv')}
  for year in range(2016,2026):
   train=[r for r in rows if int(r['season'])<year];shape=Counter(integer(r['total']-r['market_total']) for r in train)
   test=[r for r in evaluation if int(r['season'])==year];predictions=design(test)@models[year]
   for r,location in zip(test,predictions):
    market=crps(shift(shape,r['market_total'],True),r['total']);candidate=crps(shift(shape,float(location),True),r['total'])
    if abs(market-float(saved[r['game_id']]['market_total_crps']))>1e-9:raise ValueError('Baseline replay mismatch')
    losses.append(dict(game_id=r['game_id'],season=year,week=r['week'],market_total=r['market_total'],weather_total=float(location),actual_total=r['total'],market_crps=market,weather_crps=candidate,margin_crps=float(saved[r['game_id']]['market_margin_crps'])))
 comparisons=[]
 for year in ['ALL']+list(range(2016,2026)):
  subset=[r for r in losses if year=='ALL' or r['season']==year]
  if subset:comparisons.append(dict(season=year,paired_n=len(subset),market_crps=float(np.mean([r['market_crps'] for r in subset])),weather_crps=float(np.mean([r['weather_crps'] for r in subset]))))
 buckets=sum([study(evaluation,kind) for kind in ('wind','precip','dome')],[])
 result=dict(experiment_id='harvest-weather-v1',input_manifest_sha256=digest(BASE/'weather-manifest.json'),protocol_sha256=digest(BASE/'protocol.json'),code_sha256=digest(Path(__file__)),saved_baseline_sha256=digest(Path('work/harvest-elo-v2/run-2/paired-losses.csv')),buckets=buckets,coefficients=coefficients,stability=stable,candidate_built=enabled,comparisons=comparisons,promotion=False,total_not_worse=bool(comparisons and comparisons[0]['weather_crps']<=comparisons[0]['market_crps']),promotion_reason='Margin unchanged: strict margin improvement gate fails. Historical observed weather and historical lines are not as-issued T60 evidence.',margin_delta=0.,credits_spent=0,evidence='RECONSTRUCTED_ERA5_KICKOFF_WEATHER_NOT_AS_ISSUED_T60',selection_caveat='Conditional study selection uses full coefficient trajectory; overlapping expanding fits are not ten independent replications.')
 output=Path(output)
 for name,data in [('buckets',buckets),('coefficients',coefficients),('paired-losses',losses),('comparisons',comparisons)]:
  if data:put(output/f'{name}.csv',encoded(data))
 put(output/'experiment.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode());return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);a=parser.parse_args();r=run(a.output);print(json.dumps({k:r[k] for k in ('stability','comparisons','buckets','promotion_reason')},indent=2))
