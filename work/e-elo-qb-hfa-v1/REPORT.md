Status after authorized HFA release: original 6a0238fc is now non-authoritative for future gates; this historical result remains valid against its then-deployed control. See work/e-elo-hfa-release/SERIES.md.

# Pregame starter qualification and registered Elo experiments

Premise: authoritative deployed-lineage control `work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json`, generated 2026-09-19. The unchanged control was reproduced exactly for every forecast before the HFA gate.

**E-ELO-HFA: PASSED its bias-correction gate; release not activated. E-ELO-QB: HELD_FOR_REPRODUCTION_AND_VALUE_DEFINITION; no candidate fit.** Pregame starter history is available under the user-qualified rule. This replaces the earlier blanket unavailable/unqualified restriction; historical as-issued engine identity is a separate issue and does not prevent testing this rule.

**REVIEW REQUESTED:** audit sample includes playoffs and 17 games from2026; original primary-selector accuracy appears to omit injury overrides; depth-chart-first definition and quality-regression sample/window are not fully specified. All chosen conventions were hashed before implementation. No candidate, denominator or gate was tuned to recover an audit number.

## Reproduction first

Validation below uses identical complete cases across the three selectors, non-Week1 as required to compare against a prior-game source. Counts are team-games, not paired NFL games. The table still retains Week1 and every authoritative game.

| Selector | Supplied accuracy | Reproduced | Difference, percentage points | Within 1 point |
|---|---:|---:|---:|---|
| Previous-game leader plus injury override | 89.4% | 90.960% | +1.560 | NO |
| Depth-chart QB1 | 85.6% | 85.455% | -0.145 | YES |
| Depth-chart-first combination | 89.1% | 89.091% | -0.009 | YES |

Supplied sample: 1,982. Common comparable sample: 1,980 team-games in991 games. Including Week 1:2108 team-games; rule accuracy91.414%. Missing/ambiguous labels remain explicit. Do not discard Week 1 from the built table merely because the reproduction comparison uses prior-game availability.

| Season | Supplied rule | Full stated rule | Previous-game-only | Full-rule common n |
|---|---:|---:|---:|---:|
| 2016 | 90.4% | 92.500% | 90.417% | 480 |
| 2019 | 90.8% | 91.667% | 90.833% | 480 |
| 2022 | 87.6% | 89.980% | 87.795% | 509 |
| 2024 | 88.7% | 89.824% | 89.020% | 511 |

The no-override diagnostic closely reproduces the supplied primary figures: pooled89.484% on1978unambiguous prior/current observations. Injury overrides raise accuracy. We will not remove the required overrides to force agreement. The full rule misses the explicitly required1percentage-point reproduction tolerance, so E-ELO-QB fitting has not started.

2022 ambiguity: 85 team-games with at least two QB-position passers, versus supplied 108; 5within five attempts, reproducing 5. Position-filter and zero-attempt definitions must be reconciled with the supplied108; no arbitrary relabeling.

## Starter table and injury timing

Starter table SHA256: `cf0ab689beef908ca6d67a523d9331750d1c3e1917c4d2b4a2c489c0c3d2e722`. Every depth-chart fallback, Week1 selection and chart tie-break carries UNTIMESTAMPED; the 2025 schema is handled separately. The primary selector uses only prior completed games and qualified injury reports, never the current-game oracle label.

| Season | Team-games | Selected QB | UNTIMESTAMPED | Missing/ambiguous actual leader |
|---|---:|---:|---:|---:|
| 2016 | 512 | 512 | 44 | 0 |
| 2017 | 512 | 510 | 32 | 1 |
| 2018 | 512 | 512 | 38 | 0 |
| 2019 | 512 | 512 | 37 | 0 |
| 2020 | 512 | 507 | 44 | 5 |
| 2021 | 544 | 544 | 41 | 0 |
| 2022 | 542 | 542 | 48 | 1 |
| 2023 | 544 | 544 | 44 | 2 |
| 2024 | 544 | 544 | 40 | 1 |
| 2025 | 544 | 544 | 32 | 2 |

| Season | Injury rows matched to completed REG game | After kickoff | At/after T75 | QB Out/Doubtful at/after T75 |
|---|---:|---:|---:|---:|
| 2016 | 4928 | 0 | 0 | 0 |
| 2017 | 4949 | 0 | 0 | 0 |
| 2018 | 4961 | 2 | 2 | 0 |
| 2019 | 5202 | 5 | 5 | 0 |
| 2020 | 5414 | 13 | 13 | 0 |
| 2021 | 5348 | 3 | 3 | 0 |
| 2022 | 5433 | 0 | 0 | 0 |
| 2023 | 5451 | 0 | 0 | 0 |
| 2024 | 5954 | 1 | 1 | 0 |
| 2025 | 5783 | 0 | 0 | 0 |

