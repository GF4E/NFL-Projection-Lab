# NFL prediction engine: completed backtest findings

September 5, 2026. **The conditional-margin correction failed its frozen research gates.** The saved-score inference completed successfully and both independent audits accepted the negative result. No model or mapping is accepted; the external 5% target remains unmet.

## What changed in the latest test

The correction narrowed margins while preserving Elo's predicted means, the complete total-score distribution and the original Poisson background. Evaluation covered all 3,407 games: 3,135 development games from 2013–2024 and 272 separately reported, research-exposed 2025 games.

| Forecast | Development joint energy loss | Improvement versus raw naive N0 | Joint log loss |
|---|---:|---:|---:|
| Raw naive N0 | 8.478405 | Reference | 7.891024 |
| Corrected naive N0C | 8.475790 | +0.0309% | 8.049062 |
| Raw offense/defense Elo E2 | 8.428534 | +0.5882% | 7.882083 |
| Corrected Elo E2C | 8.424137 | +0.6401% | 8.098175 |

Lower losses are better. The correction's incremental energy improvement over E2 is only **0.0522%**. Its block-six simultaneous interval is **−0.0395% to +0.1438%**; all three registered block intervals span zero. Joint log loss worsens by **0.2161 nats per game**. E2C also fails the unchanged 1% research improvement floor versus both raw and corrected naive models, paired uncertainty requirements, and the defense-mechanism test.

All 16 registered interval-mass calibration checks pass. E2's 80% margin coverage changes from 85.01% to 82.62%, compared with 81.23% forecast probability assigned to the corrected interval. Mean width shrinks from 37.14 to 34.88 points. This is useful diagnostic evidence, but better interval coverage did not establish overall predictive improvement.

E2C's exposed-2025 gain versus raw N0 is 1.0432%. It remains a separately reported diagnostic and cannot replace the full development result or serve as prospective confirmation.

## What we retain from the earlier experiment

The original RF-02C backtest also returned independently audited `reject_all`. SRS regressed by 1.063% versus N0, classical Elo by 0.861%, and offense/defense Elo improved by 0.588% with unresolved uncertainty. Removing offense clearly hurt E2; removing defense hurt its point estimate but did not establish a statistically resolved incremental benefit. That does not prove defense is useless.

The earlier diagnosis found margin variance wider than realized errors warranted: E2's squared-error/forecast-variance ratio was 0.835, versus 1.014 for totals. Integer interval boundaries explained part of the nominal overcoverage, but a 3.77 percentage-point margin gap remained after accounting for actual forecast interval probability. Removing dependence narrowed margins, widened totals and scarcely changed energy score. Those findings motivated the now-rejected conditional correction; none guaranteed it would work.

## Execution and verification

RF-02D completed 234 annual receipts and 68,140 mapped scores, then stopped as `protocol_invalid` because a finite NumPy scalar failed a strict built-in-number check. Its complete archive and invalid result remain unchanged.

Separately qualified RF-02E loaded the saved JSON scores and ran the unchanged inference once: **70.82 seconds, 1,230.44 MiB**, within its 600-second/4,096-MiB limits. It made no historical fit, transform, prediction or scoring calls. The earlier implementation qualification passed 14 tests, including the real scorer-to-storage-to-full-bootstrap boundary missed by the original fixtures.

Root verified all six derived artifacts. The numerical auditor checked all 26 complete series digests, 78 partitioned scorecards and 16,860 summary values exactly, verified all 28 gain and 16 calibration-residual points, and reproduced the frozen decision. Bootstrap endpoints were authenticated and inspected, not regenerated. The temporal auditor checked the unchanged source archive, ordering, 234 annual cutoffs, prior-case references, completion and resource evidence. Original historical forecast issuance remains unverified; availability uses the disclosed 12-hour/24-hour retrospective assumptions.

## Decision and next test

Retire conditional contraction from the candidate path while preserving its code and negative evidence. The next frozen step is a small saved-mean diagnostic: raw N0/E2, full/24-hour availability, margin/total, with every development season and exposed 2025 reported. It will compare bias, squared error and prediction–outcome moments without fitting, rescoring or searching parameters. Independent review will determine whether the result warrants a new test of separate strength and scoring-level Elo update rates. The previously proposed 27-setting search remains deferred.

The process lesson is to test real interfaces before expensive runs, measure total cost, and remove unsupported complexity. Graph methods remain candidates for dependency and testing improvements when a measured need exists.

## The external 5% target

Success requires at least 5% lower mean joint energy loss against every admitted named external comparator, including the strongest, on the same games and forecast origins. Simultaneous 95% lower bounds must exceed 5%, with the required diagnostics and independent prospective confirmation.

No external comparator is admitted. The [benchmark screen](external-benchmark-screen.md) records unresolved output, archive-timing and rights questions for nfelo, FiveThirtyEight, Massey and PFF, plus the possibility of a separately preregistered, explicitly named model-plus-adapter comparison. No publisher was contacted or forecast data acquired. All history through 2025 is exposed; these results establish neither prospective performance nor product readiness.
