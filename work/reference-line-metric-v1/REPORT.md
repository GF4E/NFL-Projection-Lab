# Reference-line audit: reproduction and reconciliation

STATUS: PAUSED FOR LINEAGE RECONCILIATION. This report compares authoritative released-HFA 66a3a60c with superseded pre-HFA 6a0238fc. The supplied figures reproduce on the latter. Weekly and experiment-report rollout has not been activated because two current-HFA bucket differences exceed the requested 0.5-percentage-point tolerance.

## Reproduction

| CLOSE metric | Supplied | Pre-HFA reproduction | Current authoritative HFA |
|---|---|---|---|
| ATS | 1302/2574; 50.58%; [48.7, 52.5] | 1302/2574 · 50.58% [48.65, 52.51] | 1301/2574 · 50.54% [48.61, 52.48] |
| Total | 1285/2618; 49.08%; [47.2, 51.0] | 1285/2618 · 49.08% [47.17, 51.00] | 1285/2618 · 49.08% [47.17, 51.00] |
| ATS [4,5) | 44.1% | 113/256 · 44.14% [38.06, 50.22] | 117/262 · 44.66% [38.64, 50.68] |
| ATS [5,6) | 56.6%; [48.7, 64.5] | 86/152 · 56.58% [48.70, 64.46] | 84/151 · 55.63% [47.70, 63.55] |

The reproduction table uses the normal/Wald interval that reproduces the supplied 5-point interval. Full tables below use [Wilson 95% intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). No interval changes a gate. Buckets use floor of absolute full-precision disagreement. Actual pushes are excluded (65 spread, 21 total); there are no exact projection-on-line exclusions in either series.

## OPEN source coverage

| Season | Registered games | OPEN spread | OPEN total |
|---|---:|---:|---:|
| 2016 | 256 | 0/256 (0.0%) — MISSING | 0/256 (0.0%) — MISSING |
| 2017 | 256 | 0/256 (0.0%) — MISSING | 0/256 (0.0%) — MISSING |
| 2018 | 256 | 0/256 (0.0%) — MISSING | 0/256 (0.0%) — MISSING |
| 2019 | 256 | 0/256 (0.0%) — MISSING | 0/256 (0.0%) — MISSING |
| 2020 | 256 | 0/256 (0.0%) — MISSING | 0/256 (0.0%) — MISSING |
| 2021 | 272 | 224/272 (82.4%) | 0/272 (0.0%) — MISSING |
| 2022 | 271 | 238/271 (87.8%) | 0/271 (0.0%) — MISSING |
| 2023 | 272 | 238/272 (87.5%) | 0/272 (0.0%) — MISSING |
| 2024 | 272 | 239/272 (87.9%) | 228/272 (83.8%) |
| 2025 | 272 | 238/272 (87.5%) | 238/272 (87.5%) |

OPEN spread: 1,177/1,359 games in 2021–2025 (86.6%), or 44.6% of the full ten-season population. OPEN total: 466/1,359 (34.3%), or 17.7% of all games; available only in 2024–2025. These are coverage counts before pushes, not accuracy denominators.

Source qualification only: opening-reference performance is not advanced past the reproduction stop. Proposed spread source is nfelo output_data/historic_projected_spreads.csv, consistent with the existing repository reference. Totals use only nfelo_games.csv total_line_open. No CLOSE fallback. The two files disagree on 330 overlapping opening spreads; both snapshots and the complete conflict list are pinned. Seven duplicate game IDs in the historic file agree on their opening spread and are deduplicated by game. Source URLs, timestamps and hashes are in open-source-receipts.json.

Against nflverse CLOSE, this OPEN spread snapshot moves 1.1181 points on average; 48.51% move at least one point. The supplied 1.17 mean is not exactly reproduced. Opening references do not establish the number available at our T-75 or a realizable betting price.

## Power and interpretation

At n=2,574, the independent-game standard error under 50% is 0.9855 percentage points. A two-sided, 5% equal-tailed exact binomial test of 50% has 66.49% power at a true 52.38%, 85.43% at 53%, and 99.90% at 55%; 80% power begins at 52.790%. A separate test against illustrative -110 break-even (52.381%) has 75.23% power at a true 55%, and needs 55.157% for 80% power. Those prices are illustrative, not observed execution.

No examined season or disagreement bucket has a Wilson lower bound above 52.38%. Some have lower bounds above 50%; directional chance and priced break-even are distinct. The pooled interval includes both 50% and 52.38%. This is no demonstrated edge, not proof of no edge, and does not justify excluding every possible subset or a small economic advantage. Independent-game assumptions and unadjusted subset intervals are descriptive; dependence would weaken the effective power.

Independent illustration: 1,000,000 simulated forecasts and outcomes with independent centered normal deviations from the same line, seed 20260920, cover 49.9701%. Expected coverage is exactly 50%. The user’s 49.9% illustration is preserved as user-reported; its exact seed/sample/noise model was not supplied. Neither simulation estimates the actual engine’s latent skill.

