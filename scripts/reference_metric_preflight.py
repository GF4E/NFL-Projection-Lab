"""Reproduce supplied audit counts and qualify references; no model or reporting activation."""
import collections,csv,datetime as dt,gzip,hashlib,json,math,statistics,sys
from pathlib import Path
import numpy as np
from scipy.stats import binom
from scipy.optimize import brentq
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'work/reference-line-metric-v1'
SCHEDULE='work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv'
OLD='work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json'
def interval(w,n):
 if not n:return {'wins':0,'n':0,'rate':None,'wilson95':None,'wald95_reproduction':None}
 p=w/n;z=1.959963984540054;den=1+z*z/n;c=(p+z*z/(2*n))/den;d=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;se=math.sqrt(p*(1-p)/n)
 return {'wins':w,'n':n,'rate':p,'wilson95':[c-d,c+d],'wald95_reproduction':[p-z*se,p+z*se],'standard_error':se}
def score(rows,schedule):
 result={}
 for target in ['spread','total']:
  records=[];pushes=[];no_lean=[];missing=[]
  for r in rows:
   g=schedule.get(r['game_id'],{});raw=g.get('spread_line' if target=='spread' else 'total_line')
   if raw in ('',None):missing.append(r['game_id']);continue
   line=float(raw);projected=r['home']-r['away'] if target=='spread' else r['home']+r['away'];actual=r['actual_home']-r['actual_away'] if target=='spread' else r['actual_home']+r['actual_away'];d=projected-line;a=actual-line
   if a==0:pushes.append(r['game_id']);continue
   if d==0:no_lean.append(r['game_id']);continue
   records.append({'game_id':r['game_id'],'season':r['season'],'week':r['week'],'correct':d*a>0,'bucket':math.floor(abs(d)),'projection':projected,'line':line,'actual':actual})
  def group(rows):return interval(sum(x['correct'] for x in rows),len(rows))
  result[target]={'pooled':group(records),'pushes':pushes,'no_lean':no_lean,'missing_line':missing,'seasons':{str(y):group([r for r in records if r['season']==y]) for y in sorted({r['season'] for r in rows})},'buckets':{str(k):group([r for r in records if r['bucket']==k]) for k in sorted({r['bucket'] for r in records})},'records':records}
 return result

def power(n):
 out={}
 for name,p0 in [('directional_50pct',.5),('illustrative_minus110_break_even',110/210)]:
  lo=int(binom.ppf(.025,n,p0))
  while binom.cdf(lo,n,p0)>.025:lo-=1
  hi=int(binom.ppf(.975,n,p0))+1
  def pw(p):return float(binom.cdf(lo,n,p)+binom.sf(hi-1,n,p))
  p80=brentq(lambda p:pw(p)-.8,p0,.999)
  out[name]={'null_probability':p0,'n':n,'alpha':.05,'test':'equal-tailed two-sided exact binomial, independent games','rejection_counts':[lo,hi],'actual_size':pw(p0),'power_52_38pct':pw(110/210),'power_53pct':pw(.53),'power_55pct':pw(.55),'power_60pct':pw(.60),'minimum_rate_for_80pct_power':p80}
 # Noise-only illustrative engine: independent normal perturbations of each historical line.
 # Conditional expected hit rate is exactly 50%; the simulation is not empirical proof of that null.
 rng=np.random.default_rng(20260920);wins=int((rng.normal(size=1000000)*rng.normal(size=1000000)>0).sum())
 return {'independent_game_standard_error_at_50pct':math.sqrt(.25/n),'tests':out,'noise_only_simulation':{'games':1000000,'seed':20260920,'distribution':'line+independent N(0,1) projection noise and line+independent N(0,1) outcome residual','cover':interval(wins,1000000),'expected_rate':.5,'user_reported_49_9pct':'Not an exact reproduction target without original seed, sample size and noise model; preserved as user-supplied illustration.'}}

