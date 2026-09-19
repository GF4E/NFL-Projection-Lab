SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

# Projection v2 qualification

Experiment: `projection-v2-172f3e04-a39aa883`. [Immutable experiment](experiment-8191b32772b897ec10dfa13d0f27dd9655589b328a88636377f032c1965c42e0.json). Zero Odds API credits.

## Decision
Adaptive release check: **PASS**. Retained optional groups: **calibration, elo**.

Feature admission is a registered development rule, not a multiplicity-adjusted statistical superiority claim. These historical games were available during earlier v1 work; no untouched holdout is claimed.

## Paired comparison

| Target | Raw football baseline MAE | Adaptive v2 MAE | Improvement |
|---|---:|---:|---:|
| team_points | 8.0034 | 7.7198 | +0.2836 |
| margin | 10.5890 | 10.3431 | +0.2459 |
| total | 11.6104 | 11.1243 | +0.4861 |

Paired games: 2639. Team-MAE improvement 95% week-block interval: [0.2188, 0.3657] points. One-sided 95% lower bound: 0.2303.

## Per-season forecasts and prior-error intervals

MAE columns show team / margin / total. Sigma uses unrounded forecast errors. Interval coverage uses prior seasons only. * means outside nominal by more than 3 percentage points.

| Season | Games | Baseline MAE | V2 MAE | V2 sigma | Margin 50 / 80 | Total 50 / 80 | Prior error years |
|---|---:|---|---|---|---|---|---|
| 2016 | 256 | 7.75 / 9.87 / 11.52 | 7.75 / 9.87 / 11.52 | 9.07 / 12.36 / 13.01 | N/R | N/R | none |
| 2017 | 256 | 8.30 / 11.21 / 12.03 | 8.30 / 11.21 / 12.03 | 10.12 / 14.11 / 14.33 | 48.0% / 75.4%* | 49.2% / 76.6%* | 2016–2016 |
| 2018 | 256 | 8.26 / 10.60 / 11.98 | 8.26 / 10.60 / 11.98 | 10.14 / 13.85 / 14.66 | 53.9%* / 79.7% | 55.5%* / 81.2% | 2016–2017 |
| 2019 | 256 | 8.08 / 10.88 / 11.86 | 7.57 / 10.45 / 10.99 | 9.61 / 13.27 / 13.73 | 49.6% / 75.8%* | 46.9%* / 78.9% | 2016–2018 |
| 2020 | 256 | 8.24 / 10.29 / 12.13 | 7.57 / 9.92 / 11.07 | 9.35 / 12.76 / 13.70 | 50.4% / 82.8% | 48.8% / 80.1% | 2016–2019 |
| 2021 | 272 | 8.41 / 11.69 / 11.72 | 7.99 / 11.26 / 11.06 | 9.84 / 14.20 / 13.56 | 50.0% / 77.2% | 48.2% / 77.2% | 2016–2020 |
| 2022 | 271 | 7.34 / 9.38 / 10.98 | 7.25 / 9.20 / 11.13 | 9.10 / 11.88 / 13.67 | 59.4%* / 85.6%* | 49.1% / 78.2% | 2016–2021 |
| 2023 | 272 | 7.85 / 10.85 / 11.06 | 7.60 / 10.57 / 10.63 | 9.64 / 13.60 / 13.44 | 54.0%* / 78.3% | 54.4%* / 83.1%* | 2016–2022 |
| 2024 | 272 | 7.83 / 10.57 / 11.09 | 7.38 / 10.11 / 10.02 | 9.22 / 13.03 / 12.94 | 53.3%* / 82.7% | 58.1%* / 84.2%* | 2016–2023 |
| 2025 | 272 | 8.01 / 10.55 / 11.83 | 7.57 / 10.25 / 10.92 | 9.41 / 12.82 / 13.64 | 52.9% / 82.4% | 46.7%* / 82.7% | 2016–2024 |

## Feature decisions for future games