## current_HFA: team MAE 7.575629

Series: `work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json`. SHA256: `66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f`.

### CLOSE spread

Pooled: 1301/2574 · 50.54% [48.61, 52.47].

| Season | Correct / scored · rate [95% interval] |
|---|---|
| 2016 | 123/251 · 49.00% [42.88, 55.16] |
| 2017 | 112/248 · 45.16% [39.09, 51.38] |
| 2018 | 127/247 · 51.42% [45.21, 57.58] |
| 2019 | 143/246 · 58.13% [51.89, 64.12] |
| 2020 | 144/256 · 56.25% [50.13, 62.19] |
| 2021 | 141/268 · 52.61% [46.64, 58.51] |
| 2022 | 133/261 · 50.96% [44.92, 56.96] |
| 2023 | 111/258 · 43.02% [37.13, 49.12] |
| 2024 | 138/268 · 51.49% [45.53, 57.41] |
| 2025 | 129/271 · 47.60% [41.73, 53.54] |

| Disagreement in points | Correct / scored · rate [95% interval] |
|---|---|
| [0, 1) | 310/616 · 50.32% [46.39, 54.26] |
| [1, 2) | 252/484 · 52.07% [47.62, 56.48] |
| [2, 3) | 236/455 · 51.87% [47.28, 56.42] |
| [3, 4) | 185/381 · 48.56% [43.58, 53.56] |
| [4, 5) | 117/262 · 44.66% [38.76, 50.71] |
| [5, 6) | 84/151 · 55.63% [47.66, 63.32] |
| [6, 7) | 51/106 · 48.11% [38.84, 57.52] |
| [7, 8) | 22/41 · 53.66% [38.75, 67.94] |
| [8, 9) | 18/28 · 64.29% [45.83, 79.29] |
| [9, 10) | 11/18 · 61.11% [38.62, 79.69] |
| [10, 11) | 6/11 · 54.55% [28.01, 78.73] |
| [11, 12) | 5/8 · 62.50% [30.57, 86.32] |
| [12, 13) | 3/6 · 50.00% [18.76, 81.24] |
| [13, 14) | 1/3 · 33.33% [6.15, 79.23] |
| [14, 15) | 0/1 · 0.00% [0.00, 79.35] |
| [16, 17) | 0/2 · 0.00% [0.00, 65.76] |
| [19, 20) | 0/1 · 0.00% [0.00, 79.35] |

### CLOSE total

Pooled: 1285/2618 · 49.08% [47.17, 51.00].

| Season | Correct / scored · rate [95% interval] |
|---|---|
| 2016 | 123/255 · 48.24% [42.17, 54.35] |
| 2017 | 127/256 · 49.61% [43.54, 55.69] |
| 2018 | 116/253 · 45.85% [39.82, 52.01] |
| 2019 | 135/255 · 52.94% [46.82, 58.98] |
| 2020 | 120/251 · 47.81% [41.71, 53.97] |
| 2021 | 139/269 · 51.67% [45.72, 57.58] |
| 2022 | 127/268 · 47.39% [41.49, 53.36] |
| 2023 | 136/270 · 50.37% [44.44, 56.29] |
| 2024 | 137/269 · 50.93% [44.98, 56.85] |
| 2025 | 125/272 · 45.96% [40.13, 51.89] |

| Disagreement in points | Correct / scored · rate [95% interval] |
|---|---|
| [0, 1) | 289/578 · 50.00% [45.94, 54.06] |
| [1, 2) | 251/532 · 47.18% [42.97, 51.43] |
| [2, 3) | 219/445 · 49.21% [44.60, 53.85] |
| [3, 4) | 186/383 · 48.56% [43.60, 53.56] |
| [4, 5) | 137/261 · 52.49% [46.44, 58.47] |
| [5, 6) | 88/186 · 47.31% [40.26, 54.47] |
| [6, 7) | 52/103 · 50.49% [40.99, 59.95] |
| [7, 8) | 33/64 · 51.56% [39.58, 63.37] |
| [8, 9) | 13/28 · 46.43% [29.53, 64.19] |
| [9, 10) | 9/19 · 47.37% [27.33, 68.29] |
| [10, 11) | 6/10 · 60.00% [31.27, 83.18] |
| [11, 12) | 2/3 · 66.67% [20.77, 93.85] |
| [12, 13) | 0/4 · 0.00% [0.00, 48.99] |
| [13, 14) | 0/1 · 0.00% [0.00, 79.35] |
| [14, 15) | 0/1 · 0.00% [0.00, 79.35] |

## pre_HFA: team MAE 7.574348

Series: `work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json`. SHA256: `6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10`.

### CLOSE spread

Pooled: 1302/2574 · 50.58% [48.65, 52.51].

