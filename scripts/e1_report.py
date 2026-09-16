"""Render saved E1 evidence. This script cannot refit a model."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/projection-governance-v2/e1'

def run():
    r=json.loads((OUT/'verification.json').read_text());reg=json.loads((OUT/'registration.json').read_text())
    staff=json.loads((OUT/'staff-coverage.json').read_text());fits=json.loads((OUT/'state-fits.json').read_text())
    lines=['# E1 — Early-season updating rule','',f"Decision: **{r['decision']}**. Live method remains linear. No automatic promotion.",'',
      f"Preregistration: `{reg['sha256']}`; registered {reg['registered_at']}; first comparative result {r['first_comparative_result_at']}.",
      f"{r['games']} paired regular-season games, 2016–2025. This is reused historical development evidence, not an untouched holdout.",'',
      '## Gate table','', '| Candidate | Team MAE | Change vs control | Margin MAE | Total MAE | Margin 50 / 80 coverage | Total 50 / 80 coverage | Numeric gate |',
      '|---|---:|---:|---:|---:|---|---|---|']
    for name in ('linear','k4','k8','state_space'):
        m=r['pooled'][name];g=r['gate'].get(name)
        lines.append(f"| {name} | {m['team']['mae']:.4f} | {'control' if not g else format(100*g['relative_team_mae_improvement'],'.2f')+'%'} | {m['margin']['mae']:.4f} | {m['total']['mae']:.4f} | {100*m['margin']['coverage_50']:.2f}% / {100*m['margin']['coverage_80']:.2f}% | {100*m['total']['coverage_50']:.2f}% / {100*m['total']['coverage_80']:.2f}% | {'—' if not g else 'PASS' if g['numeric_gate_pass'] else 'FAIL'} |")
    lines+=['','Gate: at least 1% lower team MAE and all four margin/total coverage rates within 3 percentage points of nominal. Intervals and probabilities use each candidate’s own previous-three-season paired OOF residuals. No E2 post-processing was fitted.','',
        '## Paired uncertainty','', '| Candidate | 95% interval for control minus challenger team MAE |','|---|---|']
    for name,g in r['gate'].items():
        lo,hi=g['paired_mae_improvement_interval_95'];lines.append(f'| {name} | [{lo:.4f}, {hi:.4f}] |')
    lines+=['','2,000 fixed-seed resamples of four-week blocks within season. Both team errors remain together in each game. These are descriptive development intervals, not multiplicity-adjusted discovery claims.','',
            '## Annual team MAE','', '| Season | Linear | k4 | k8 | State space |','|---|---:|---:|---:|---:|']
    for year in range(2016,2026):lines.append('| '+str(year)+' | '+' | '.join(f"{r['annual'][n][str(year)]['team']['mae']:.4f}" for n in ('linear','k4','k8','state_space'))+' |')
    lines+=['','## Weeks 1–4','', '| Candidate | Team MAE | Margin MAE | Total MAE |','|---|---:|---:|---:|']
    for name,m in r['weeks_1_to_4'].items():lines.append(f"| {name} | {m['team']['mae']:.4f} | {m['margin']['mae']:.4f} | {m['total']['mae']:.4f} |")
    lines+=['','## Verification and compression','', '| Candidate | Target | Projected / actual SD | Skill vs league climatology | Skill vs persistence | CRPS |','|---|---|---|---:|---:|---:|']
    for name,m in r['pooled'].items():
        for target in ('team','margin','total'):
            v=m[target];lines.append(f"| {name} | {target} | {v['projected_sd']:.3f} / {v['actual_sd']:.3f} | {v['skill_climatology']:.4f} | {v['skill_persistence']:.4f} | {v['crps']:.4f} |")
    lines+=['','Full weekly dispersion, skill versus league/last-season-team/persistence, PIT bin counts, interval scores and winner Brier/reliability are in `verification.json`. Forecast SD is audited beside actual SD, not forced to equal noisy realized-score dispersion.','',
            '## State fit parameters','', '| Fold | q | r | lambda | rho | P0 offense / defense diagonal | Half-life offense / defense | Riccati iterations / converged | Bound hits | Games / 3 optimized / 4 including rho |',
            '|---|---:|---:|---:|---:|---|---|---|---|---|']
    for f in fits:
        d=f['stationary'];lines.append(f"| {f['season']} | {f['q']:.6f} | {f['r']:.6f} | {f['retention']:.6f} | {f['rho']:.6f} | {d['diagonal'][0]:.6f} / {d['diagonal'][32]:.6f} | {d['offense_half_life']:.3f} / {d['defense_half_life']:.3f} | {d['iterations']} / {d['converged']} | {', '.join(f['bound_hits']) or 'none'} | {f['training_games']} / {f['games_per_optimized_parameter']:.1f} / {f['games_per_parameter_including_rho']:.1f} |")
    lines+=['','Half-life is a steady-state approximation for an uninterrupted weekly reference schedule, not an empirical universal team-memory parameter. The filter optimizes three quantities and estimates rho from a fixed training-only pilot; 63 constrained latent states are also tracked. k4/k8 add no estimated parameters. All methods retain the existing four ridge coefficients including intercept; filter parameter counts are additional to those.','',
            '## Staff data addition and limitations','',f"`config/staff_history.json` SHA-256: `{staff['sha256']}`.",'',
            '| Season | Team-seasons | HC | OC | DC | QB1 | Known QB1 changes |','|---|---:|---:|---:|---:|---:|---:|']
    for year,c in staff['coverage'].items():lines.append(f"| {year} | 32 | {c['head_coach']} | {c['offensive_coordinator']} | {c['defensive_coordinator']} | {c['qb1']} | {c['qb1_change_known']} |")
    lines+=['','PFR returned HTTP 403 for season/coaching-history probes. All 448 HC/OC/DC team-season records remain explicitly unknown, with source URLs and null retrieval timestamps; a successful coaching extraction is **not** claimed. MIA/TB 2017 did not have a Week 1 starter observation. Unknown combined coach/QB transitions use false, per A.3. `staff-coverage.json` enumerates every unknown team-season. No continuity weights, GM/roster fields, or PFF data were added to the model.','']
    current=OUT/'current-season.json'
    if current.exists():
        c=json.loads(current.read_text());lines+=['## Current-season issued-game comparison','',c['population']+'.','',
             '| Forecast | Games | Team MAE | Margin MAE | Total MAE |','|---|---:|---:|---:|---:|']
        for name,m in c['summary'].items():lines.append(f"| {name} | {len(c['games'])} | {m['team']['mae']:.4f} | {m['margin']['mae']:.4f} | {m['total']['mae']:.4f} |")
        lines+=['','Only immutable AS_ISSUED contribution inputs are used for challenger counterfactuals. Original forecasts/grades are untouched. The two retrospective Week 1 games are excluded. All candidate fitting stops at 2025. Per-game before/after scores are in `current-season.json`.','']
    else:lines+=['## Current-season comparison','', 'PENDING: no release is permitted until this evidence is complete.','']
    lines+=['## Governance and release','', 'Phase A remains exploratory and does not count as E2. E2 is Week 3, separately registered against E1’s promoted method or the retained linear control. Two reviewer responses have not been received; none is fabricated. This experiment cannot activate a method.','',
        f"Gate replay: {r['runtime_seconds']:.1f} seconds, peak process RSS {r['peak_rss_mib']:.1f} MiB, one BLAS worker. Cached fits and OOF outputs are retained; this report renderer never refits.",'',
        'Least certain: the nondiagonal reference covariance and team-specific preseason injection. Their exact reference equations and PSD scaling were recorded before results; invariance, convergence, and known-strength recovery were tested.','']
    (OUT/'report.md').write_text('\n'.join(lines))

if __name__=='__main__':run()