def render(out):
 def cell(v, method='wilson95'):
  if not v['n']:return '0 games; no estimate'
  lo,hi=v[method]
  return f"{v['wins']}/{v['n']} · {v['rate']*100:.2f}% [{lo*100:.2f}, {hi*100:.2f}]"
 lines=['# Reference-line audit: reproduction and reconciliation', '',
 'STATUS: PAUSED FOR LINEAGE RECONCILIATION. This report compares authoritative released-HFA 66a3a60c with superseded pre-HFA 6a0238fc. The supplied figures reproduce on the latter. Weekly and experiment-report rollout has not been activated because two current-HFA bucket differences exceed the requested 0.5-percentage-point tolerance.', '',
 '## Reproduction', '', '| CLOSE metric | Supplied | Pre-HFA reproduction | Current authoritative HFA |', '|---|---|---|---|']
 old=out['series']['pre_HFA'];new=out['series']['current_HFA']
 for label,target,bucket,expected in [('ATS','spread',None,'1302/2574; 50.58%; [48.7, 52.5]'),('Total','total',None,'1285/2618; 49.08%; [47.2, 51.0]'),('ATS [4,5)','spread','4','44.1%'),('ATS [5,6)','spread','5','56.6%; [48.7, 64.5]')]:
  a=old[target]['pooled'] if bucket is None else old[target]['buckets'][bucket]
  b=new[target]['pooled'] if bucket is None else new[target]['buckets'][bucket]
  lines.append(f'| {label} | {expected} | {cell(a,"wald95_reproduction")} | {cell(b,"wald95_reproduction")} |')
 lines += ['', 'The reproduction table uses the normal/Wald interval that reproduces the supplied 5-point interval. Full tables below use [Wilson 95% intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). No interval changes a gate. Buckets use floor of absolute full-precision disagreement. Actual pushes are excluded (65 spread, 21 total); there are no exact projection-on-line exclusions in either series.', '',
 '## OPEN source coverage', '', '| Season | Registered games | OPEN spread | OPEN total |', '|---|---:|---:|---:|']
 coverage=json.loads((O/'open-coverage-preflight.json').read_text())
 hs=next(v['coverage'] for k,v in coverage.items() if k.endswith('/historic_projected_spreads.csv'))
 ts=next(v['coverage'] for k,v in coverage.items() if k.endswith('/nfelo_games.csv'))
 for y,v in hs.items():
  n=v['population'];a=v['home_line_open']['available'];b=ts[y]['total_line_open']['available']
  lines.append(f'| {y} | {n} | {a}/{n} ({100*a/n:.1f}%)'+(' — MISSING' if not a else '')+f' | {b}/{n} ({100*b/n:.1f}%)'+(' — MISSING' if not b else '')+' |')
 lines += ['', 'OPEN spread: 1,177/1,359 games in 2021–2025 (86.6%), or 44.6% of the full ten-season population. OPEN total: 466/1,359 (34.3%), or 17.7% of all games; available only in 2024–2025. These are coverage counts before pushes, not accuracy denominators.', '',
 'Source qualification only: opening-reference performance is not advanced past the reproduction stop. Proposed spread source is nfelo output_data/historic_projected_spreads.csv, consistent with the existing repository reference. Totals use only nfelo_games.csv total_line_open. No CLOSE fallback. The two files disagree on 330 overlapping opening spreads; both snapshots and the complete conflict list are pinned. Seven duplicate game IDs in the historic file agree on their opening spread and are deduplicated by game. Source URLs, timestamps and hashes are in open-source-receipts.json.', '',
 'Against nflverse CLOSE, this OPEN spread snapshot moves 1.1181 points on average; 48.51% move at least one point. The supplied 1.17 mean is not exactly reproduced. Opening references do not establish the number available at our T-75 or a realizable betting price.', '',
 '## Power and interpretation', '',
 'At n=2,574, the independent-game standard error under 50% is 0.9855 percentage points. A two-sided, 5% equal-tailed exact binomial test of 50% has 66.49% power at a true 52.38%, 85.43% at 53%, and 99.90% at 55%; 80% power begins at 52.790%. A separate test against illustrative -110 break-even (52.381%) has 75.23% power at a true 55%, and needs 55.157% for 80% power. Those prices are illustrative, not observed execution.', '',
 'No examined season or disagreement bucket has a Wilson lower bound above 52.38%. Some have lower bounds above 50%; directional chance and priced break-even are distinct. The pooled interval includes both 50% and 52.38%. This is no demonstrated edge, not proof of no edge, and does not justify excluding every possible subset or a small economic advantage. Independent-game assumptions and unadjusted subset intervals are descriptive; dependence would weaken the effective power.', '',
 'Independent illustration: 1,000,000 simulated forecasts and outcomes with independent centered normal deviations from the same line, seed 20260920, cover 49.9701%. Expected coverage is exactly 50%. The user’s 49.9% illustration is preserved as user-reported; its exact seed/sample/noise model was not supplied. Neither simulation estimates the actual engine’s latent skill.', '']
 for name,path in [('current_HFA',out['authoritative']),('pre_HFA',out['legacy'])]:
  rows=json.loads((ROOT/path).read_text());mae=sum(abs(r['home']-r['actual_home'])+abs(r['away']-r['actual_away']) for r in rows)/(2*len(rows))
  lines += [f'## {name}: team MAE {mae:.6f}', '', f'Series: `{path}`. SHA256: `{out["source_sha256"][path]}`.', '']
  for target in ['spread','total']:
   m=out['series'][name][target]
   lines += [f'### CLOSE {target}', '', f'Pooled: {cell(m["pooled"])}.', '', '| Season | Correct / scored · rate [95% interval] |','|---|---|']
   lines += [f'| {k} | {cell(v)} |' for k,v in m['seasons'].items()]
   lines += ['', '| Disagreement in points | Correct / scored · rate [95% interval] |','|---|---|']
   lines += [f'| [{k}, {int(k)+1}) | {cell(v)} |' for k,v in m['buckets'].items()]
   lines += ['']
 lines += ['## Status and verification', '',
 'Recompute: `/opt/anaconda3/bin/python3.12 -B scripts/reference_metric_preflight.py`. Row-level scoring, source hashes, both interval methods and power assumptions are in reproduction.json. Source qualification receipts and coverage are adjacent. Forecast/model files were not edited; this reporting-only preflight is not imported by production. Requested weekly and every-experiment integration remains pending lineage reconciliation.', '',
 'Least sure of: which nfelo output file represents the intended opening spread. This changed the plan: preserve the existing reference source, pin both snapshots, report the disagreement, and make no claim that OPEN equals our executable issuance line.', '',
 'Confidence: near-total — the central claim that supplied counts belong to pre-HFA rather than released HFA is arithmetic on verified rows. Move down to high if an independent recomputation invalidates a source hash or the line-sign convention. The interpretation of economic edge remains limited by the explicitly stated power and price assumptions.']
 (O/'REPORT.md').write_text('\n'.join(lines)+'\n')

