# Projection v1 source and implementation status

**Not fitted or deployed.** Numerical claims below come from [experiment.json](experiment.json), produced by `scripts/projection_source_audit.py`. This is not a model performance report.

| Season | REG games in pinned PBP | Plays excluded by garbage filter | Fourth-quarter plays with unknown wp |
|---|---:|---:|---:|
| 2015 | 256 | 5412 | 243 |
| 2016 | 256 | 5151 | 250 |
| 2017 | 256 | 5511 | 247 |
| 2018 | 256 | 5175 | 249 |
| 2019 | 256 | 5519 | 255 |
| 2020 | 256 | 5376 | 246 |
| 2021 | 272 | 5962 | 251 |
| 2022 | 271 | 4968 | 251 |
| 2023 | 272 | 5249 | 259 |
| 2024 | 272 | 5322 | 256 |
| 2025 | 272 | 5346 | 258 |

## Required decision before fitting

The declared 2016–2025 training design cannot obtain Open-Meteo issuance-qualified kickoff forecasts for the entire period. [Provider documentation](https://open-meteo.com/en/docs/historical-forecast-api) says the stitched archive starts around 2022. The existing pinned forecast follow-up specifically records UNAVAILABLE_ISSUANCE_HISTORY; its retrospective stitched values are not qualifying pregame forecasts. No observed-weather substitution has been made. Direct pressure is absent from the pinned PBP schema and needs separate qualified participation data; [nflverse documentation](https://nflreadr.nflverse.com/reference/load_participation.html) distinguishes NGS and FTN sources and the after-season release of FTN participation.

Awaiting whether to authorize a reduced core fit with unavailable terms explicitly inactive or retain the exact full-input requirement. Also awaiting whether Week 1 final reconstructions may be displayed as RETROSPECTIVE, excluded from prospective accuracy. These cannot be presented as original locked forecasts.

## Delivered foundation

- Plan maps every requirement before implementation.
- Per-drive baseline; standardized ridge with deterministic row ordering; additive point contributions.
- Hashed unsmoothed integer residuals, winner probabilities splitting tie mass, central 50/80 intervals.
- Accuracy-only MAE, residual sigma, coverage flags; shared team-points edit immutability.
- Provenance/as-of guard; engine-package separation test. Reader separation and snapshots await implementation.
- Unseeded staff continuity slot and stadium coordinates converted from the existing pinned source.

## Required performance outputs

Per-season team-points/margin/total MAE, sigma and coverage: **NOT RUN**, pending the input policy. No fitted coefficients, valid model version, production projections or screenshots exist for this new package yet. Existing wager grades, model locks, website and workers are unchanged. Odds API credits: zero.
