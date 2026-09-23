NON-AUTHORITATIVE REPLAY — historical development evidence; not the deployed control or a promotion result.

# Chronological train/test audit

The saved replay predicts later completed NFL games using earlier training games, retaining both team targets together. This independent membership audit passes 2,639 games / 5,278 actual team scores, 175 fitted artifacts and 274,174 training-game membership checks. Each target is absent from its own fit, each fit is available before its forecast, and every training result passes the disclosed kickoff-plus-four-hours chronology proxy. Target scores match the pinned schedule's integer finals. The test population matches the preserved control's game IDs exactly.

| Test season | Initial training games | Test games | Test team MAE |
| --- | ---: | ---: | ---: |
| 2016 | 256 | 256 | 7.1539 |
| 2017 | 512 | 256 | 7.8391 |
| 2018 | 768 | 256 | 7.8773 |
| 2019 | 1,024 | 256 | 7.5141 |
| 2020 | 1,280 | 256 | 7.5706 |
| 2021 | 1,536 | 272 | 7.9862 |
| 2022 | 1,808 | 271 | 7.2456 |
| 2023 | 2,079 | 272 | 7.6126 |
| 2024 | 2,351 | 272 | 7.3798 |
| 2025 | 2,623 | 272 | 7.5708 |
| Pooled | — | 2,639 | 7.5747 |

MAE is points per team on held-out-at-prediction rows, not training error. The initial fit trains only on earlier seasons; earlier results within the test season may enter later scheduled refits. That is sequential testing under the frozen update policy, not a frozen whole-season holdout. Both scores remain grouped by game. Recompute with `python -B work/engine-rebuild/check_train_test.py`; exact replay/control hashes and machine-readable evidence are in train-test-audit.json.

Limits: this checker does not qualify feature vintages, inner tuning, calibration or historical provider availability. No new model was fitted, no statistical gate evaluated, and no production authority transferred. The replay has no qualified own-lineage historical calibration, so this report does not invent CRPS or interval coverage. The first checker attempt compared source numeric strings with numeric targets; normalization corrected that representation error and its failure log is retained. Five focused tests cover grouped targets, future training labels, source representation, fit-at-issuance rejection, duplicate targets and changed finals.

The governing prompt now explicitly requires chronological inner validation, a full test-error table, paired game splits, leakage perturbation tests and prospective evidence. See PROMPT-reviewed-2026-09-22.md section 10. The existing seasons have already informed development; this audit cannot establish independently confirmed future skill.

## Individual prediction-versus-actual scores

The test-score audit exports all 5,278 team rows, with game/team, unrounded prediction, actual integer final, signed error (prediction minus actual), absolute error, fit hash, fit availability, training hash and issuance time. The original membership audit is preserved. Reproduce the new artifact with `python -B work/engine-rebuild/check_test_scores.py`; `test-score-audit/current-ref.json` identifies its immutable summary and compressed CSV by SHA256.

| Saved replay metric | Pooled result |
| --- | ---: |
| Team MAE | 7.5747 points |
| Team RMSE | 9.5161 points |
| Team signed bias | +0.1921 points |
| Margin MAE | 10.2419 points |
| Total MAE | 10.8643 points |
| Projected team-score SD | 2.9385 points |
| Actual team-score SD | 9.9670 points |

The summary contains these measures by season as well. These are NON-AUTHORITATIVE REPLAY results, not live-lineage accuracy, a fitted challenger, or an untouched test. Positive bias means overprediction. SD uses the full reported population. No rounded display value enters scoring. The difference in forecast and outcome dispersion does not by itself establish a model defect.

Five additional fixtures verify hand-calculated fractional errors, CSV precision, game grouping, future-label exclusion and nonfinite prediction rejection. Independent pandas recomputation from the exported CSV agrees across all 99 pooled/annual metric cells within 4.09e-14. Missing own-lineage calibration is explicitly named; interval/CRPS metrics are not fabricated. Matched eligible-game baselines, end-to-end feature/tuning/calibration leakage tests and prospective confirmation remain required by acceptance row 10c, which remains PARTIAL.

Confidence: near-total in the reported membership counts and MAE arithmetic, meaning arithmetic on verified saved rows; lower to high if an independent recomputation differs. Confidence in better future predictions is not established by this audit.