def run():
 catalog=json.loads((ROOT/'work/series-registry/catalog.json').read_text());current=catalog['authoritative_control'];entry=next(x for x in catalog['series'] if x['path']==current and x['authoritative']);assert hashlib.sha256((ROOT/current).read_bytes()).hexdigest()==entry['sha256'];schedule={r['game_id']:r for r in csv.DictReader((ROOT/SCHEDULE).open())};out={'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),'authoritative':current,'legacy':OLD,'series':{},'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in [current,OLD,SCHEDULE]}}
 for label,path in [('current_HFA',current),('pre_HFA',OLD)]:out['series'][label]=score(json.loads((ROOT/path).read_text()),schedule)
 out['reproduction_status']='PAUSED_FOR_LINEAGE_RECONCILIATION';out['power']=power(2574);out['requested_wording_verbatim']='across ten seasons and 2,574 games the deployed engine shows no demonstrated edge against the closing number in any season or subset. With a standard error of 0.99 percentage points, a true break-even model is not excluded by this evidence; what is excluded is a large edge. A simulated unbiased engine that is a noisy copy of the line covers 49.9 percent, and the measured 50.58 is consistent with that.';out['wording_scope']='User-specified finding belongs to pre-HFA6a0238fc. Any season or subset refers to the tested seasons and one-point disagreement buckets, not every possible subset. No claim of proof of no edge; 49.9simulation is user-reported.'
 (O/'reproduction.json').write_text(json.dumps(out,indent=2)+'\n');render(out);print(json.dumps({'pooled':{k:{t:v[t]['pooled'] for t in ['spread','total']} for k,v in out['series'].items()},'power':out['power']},indent=2))
if __name__=='__main__':run()
