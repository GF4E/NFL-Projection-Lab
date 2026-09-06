# NFL prediction engine: completed backtest findings

Private local research report — not for public site publication. September 5, 2026. **The conditional-margin correction failed its frozen research gates.** The saved-score inference and subsequent saved-mean diagnostic are complete and independently checked. These findings do not accept a model or mapping, and the external 5% target remains unmet.

The subsequent split-rate Elo experiment stopped at its registered cost checkpoint. Its [independently checked cost findings](split-rate-cost-findings.md) now govern the next step; the prior prediction results below remain unchanged.

## What changed in the earlier completed prediction test

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

## What the saved means show

The completed diagnostic compared raw N0 and E2 at both retrospective availability delays, using all 3,407 games and every declared partition. Differences below are E2 minus N0 mean squared error, in points squared; negative values favor E2.

| Target / availability | Development difference | Development seasons favoring E2 |
|---|---:|---:|
| Margin / 12-hour | −5.672 | 12/12 |
| Total / 12-hour | +1.521 | 4/12 |
| Margin / 24-hour | −5.567 | 11/12 |
| Total / 24-hour | +1.598 | 5/12 |

Margin means improve broadly, while total means give back some of that benefit. This concerns error and variation in the predicted means, distinct from the within-forecast variance tested by the rejected correction. Exposed 2025 is a material counterexample: E2 improves both margin and total squared error at both delays. Its 24-hour margin result is also slightly worse in the 2022 development season. The pattern is descriptive, not universal or prospective evidence, and it cannot identify optimal update rates.

The pass completed in **8.24 seconds / 410.69 MiB**, within its 120-second/2,048-MiB limits. Six analytical test groups passed before execution. Independent review authenticated 461 logged inputs and all 45 source pins, recomputed every one of the 112 summaries and 56 paired differences, and checked all 27,256 saved squared errors exactly. The maximum summary difference was 5.7e-14, within the declared numerical tolerance. No fitting, forecast transformation, scoring, bootstrap or gain estimation occurred.

The frozen diagnostic acceptance is `49107117071d229dea4be9517ea9a6d1e5dcd2a648fdfa7ea055ee03b693c81b`; its result is `126399b55ddfa374d0ee9ff050b8698c7deab4b1864edf780aed4b56f21f15d0`, with independent review `b8e1512b90505af946e9380a9faad72506ddd2631a951bc760deb6834c93d761`.

## Decision and next test

Retire conditional contraction from the candidate path while preserving its code and negative evidence. The accepted saved-mean pattern warrants a **new tied-versus-split strength/scoring-level Elo update scope**, with exact equivalence to original E2 when rates are tied, correct complete rating histories, prior-data-only selection, immutable controls and full joint-distribution requirements. Design recommendations are not preregistration or execution approval. The previously proposed 27-setting search remains deferred; no gains are selected from these summaries.

The immediate public delivery is limited to the existing front page's Beta label and update date, after focused release verification. The owner's latest instruction keeps research process, milestone summaries, results and diagnostics private; this report and its detailed evidence are not part of that publication. The front-page change does not promote a model, establish prospective performance or authorize live forecasts, new data/provider capture, database migrations, credential inventory or Odds access. This document does not claim the site release is already complete.

The process lesson is to test real interfaces before expensive runs, measure total cost, and remove unsupported complexity. Graph methods remain candidates for dependency and testing improvements when a measured need exists.

## The external 5% target

Success requires at least 5% lower mean joint energy loss against every admitted named external comparator, including the strongest, on the same games and forecast origins. Simultaneous 95% lower bounds must exceed 5%, with the required diagnostics and independent prospective confirmation.

No external comparator is admitted. The [benchmark screen](external-benchmark-screen.md) records unresolved output, archive-timing and rights questions for nfelo, FiveThirtyEight, Massey and PFF, plus the possibility of a separately preregistered, explicitly named model-plus-adapter comparison. No publisher was contacted or forecast data acquired. All history through 2025 is exposed; these results establish neither prospective performance nor product readiness.

## Revision record

- **September 5, 2026:** Added the completed, independently accepted saved-mean diagnostic and its counterexamples; kept the 27-setting search deferred. Applied the owner's latest publication correction: front-page Beta label/date only, with research process and findings private. All prior outcomes and performance requirements remain unchanged.
