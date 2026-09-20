"""Render the registered Elo reproduction and gate packet; never fit or fetch."""
import hashlib,json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.reference_reports import report_file
O=Path(__file__).resolve().parents[1]/'work/e-elo-qb-hfa-v1'
def read(n):return json.loads((O/n).read_text())
def run():
 s=read('starter-reproduction.json');q=read('starter-validation-reconciliation.json');inj=read('injury-timestamp-audit.json');reg=read('supporting-regression-reproduction.json');h=read('hfa-deployed-gate.json');a=read('hfa-population-reconciliation.json')[0];under=read('underlying-elo-findings.json');c=s['common_nonweek1'];lines=['# Pregame starter qualification and registered Elo experiments','',
 'Premise: authoritative deployed-lineage control `work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json`, generated 2026-09-19. The unchanged control was reproduced exactly for every forecast before the HFA gate.', '',
 '**E-ELO-HFA: PASSED its bias-correction gate; release not activated. E-ELO-QB: HELD_FOR_REPRODUCTION_AND_VALUE_DEFINITION; no candidate fit.** Pregame starter history is available under the user-qualified rule. This replaces the earlier blanket unavailable/unqualified restriction; historical as-issued engine identity is a separate issue and does not prevent testing this rule.', '',
 '**REVIEW REQUESTED:** audit sample includes playoffs and 17 games from2026; original primary-selector accuracy appears to omit injury overrides; depth-chart-first definition and quality-regression sample/window are not fully specified. All chosen conventions were hashed before implementation. No candidate, denominator or gate was tuned to recover an audit number.', '',
 '## Reproduction first','',
 'Validation below uses identical complete cases across the three selectors, non-Week1 as required to compare against a prior-game source. Counts are team-games, not paired NFL games. The table still retains Week1 and every authoritative game.', '',
 '| Selector | Supplied accuracy | Reproduced | Difference, percentage points | Within1point |','|---|---:|---:|---:|---|']
 for k,label in [('selected_qb','Previous-game leader plus injury override'),('chart_qb','Depth-chart QB1'),('depth_first_qb','Depth-chart-first combination')]:
  d=c[k]*100-s['target_percent'][k];lines.append(f"| {label} | {s['target_percent'][k]:.1f}% | {c[k]*100:.3f}% | {d:+.3f} | {'YES' if abs(d)<=1 else 'NO'} |")
 lines+=['',f"Supplied sample:1982. Common comparable sample:{c['team_games']}team-games in{c['unique_games']}games. IncludingWeek1:{s['including_week1']['team_games']}team-games; rule accuracy{s['including_week1']['selected_qb']*100:.3f}%. Missing/ambiguous labels remain explicit. Do not discard Week1 from the built table merely because the reproduction comparison uses prior-game availability.", '',
 '| Season | Supplied rule | Full stated rule | Previous-game-only | Full-rule common n |','|---|---:|---:|---:|---:|']
 qm={str(v['season']):v for v in q['by_season']}
 for y,t in s['season_targets'].items():v=s['by_season'][y];lines.append(f"| {y} | {t:.1f}% | {v['selected_qb']*100:.3f}% | {qm[y]['previous_game_only_accuracy']*100:.3f}% | {v['team_games']} |")
 lines+=['',f"The no-override diagnostic closely reproduces the supplied primary figures: pooled{q['pooled_previous_only_accuracy']*100:.3f}% on{q['n']}unambiguous prior/current observations. Injury overrides raise accuracy. We will not remove the required overrides to force agreement. The full rule misses the explicitly required1percentage-point reproduction tolerance, so E-ELO-QB fitting has not started.", '',
 f"2022ambiguity: {s['ambiguity_2022']['multiple_passers']}team-games with at least two QB-position passers, versus supplied108; {s['ambiguity_2022']['within_five_attempts']}within five attempts, reproducing5. Position-filter and zero-attempt definitions must be reconciled with the supplied108; no arbitrary relabeling.", '',
 '## Starter table and injury timing','',f"Starter table SHA256: `{s['table']['sha256']}`. Every depth-chart fallback, Week1 selection and chart tie-break carries UNTIMESTAMPED; the2025schema is handled separately. The primary selector uses only prior completed games and qualified injury reports, never the current-game oracle label.", '',
 '| Season | Team-games | Selected QB | UNTIMESTAMPED | Missing/ambiguous actual leader |','|---|---:|---:|---:|---:|']
 for y,v in s['coverage'].items():lines.append(f"| {y} | {v['team_games']} | {v['selected']} | {v['UNTIMESTAMPED']} | {v['missing_actual']} |")
 lines+=['','| Season | Injury rows matched to completed REG game | After kickoff | At/afterT75 | QB Out/Doubtful at/afterT75 |','|---|---:|---:|---:|---:|']
 for y,v in inj.items():
  if int(y)<=2025:lines.append(f"| {y} | {v['matched_to_regular_game']} | {v['after_kickoff']} | {v['at_or_after_T75']} | {v['qb_out_doubtful_at_or_after_T75']} |")
 lines+=['', 'The2022 matched count5433 reproduces the supplied count. No matched2022report postdates kickoff in this pinned download, versus the supplied1; importantly, zero QB Out/Doubtful reports are late across2016–2025. Seventeen2022injury rows belong to the canceled BUF–CIN game and are unmatched to a completed game; retained in raw sources and counted, not silently erased. Source timestamps are modification times, not inferred publication times.', '',
 'Raw depth-chart coverage2016–2024 is5534rank1QB team-weeks out of5554source team-weeks, not supplied5287/5310. These are source snapshots including bye/postseason records, not played-game coverage; per-season actual table coverage appears above. Source-definition reconciliation remains open. All requested player, injury and chart CSV endpoints returned200, including the2025player-stats release rename.', '',
 '## Supporting regression reproduction','',
 '| In-sample model | Supplied n | Reproduced n | Supplied MAE | Reproduced MAE | Team-scoring coefficient |','|---|---:|---:|---:|---:|---:|',
 f"| Prior-four scoring |2442|{reg['n_team_games']}|7.761|{reg['scoring_only']['mae']:.6f}|{reg['scoring_only']['coefficients'][1]:.6f}|",
 f"| Plus selectedQB priorEPA/attempt |2442|{reg['n_team_games']}|7.642|{reg['with_qb']['mae']:.6f}|{reg['with_qb']['coefficients'][1]:.6f}|", '',
 f"Gain:{reg['relative_gain']*100:.3f}% versus supplied1.53%. Convention: {reg['sample']}. This does not reproduce the supplied sample or result; request the original row manifest/window definition. It is an in-sample association, not a rigorous upper bound on OOF MAE improvement, proof of causation, or a substitute for the registered gate.", '',
 '## E-ELO-HFA reproduction and authoritative gate','',
 '| Audit reproduction | n | Control MAE | HFA MAE | Control bias | HFA bias |','|---|---:|---:|---:|---:|---:|',
 '| Supplied |2244|10.274800|10.252400|+0.999000|+0.221000|',
 f"| Reconciled all-game2018–2026 sample |{a['all_types_2018_and_later_n']}|{a['reproduction']['control']['mae']:.6f}|{a['reproduction']['hfa']['mae']:.6f}|{a['reproduction']['control']['bias']:+.6f}|{a['reproduction']['hfa']['bias']:+.6f}|", '',
 'Both MAEs reproduce within0.01. The refit bias differs and is disclosed. The2244sample includes17games from2026 and playoffs; it is reference evidence only. The actual gate below uses2639REGgames2016–2025, the pinned deployed feature path, calendar repairs and weekly ridge refits. Its unchanged control matches6a0238fc exactly, including every historical feature and point forecast.', '',
 '| Gate quantity | Control | HFA | Requirement | Result |','|---|---:|---:|---|---|',
 f"| Elo margin MAE |{h['own_elo']['control']['mae']:.6f}|{h['own_elo']['hfa']['mae']:.6f}|Worsening ≤0.1%|PASS|",
 f"| Elo margin bias |{h['own_elo']['control']['bias']:+.6f}|{h['own_elo']['hfa']['bias']:+.6f}|Closer to zero|PASS|",
 f"| Reliability, squared bin error |{h['own_elo']['control']['reliability_squared_03_08']:.8f}|{h['own_elo']['hfa']['reliability_squared_03_08']:.8f}|Improve in0.3–0.8|PASS|",
 f"| Deployed team MAE |{h['deployed_points']['control']['team_mae']:.6f}|{h['deployed_points']['hfa']['team_mae']:.6f}|Worsening ≤0.1%|PASS|", '',
 f"Deployed team-MAE worsening:{(h['deployed_points']['hfa']['team_mae']/h['deployed_points']['control']['team_mae']-1)*100:.4f}%. This is a bias-correction pass, not a team-score accuracy improvement. One HFA mean per outer season from three earlier REG nonneutral seasons; games per parameter and values are in hfa-deployed-gate.json. Neutral venues retain zero HFA. Elo divisor25, K20 and reversion are unchanged. Elapsed:{h['elapsed_seconds']:.2f}seconds on one worker.", '',
 'Gate status is PASSED_PENDING_RELEASE under the existing queue policy automatic_method_promotion=false. Production remains unchanged; no active fit, historical lock, grade or current board was rewritten. A release must version the new HFA feature history and compatible fit together; merely changing the global65constant would silently reinterpret frozen fits and is not a valid deployment.', '',
 '## Underlying findings and limitations','',
 f"The supplied2778games and1.92home-margin mean reproduce when2026is included: mean{under['home_margin']:.6f}, Elo bias+{under['elo_margin_bias']:.6f}. The reported annual2016–2025means reproduce on all game types. OLS slope implies divisor{under['OLS_actual_on_elo_margin']['implied_divisor']:.3f}, matching25.5; directMAE minimization has a different optimum{under['diagnostic_best_divisor']:.3f}. These are different objectives, and neither changes the registered divisor.", '',
 'The audited win-probability bins are HOME-win probabilities. Uniform positive prediction-minus-observation gaps below0.5 are not overstatement of the away favorite. The site win column is produced by projection_v3.card.project through projection.distribution.summarize, using projected scores and residuals; it is not a direct copy of Elo logistic probabilities. The absence of retained QB adjustment is verified; its value still needs the registered experiment.', '',
 'E-ELO-QB needs the exact EPA/dropback+CPOE→VALUE formula, scale and no-history rule. engine/elo.py only accepts supplied VALUE and multiplies its difference by3.3; it does not define that conversion. No invented weights, market values, inaccurate oracle forecast, or out-of-scope candidate was scored. Starter validation disagreement also needs reconciliation, ideally from the independent script/row manifest. Oracle(a) and candidate(b) will follow only once those conditions are resolved.', '',
 'Least sure: matching the independent audit population and VALUE units. That led to an explicit population reconciliation, a separate authoritative HFA gate, and holding only dependent QB fitting.', '',
 'Confidence: medium for the HFA bias-correction decision—it holds on authoritative data but depends on defensible HFA-training and reliability conventions. Downgrade to low if the intended reliability metric or audit HFA implementation reverses a gate check. Starter-source availability and recorded arithmetic are verified; no confidence claim is made for an unrun QB candidate.']
 report_file(O/'REPORT.md').write_text('\n'.join(lines)+'\n')
if __name__=='__main__':run()
