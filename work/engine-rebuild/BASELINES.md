NON-AUTHORITATIVE REPLAY — historical development evidence, not the deployed control or a promotion decision.

REVIEW REQUESTED — Tier 2: the venue comparator uses prior-season non-neutral home/away averages, with the league mean for neutral games. An expanding multi-season venue average is a defensible alternative; this descriptive comparison does not select a venue feature.

# Matched test-score benchmarks

The saved engine forecasts and three simple benchmarks are evaluated on exactly 2,639 completed games / 5,278 integer team scores from 2016–2025. Each engine forecast is absent from its own fit; every benchmark uses only results eligible before that forecast’s scheduled state cutoff. Zero test games are dropped. All team histories contain at least four games; no fallback is needed. The 46 neutral fixtures contribute 92 team targets.

Expected points remain fractional regression outputs. Final scores are integer labels. We measure distance from the actual points rather than treating every exact-score miss as a classification error. Team MAE is primary; a coin flip is not a team-score benchmark. The production weekly refit policy is sequential: an earlier test result may enter a later fit, never its own forecast. Settings must still be chosen on earlier validation data.

| Forecast | Team MAE | Team RMSE | Team bias | Margin MAE | Total MAE | Forecast SD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Saved replay | 7.5747 | 9.5161 | 0.1921 | 10.2419 | 10.8643 | 2.9385 |
| Prior-season league average | 7.9767 | 9.9989 | -0.0091 | 11.1338 | 11.0537 | 0.8665 |
| Prior-season venue average | 7.9404 | 9.9604 | 0.0056 | 11.0010 | 11.0497 | 1.2914 |
| Team last-four-game average | 8.2677 | 10.3994 | 0.0018 | 11.3506 | 11.8694 | 5.9388 |

All errors are points; bias is prediction minus actual. Actual team-score SD is 9.9670. Forecast dispersion is not forced to equal outcome dispersion.

| Test season | Games | Replay MAE | League MAE | Venue MAE | Last-four MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2016 | 256 | 7.1539 | 7.5271 | 7.4661 | 7.9082 |
| 2017 | 256 | 7.8391 | 8.1631 | 8.1046 | 8.6343 |
| 2018 | 256 | 7.8773 | 8.2423 | 8.1547 | 8.3872 |
| 2019 | 256 | 7.5141 | 8.1123 | 8.2036 | 8.2598 |
| 2020 | 256 | 7.5706 | 8.0535 | 8.0477 | 8.3921 |
| 2021 | 272 | 7.9862 | 8.5611 | 8.5628 | 8.5165 |
| 2022 | 271 | 7.2456 | 7.4489 | 7.4235 | 7.7924 |
| 2023 | 272 | 7.6126 | 7.8717 | 7.7603 | 8.4577 |
| 2024 | 272 | 7.3798 | 7.8731 | 7.8192 | 8.1186 |
| 2025 | 272 | 7.5708 | 7.9242 | 7.8757 | 8.2224 |

The saved replay has lower observed team MAE than each of these three benchmarks in all ten seasons. Pooled differences are −0.4020 points versus league average, −0.3657 versus venue average and −0.6930 versus last-four scoring. Those are descriptive differences on reused historical data, not confidence intervals, independent confirmation, causal explanations or evidence that a new candidate has passed a gate. No new model was fitted or promoted.

## Reproduction and safeguards

The plan and convention sweep were written before the comparison in BASELINES-PLAN.md. The league window follows the September 21 audit; the last-four convention follows scripts/e1_evaluate.py. Both use means, without tuning their windows to these results. Eligibility uses Eastern-source kickoff plus four hours strictly before the Fri/Mon/Tue cutoff; historical provider-vintage availability is unrecorded. Neutral-site history is excluded only from the venue role averages, not from the scoring population. Franchise aliases preserve histories across relocation.

Run `python -B work/engine-rebuild/check_score_baselines.py`, then `python -B work/engine-rebuild/verify_score_baselines.py`. The latter independently reconstructs all three forecasts from source scores using pandas and compares the exported full-precision values, source-history identities, paired errors and annual/pooled metrics. It does not call the primary prediction or metric helper.

- Twelve new focused tests plus ten existing train/test checks pass. They exercise exact arithmetic, future/target-label exclusion, strict cutoff equality, rescheduling, neutral fixtures, aliases, sparse histories, duplicate targets, invalid scores, chronology and paired populations.
- Independent recomputation verifies 15,834 predictions and the same number of history identities; prediction differences are zero. All 649 metric/count cells agree within 1.6e-13.
- The first independent verification failed because source season strings were not normalized to numeric years; that failure log is preserved. Explicit numeric parsing and empty/nonfinite guards corrected the verifier; no baseline, source row or scoring gate changed.
- Reversing the complete schedule and target order preserves every baseline prediction and history hash (see score-baselines-row-order.json).

Exact summary: `work/engine-rebuild/score-baselines/e4b3ac05a662597ddeec2d3a8226ea69fb0d740e07688bc156d831548487907e.json`, SHA256 `e4b3ac05a662597ddeec2d3a8226ea69fb0d740e07688bc156d831548487907e`. Exact CSV: `work/engine-rebuild/score-baselines/21f77522f77a354683190c75d5839d65898f83928b845a7798152cd8686c6315.csv.gz`. Source, checker and pre-comparison plan hashes are recorded in the summary.

## Limits and next work

The saved replay is not the authoritative issuing series. Existing historical seasons have already informed development; they are not a pristine final test. Full-pipeline feature construction, inner tuning and calibration leakage qualification, own-lineage probability calibration, authority migration and prospective confirmation remain open. Consequently interval coverage, CRPS and interval scores are explicitly unavailable here, not zero. This is a descriptive training/test audit, not a weekly or registered experiment report; it creates no market diagnostic, candidate or selection criterion.

This increment strengthens requirement 10c, which remains PARTIAL. Resume the public closeout/Season verification adapter and reviewed training migration, then the remaining recovery, deployment, calibration/venue experiments, real reviewer decisions and observed-live-cycle requirements. Durable storage authorization remains pending; no spending or production numerical change occurred.

Research: [chronological cross-validation](https://otexts.com/fpp3/tscv.html), [simple benchmarks](https://otexts.com/fpp3/simple-methods.html), and [point forecast accuracy](https://otexts.com/fpp3/accuracy.html). These support the evaluation design; the exact NFL windows are disclosed repository conventions.

Least certain: historical source availability and whether performance survives genuinely future games; neither can be established by repeated analysis of the same archive.

Confidence: near-total in the counts and error arithmetic, meaning arithmetic on hash-verified rows independently reconstructed through a second numerical route; lower to high if independent reproduction on those rows differs. This rating does not assert production readiness or improved future accuracy.
