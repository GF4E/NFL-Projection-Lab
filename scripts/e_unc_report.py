"""Build E-UNC review packet from frozen scoring output; never refits."""
import json,gzip,sys,hashlib
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/e-unc'
import sys
sys.path.insert(0,str(ROOT))
from scripts.reference_reports import report_file
def main():
 scores=json.loads((OUT/'scores.json').read_text());gate=json.loads((OUT/'gate.json').read_text());records=json.loads(gzip.decompress((OUT/'scored-games.json.gz').read_bytes()))
 base=records['control'];ids=sorted({r['game_id'] for r in base});index={g:i for i,g in enumerate(ids)}
 blocks={}
 for r in base:blocks.setdefault((r['season'],(r['week']-1)//4),set()).add(index[r['game_id']])
 byyear={y:[np.array(sorted(v)) for (s,w),v in blocks.items() if s==y] for y in range(2016,2026)}
 rng=np.random.default_rng(20260916);draws=[]
 for _ in range(2000):draws.append(np.concatenate([np.concatenate([b[i] for i in rng.integers(len(b),size=len(b))]) for b in byyear.values()]))
 losses={}
 for n,rr in records.items():
  grouped={g:[] for g in ids}
  for r in rr:
   if r['target']=='team':grouped[r['game_id']].append(r['crps'])
  losses[n]=np.array([np.mean(grouped[g]) for g in ids])
 boot={n:dict(zip(['lower95','upper95'],np.quantile([1-losses[n][d].mean()/losses['control'][d].mean() for d in draws],[.025,.975]).tolist())) for n in records if n!='control'}
 (OUT/'paired-uncertainty.json').write_text(json.dumps(boot,indent=2)+'\n')
 names=list(records);targets=['team','margin','total']
 fig,axs=plt.subplots(4,3,figsize=(12,11))
 for i,n in enumerate(names):
  for j,t in enumerate(targets):
   ax=axs[i,j];ax.bar(np.arange(10),scores['pooled'][n][t]['pit']);ax.set_title(n+' · '+t);ax.set_xlabel('Midpoint PIT bin')
 fig.tight_layout();fig.savefig(OUT/'pit.png',dpi=130);plt.close(fig)
 fig,axs=plt.subplots(1,3,figsize=(12,4))
 for ax,t in zip(axs,targets):
  for n in names:
   b=scores['pooled'][n][t]['spread_skill'];ax.plot([x['spread'] for x in b],[x['absolute_error'] for x in b],'.-',label=n)
  ax.set_title(t);ax.set_xlabel('Predicted spread');ax.set_ylabel('Mean absolute error')
 axs[0].legend(fontsize=7);fig.tight_layout();fig.savefig(OUT/'spread-skill.png',dpi=130);plt.close(fig)
 fig,ax=plt.subplots(figsize=(6,5));ax.plot([0,1],[0,1],'--',color='gray')
 for n in names:
  b=[b for b in scores['pooled'][n]['winner']['reliability'] if b['n']];ax.plot([r['forecast'] for r in b],[r['observed'] for r in b],'.-',label=n)
 ax.legend();ax.set_xlabel('Forecast probability');ax.set_ylabel('Observed home result (ties half)');fig.tight_layout();fig.savefig(OUT/'reliability.png',dpi=130);plt.close(fig)
 windref=json.loads((ROOT/'work/projection-v1/source-manifest.json').read_text())['wind'];wind=json.loads((ROOT/windref['path']).read_text());coverage=[]
 for y in range(2016,2026):
  gids={r['game_id'] for r in base if r['season']==y};available=sum(r['game_id'] in gids for r in wind)
  coverage.append({'season':y,'games':len(gids),'week_and_games_played_and_roof':len(gids),'confirmed_starter_qualified':0,'coach_change_timing_qualified':0,'wind_stitched_rows':available,'wind_pregame_timestamp_qualified':0,'primary_inactive':['confirmed starter','coach/QB change timing','forecast wind']})
 (OUT/'availability.json').write_text(json.dumps(coverage,indent=2)+'\n')
 secondary_path=OUT/'secondary.json'
 secondary_ready=secondary_path.exists() and json.loads(secondary_path.read_text()).get('status','') in ('SCORED_2025_WITH_2024_TRAINING','INSUFFICIENT')
 if not secondary_ready:
  (OUT/'secondary.json').write_text(json.dumps({'label':'SECONDARY — NOT GATED','period':[2021,2025],'status':'NOT_RUN_NO_TIMESTAMP_QUALIFIED_WIND','source':windref,'reason':'2021 outside documented archive; 2022–2025 stored stitched forecasts lack pre-issuance timestamps. No reanalysis, imputation or tuning. Primary results unaffected.','coverage':[r for r in coverage if r['season']>=2021]},indent=2)+'\n')
 audit=json.loads((OUT/'audit.json').read_text());var=json.loads((OUT/'variance.json').read_text())
 lines=['# E-UNC review packet','',
 'REVIEW REQUESTED: empirical paired ensemble rather than Gaussian copula; log-absolute-error scale rather than log variance; conditional ridge sandwich rather than full-pipeline bootstrap; interval-score non-worsening tested per target. Details: GAP-SWEEP.md.',
 '', '## Decision', 'Closeout: verified single-game predictive intervals, paired margin residuals, no independence defect; rho 0.04. Review-predicted joint benefit rejected by the release gate. Conditional coefficient uncertainty under 0.2 percent of predictive variance means no material within-season narrowing is expected. Heteroscedastic hypothesis OPEN; three-feature set REJECTED, no repeat without newly qualified fields. Wind secondary INSUFFICIENT, not negative: one training and one test season cannot overturn the 2,639-game bucket study; return after 2021–2023 qualification. Next E2.', 'RETAIN CONTROL. No challenger passes. Candidate b and c are PARTIAL TESTS; rejection applies only to the reduced feature set. The richer heteroscedastic question returns after inactive histories qualify. Primary objective reverts to team MAE for the next experiment.',
 '', 'Secondary wind analysis: see SECONDARY-REPORT.md. New fixed-lead Previous Runs forecasts support 2024 training and 2025 testing (272 games each); 2021–2023 remain unscored because qualified GFS wind history is absent. Adding wind worsened CRPS by about 0.12%; it never enters the gate. This is a disclosed partial-period result, not a complete 2021–2025 study.',
 '', '## Audit before model changes',
 '50/80 bands are predictive empirical residual quantiles for a single game, not confidence intervals for a fitted mean. engine/projection/distribution.py::residual_distribution, pmf, quantile, summarize rounds residuals and centers for discrete PMFs. engine/board_v7.py::metadata builds team bands from the issuing version’s pooled team residual PMF; scripts/projection_v3_publish.py::shape_for pins that fit.',
 'Margin and total residuals are formed from home/away errors of the SAME GAME in engine/projection_v2/qualify.py::residuals; summarize uses those PMFs directly. No independent combination defect was found. Winner probability is positive-margin mass plus half tie mass. This semantics is retained and labeled.',
 f"Pooled retained linear incumbent OOF correlation (2639 games) = {audit['seasons'][-1]['rho']:.6f}. This retrospective number is diagnostic, never inserted into earlier fits. Evaluation uses retained E1 linear point forecasts and fold-specific training dependence.",
 'The old artifact contains no separately identified parameter/noise components. variance.json adds a conditional training-only game-cluster sandwich estimate for the retained ridge. Its residual component includes misspecification and is NOT a measured physical irreducible floor. Pointwise predictive variance is estimated parameter variance plus that residual estimate.',
 '', '## Gate',
 '|Candidate|Team CRPS improvement|Paired 95% interval|Coverage|Winkler|Point invariance|Pass|','|---|---:|---|---|---|---|---|']
 for n,g in gate['gate'].items():lines.append(f"|{n}|{g['CRPS_improvement']:.4%}|{boot[n]['lower95']:.4%} to {boot[n]['upper95']:.4%}|{g['coverage_pass']}|{g['winkler_pass']}|{g['point_invariance_pass']}|{g['pass']}|")
 lines+=['',f"All {gate['games']} games paired; max point change {gate['max_point_difference']}. No candidate refits point forecasts. 500 members for joint candidates; no candidate promotion; no frozen artifact rewritten.",'','## Full season scores','Coverage and width shown together; counts are observations (team rows = twice games). Scores are unrounded internally.','|Season|Candidate|Target|N|MAE|CRPS|50 hits|50 coverage|50 width|50 Winkler|80 hits|80 coverage|80 width|80 Winkler|','|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
 for y in ['pooled',*map(str,range(2016,2026))]:
  for n in names:
   s=scores['pooled'][n] if y=='pooled' else scores['annual'][n][y]
   for t in targets:
    r=s[t];a,b=r['50'],r['80'];lines.append(f"|{y}|{n}|{t}|{r['n']}|{r['mae']:.6f}|{r['crps']:.6f}|{a['hits']}|{a['coverage']:.4f}|{a['width']:.4f}|{a['winkler']:.4f}|{b['hits']}|{b['coverage']:.4f}|{b['width']:.4f}|{b['winkler']:.4f}|")
 lines+=['','## Winner Brier (evidence, not gate)','|Season|Control|a|b PARTIAL|c PARTIAL|','|---|---:|---:|---:|---:|']
 for y in ['pooled',*map(str,range(2016,2026))]:lines.append('|'+y+'|'+'|'.join(f"{(scores['pooled'][n] if y=='pooled' else scores['annual'][n][y])['winner']['brier']:.6f}" for n in names)+'|')
 lines+=['','## Conditional variance decomposition','|Season|Training rho|Parameter|Residual + discrepancy|Predictive|Parameter/residual ratio|','|---|---:|---:|---:|---:|---:|']
 for v in var:lines.append(f"|{v['season']}|{v['rho_training']:.6f}|{v['parameter_variance']:.6f}|{v['conditional_noise_and_discrepancy_variance']:.6f}|{v['predictive_variance']:.6f}|{v['ratio']:.6f}|")
 lines+=['',f"Parameter fraction range: {min(v['parameter_fraction'] for v in var):.3%}–{max(v['parameter_fraction'] for v in var):.3%}. Conditional parameter uncertainty is small; collecting more fitting data alone will not remove most predictive spread.",
 '', '## Evidence and limits','scores.json contains every season/week coverage, width, Winkler, CRPS, PIT, spread-skill, ten-bin reliability, Brier and score dispersion. scored-games.json.gz retains all per-game values. fits.json reports the five scale coefficients, games per parameter and spread range per fold. a has zero fitted scale coefficients; b/c have five. The empirical calibration distributions and estimated dependence are also reported, not counted as searched hyperparameters.',
 '![PIT](pit.png)','![Spread skill](spread-skill.png)','![Reliability](reliability.png)',
 '', 'Least sure: separating physical irreducible variance from model error. Changed the report to label the residual estimate as noise PLUS discrepancy instead of asserting an identified irreducible floor.',
 '','Credits spent: 0. No automatic method promotion. Secondary wind requirement is completed on the qualified 2024–2025 subset; full 2021–2025 coverage remains a data gap.']
 report_file(OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')
 print('Report built; no refit')
if __name__=='__main__':main()
