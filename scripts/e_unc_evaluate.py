"""Registered E-UNC replay; immutable centers, chronological scale fits."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import csv,gzip,hashlib,json,sys,time,signal
from pathlib import Path
from collections import defaultdict
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection_v3.model import predict
OUT=ROOT/'work/e-unc';E1=ROOT/'work/projection-governance-v2/e1-calendar-corrected'
NAMES=['control','a_joint','b_hetero','c_joint_hetero']
def save(name,x): (OUT/name).write_text(json.dumps(x,indent=2,allow_nan=False)+'\n')
def score(x,y):
 x=np.sort(np.asarray(x));n=len(x)
 out={'crps':float(np.mean(abs(x-y))-np.sum((2*np.arange(n)-n+1)*x)/n**2),'spread':float(np.std(x)),'pit':float(np.mean(x<y)+.5*np.mean(x==y))}
 for level in (50,80):
  alpha=1-level/100;lo,hi=x[np.clip(np.ceil(np.array([alpha/2,1-alpha/2])*n-1e-12).astype(int)-1,0,n-1)]
  out[str(level)]={'lower':float(lo),'upper':float(hi),'width':float(hi-lo),'covered':bool(lo<=y<=hi),'winkler':float(hi-lo+2/alpha*(max(lo-y,0)+max(y-hi,0)))}
 return out
def summarize(rows):
 out={}
 for t in ['team','margin','total']:
  rr=[r for r in rows if r['target']==t]
  out[t]={'n':len(rr),'mae':float(np.mean([abs(r['point']-r['actual']) for r in rr])),'crps':float(np.mean([r['crps'] for r in rr])),'pit':np.histogram([r['pit'] for r in rr],bins=np.linspace(0,1,11))[0].tolist()}
  for l in ['50','80']:
   out[t][l]={'hits':sum(r[l]['covered'] for r in rr),'n':len(rr),'coverage':float(np.mean([r[l]['covered'] for r in rr])),'width':float(np.mean([r[l]['width'] for r in rr])),'winkler':float(np.mean([r[l]['winkler'] for r in rr]))}
  splits=np.array_split(sorted(rr,key=lambda r:r['spread']),10)
  out[t]['spread_skill']=[{'n':len(b),'spread':float(np.mean([r['spread'] for r in b])),'absolute_error':float(np.mean([abs(r['actual']-r['point']) for r in b]))} for b in splits if len(b)]
  out[t]['projected_sd']=float(np.std([r['point'] for r in rr]));out[t]['actual_sd']=float(np.std([r['actual'] for r in rr]))
 rr=[r for r in rows if r['target']=='margin']
 out['winner']={'brier':float(np.mean([(r['probability']-r['outcome'])**2 for r in rr])),'reliability':[]}
 for i in range(10):
  b=[r for r in rr if min(9,int(r['probability']*10))==i]
  out['winner']['reliability'].append({'bin':i,'n':len(b),'forecast':float(np.mean([r['probability'] for r in b])) if b else None,'observed':float(np.mean([r['outcome'] for r in b])) if b else None})
 return out
def run():
 started=time.monotonic();signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(TimeoutError('45 minute budget')));signal.alarm(2700)
 reg=json.loads((OUT/'registration.json').read_text());assert hashlib.sha256((OUT/'registration.json').read_bytes()).hexdigest()==(OUT/'registration.sha256').read_text().strip()
 for p,h in reg['files'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
 oof=json.loads((E1/'oof.json').read_text())['linear']
 features=json.loads(gzip.decompress((E1/'features.json.gz').read_bytes()))['linear']
 fby={r['row_id']:r for r in features}
 sref=json.loads((ROOT/'work/projection-v2/phase-a/features-ref.json').read_text())['schedule_ref']
 raw=Path(sref['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==sref['sha256']
 schedule={r['game_id']:r for r in csv.DictReader(raw.decode().splitlines())}
 paired=defaultdict(dict)
 for r in oof:paired[r['game_id']][r['home']]=r
 games=[]
 for gid,p in sorted(paired.items()):
  h,a=p[True],p[False];roof=schedule[gid]['roof'];assert roof in ('dome','closed','open','outdoors')
  prior=[r for r in features if r['season']==h['season'] and r['assimilation_available_at']<h['issuance_at']]
  counts=[sum(r['team']==t for r in prior) for t in [h['team'],a['team']]]
  games.append({'id':gid,'season':h['season'],'week':h['week'],'point':np.array([h['point'],a['point']]),'actual':np.array([h['actual'],a['actual']]),'x':np.array([1,h['week'],*counts,int(roof in ('dome','closed'))],float),'rows':[h,a]})
 records={n:[] for n in NAMES};fits=[];standardized={};variances=[];maxdiff=0
 for year in range(2013,2026):
  prior=[g for g in games if g['season']<year];test=[g for g in games if g['season']==year]
  beta=np.linalg.lstsq(np.array([g['x'] for g in prior]),np.log(np.maximum([np.mean(abs(g['actual']-g['point'])) for g in prior],1e-6)),rcond=None)[0] if prior else np.zeros(5)
  scales={g['id']:float(np.exp(np.clip(g['x']@beta,-20,20))) if prior else 1. for g in test}
  fits.append({'season':year,'trained_through':year-1,'coefficients':beta.tolist(),'parameters':5 if prior else 0,'training_games':len(prior),'games_per_parameter':len(prior)/5 if prior else None,'scale_min':min(scales.values()),'scale_max':max(scales.values())})
  if year>=2016:
   residual=np.array([g['actual']-g['point'] for g in prior]);z=np.array([standardized[g['id']] for g in prior]);rho=float(np.corrcoef(residual.T)[0,1])
   fit=json.loads((E1/f'core-linear-{year}.json').read_text())
   train=[r for r in features if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None]
   def design(r):return np.array([1,*[(r['features'][k]-m)/s if r['features'][k] is not None else 0 for k,m,s in zip(fit['names'],fit['means'],fit['scales'])]])
   X=np.array([design(r) for r in train]);err=np.array([r['actual_points']-predict(fit,r['features'])['points'] for r in train])
   penalty=np.diag([0]+[fit['penalty']]*len(fit['names']));bread=np.linalg.pinv(X.T@X+penalty);clusters=defaultdict(lambda:np.zeros(X.shape[1]))
   for r,x,e in zip(train,X,err):clusters[r['game_id']]+=x*e
   meat=sum(np.outer(v,v) for v in clusters.values());cov=bread@meat@bread
   vpar=float(np.mean([design(fby[r['row_id']])@cov@design(fby[r['row_id']]) for g in test for r in g['rows']]));vres=float(np.var(err,ddof=X.shape[1]))
   variances.append({'season':year,'games':len(test),'rho_training':rho,'parameter_variance':vpar,'conditional_noise_and_discrepancy_variance':vres,'predictive_variance':vpar+vres,'parameter_fraction':vpar/(vpar+vres),'ratio':vpar/vres,'physical_irreducible_variance':'NOT_IDENTIFIABLE; residual estimate includes model discrepancy'})
   rounded=lambda a:np.sign(a)*np.floor(abs(a)+.5)
   for g in test:
    points=g['point'];actual=g['actual'];scale=scales[g['id']]
    for name in NAMES:
     seed=int(hashlib.sha256((g['id']+'|E-UNC|'+name).encode()).hexdigest()[:16],16);rng=np.random.default_rng(seed)
     if name in ('a_joint','c_joint_hetero'):
      base=residual if name=='a_joint' else z*scale
      pair=points+base[rng.integers(len(base),size=500)]
      samples=[pair[:,0],pair[:,1],pair[:,0]-pair[:,1],pair[:,0]+pair[:,1]]
     elif name=='b_hetero':
      samples=[points[0]+z.flatten()*scale,points[1]+z.flatten()*scale,points[0]-points[1]+(z[:,0]-z[:,1])*scale,points.sum()+(z[:,0]+z[:,1])*scale]
     else:
      samples=[rounded(points[0])+rounded(residual.flatten()),rounded(points[1])+rounded(residual.flatten()),rounded(points[0]-points[1])+rounded(residual[:,0]-residual[:,1]),rounded(points.sum())+rounded(residual[:,0]+residual[:,1])]
     point_values=[points[0],points[1],points[0]-points[1],points.sum()]
     expected=[g['point'][0],g['point'][1],g['point'][0]-g['point'][1],g['point'].sum()]
     delta=float(np.max(abs(np.array(point_values)-expected)));maxdiff=max(maxdiff,delta)
     assert delta<=reg['point_tolerance'],'OUT_OF_SCOPE point movement'
     for j,target in enumerate(['team','team','margin','total']):
      y=[actual[0],actual[1],actual[0]-actual[1],actual.sum()][j]
      row={'game_id':g['id'],'season':year,'week':g['week'],'target':target,'side':j,'point':float(point_values[j]),'actual':float(y),**score(samples[j],y)}
      if target=='margin':row.update(probability=float(np.mean(samples[j]>0)+.5*np.mean(samples[j]==0)),outcome=1 if y>0 else .5 if y==0 else 0)
      records[name].append(row)
   print('E-UNC completed',year,flush=True)
  for g in test:standardized[g['id']]=(g['actual']-g['point'])/scales[g['id']]
 pooled={n:summarize(r) for n,r in records.items()}
 annual={n:{str(y):summarize([r for r in rr if r['season']==y]) for y in range(2016,2026)} for n,rr in records.items()}
 weekly={n:{f'{y}-{w}':summarize([r for r in rr if r['season']==y and r['week']==w]) for y,w in sorted({(r['season'],r['week']) for r in rr})} for n,rr in records.items()}
 gate={}
 for name in NAMES[1:]:
  gain=1-pooled[name]['team']['crps']/pooled['control']['team']['crps']
  cover=all(abs(pooled[name][t][l]['coverage']-int(l)/100)<=.03 for t in ['margin','total'] for l in ['50','80'])
  wink=all(pooled[name][t][l]['winkler']<=pooled['control'][t][l]['winkler']+1e-12 for t in ['team','margin','total'] for l in ['50','80'])
  gate[name]={'CRPS_improvement':gain,'coverage_pass':cover,'winkler_pass':wink,'point_invariance_pass':maxdiff<=1e-12,'pass':bool(gain>=.01 and cover and wink)}
 save('scores.json',{'pooled':pooled,'annual':annual,'weekly':weekly});save('fits.json',fits);save('variance.json',variances)
 (OUT/'scored-games.json.gz').write_bytes(gzip.compress(json.dumps(records,separators=(',',':')).encode(),mtime=0))
 save('gate.json',{'primary':'mean team-points CRPS','gate':gate,'decision':'REVIEW_REQUIRED' if any(v['pass'] for v in gate.values()) else 'RETAIN_CONTROL','max_point_difference':maxdiff,'games':len({r['game_id'] for r in records['control']}),'elapsed_seconds':time.monotonic()-started,'peak_memory_unit':'one worker; arrays under 4 GiB'})
 print(json.dumps(gate))
if __name__=='__main__':run()
