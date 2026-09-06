# NFL prediction engine: what the completed backtest tells us

September 5, 2026. The complete historical backtest and two independent audits are finished. **No model cleared the frozen research gates.** Distribution diagnosis selected one margin correction for further testing; the external 5% goal remains unmet.

## Forecast performance

The run covered 3,407 games: 3,135 development games from 2013–2024 and 272 separately reported, research-exposed 2025 games. Lower joint energy loss is better.

| Model | Development improvement versus naive baseline |
|---|---:|
| Naive team-score baseline (N0) | Reference |
| SRS strength model (S1) | −1.063% |
| Classical Elo (E1) | −0.861% |
| Offense/defense Elo (E2) | +0.588% |

E2's improvement was below the frozen 1% research threshold, and its simultaneous uncertainty intervals include no improvement. Removing offense clearly worsened performance. Removing defense also worsened the point estimate, but its incremental benefit remains statistically unresolved. This does not establish that defense is useless.

## Why the interval failures need a closer look

E2's nominal 80% margin intervals covered 85.01% of outcomes. Integer score boundaries account for some excess: the forecasts actually assigned those intervals an average 81.24% probability. A separate diagnostic over the full archive still found a 3.77 percentage-point gap between realized coverage and forecast probability. The naive model has a similar 3.19-point gap.

| E2 development diagnostic | Margin | Total |
|---|---:|---:|
| Mean forecast variance | 211.19 | 185.49 |
| Mean squared prediction error | 176.44 | 188.12 |
| Error / variance | 0.835 | 1.014 |

The margin distribution appears wider than its realized errors warrant, while total variance is much closer. These are descriptive comparisons and include errors in the predicted means. The coverage-gap intervals use week/season dependence and remain positive for margins, but are pointwise exploratory intervals, not a new confirmatory result.

Simply removing dependence was already tested. It narrows margins but widens totals, with essentially no energy-score improvement. A blanket spread reduction is therefore not an established fix. All original failures remain recorded.

## The next enhancement to qualify

Independent review chose one change to the enhanced-Elo score mapping: contract the empirical margin distribution while preserving the predicted mean scores, the full total-score distribution and the existing Poisson background. Keeping that background matters because possible shutouts and blowouts must retain positive probability.

The finite transformation, complete distribution adapter, calibration-case bridge and independence control passed scoped independent review, with 48 synthetic tests passing. Statistical and temporal reviewers also accepted the historical protocol: 20 mapped series, 28 paired comparisons and 16 calibration cells. Numerical archive admission has now passed: all 68,140 original distributions and 56,430 prior-only cases validated within budget, with scoped independent reviews accepted. The pure chronological replay functions are also independently accepted; all 84 combined tests pass. Next qualify the integrated historical caller, the 520 predetermined identity metric checks and full runner/inference before historical fitting or successor scoring. Each series' annual contraction parameter must use eligible prior-year forecasts only; 2025 outcomes are excluded from calibration. No historical parameter or successor prediction has been fitted. Proper-score evaluation can still reject this proposal, and the variance gap is not a promised energy-score gain.

A separate idea—giving Elo strength and scoring level different learning rates—was documented and deferred. Testing both changes together would obscure which one mattered. The accepted historical design and numerical admission now await executable replay, identity and runner/inference qualification, with every prior failed result preserved.

## The external 5% target

The target means at least 5% lower mean joint energy loss against every member of a disclosed eligible comparator set, including its strongest model, on the same games and forecast cutoffs. Simultaneous 95% lower bounds must exceed 5%, with calibration and other required checks plus prospective confirmation.

A public-documentation screen examined nfelo, FiveThirtyEight, Massey and PFF. None was admitted: native joint-score output, contemporaneous archive evidence or applicable rights remain unresolved. A transparently named, preregistered model-plus-adapter comparison is another possible route; it cannot silently be labeled native model performance. See [the documented benchmark screen](external-benchmark-screen.md) for primary-source links and exact gaps. No publisher was contacted and no forecast data was acquired.

## Verification and limits

Root verified 1,909 archived files. Independent quantitative review reproduced the scorecards and frozen decision; separate temporal review checked delayed updates, annual selection, ancestry and falsification. The additional interval-mass diagnostic recovered saved forecasts without fitting or rescoring, took 24 seconds, and preserved all 16 model/target combinations.

Historical availability still uses disclosed 12-hour/24-hour proxies. All history through 2025 is exposed. None of this establishes a prospective forecast, production-ready model or external 5% advantage.
