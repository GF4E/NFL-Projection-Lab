SERIES NOTICE: The engine uses the sole authoritative deployed-lineage control; the v3 baseline is SUPERSEDED and nfelo/closing lines are external, non-authoritative benchmark comparators.

# E-BENCHMARK-GAP — descriptive result, no fitting

**Next experiment question: E-QB-CHANGE — handling games with a changed starting quarterback. No model candidates or fitted changes are specified or admitted by this report.**

The correct deployed control reduces the audit’s apparent nfelo gap substantially. First-source-row audit reconstruction exactly reproduces the quoted baseline 10.563, nfelo 10.041 and closing line 9.787, but the deployed lineage is 10.265. Gap to nfelo: 0.224 points, about 2.18% of deployed margin MAE, versus 0.522 using the stale baseline.

## Population reconciliation

The 2021–2025 deployed set has 1359 games. nfelo is absent on 182; seven IDs are duplicated, with three conflicting predictions. Existing preregistered duplicate policy excludes all seven from primary scoring: 1170 games. The audit’s 1177 is reproduced separately under both first- and last-source-row duplicate choices, neither chosen by accuracy. Both round to nfelo 10.041. All included and excluded IDs and every forecast/error are saved.

| Comparison | Games | Deployed margin MAE | nfelo pre-regression | Closing line | Superseded baseline |
|---|---:|---:|---:|---:|---:|
| Primary unique IDs | 1170 | 10.249234 | 10.022606 | 9.774786 | 10.555918 |
| first_source_row | 1177 | 10.265433 | 10.041163 | 9.787171 | 10.563008 |
| last_source_row | 1177 | 10.265433 | 10.040738 | 9.787171 | 10.563008 |

## Where the primary gap opens

Paired excess loss = deployed absolute margin error minus comparator error. Positive values favor the comparator. Shares are signed shares of pooled excess loss; dimensions overlap and must not be added together. These are descriptive reused-data comparisons, not causal estimates or promotion gates.

### favorite_band

| Bucket | Games | Deployed MAE | nfelo MAE | Gap/game | Share of nfelo excess loss | Closing gap/game |
|---|---:|---:|---:|---:|---:|---:|
| 14+ | 13 | 12.980 | 10.989 | +1.991 | 9.8% | +2.980 |
| 3–<7 | 465 | 10.213 | 10.108 | +0.105 | 18.4% | +0.268 |
| 7–<14 | 225 | 11.464 | 10.925 | +0.540 | 45.8% | +0.782 |
| <3 | 467 | 9.624 | 9.476 | +0.148 | 26.1% | +0.462 |

### qb_change

| Bucket | Games | Deployed MAE | nfelo MAE | Gap/game | Share of nfelo excess loss | Closing gap/game |
|---|---:|---:|---:|---:|---:|---:|
| CHANGED | 276 | 10.359 | 9.709 | +0.649 | 67.6% | +0.707 |
| UNCHANGED | 894 | 10.215 | 10.119 | +0.096 | 32.4% | +0.403 |

### roof

| Bucket | Games | Deployed MAE | nfelo MAE | Gap/game | Share of nfelo excess loss | Closing gap/game |
|---|---:|---:|---:|---:|---:|---:|
| DOME | 312 | 10.280 | 10.159 | +0.121 | 14.3% | +0.448 |
| OUTDOOR | 858 | 10.238 | 9.973 | +0.265 | 85.7% | +0.484 |

### season

| Bucket | Games | Deployed MAE | nfelo MAE | Gap/game | Share of nfelo excess loss | Closing gap/game |
|---|---:|---:|---:|---:|---:|---:|
| 2021 | 224 | 11.170 | 10.705 | +0.465 | 39.3% | +0.427 |
| 2022 | 238 | 9.173 | 8.763 | +0.410 | 36.8% | +0.486 |
| 2023 | 238 | 10.667 | 10.382 | +0.285 | 25.6% | +0.631 |
| 2024 | 239 | 10.211 | 10.287 | -0.075 | -6.8% | +0.377 |
| 2025 | 231 | 10.074 | 10.015 | +0.059 | 5.1% | +0.448 |

### week_band

| Bucket | Games | Deployed MAE | nfelo MAE | Gap/game | Share of nfelo excess loss | Closing gap/game |
|---|---:|---:|---:|---:|---:|---:|
| 1–5 | 343 | 10.393 | 10.213 | +0.180 | 23.3% | +0.404 |
| 6+ | 827 | 10.190 | 9.944 | +0.246 | 76.7% | +0.503 |

## Interpretation and next question

- Observed QB-change games: 276/1170 (23.6%) carry 67.6% of the excess loss versus nfelo. Gap is +0.649 points/game versus +0.096 for unchanged starters. The QB-change gap is positive in all five seasons. In 2022, however, unchanged starters have the larger gap; this is not a universal mechanism.
- Favorite magnitude 7–<14 carries 45.8% of the gap on 225 games. Its QB-change subset has +1.434 gap/game (46 games), versus +0.310 with unchanged starters. In <3-point games the QB-change gap is +0.730 versus -0.033 unchanged. The 14+ band has only 13 games and is too small to drive a standalone conclusion.
- Outdoor games carry 85.7% of the gap on 73.3% of games; this concentration is weaker than QB changes. The later-week band has +0.246 gap/game versus +0.180 early, giving no clear early-season-only diagnosis.
- Seasons 2021–2023 carry essentially all net gap; the engine slightly outperforms nfelo in 2024 and is close in 2025. This limits confidence that the historical gap is persistent today.

Name E-QB-CHANGE as the next experiment question. Before candidate design, qualify pregame starter identification, replacement value and information cutoffs. The observed-starter diagnostic alone does not qualify an input, establish causality, or justify changing a weight. No fitting and no candidates were created.

## Source and timing qualifications

REVIEW REQUESTED — QB flags use observed nflverse starter IDs versus the previous played REG game, including the previous season. All 1170 matched games have sufficient IDs under that definition (zero UNKNOWN); this is retrospective descriptive coverage, not 100% pregame-confirmed availability. No missing starter was inferred.

REVIEW REQUESTED — the nfelo field is pre-regression, not verified football-only. The pinned repository’s Nfelo.py passes closing lines into rating-update calculations and uses external priors before projection; bypassing final market blending does not establish market-free ancestry. The CSV also spans model versions and does not prove matched T-75 inputs. Source inspection: https://github.com/greerreNFL/nfelo/blob/3425a6a9c304639f9e7c110cf4a0a79b92ad5b89/nfelo/Model/Nfelo.py (project_game and process_game). No upstream implementation code copied or executed.

Closing lines are benchmark-only. No market value entered our projection, historical replay, or model fit. The study imports no fitting module.

The standard errors saved in results.json are descriptive game-level quantities, not multiple-comparison-adjusted significance or a promotion test.

Artifacts: registration.json/.sha256, per-game.json, excluded-games.json, audit-first_source_row-per-game.json, audit-last_source_row-per-game.json, audit-reconstruction.json, qb-cross-tabs.json and results.json.
