# Saved-mean diagnostic: Elo strength versus scoring level

September 5, 2026. The completed, independently checked diagnostic warrants a **new tied-versus-split Elo update hypothesis**. It does not identify optimal rates or authorize the previously deferred 27-setting search.

## What the complete development sample shows

Squared error is in points squared; lower is better. Differences below are E2 minus N0 on the same games.

| Target / availability | N0 mean squared error | E2 mean squared error | Difference | Development seasons favoring E2 |
|---|---:|---:|---:|---:|
| Margin / 12-hour | 182.112 | 176.440 | -5.672 | 12/12 |
| Total / 12-hour | 186.600 | 188.121 | +1.521 | 4/12 |
| Margin / 24-hour | 182.228 | 176.661 | -5.567 | 11/12 |
| Total / 24-hour | 186.728 | 188.326 | +1.598 | 5/12 |

Margin prediction improves broadly, while total prediction gives back some of that benefit. E2's existing development calibration slopes are 1.054 for margin and 0.671 for total (24-hour: 1.048 and 0.664). N0's corresponding full slopes are 1.636 and 0.979. These are previously computed descriptive regression coefficients, quoted without new fitting or uncertainty analysis. They are not optimal learning rates.

In full-availability development, E2's total predictions have variance 14.250 and covariance with observed totals 9.568, versus N0's 6.680 and 6.537. The difference concerns variation in the predicted means, not the within-forecast score variance tested by the rejected margin correction.

Exposed 2025 is a material counterexample: E2 improves both margin and total squared error at both availability delays. In 2022, the 24-hour E2 margin result is slightly worse. The pattern is therefore useful for forming a hypothesis, not a universal or prospective finding.

## Every declared partition

Negative values favor E2. All seasons are shown; no favorable subset was selected.

| Partition | Margin, 12h | Total, 12h | Margin, 24h | Total, 24h |
|---|---:|---:|---:|---:|
| development | -5.672 | +1.521 | -5.567 | +1.598 |
| 2013 | -11.398 | +2.569 | -10.805 | +3.747 |
| 2014 | -4.928 | -1.952 | -5.419 | -1.508 |
| 2015 | -5.982 | +4.837 | -5.995 | +4.778 |
| 2016 | -5.008 | -4.423 | -5.194 | -4.407 |
| 2017 | -7.130 | +6.718 | -7.254 | +6.669 |
| 2018 | -2.368 | -5.837 | -2.405 | -5.994 |
| 2019 | -6.271 | -1.339 | -6.152 | -1.653 |
| 2020 | -3.184 | +10.333 | -2.767 | +10.323 |
| 2021 | -6.022 | +1.921 | -5.505 | +2.125 |
| 2022 | -0.078 | +3.791 | +0.676 | +3.980 |
| 2023 | -5.723 | +1.454 | -5.388 | +1.292 |
| 2024 | -10.010 | +0.115 | -10.653 | -0.218 |
| exposed 2025 | -4.340 | -2.302 | -4.114 | -2.082 |

## Verification and decision

The sole pass covered all 3,407 games and 13,628 original saved rows: eight cells across fourteen partitions, producing 112 moment summaries and 56 paired differences. It completed in **8.24 seconds / 410.69 MiB**, within the frozen 120-second/2,048-MiB limits. All 27,256 saved squared errors matched exactly; native failure counts were zero and every game was retained.

Six analytical test groups passed before execution. Independent review reauthenticated 461 logged inputs, all 45 frozen source pins and original ordering, then recomputed every summary and paired difference. Maximum cell discrepancy was 5.7e-14, inside the declared 1e-12 relative / 1e-9 absolute roundoff tolerance. Pooled development moments include the required between-season variance/covariance terms. No model fitting, prediction transformation, scoring or bootstrap occurred.

Prepare a new hypothesis that separates relative team-strength and scoring-level Elo updates, with common inputs and score mapping. Require exact tied-case equivalence, a finite training-only selection rule, fair archived controls, bounded computation and independent qualification before any historical fit. No gain value is selected from these summaries. The full joint-energy, calibration and log-loss requirements still apply; better mean error alone cannot accept a model. The external 5% and prospective requirements remain unmet.
