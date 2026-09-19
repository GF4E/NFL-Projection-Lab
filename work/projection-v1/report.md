SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

# Projection v1 — fitted football scores

Version: `projection-v1-67c39f9a-2e58a851`. Evidence: [experiment.json](experiment.json). No Odds API credits spent.

2016–2025 regular-season rolling-origin forecasts; each season fits earlier seasons. Penalty and decay use earlier out-of-fold team-score MAE only. Final fit freezes the selected settings. All numbers below come from the experiment record above.

## Per-season point accuracy

| Season | Games | Team MAE | Team sigma | Margin MAE | Margin sigma | Total MAE | Total sigma |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 256 | 7.29 | 9.27 | 9.40 | 12.08 | 11.11 | 14.02 |
| 2017 | 256 | 7.82 | 10.02 | 10.60 | 13.87 | 11.42 | 14.48 |
| 2018 | 256 | 7.84 | 9.92 | 10.41 | 13.60 | 11.17 | 14.49 |
| 2019 | 256 | 7.66 | 9.70 | 10.64 | 13.37 | 11.01 | 13.88 |
| 2020 | 256 | 7.72 | 9.47 | 9.99 | 12.83 | 11.21 | 13.84 |
| 2021 | 272 | 7.98 | 9.83 | 11.23 | 14.28 | 11.15 | 13.53 |
| 2022 | 271 | 7.21 | 9.01 | 8.99 | 11.76 | 11.16 | 13.65 |
| 2023 | 272 | 7.41 | 9.43 | 10.39 | 13.51 | 10.23 | 13.14 |
| 2024 | 272 | 7.35 | 9.19 | 9.95 | 13.03 | 10.25 | 12.99 |
| 2025 | 272 | 7.40 | 9.22 | 10.13 | 12.73 | 10.75 | 13.35 |

## Coverage

Coverage uses the pooled empirical integer OOF residual distribution. This is descriptive calibration, not a prospective interval-validation result. An asterisk flags more than three percentage points from nominal.

| Season | Margin 50% | Margin 80% | Total 50% | Total 80% |
|---|---:|---:|---:|---:|
| 2016 | 52.3% | 85.5%* | 51.2% | 82.0% |
| 2017 | 53.1%* | 79.3% | 50.4% | 77.3% |
| 2018 | 54.7%* | 79.7% | 54.7%* | 81.6% |
| 2019 | 52.3% | 77.3% | 53.5%* | 80.5% |
| 2020 | 51.2% | 80.1% | 52.0% | 82.0% |
| 2021 | 47.8% | 78.3% | 46.7%* | 81.6% |
| 2022 | 56.8%* | 84.9%* | 50.9% | 81.5% |
| 2023 | 53.3%* | 78.3% | 55.5%* | 84.6%* |
| 2024 | 53.7%* | 81.2% | 57.4%* | 84.2%* |
| 2025 | 52.9% | 80.9% | 50.0% | 83.8%* |

## Inactive inputs

| Input | Weight | Status | Reason |
|---|---:|---|---|
| career_fg_long | 0 | INACTIVE | No qualifying training observations |
| career_fg_medium | 0 | INACTIVE | No qualifying training observations |
| career_fg_short | 0 | INACTIVE | No qualifying training observations |
| continuity | 0 | INACTIVE | Staff history unseeded |
| elo_qb_adjustment | 0 | INACTIVE | ANY/A values exist but historical pregame starter availability is unqualified |
| pressure_allowed | 0 | INACTIVE | No qualifying training-history pressure series |
| pressure_generated | 0 | INACTIVE | No qualifying training-history pressure series |
| qb_backup | 0 | INACTIVE | Pregame starter history unqualified |
| qb_career_starts | 0 | INACTIVE | Pregame starter history unqualified |
| qb_cpoe | 0 | INACTIVE | Pregame starter history unqualified |
| qb_epa | 0 | INACTIVE | Pregame starter history unqualified |
| referee | 0 | INACTIVE | Week 5 positive study absent |

## Wind and limited history

Wind: PARTIAL_HISTORY. Final weight -0.098661 team points per mph, fit to 1472 team rows in the 2022–2025 archive. Pre-2022 rows never enter that fit. Historical stitched forecasts do not establish the exact pregame issuance. Live forecasts retain request, availability and valid-hour timestamps and raw hashes. Beyond the available forecast horizon, wind stays inactive with no replacement value.

TE/RB target-share history is roster-backed from 2025; earlier missing rows contribute zero. Inactive QB slots mean base Elo is used and its QB adjustment contributes zero. Continuity and referee slots remain unseeded/disabled.

## Reproduction

Named immutable fit: `work/projection-v1/fit-f6cc53cee92c3375ffd8c116c42487ebbed8653cb0265d7b536cb42104df8a97.json` (`f6cc53cee92c3375ffd8c116c42487ebbed8653cb0265d7b536cb42104df8a97`).

Verification: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_replay.py --verify`

Offline replay: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_replay.py`

## Review

Least sure: forecast-history issuance qualification. Kept wind PARTIAL_HISTORY, omitted unavailable live measurements, and separated retrospective reconstructions and descriptive coverage from as-issued accuracy.

## Deployment and verification

Live: https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/sunday . Sites release 187 succeeded. All 32 API game records match the engine artifact; all 16 Week 2 cards show the three projection tiles and Against text. Cloud football preparation, entry sync and publication passed. 19 projection tests and 214 existing engine tests passed; main 304 and Sites 423 tests passed, with one pre-existing skipped test in each website suite. Both builds and typechecks passed. See experiment.json and verification/ for receipts.

Screenshots: [390px](screenshots/bal-ind-390.png), [1280px](screenshots/bal-ind-1280.png).