| Group | Test seasons | Standalone MAE gain | Decision |
|---|---:|---:|---|
| calibration | 10 | 3.60% | RETAINED |
| efficiency | 10 | 1.14% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| elo | 10 | 1.95% | RETAINED |
| explosiveness | 10 | 0.09% | INACTIVE: FAILED_USEFULNESS_GATE |
| kicking | 10 | -0.09% | INACTIVE: FAILED_USEFULNESS_GATE |
| momentum | 10 | 0.01% | INACTIVE: FAILED_USEFULNESS_GATE |
| pace | 10 | 1.50% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| passing | 10 | 1.00% | INACTIVE: FAILED_USEFULNESS_GATE |
| pythagorean | 10 | 1.37% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| rest_travel | 10 | 0.04% | INACTIVE: FAILED_USEFULNESS_GATE |
| rushing | 10 | 0.87% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| schedule_strength | 10 | 0.07% | INACTIVE: FAILED_USEFULNESS_GATE |
| scoring_composition | 10 | -0.14% | INACTIVE: FAILED_USEFULNESS_GATE |
| target_shares | 0 | N/R | INACTIVE: INSUFFICIENT_OOF_HISTORY |
| turnovers_luck | 10 | 0.24% | INACTIVE: FAILED_USEFULNESS_GATE |
| venue | 10 | 0.35% | INACTIVE: FAILED_USEFULNESS_GATE |
| wind | 3 | 0.36% | INACTIVE: FAILED_USEFULNESS_GATE |

Conditional comparisons refit and retune the complete remaining subset. Detailed paired counts, seasonal improvements and intervals are in the immutable qualification record linked by the experiment. Failing components remain recorded with zero live weight; no source or v1 evidence is deleted.

2016 interval results are unavailable because no earlier OOF season exists. Target shares never acquire an eligible test fold: the first measurements arrive in 2025, after every historical training fold relevant to those measurements. Wind retains its limited 2022–2025 archive qualification; unavailable history is never filled.

## Replay

Verification: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v2_replay.py --verify`

Full offline qualification replay: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v2_replay.py --experiment work/projection-v2/experiment-8191b32772b897ec10dfa13d0f27dd9655589b328a88636377f032c1965c42e0.json --replay`

Least sure: whether a group improved the forecast or merely duplicated another input. Refitted conditional ablations determine the retained set; WHY uses grouped measured contributions and a distinct strongest opposing term.

## Preserved v1 context

[Comparison record](v1-context-013624509343a94094a6a23698d9db34d9f6c98bca673e0bc648353d1f080053.json), 2639 identical games. This does not alter the preregistered release gate.

| Forecast | Team MAE | Margin MAE | Total MAE |
|---|---:|---:|---:|
| V1 historical forecasts | 7.5657 | 10.1703 | 10.9383 |
| V2 adaptive qualification | 7.7198 | 10.3431 | 11.1243 |
| V2 final subset, development only | 7.5732 | 10.2407 | 10.8654 |

V2 qualifies against the raw football baseline. It does not establish superior accuracy to v1. Its adaptive record includes the first three seasons with insufficient prior group-validation history, so those forecasts use the baseline only. The final subset's historical performance is reported separately because choosing that subset used the whole development period.

## Deployed verification

Sites release 188 succeeded. The live API matches all 32 engine game records and the version-separated scorecards. DigitalOcean 159.89.185.88 serves the qualified package; both capture and daily timers are active. The ownership-locked publication probe synchronized shared entries and preserved all four v1 frozen files. No Odds API calls. Evidence: [local verification](verification/local.json), [live API](verification/live-api.json), [cloud](verification/cloud.json), [deployment](verification/deployment.json).

Tests: 33 projection, 214 existing engine, 307 main reader and 426 deployed-site tests pass; the two website suites each retain one pre-existing skipped test. Both builds and typechecks pass. Full offline qualification replay reproduces the registered decisions and forecasts.

[390px card](screenshots/bal-ind-390.png) · [1280px card](screenshots/bal-ind-1280.png).
