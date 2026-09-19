"""Existing-series diagnostics only; no fitting or production-series claim."""
import json,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def stats(rows):
 p=[r['point'] for r in rows];y=[r['actual'] for r in rows];pm=statistics.mean(p);ym=statistics.mean(y)
 return {'games':len(rows)//2,'team_mae':statistics.mean(abs(a-b) for a,b in zip(p,y)),'bias_projected_minus_actual':pm-ym,'projected_sd':statistics.pstdev(p),'actual_on_projected_slope':sum((a-pm)*(b-ym) for a,b in zip(p,y))/sum((a-pm)**2 for a in p)}
b=json.loads(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).read_text());baseline=[{'season':r['season'],'point':r[s],'actual':r['actual_'+s]} for r in b for s in ('home','away')]
replay=json.loads((ROOT/'work/projection-governance-v2/e1-calendar-corrected/oof.json').read_text())['linear'];replay=[r for r in replay if 2016<=r['season']<=2025]
result={name:{str(year):stats([r for r in rows if year=='pooled' or r['season']==year]) for year in [*range(2016,2026),'pooled']} for name,rows in [('v3_baseline',baseline),('REPLAY',replay)]}
(ROOT/'work/projection-v2w/existing-series-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
lines=['# Existing-series comparison only','', 'Bias = projected minus actual. SD is population SD across both teams. No deployed-lineage series generated.','', '| Season | Baseline bias | Baseline slope | REPLAY bias | REPLAY slope |','|---|---:|---:|---:|---:|']
for y in result['v3_baseline']:
 a=result['v3_baseline'][y];b=result['REPLAY'][y];lines.append(f"| {y} | {a['bias_projected_minus_actual']:.3f} | {a['actual_on_projected_slope']:.3f} | {b['bias_projected_minus_actual']:.3f} | {b['actual_on_projected_slope']:.3f} |")
(ROOT/'work/projection-v2w/existing-series-comparison.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))
