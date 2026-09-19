"""Fixed fixture comparison against preserved historical reference implementations."""
import sys,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine import scoring
from engine.forecast_system.postprocess import empirical_crps
from engine.harvest import crps as old_pmf
OUT=ROOT/'work/harvest-scan/e-score-tooling'
def legacy_ensemble(x,y):
 x=sorted(x);n=len(x);return sum(abs(v-y) for v in x)/n-sum((2*i-n+1)*v for i,v in enumerate(x))/(n*n)
def run():
 rows=[]
 def add(metric,case,old,new):rows.append({'metric':metric,'fixture':case,'legacy':old,'library':new,'absolute_difference':abs(old-new)})
 ensembles=[([0],0),([7],14),([-7,0,7,14],31),([21,21,28,35],24),([1000,-1000,0],.5),([3,1,2,2],2.2)]
 for i,(x,y) in enumerate(ensembles):
  add('CRPS',str(i),legacy_ensemble(x,y),scoring.crps(x,y));add('CRPS postprocess',str(i),empirical_crps(x,y),scoring.crps(x,y))
 for i,(m,y) in enumerate([({0:.1,7:.2,21:.7},14),({-3:.5,3:.5},0),({7:1},7)]):add('CRPS weighted PMF',str(i),old_pmf(m,y),scoring.pmf_crps(m,y))
 for level in [.5,.8]:
  for y in [0,10,15,20,30]:add('Winkler',f'{level}:{y}',10+2/(1-level)*(max(10-y,0)+max(y-20,0)),scoring.interval_score(10,20,y,level))
 for p in [0,.2,.5,.9,1]:
  for y in [0,.5,1]:add('Brier',f'{p}:{y}',(p-y)**2,scoring.brier(p,y))
 for y in [-5,10,15,20,45]:
  x=[0,10,15,20,30];f=lambda z:min(z,10)+max(z-20,0);add('twCRPS both tails',str(y),legacy_ensemble([f(v) for v in x],f(y)),scoring.tail_crps(x,y,10,20))
 result={'package':'scoringrules==0.10.0','license':'Apache-2.0','backend':'numpy','estimator':'energy empirical distribution','tolerance':1e-6,'rows':rows,'above_tolerance':[r for r in rows if r['absolute_difference']>1e-6]}
 (OUT/'reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
 lines=['# E-SCORE tooling reconciliation','','No forecast changed. Tail CRPS is a new diagnostic, compared with an independent transformed-distribution reference. Frozen historical functions retained for exact archived replay.','','| Metric | Fixtures | Maximum absolute difference |','|---|---:|---:|']
 for m in dict.fromkeys(r['metric'] for r in rows):
  rr=[r for r in rows if r['metric']==m];lines.append(f"| {m} | {len(rr)} | {max(r['absolute_difference'] for r in rr):.12g} |")
 lines+=['',f"Discrepancies above 1e-6: {len(result['above_tolerance'])}."]
 (OUT/'RECONCILIATION.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))
 if result['above_tolerance']:raise RuntimeError('Reconciliation failed; no switch authorized')
 return result
if __name__=='__main__':run()