The 2022 matched count5433 reproduces the supplied count. No matched2022 report postdates kickoff in this pinned download, versus the supplied1; importantly, zero QB Out/Doubtful reports are late across2016–2025. Seventeen2022 injury rows belong to the canceled BUF–CIN game and are unmatched to a completed game; retained in raw sources and counted, not silently erased. Source timestamps are modification times, not inferred publication times.

Raw depth-chart coverage2016–2024 is5534rank1QB team-weeks out of5554source team-weeks, not supplied5287/5310. These are source snapshots including bye/postseason records, not played-game coverage; per-season actual table coverage appears above. Source-definition reconciliation remains open. All requested player, injury and chart CSV endpoints returned200, including the 2025 player-stats release rename.

## Supporting regression reproduction

| In-sample model | Supplied n | Reproduced n | Supplied MAE | Reproduced MAE | Team-scoring coefficient |
|---|---:|---:|---:|---:|---:|
| Prior-four scoring |2442|2806|7.761|7.794422|0.404796|
| Plus selected QB prior EPA/attempt |2442|2806|7.642|7.732279|0.290567|

Gain:0.797% versus supplied 1.53%. Convention: 2018-2024 REG;four current-season completedgames;selected QB cumulative earlier2014+EPA/attempt;common complete cases. This does not reproduce the supplied sample or result; request the original row manifest/window definition. It is an in-sample association, not a rigorous upper bound on OOF MAE improvement, proof of causation, or a substitute for the registered gate.

## E-ELO-HFA reproduction and authoritative gate

| Audit reproduction | n | Control MAE | HFA MAE | Control bias | HFA bias |
|---|---:|---:|---:|---:|---:|
| Supplied |2244|10.274800|10.252400|+0.999000|+0.221000|
| Reconciled all-game 2018–2026 sample |2244|10.274796|10.246808|+0.998870|+0.144041|

Both MAEs reproduce within 0.01. The refit bias differs and is disclosed. The2244sample includes 17 games from2026 and playoffs; it is reference evidence only. The actual gate below uses2639REGgames2016–2025, the pinned deployed feature path, calendar repairs and weekly ridge refits. Its unchanged control matches6a0238fc exactly, including every historical feature and point forecast.

| Gate quantity | Control | HFA | Requirement | Result |
|---|---:|---:|---|---|
| Elo margin MAE |10.244657|10.216512|Worsening ≤0.1%|PASS|
| Elo margin bias |+0.876156|+0.020791|Closer to zero|PASS|
| Reliability, squared bin error |0.00242409|0.00056967|Improve in 0.3–0.8|PASS|
| Deployed team MAE |7.574348|7.575629|Worsening ≤0.1%|PASS|

Deployed team-MAE worsening:0.0169%. This is a bias-correction pass, not a team-score accuracy improvement. One HFA mean per outer season from three earlier REG nonneutral seasons; games per parameter and values are in hfa-deployed-gate.json. Neutral venues retain zero HFA. Elo divisor 25, K 20 and reversion are unchanged. Elapsed:3.61 seconds on one worker.

Gate status is PASSED_PENDING_RELEASE under the existing queue policy `automatic_method_promotion=false`. Production remains unchanged; no active fit, historical lock, grade or current board was rewritten. A release must version the new HFA feature history and compatible fit together; merely changing the global65constant would silently reinterpret frozen fits and is not a valid deployment.

## Underlying findings and limitations

The supplied2778 games and1.92home-margin mean reproduce when2026is included: mean1.923326, Elo bias+0.777419. The reported annual2016–2025means reproduce on all game types. OLS slope implies divisor25.532, matching25.5; directMAE minimization has a different optimum28.882. These are different objectives, and neither changes the registered divisor.

The audited win-probability bins are HOME-win probabilities. Uniform positive prediction-minus-observation gaps below0.5 are not overstatement of the away favorite. The site win column is produced by projection_v3.card.project through projection.distribution.summarize, using projected scores and residuals; it is not a direct copy of Elo logistic probabilities. The absence of retained QB adjustment is verified; its value still needs the registered experiment.

E-ELO-QB needs the exact EPA/dropback+CPOE→VALUE formula, scale and no-history rule. engine/elo.py only accepts supplied VALUE and multiplies its difference by 3.3; it does not define that conversion. No invented weights, market values, inaccurate oracle forecast, or out-of-scope candidate was scored. Starter validation disagreement also needs reconciliation, ideally from the independent script/row manifest. Oracle(a) and candidate(b) will follow only once those conditions are resolved.

Least sure: matching the independent audit population and VALUE units. That led to an explicit population reconciliation, a separate authoritative HFA gate, and holding only dependent QB fitting.

Confidence: medium for the HFA bias-correction decision—it holds on authoritative data but depends on defensible HFA-training and reliability conventions. Downgrade to low if the intended reliability metric or audit HFA implementation reverses a gate check. Starter-source availability and recorded arithmetic are verified; no confidence claim is made for an unrun QB candidate.
