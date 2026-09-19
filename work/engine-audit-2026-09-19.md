# Independent engine audit, 2026-09-19

Executed by Claude against GF4E/NFL-Projection-Lab engine-v2 at ed5a2009. Every number below is recomputed from per-game rows in the repository. None is copied from a Codex report.

## Headline

1. The deployed engine has under-projected scoring in every season since 2016, by 2.84 points per team and 5.7 per game. Week 1's 6.9-point total miss and the Thursday BUF 41 miss are the ten-year average appearing live, not a 2026 environment shift.
2. The deployed engine is severely compressed: projected team points have a standard deviation of 1.5 to 2.0 against an actual of 10. The regression slope of actual on projected runs 1.0 to 2.0 by season.
3. Two simple, rolling-origin corrections fit only on prior seasons reduce out-of-fold team MAE by 3.2 to 3.4 percent, with paired-bootstrap 95 percent intervals entirely below minus 2.2 percent, improving 9 of 9 seasons. Both clear the 1 percent gate by a wide margin. This is a measured result on the engine's own rows.
4. The governance replay used to gate E1 and E-UNC is not the deployed model. Its control has team MAE 7.57 and bias plus 0.30; the deployed-model series has MAE 8.00 and bias minus 2.84, and the 2026 as-issued record (MAE 8.43, bias minus 3.45, projected SD 1.98) matches the deployed series, not the replay. Four experiments were gated against a control that does not have the defect production has.
5. An EMOS post-processor already exists in the repository at engine/forecast_system/postprocess.py, schema forecast-system-v2-emos-1. It is not applied on the deployed projection-v3 path. The fix was built during the exploratory Phase A and never registered or promoted because the queue put E1 ahead of it.

## Section 1. Reconciliation

| Series | Source file | Games | Team MAE | Signed bias | Projected SD |
|---|---|---|---|---|---|
| Deployed-model OOF, projection-v3 baseline | work/projection-v3/baseline-oof-bb7a7f0a.json | 2,639 | 8.003 | −2.84 | 1.5 |
| Governance replay control, E1 linear | work/projection-governance-v2/e1-calendar-corrected/oof.json | 2,639 | 7.572 | +0.30 | 3.0 |
| 2026 as-issued, projection-v3 grades | outputs/projection-v3/grades/2026_*.json | 14 | 8.43 | −3.45 | 1.98 |
| v2 Phase A core OOF | work/projection-v2/phase-a/core-oof.json | 2,639 | 7.871 | −3.03 | |

The reported 7.5716 is the replay control. The deployed model is the 8.00 series. Codex's own E1 report, line 141, states the replay "can differ from the originally issued version." That difference is 0.43 points of MAE and 3.1 points of bias, and every gate decision so far has been made on the wrong side of it.

## Section 2. Sequential decomposition, deployed-model OOF 2016 to 2025

| Step | Source removed | Team MAE after | Share of raw MAE explained |
|---|---|---|---|
| 0 | none | 8.003 | |
| 1 | league level by season | 7.723 | 3.5% |
| 2 | compression, actual on projected | 7.682 | 0.5% |
| 3 | home field residual | 7.646 | 0.5% |
| 4 | early-season blend | 7.642 | 0.0% |

Slope of actual on projected by season, 2016 to 2025: 1.68, 1.04, 1.07, 1.95, 1.22, 1.51, 1.15, 1.65, 1.94, 1.96. All above 1. Residual home bias after level and compression: home −0.91, away +0.91, so the fitted home field is about 1.8 points too small. Week 1 to 5 MAE 7.60 versus Week 6 onward 7.66: the early-season blend is not a measurable source of error, which is consistent with E1's rejection.

The predictability-floor estimate in the prompt was computed incorrectly in this run (the pairing key matched teams within a game rather than rematches) and is withdrawn. The E-UNC decomposition stands as the floor reference for now.

## Section 3. Rolling-origin fixes, fit on prior seasons only

| Fix | Team MAE | Raw | Change | 95% paired bootstrap | Seasons improved | Bias after |
|---|---|---|---|---|---|---|
| A. League level, prior-two-season mean bias, additive | 7.773 | 8.030 | −3.20% | [−4.19, −2.22] | 9 of 9 | +0.04 |
| B. EMOS, actual = a + b × projected, all prior seasons | 7.757 | 8.030 | −3.40% | [−4.44, −2.33] | 9 of 9 | +0.21 |
| C. A then B | 7.757 | 8.030 | −3.40% | [−4.44, −2.33] | 9 of 9 | +0.21 |