| Season | Correct / scored · rate [95% interval] |
|---|---|
| 2016 | 124/251 · 49.40% [43.27, 55.55] |
| 2017 | 110/248 · 44.35% [38.30, 50.58] |
| 2018 | 128/247 · 51.82% [45.61, 57.98] |
| 2019 | 143/246 · 58.13% [51.89, 64.12] |
| 2020 | 143/256 · 55.86% [49.73, 61.81] |
| 2021 | 141/268 · 52.61% [46.64, 58.51] |
| 2022 | 133/261 · 50.96% [44.92, 56.96] |
| 2023 | 111/258 · 43.02% [37.13, 49.12] |
| 2024 | 140/268 · 52.24% [46.27, 58.15] |
| 2025 | 129/271 · 47.60% [41.73, 53.54] |

| Disagreement in points | Correct / scored · rate [95% interval] |
|---|---|
| [0, 1) | 317/622 · 50.96% [47.04, 54.88] |
| [1, 2) | 252/489 · 51.53% [47.11, 55.93] |
| [2, 3) | 229/446 · 51.35% [46.71, 55.95] |
| [3, 4) | 189/386 · 48.96% [44.01, 53.94] |
| [4, 5) | 113/256 · 44.14% [38.19, 50.27] |
| [5, 6) | 86/152 · 56.58% [48.63, 64.20] |
| [6, 7) | 50/106 · 47.17% [37.93, 56.60] |
| [7, 8) | 23/42 · 54.76% [39.95, 68.78] |
| [8, 9) | 18/26 · 69.23% [50.01, 83.50] |
| [9, 10) | 10/17 · 58.82% [36.01, 78.39] |
| [10, 11) | 6/11 · 54.55% [28.01, 78.73] |
| [11, 12) | 5/8 · 62.50% [30.57, 86.32] |
| [12, 13) | 3/6 · 50.00% [18.76, 81.24] |
| [13, 14) | 1/3 · 33.33% [6.15, 79.23] |
| [14, 15) | 0/1 · 0.00% [0.00, 79.35] |
| [16, 17) | 0/1 · 0.00% [0.00, 79.35] |
| [17, 18) | 0/1 · 0.00% [0.00, 79.35] |
| [19, 20) | 0/1 · 0.00% [0.00, 79.35] |

### CLOSE total

Pooled: 1285/2618 · 49.08% [47.17, 51.00].

| Season | Correct / scored · rate [95% interval] |
|---|---|
| 2016 | 123/255 · 48.24% [42.17, 54.35] |
| 2017 | 127/256 · 49.61% [43.54, 55.69] |
| 2018 | 116/253 · 45.85% [39.82, 52.01] |
| 2019 | 135/255 · 52.94% [46.82, 58.98] |
| 2020 | 120/251 · 47.81% [41.71, 53.97] |
| 2021 | 138/269 · 51.30% [45.35, 57.21] |
| 2022 | 128/268 · 47.76% [41.85, 53.73] |
| 2023 | 136/270 · 50.37% [44.44, 56.29] |
| 2024 | 137/269 · 50.93% [44.98, 56.85] |
| 2025 | 125/272 · 45.96% [40.13, 51.89] |

| Disagreement in points | Correct / scored · rate [95% interval] |
|---|---|
| [0, 1) | 287/577 · 49.74% [45.68, 53.81] |
| [1, 2) | 252/532 · 47.37% [43.16, 51.61] |
| [2, 3) | 221/447 · 49.44% [44.83, 54.06] |
| [3, 4) | 187/385 · 48.57% [43.62, 53.55] |
| [4, 5) | 137/260 · 52.69% [46.63, 58.68] |
| [5, 6) | 87/185 · 47.03% [39.97, 54.21] |
| [6, 7) | 51/102 · 50.00% [40.47, 59.53] |
| [7, 8) | 33/64 · 51.56% [39.58, 63.37] |
| [8, 9) | 13/28 · 46.43% [29.53, 64.19] |
| [9, 10) | 10/19 · 52.63% [31.71, 72.67] |
| [10, 11) | 6/11 · 54.55% [28.01, 78.73] |
| [11, 12) | 1/2 · 50.00% [9.45, 90.55] |
| [12, 13) | 0/4 · 0.00% [0.00, 48.99] |
| [13, 14) | 0/1 · 0.00% [0.00, 79.35] |
| [14, 15) | 0/1 · 0.00% [0.00, 79.35] |

## Status and verification

Recompute: `/opt/anaconda3/bin/python3.12 -B scripts/reference_metric_preflight.py`. Row-level scoring, source hashes, both interval methods and power assumptions are in reproduction.json. Source qualification receipts and coverage are adjacent. Forecast/model files were not edited; this reporting-only preflight is not imported by production. Requested weekly and every-experiment integration remains pending lineage reconciliation.

Least sure of: which nfelo output file represents the intended opening spread. This changed the plan: preserve the existing reference source, pin both snapshots, report the disagreement, and make no claim that OPEN equals our executable issuance line.

Confidence: near-total — the central claim that supplied counts belong to pre-HFA rather than released HFA is arithmetic on verified rows. Move down to high if an independent recomputation invalidates a source hash or the line-sign convention. The interpretation of economic edge remains limited by the explicitly stated power and price assumptions.
