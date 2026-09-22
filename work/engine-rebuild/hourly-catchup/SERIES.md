# SERIES — hourly catch-up reconstruction

**NON-AUTHORITATIVE. No statistical gate or production activation.**

Generated 2026-09-22T22:00:57.777377+00:00. Replay: `work/engine-rebuild/hourly-catchup/replay-7560f2b2c85f7971c8ee3ac95fc1bc27d27cbcff052500a17ef532ba9eb877c0.json.gz`, SHA256 `7560f2b2c85f7971c8ee3ac95fc1bc27d27cbcff052500a17ef532ba9eb877c0`.
Code: shared cutoff preparation, approved Elo/efficiency state and calibration/Elo ridge with fixed penalty 10. Weights refit from retained pregame rows. Each forecast identifies its own exact fit hash; there is no single fit for the series. Checkout `f5f1de493b0c6f42954dc924b92e1d07aeacd1d7`; exact source bytes are hash-verified in `source-ref.json`.

The host learning timer is Tuesday 06:00 Pacific; the job named daily dispatches hourly. The replay keeps those policies separate from Friday/Monday/Tuesday assimilation. Historical source arrival, closeout publication and calculation latency are simulated, not observed. Final/PBP availability is assumed at kickoff plus four hours and the fit becomes available ten minutes after dispatch. The preserved HFA deployed-lineage series remains the sole authoritative control until the corrected issuing path is qualified and activated.

| Season | Games | Team MAE | Bias (projection − actual) | Actual-on-projected slope | Projected SD | Catch-up refits | Changed vs strict Tuesday |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2016 | 256 | 7.153935 | +0.185099 | 1.018135 | 2.660051 | 0 | 0 |
| 2017 | 256 | 7.839094 | +0.453988 | 0.778011 | 2.784408 | 0 | 0 |
| 2018 | 256 | 7.877312 | +0.082828 | 0.940535 | 2.779190 | 0 | 0 |
| 2019 | 256 | 7.514145 | -0.029724 | 1.158976 | 2.992597 | 0 | 0 |
| 2020 | 256 | 7.570630 | -0.539090 | 1.001745 | 3.096983 | 3 | 45 |
| 2021 | 272 | 7.986227 | +0.481704 | 1.028291 | 3.119241 | 1 | 16 |
| 2022 | 271 | 7.245634 | +0.901591 | 0.778805 | 2.591697 | 0 | 0 |
| 2023 | 272 | 7.612627 | +0.493641 | 1.010756 | 2.664856 | 0 | 0 |
| 2024 | 272 | 7.379825 | -0.084753 | 1.130914 | 2.943814 | 0 | 0 |
| 2025 | 272 | 7.570832 | -0.069201 | 1.024126 | 3.120629 | 0 | 0 |
| Pooled | 2639 | 7.574666 | +0.192097 | 1.010819 | 2.938524 | 4 | 61 |

Population SD; slope includes an intercept. All games retain paired team rows. No historical probability/interval scores are claimed: own-lineage calibration warmup remains unqualified.

Verified 2639 forecast cutoffs; early/duplicate observations: 0. Feature maximum difference from the earlier cutoff renderer: 0.0. Reversed-row refits: 175; exact point difference: 0.0. Independent augmented-solve maximum coefficient difference: 2.09e-14; point difference: 3.55e-14.

Forecasts within the assumed zero-to-ten-minute fit latency window: 0. An empty set establishes invariance between those two latency endpoints for this replay; it does not establish historical provider arrival, compute or publication time.

Replay duration 796.29 seconds; peak resident bytes 1323417600. One worker; 45-minute and 4-GiB ceilings. No provider requests or new spending.

Confidence: high in the shared numerical chronology behavior tested across all ten seasons and alternate row order, with an independent solve. Lower to medium if qualified source vintages or a production dispatch trace changes the eligible set. Full production readiness and improved predictive accuracy are unproved.
