SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

# E-SCORE registration and control evidence

REVIEW REQUESTED: C02/C03 prior exposure and trend; C04 centering; C05 chronological intercept; C08 definition of systematic bias. See GAP-SWEEP.md for decisions and alternatives. Registration only; challengers have not been fitted.

Next in queue: E-SCORE, ahead of E2. Deadline Tuesday 2026-09-22 06:00 PT.

Preregistration SHA256: 44ae73f41d03bff8a99b3ddbaa1a41a76f457c5dcfcfaeb2ebaee4e2bc12beb9

## Historical control signed total bias
Positive = actual total above projection. Corrected E1 linear control, reused historical development evidence.

| Season | Games | Actual minus projected total |
|---|---:|---:|
| 2016 | 256 | -0.516 |
| 2017 | 256 | -1.258 |
| 2018 | 256 | -0.253 |
| 2019 | 256 | -0.327 |
| 2020 | 256 | +1.252 |
| 2021 | 272 | -1.195 |
| 2022 | 271 | -2.140 |
| 2023 | 272 | -1.381 |
| 2024 | 272 | -0.090 |
| 2025 | 272 | -0.038 |

Equal-season mean -0.595; 95% season-level t interval [-1.268, +0.079]. Systematic level error under preregistered C08: False. This is control evidence only, not a candidate gate decision.

Week 1: 14 AS_ISSUED games, mean total error +6.9079, 7 above our projected total (supplied count 9 not reproduced). Three largest team misses including DET-BUF: [{'game_id': '2026_01_CHI_CAR', 'team': 'CHI', 'error': 33.80953006652543}, {'game_id': '2026_01_GB_MIN', 'team': 'MIN', 'error': 17.487992393671895}, {'game_id': '2026_01_BAL_IND', 'team': 'BAL', 'error': 16.827890122312628}].

No fit, production method, frozen forecast or grade changed. Credits spent: 0.
Least sure: full-season fitted intercept could leak; candidate c uses only the training prefix, with hindsight season means isolated as descriptive evidence.

## Verification

4 evidence/registration tests, 7 governance tests and 218 standing week1 tests passed. Git whitespace and credential/size checks passed. The frozen lock SHA256 was checked before and after evidence generation. Registration verifies all pinned inputs. No candidate comparison or production refit ran.
