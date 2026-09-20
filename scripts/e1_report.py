"""Render saved E1 evidence. This script cannot refit a model."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0,str(ROOT))
from scripts.reference_reports import report_file
OUT=ROOT/'work/projection-governance-v2/e1'

def run():
    validity_path=OUT/'validity.json'
    if validity_path.exists():
        validity=json.loads(validity_path.read_text())
        if not validity['valid_e1_result']:
            lines=['# E1 — chronology audit blocked the result','',
                '**The first numerical rejection is withdrawn. This is not a valid E1 gate result. Linear remains live; no method was promoted.**','',
                validity['defect'],'',
                '| Game | Played | NFL week | Calendar week at play | Tuesday cutoff missed |',
                '|---|---|---:|---:|---|']
            for game in validity['affected_games']:
                lines.append(f"| {game['game_id']} | {game['gameday']} {game['gametime']} ET | {game['nfl_week']} | {game['calendar_week']} | {game['tuesday_cutoff']} 06:00 PT |")
            lines+=['','## Required cadence decision','',
                'Recommended: each game uses the most recent Tuesday 06:00 PT state before its actual T-75 issuance; assimilate only results completed before that cutoff, regardless of NFL week label. The alternative is to freeze one state for an entire NFL week until all its games are final. User clarification is pending under the instruction to stop on undefined conventions.','',
                '## Completed and preserved','',
                '- Constrained filter, reference Riccati covariance, preseason transition and diagnostics implemented. Constant-shift invariance, covariance convergence, zero null variance, synthetic recovery, training-order invariance and same-week causal sequencing tests pass.',
                '- 296 unit tests pass, but they did not cover the postponed-game calendar case. The final calendar audit fails; passing unit tests does not override that failure.',
                '- The original hashed preregistration and all numerical artifacts are preserved in `../e1-week-label-run/`, with `VALIDITY.json` marking the run invalid. No additional parameter settings were tried.',
                '- The 14-game current-season counterfactual table used frozen issued inputs, but its historical state fitting shares the calendar defect; it is not accepted E1 evidence.',
                '- Staff file has 448 team-season rows; QB1 is sourced for 446. All coaching fields remain unknown after PFR 403; A.3 false unknown flags were used and disclosed. No PFF or other data addition started.',
                'Staff file SHA-256: `'+json.loads((OUT/'staff-coverage.json').read_text())['sha256']+'`. Coverage by season and every unknown team-season are listed in `staff-coverage.json`.',
                '- Active fit, prior projections, grades and Phase A archive remain unchanged. E2 has not started and will use the result of a valid E1.','',
                'Least certain: calendar-time meaning of Tuesday-only assimilation for postponed games. The actual schedule audit exposed a defect in week-label replay, so the rejection was withdrawn and the cadence decision requested instead of silently changing the protocol.','']
            report_file(OUT/'report.md').write_text('\n'.join(lines))
            return
    r=json.loads((OUT/'verification.json').read_text());reg=json.loads((OUT/'registration.json').read_text())
    staff=json.loads((OUT/'staff-coverage.json').read_text());fits=json.loads((OUT/'state-fits.json').read_text())
    if (OUT/'state-fit-2026.json').exists():fits.append(json.loads((OUT/'state-fit-2026.json').read_text()))
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
            '![Weekly dispersion](weekly-dispersion.png)','', '![PIT histograms](pit-histograms.png)','', '## State fit parameters','', '| Fold | q | r | lambda | rho | P0 offense / defense diagonal | Half-life offense / defense | Riccati iterations / converged | Bound hits | Games / 3 optimized / 4 including rho |',
            '|---|---:|---:|---:|---:|---|---|---|---|---|']
    for f in fits:
        d=f['stationary'];lines.append(f"| {f['season']} | {f['q']:.6f} | {f['r']:.6f} | {f['retention']:.6f} | {f['rho']:.6f} | {d['diagonal'][0]:.6f} / {d['diagonal'][32]:.6f} | {d['offense_half_life']:.3f} / {d['defense_half_life']:.3f} | {d['iterations']} / {d['converged']} | {', '.join(f['bound_hits']) or 'none'} | {f['training_games']} / {f['games_per_optimized_parameter']:.1f} / {f['games_per_parameter_including_rho']:.1f} |")
    lines+=['','The 2026 row is the current-season counterfactual fit, trained through 2025 only. Half-life is a steady-state approximation for an uninterrupted weekly reference schedule, not an empirical universal team-memory parameter. The filter optimizes three quantities and estimates rho from a fixed training-only pilot; 63 constrained latent states are also tracked. k4/k8 add no estimated parameters. All methods retain the existing four ridge coefficients including intercept; filter parameter counts are additional to those.','',
            'The 2013 and 2014 calibration-only training records contain no effective preseason transition after the mandated 2013 reset; lambda is not separately identified in those pilot fits. The optimizer coordinate is reported without claiming otherwise. Scored 2016–2025 folds have prior preseason transitions.','', '## Staff data addition and limitations','',f"`config/staff_history.json` SHA-256: `{staff['sha256']}`.",'',
            '| Season | Team-seasons | HC | OC | DC | QB1 | Known QB1 changes |','|---|---:|---:|---:|---:|---:|---:|']
    for year,c in staff['coverage'].items():lines.append(f"| {year} | 32 | {c['head_coach']} | {c['offensive_coordinator']} | {c['defensive_coordinator']} | {c['qb1']} | {c['qb1_change_known']} |")
    lines+=['','PFR returned HTTP 403 for season/coaching-history probes. All 448 HC/OC/DC team-season records remain explicitly unknown, with source URLs and null retrieval timestamps; a successful coaching extraction is **not** claimed. MIA/TB 2017 did not have a Week 1 starter observation. Unknown coach changes read false independently; known QB1 changes still double preseason variance. `staff-coverage.json` enumerates every unknown team-season. No continuity weights, GM/roster fields, or PFF data were added to the model.','']
    current=OUT/'current-season.json'
    if current.exists():
        c=json.loads(current.read_text());lines+=['## Current-season issued-game comparison','',c['population']+'.','',
             '| Forecast | Games | Team MAE | Margin MAE | Total MAE |','|---|---:|---:|---:|---:|']
        for name,m in c['summary'].items():lines.append(f"| {name} | {len(c['games'])} | {m['team']['mae']:.4f} | {m['margin']['mae']:.4f} | {m['total']['mae']:.4f} |")
        lines+=['','Only immutable AS_ISSUED contribution inputs are used for challenger counterfactuals. Original forecasts/grades are untouched. The two retrospective Week 1 games are excluded. All candidate fitting stops at 2025. Replay-linear follows the registered expanding-history refit and can differ from the originally issued version. Compare challengers with replay-linear to isolate the method comparison; originally issued scores remain a separate reference. Per-game before/after scores are in `current-season.json`.','']
    else:lines+=['## Current-season comparison','', 'PENDING: no release is permitted until this evidence is complete.','']
    lines+=['## Governance and release','', 'Phase A remains exploratory and does not count as E2. E2 is Week 3, separately registered against E1’s promoted method or the retained linear control. The computed decision is reported in the gate table; numerical output cannot activate a method or override an incomplete evidence audit. Two reviewer responses have not been received; none is fabricated. No release approval is claimed. This experiment cannot activate a method.','',
        f"Gate replay: {r['runtime_seconds']:.1f} seconds, peak process RSS {r['peak_rss_mib']:.1f} MiB, one BLAS worker. Cached fits and OOF outputs are retained; this report renderer never refits.",'',
        'Least certain: the nondiagonal reference covariance and team-specific preseason injection. Their exact reference equations and PSD scaling were recorded before results; invariance, convergence, and known-strength recovery were tested.','']
    if (OUT/'preregistration-addendum.json').exists():
        addendum=json.loads((OUT/'preregistration-addendum.json').read_text())
        flags=[dict(item) for item in addendum['items'] if item['tier']==2]
        if (OUT/'availability-convention.json').exists():
            for item in flags:
                if item['id']=='C25':
                    item['decision']='Resolved by binding user instruction: played kickoff plus four hours is assimilation availability; no actual completion clock is used.'
                    item['alternative']='The previous exact-completion requirement was superseded; no estimated physical completion time is asserted.'
        note=['**REVIEW REQUESTED (nonblocking):** '+', '.join(item['id']+' '+item['topic'] for item in flags)+'. Decisions and untested alternatives: [preregistration addendum](PREREGISTRATION-ADDENDUM.md).','']
        for item in flags:
            note+=['- '+item['id']+': '+item['decision']+' **Alternative not taken:** '+item['alternative']]
        note+=['']
        lines=note+lines
        sensitivity=r.get('extreme_game_sensitivity',{})
        lines+=['## Extreme-game sensitivity (diagnostic only)','','| Candidate | Leave-one-game-out improvement range | Omitted game at minimum / maximum |','|---|---|---|']
        for name,item in sensitivity.items():
            lines.append(f"| {name} | {item['minimum']} to {item['maximum']} | {item.get('omitted_game_at_minimum')} / {item.get('omitted_game_at_maximum')} |")
        lines+=['','Both teams remain paired. This diagnostic never changes eligibility, candidate selection or the release gate.','']
    if (OUT/'availability-convention.json').exists():
        calendar=json.loads((OUT/'calendar-audit.json').read_text())
        lines+=['## Calendar correction and affected forecasts','','All four candidates use the identical fixed played-kickoff-plus-four-hours convention. nflverse clock fields are Eastern regardless of venue and are converted to UTC. Four hours is an authorized availability convention, not a universal upper bound on physical game duration. No completion timestamp was invented or required; no registered game was dropped.','','| Season | Games audited | Forecasts with changed available history |','|---|---:|---:|']
        for year,values in calendar['by_season'].items():lines.append(f"| {year} | {values['games']} | {values['affected_forecasts']} |")
        lines+=['','Affected means a changed incorporated historical-game-ID set relative to the invalidated week-label replay; numerical downstream propagation is separate. Source-event IDs and each forecast dependency set are preserved in calendar-audit.json and calendar-lineage.json.gz.',f"Minimum gap from the four-hour availability mark to its next assimilation cutoff: {calendar['minimum_hours_between_availability_and_assimilation']:.2f} hours. This schedule check does not measure actual end times.",'','The earlier numerical rejection remains withdrawn and preserved. This corrected run is the first valid E1 result only after its independent audits pass.','']
    report_file(OUT/'report.md').write_text('\n'.join(lines))

if __name__=='__main__':run()
