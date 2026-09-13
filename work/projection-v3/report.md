# Projection v3 qualification

Experiment: `projection-v3-b7a84dbe-2b5d9d0f`. [Immutable experiment](experiment-ff50930b74f40a69b9a2de61669fdac211ad782b508428b2ffc12580faf964be.json). Zero Odds API credits.

## Decision
Adaptive release check: **PASS**. Retained optional groups: **calibration**.

Feature admission is a registered development rule, not a multiplicity-adjusted statistical superiority claim. These historical games were available during earlier v1 work; no untouched holdout is claimed.

## Paired comparison

| Target | Raw football baseline MAE | Adaptive v3 MAE | Improvement |
|---|---:|---:|---:|
| team_points | 8.0034 | 7.7613 | +0.2422 |
| margin | 10.5890 | 10.3772 | +0.2118 |
| total | 11.6104 | 11.1898 | +0.4206 |

Paired games: 2639. Team-MAE improvement 95% week-block interval: [0.1899, 0.3200] points. One-sided 95% lower bound: 0.2006.

## Per-season forecasts and prior-error intervals

MAE columns show team / margin / total. Sigma uses unrounded forecast errors. Interval coverage uses prior seasons only. * means outside nominal by more than 3 percentage points.

| Season | Games | Baseline MAE | V3 MAE | V3 sigma | Margin 50 / 80 | Total 50 / 80 | Prior error years |
|---|---:|---|---|---|---|---|---|
| 2016 | 256 | 7.75 / 9.87 / 11.52 | 7.75 / 9.87 / 11.52 | 9.07 / 12.36 / 13.01 | N/R | N/R | none |
| 2017 | 256 | 8.30 / 11.21 / 12.03 | 8.30 / 11.21 / 12.03 | 10.12 / 14.11 / 14.33 | 48.0% / 75.4%* | 49.2% / 76.6%* | 2016–2016 |
| 2018 | 256 | 8.26 / 10.60 / 11.98 | 8.26 / 10.60 / 11.98 | 10.14 / 13.85 / 14.66 | 53.9%* / 79.7% | 55.5%* / 81.2% | 2016–2017 |
| 2019 | 256 | 8.08 / 10.88 / 11.86 | 7.57 / 10.45 / 10.99 | 9.61 / 13.27 / 13.73 | 49.6% / 75.8%* | 46.9%* / 78.9% | 2016–2018 |
| 2020 | 256 | 8.24 / 10.29 / 12.13 | 7.57 / 9.92 / 11.07 | 9.35 / 12.76 / 13.70 | 50.4% / 82.8% | 48.8% / 80.1% | 2016–2019 |
| 2021 | 272 | 8.41 / 11.69 / 11.72 | 8.15 / 11.26 / 11.63 | 9.85 / 14.20 / 13.58 | 50.4% / 77.6% | 50.0% / 82.4% | 2016–2020 |
| 2022 | 271 | 7.34 / 9.38 / 10.98 | 7.25 / 9.20 / 11.13 | 9.10 / 11.88 / 13.67 | 56.5%* / 85.6%* | 48.3% / 76.4%* | 2016–2021 |
| 2023 | 272 | 7.85 / 10.85 / 11.06 | 7.60 / 10.57 / 10.63 | 9.64 / 13.60 / 13.44 | 54.0%* / 78.3% | 51.5% / 82.0% | 2016–2022 |
| 2024 | 272 | 7.83 / 10.57 / 11.09 | 7.62 / 10.45 / 10.09 | 9.45 / 13.54 / 13.08 | 54.8%* / 80.1% | 57.4%* / 84.2%* | 2016–2023 |
| 2025 | 272 | 8.01 / 10.55 / 11.83 | 7.57 / 10.25 / 10.92 | 9.41 / 12.82 / 13.64 | 52.9% / 83.5%* | 46.7%* / 82.7% | 2016–2024 |

## Feature decisions for future games

| Group | Test seasons | Standalone MAE gain | Decision |
|---|---:|---:|---|
| calibration | 10 | 3.60% | RETAINED |
| career_kicking | 10 | -0.08% | INACTIVE: FAILED_USEFULNESS_GATE |
| efficiency | 10 | 1.14% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| elo | 10 | 1.95% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| explosiveness | 10 | 0.09% | INACTIVE: FAILED_USEFULNESS_GATE |
| kicking | 10 | -0.09% | INACTIVE: FAILED_USEFULNESS_GATE |
| momentum | 10 | 0.01% | INACTIVE: FAILED_USEFULNESS_GATE |
| pace | 10 | 1.50% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| passing | 10 | 1.00% | INACTIVE: FAILED_USEFULNESS_GATE |
| pressure | 10 | 0.26% | INACTIVE: FAILED_USEFULNESS_GATE |
| pythagorean | 10 | 1.37% | REMOVED: conditional FAILED_USEFULNESS_GATE |
| quarterback | 10 | 1.04% | REMOVED: conditional FAILED_USEFULNESS_GATE |
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

