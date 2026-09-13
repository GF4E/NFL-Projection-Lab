"""Render the qualified experiment and chronological interval evidence."""
import json,math,statistics,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection_v3.qualify import read,save

def main():
 work=ROOT/'work/projection-v3';record=read(json.loads((work/'record-ref.json').read_text()));pred=read(record['oof']);decisions=read(record['qualification']);annual=[]
 for row in record['annual']:
  pp=[r for r in pred if r['season']==row['season']];errors={'team_points':[],'margin':[],'total':[]}
  for r in pp:
   he=r['actual_home']-r['home'];ae=r['actual_away']-r['away'];errors['team_points'] += [he,ae];errors['margin'].append(he-ae);errors['total'].append(he+ae)
  annual.append({**row,'residual_sigma':{k:statistics.stdev(v) for k,v in errors.items()}})
 audit={'experiment':record['experiment'],'record':json.loads((work/'record-ref.json').read_text()),'annual':annual};save('reported-metrics',audit)
 text=['# Projection v3 qualification',f"\nExperiment: `{record['experiment']}`. [Immutable experiment]({Path(audit['record']['path']).name}). Zero Odds API credits.",'\n## Decision',f"Adaptive release check: **{'PASS' if record['release_pass'] else 'FAIL; raw football baseline released'}**. Retained optional groups: **{', '.join(record['released_groups']) or 'none'}**.",'\nFeature admission is a registered development rule, not a multiplicity-adjusted statistical superiority claim. These historical games were available during earlier v1 work; no untouched holdout is claimed.','\n## Paired comparison','\n| Target | Raw football baseline MAE | Adaptive v3 MAE | Improvement |','|---|---:|---:|---:|']
 r=record['release_gate']
 for k in ['team_points','margin','total']:text.append(f"| {k} | {r['control_mae'][k]:.4f} | {r['candidate_mae'][k]:.4f} | {r['mae_improvement'][k]:+.4f} |")
 ci=r['team_improvement_interval'];text+= [f"\nPaired games: {r['paired_n']}. Team-MAE improvement 95% week-block interval: [{ci['lower95']:.4f}, {ci['upper95']:.4f}] points. One-sided 95% lower bound: {ci['one_sided95_lower']:.4f}.",'\n## Per-season forecasts and prior-error intervals','\nMAE columns show team / margin / total. Sigma uses unrounded forecast errors. Interval coverage uses prior seasons only. * means outside nominal by more than 3 percentage points.','\n| Season | Games | Baseline MAE | V3 MAE | V3 sigma | Margin 50 / 80 | Total 50 / 80 | Prior error years |','|---|---:|---|---|---|---|---|---|']
 for a in annual:
  fmt=lambda kind:' / '.join(f"{a['point_metrics'][k][kind]:.2f}" for k in ['team_points','margin','total']);sig=' / '.join(f"{a['residual_sigma'][k]:.2f}" for k in ['team_points','margin','total']);metrics=a['interval_score']['metrics']
  def coverage(k):
   return 'N/R' if not metrics else ' / '.join(f"{metrics[k]['coverage'][l]['rate']*100:.1f}%"+('*' if metrics[k]['coverage'][l]['flag'] else '') for l in ['50','80'])
  text.append(f"| {a['season']} | {a['paired_n']} | {fmt('baseline_mae')} | {fmt('v2_mae')} | {sig} | {coverage('margin')} | {coverage('total')} | {'none' if a['season']==2016 else '2016–'+str(a['season']-1)} |")
 text+=['\n## Feature decisions for future games','\n| Group | Test seasons | Standalone MAE gain | Decision |','|---|---:|---:|---|']
 last=decisions[-1];removed={g:c['reason'] for rr in last['conditional_rounds'] for g,c in rr['checks'].items() if not c['pass']}
 for g,r in last['marginal'].items():
  decision='RETAINED' if g in record['released_groups'] else ('REMOVED: conditional '+removed[g] if g in removed else 'INACTIVE: '+r['reason'] if not r['pass'] else 'REMOVED: release check failed');gain=r.get('relative_team_improvement');text.append(f"| {g} | {len(r['eligible_seasons'])} | {gain*100:.2f}% | {decision} |" if gain is not None else f"| {g} | {len(r['eligible_seasons'])} | N/R | {decision} |")
 text+=['\nConditional comparisons refit and retune the complete remaining subset. Detailed paired counts, seasonal improvements and intervals are in the immutable qualification record linked by the experiment. Failing components remain recorded with zero live weight; no source or v1 evidence is deleted.','\n2016 interval results are unavailable because no earlier OOF season exists. Target shares never acquire an eligible test fold: the first measurements arrive in 2025, after every historical training fold relevant to those measurements. Wind retains its limited 2022–2025 archive qualification; unavailable history is never filled.','\n## Replay','\nVerification: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v3_replay.py --verify`','\nFull offline qualification replay: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v3_replay.py --replay`','\nLeast sure: whether a group improved the forecast or merely duplicated another input. Refitted conditional ablations determine the retained set; WHY uses grouped measured contributions and a distinct strongest opposing term.']
 (work/'report.md').write_text('\n'.join(text)+'\n');return audit
if __name__=='__main__':main()