B subsumes A: the intercept absorbs the level. On the governance replay control the same fixes do nothing (−0.06% and −0.05%, intervals spanning zero), which is expected because that series has no level defect. This is the direct evidence that the replay and the deployed model are different objects.

## Section 4. Benchmark on identical games, 2021 to 2025, n = 1,177

| Model | Margin MAE | Total MAE | Total bias |
|---|---|---|---|
| Deployed engine OOF | 10.563 | 11.390 | −5.19 |
| Deployed engine plus fix A | | 10.847 | +0.20 |
| nfelo pure model, pre-regression, football only | 10.041 | not published | |
| nflverse closing line, audit reference only | 9.787 | 10.370 | |

nfelo's football-only number beats the deployed engine on margin by 5 percent. The closing line beats it by 7 percent on margin and 9 percent on total. Fix A alone closes half the total gap to the closing line. The sign conventions were verified: nflverse spread_line is the home margin, nfelo home_line is negative when home is favored.

## Section 5. Largest misses, 2025 OOF

The ten largest team-point misses are all under-projections of 40-plus-point team scores, ranging from −23.7 to −30.4. Fix C, fit on 2016 to 2024, reduces all ten, by 3 to 4 points each. None is fully closed; games where a team scores 45 to 52 sit beyond any level correction and are the tail the intervals exist for. In 2026 the pattern repeats: BAL 41, CHI 59, BUF 41, all under-projected. Cause class for all thirteen: level plus compression, not stale inputs, not chronology.

## Section 6. Code against the citations

Gneiting, Raftery, Westveld and Goldman 2005, EMOS: implemented at engine/forecast_system/postprocess.py as a prior-three-season CRPS-fit layer, schema forecast-system-v2-emos-1. Not applied in the deployed projection-v3 path. Divergence: the correct method exists and is disconnected from production.
Glickman and Stern 1998, state-space: implemented and tested under E1; correctly constrained after the rank-deficiency fix. No divergence.
WEPA: not implemented; queued as E-WEPA. No divergence yet.
Benz, Bliss and Lopez 2024, home field: the deployed HFA is about 1.8 points below what the residuals indicate. Divergence in magnitude, not method.

## Section 7. What goes to Codex

One experiment. The evidence supports one, not three, because the level and compression corrections are the same fix and together explain the dominant error, and the next-largest source, home field at 0.5 percent, is inside the noise of a single experiment.

The count is one because everything else measured here either failed to clear 1 percent (blend, home field) or is already queued with its own registration (WEPA, opponent adjustment).

### E-POST: post-processing on the deployed model

Control: the deployed projection-v3 path exactly as it issues today.
Candidate (a): additive league-level correction, the mean signed error over the prior two completed seasons, applied to every team projection. Candidate (b): EMOS, actual = a + b × projected, fit on all prior seasons, applied forward, with the dispersion scale on the predictive distribution fit by CRPS per Addendum C, using the existing postprocess.py connected to the deployed path. Candidate (c): (b) plus a home-field offset fit on prior-season residuals. Prefer the simpler on ties.
Numbers Codex must reproduce before fitting anything new: control team MAE 8.003 on the 2,639-game deployed OOF series; candidate (b) 7.757 rolling-origin, −3.40 percent, interval [−4.44, −2.33], 9 of 9 seasons improved. If the reproduction differs by more than 0.02 MAE, stop and reconcile the series before proceeding.
Gate: standard, 1 percent team MAE, coverage within 3 points. The measured result clears it by more than three times the margin.
Disproving condition: the reproduction on the deployed series does not show the negative bias, meaning the deployed model is not the 8.00 series and the reconciliation in Section 1 is wrong.

### Governance correction, not an experiment

Every future experiment is gated against the deployed model's rolling-origin series, not the expanding-refit replay. The replay control is retained as a diagnostic and labeled REPLAY. The E1 and E-UNC rejections stand as valid comparisons within the replay but are annotated as not tested against production. Any candidate rejected under the replay may be re-registered once against the deployed series.