Verification: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v3_replay.py --verify`

Full offline qualification replay: `OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/projection_v3_replay.py --replay`

Least sure: whether a group improved the forecast or merely duplicated another input. Refitted conditional ablations determine the retained set; WHY uses grouped measured contributions and a distinct strongest opposing term.

## Requested personnel and pressure inputs

QB, pressure and kicker measurements are now implemented. QB passed the marginal screen (1.039% team-MAE gain), but failed conditional elimination (-0.259%). Pressure failed the marginal screen (0.262%, below 0.5%, and total MAE worsened). Career kicking failed (-0.0756% team gain). Continuity/referee remain zero. Elo also narrowly failed the conditional 0.5% gate (0.4815%) in the expanded candidate set; simultaneous removal follows the registered protocol. The future fit retains only calibration on the mandatory PPD/pace baseline.

### Prior v2 comparison

| Target | V2 adaptive MAE | V3 adaptive MAE |
|---|---:|---:|
| team_points | 7.719819 | 7.761273 |
| margin | 10.343090 | 10.377207 |
| total | 11.124292 | 11.189789 |

V3 passes the raw-baseline gate; it is worse than v2 on these historical metrics. Neither record is a fresh untouched holdout.

### Source qualification and missing evidence

Kicker IDs existed in raw PBP; the previous feature code explicitly forced career bands to null because it only had team aggregates. New career ledgers follow selected kicker IDs across teams, including postseason and garbage time, using only earlier games. Zero-attempt bands stay null. Careers crossing the 1999 boundary are flagged and unavailable rather than mislabeled complete. Career QB starts use the first-dropback proxy, not an official starts feed. Backup means replacement of the historical team incumbent, not an official injury designation.

Historical weekly charts (2009–2024) lack proven original issuance. Timestamped charts are filtered strictly before T75; current receipt also must precede T75. Injury files contain no explicit replacement-starter field, so no injury override was fabricated. The prior-game fallback is flagged row by row. Current-game schedule QB IDs are not used. All sources were hashed; public downloads used no Odds API credits.

Pressure uses the literal qb_hit+sack sum. Most seasons contain overlapping hit/sack flags, so this is a weighted event proxy, not the fraction of distinct pressured plays. The audit records overlap per season. The absence of overlap in 2003–2005 warrants source-coding caution; those years do not enter the 2015–2025 pressure features used by this fit.

### Input coverage

Counts are measured team-game rows; missing input values contribute zero correction, not a measured zero.

| Season | Team rows | QB EPA / CPOE / starts / backup | Pressure generated / allowed | Career FG short / medium / long |
|---|---:|---|---|---|
| 2016 | 512 | 507 / 507 / 512 / 512 | 512 / 512 | 474 / 478 / 473 |
| 2017 | 512 | 509 / 509 / 512 / 512 | 512 / 512 | 472 / 467 / 451 |
| 2018 | 512 | 509 / 509 / 512 / 512 | 512 / 512 | 479 / 478 / 458 |
| 2019 | 512 | 511 / 511 / 512 / 512 | 512 / 512 | 491 / 492 / 472 |
| 2020 | 512 | 508 / 508 / 512 / 512 | 512 / 512 | 507 / 495 / 490 |
| 2021 | 544 | 540 / 540 / 544 / 544 | 544 / 544 | 533 / 518 / 512 |
| 2022 | 542 | 541 / 541 / 542 / 542 | 542 / 542 | 541 / 537 / 538 |
| 2023 | 544 | 541 / 541 / 544 / 544 | 544 / 544 | 535 / 529 / 534 |
| 2024 | 544 | 538 / 537 / 544 / 544 | 544 / 544 | 535 / 527 / 513 |
| 2025 | 544 | 539 / 538 / 544 / 544 | 544 / 544 | 530 / 529 / 522 |

### Probability diagnosis

V2 margin residual mean/median: +1.5305/+1; home tie-split share at equal scores: 54.57%. V3: +1.5430/+1, 54.51%. The stored residuals are not centered; rounding the projected margin creates probability steps. Mean point estimates therefore disagree with residual-based winner direction near zero. The field includes half of modeled tie mass, so it is not outright P(win). The reader now labels tie splitting, and new conflicting cards carry an explicit disagreement note. No recentering, symmetrization, score adjustment or probability-method change was made.

[BAL–IND ranked contribution report](BAL-IND.md). Full counts and numeric audit: audit-70d04aa9e993b9595a3aa255c4834876af218f2fafa92648b3c2b10c5a37d53c.json.

Source documentation: [nflfastR fields](https://nflfastr.com/reference/fast_scraper.html), [nflverse update and depth-chart availability](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).
