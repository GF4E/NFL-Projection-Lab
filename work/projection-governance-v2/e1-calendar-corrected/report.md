SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

**REVIEW REQUESTED (nonblocking):** C06 Linear decay clock on exceptional schedules, C11 Reference schedule and steady-state diagnostic, C12 Preseason injection cross-covariances, C25 Completion evidence precision and substitutes. Decisions and untested alternatives: [preregistration addendum](PREREGISTRATION-ADDENDUM.md).

- C06: Retain the corrected implementation: elapsed scheduled assimilation cutoffs from the first forecast cutoff of a season advance the existing linear decay; freeze that weight inside an interval. **Alternative not taken:** Use the forecast game NFL-week label for decay even when two games share one interval. This could change control predictions and conflicts with the frozen-state interpretation.
- C11: Retain registered symmetric 32 virtual team-versus-league games and posterior P0; diagonal KH gains and offense/defense half-lives remain diagnostics. **Alternative not taken:** A rotating 16-real-matchup reference schedule. Not evaluated; would require an explicit protocol correction if reviewers establish the retained construction is wrong.
- C12: Retain registered C[D P0 D]C congruence with sqrt(2) on flagged components, then the registered lambda transition. **Alternative not taken:** Add flagged diagonal variance alone before projection. Not tested; it changes cross-covariances and could change forecasts.
- C25: Resolved by binding user instruction: played kickoff plus four hours is assimilation availability; no actual completion clock is used. **Alternative not taken:** The previous exact-completion requirement was superseded; no estimated physical completion time is asserted.

# E1 — Early-season updating rule

Decision: **NO_CHALLENGER_CLEARS_GATE**. Live method remains linear. No automatic promotion.

Preregistration: `a48e85241a47301ff3e462af70db6171c7c0edd750a67ac878ebe2b4411f1e62`; registered 2026-09-16T18:52:19.288870+00:00; first comparative result 2026-09-16T19:59:54.430668+00:00.
2639 paired regular-season games, 2016–2025. This is reused historical development evidence, not an untouched holdout.

## Gate table

| Candidate | Team MAE | Change vs control | Margin MAE | Total MAE | Margin 50 / 80 coverage | Total 50 / 80 coverage | Numeric gate |
|---|---:|---:|---:|---:|---|---|---|
| linear | 7.5716 | control | 10.2462 | 10.8749 | 50.25% / 79.54% | 50.66% / 80.07% | — |
| k4 | 7.5860 | -0.19% | 10.2552 | 10.9055 | 50.28% / 79.35% | 50.59% / 79.77% | FAIL |
| k8 | 7.6010 | -0.39% | 10.2662 | 10.9301 | 50.44% / 79.61% | 50.28% / 79.54% | FAIL |
| state_space | 7.5724 | -0.01% | 10.2486 | 10.8443 | 50.36% / 79.58% | 50.17% / 80.07% | FAIL |

Gate: at least 1% lower team MAE and all four margin/total coverage rates within 3 percentage points of nominal. Intervals and probabilities use each candidate’s own previous-three-season paired OOF residuals. No E2 post-processing was fitted.

## Paired uncertainty

| Candidate | 95% interval for control minus challenger team MAE |
|---|---|
| k4 | [-0.0236, -0.0051] |
| k8 | [-0.0440, -0.0142] |
| state_space | [-0.0202, 0.0197] |

2,000 fixed-seed resamples of four-week blocks within season. Both team errors remain together in each game. These are descriptive development intervals, not multiplicity-adjusted discovery claims.

## Annual team MAE

| Season | Linear | k4 | k8 | State space |
|---|---:|---:|---:|---:|
| 2016 | 7.1484 | 7.1478 | 7.1607 | 7.1526 |
| 2017 | 7.7996 | 7.8408 | 7.8623 | 7.8618 |
| 2018 | 7.8702 | 7.8505 | 7.8572 | 7.7973 |
| 2019 | 7.5204 | 7.5311 | 7.5513 | 7.5116 |
| 2020 | 7.5584 | 7.5546 | 7.5896 | 7.6296 |
| 2021 | 7.9869 | 8.0062 | 8.0189 | 7.9603 |
| 2022 | 7.2685 | 7.3113 | 7.3266 | 7.2270 |
| 2023 | 7.6193 | 7.6235 | 7.6345 | 7.6453 |
| 2024 | 7.3758 | 7.4068 | 7.4149 | 7.4065 |
| 2025 | 7.5699 | 7.5865 | 7.5942 | 7.5362 |

## Weeks 1–4

| Candidate | Team MAE | Margin MAE | Total MAE |
|---|---:|---:|---:|
| k4 | 7.5867 | 10.0468 | 11.2665 |
| k8 | 7.5830 | 10.0246 | 11.2823 |
| linear | 7.5935 | 10.0658 | 11.2431 |
| state_space | 7.5811 | 10.0214 | 11.2189 |

## Verification and compression

| Candidate | Target | Projected / actual SD | Skill vs league climatology | Skill vs persistence | CRPS |
|---|---|---|---:|---:|---:|
| k4 | team | 2.979 / 9.967 | 0.0856 | 0.1598 | 5.3634 |
| k4 | margin | 5.531 / 14.207 | 0.1424 | 0.1675 | 7.3508 |
| k4 | total | 2.214 / 13.873 | 0.0254 | 0.1525 | 7.7247 |
| k8 | team | 2.947 / 9.967 | 0.0822 | 0.1566 | 5.3792 |
| k8 | margin | 5.520 / 14.207 | 0.1406 | 0.1658 | 7.3582 |
| k8 | total | 2.065 / 13.873 | 0.0201 | 0.1479 | 7.7602 |
| linear | team | 3.002 / 9.967 | 0.0894 | 0.1632 | 5.3489 |
| linear | margin | 5.563 / 14.207 | 0.1446 | 0.1697 | 7.3430 |
| linear | total | 2.259 / 13.873 | 0.0307 | 0.1571 | 7.6908 |
| state_space | team | 2.978 / 9.967 | 0.0900 | 0.1638 | 5.3628 |
| state_space | margin | 5.606 / 14.207 | 0.1437 | 0.1688 | 7.3462 |
| state_space | total | 2.013 / 13.873 | 0.0329 | 0.1590 | 7.7234 |

Full weekly dispersion, skill versus league/last-season-team/persistence, PIT bin counts, interval scores and winner Brier/reliability are in `verification.json`. Forecast SD is audited beside actual SD, not forced to equal noisy realized-score dispersion.

![Weekly dispersion](weekly-dispersion.png)

![PIT histograms](pit-histograms.png)

## State fit parameters

| Fold | q | r | lambda | rho | P0 offense / defense diagonal | Half-life offense / defense | Riccati iterations / converged | Bound hits | Games / 3 optimized / 4 including rho |
|---|---:|---:|---:|---:|---|---|---|---|---|
| 2013 | 0.007278 | 0.846293 | 0.500000 | -0.038278 | 0.073118 / 0.073118 | 7.480 / 7.480 | 106 / True | none | 256 / 85.3 / 64.0 |
| 2014 | 0.006912 | 0.787452 | 0.700000 | 0.022184 | 0.068727 / 0.068727 | 7.413 / 7.413 | 104 / True | none | 512 / 170.7 / 128.0 |
| 2015 | 0.004517 | 0.843960 | 0.873505 | -0.007640 | 0.058112 / 0.058112 | 9.486 / 9.486 | 130 / True | none | 768 / 256.0 / 192.0 |
| 2016 | 0.004545 | 0.822780 | 0.590240 | 0.009694 | 0.057528 / 0.057528 | 9.340 / 9.340 | 128 / True | none | 1024 / 341.3 / 256.0 |
| 2017 | 0.004119 | 0.796661 | 0.537207 | 0.020087 | 0.053953 / 0.053953 | 9.654 / 9.654 | 132 / True | none | 1280 / 426.7 / 320.0 |
| 2018 | 0.003813 | 0.816408 | 0.471624 | 0.029783 | 0.052640 / 0.052640 | 10.157 / 10.157 | 138 / True | none | 1536 / 512.0 / 384.0 |
| 2019 | 0.003734 | 0.823329 | 0.498407 | 0.038027 | 0.052342 / 0.052342 | 10.305 / 10.305 | 140 / True | none | 1792 / 597.3 / 448.0 |
| 2020 | 0.003733 | 0.823995 | 0.533420 | 0.033559 | 0.052355 / 0.052355 | 10.312 / 10.312 | 140 / True | none | 2048 / 682.7 / 512.0 |
| 2021 | 0.004129 | 0.825764 | 0.531160 | 0.036525 | 0.055024 / 0.055024 | 9.816 / 9.816 | 134 / True | none | 2304 / 768.0 / 576.0 |
| 2022 | 0.003796 | 0.846419 | 0.550854 | 0.029644 | 0.053521 / 0.053521 | 10.364 / 10.364 | 141 / True | none | 2576 / 858.7 / 644.0 |
| 2023 | 0.003764 | 0.840707 | 0.524865 | 0.041509 | 0.053112 / 0.053112 | 10.372 / 10.372 | 141 / True | none | 2847 / 949.0 / 711.8 |
| 2024 | 0.003512 | 0.847149 | 0.552597 | 0.037083 | 0.051564 / 0.051564 | 10.779 / 10.779 | 146 / True | none | 3119 / 1039.7 / 779.8 |
| 2025 | 0.003729 | 0.845371 | 0.538121 | 0.035405 | 0.053028 / 0.053028 | 10.449 / 10.449 | 142 / True | none | 3391 / 1130.3 / 847.8 |
| 2026 | 0.003798 | 0.848642 | 0.542515 | 0.036267 | 0.053604 / 0.053604 | 10.375 / 10.375 | 141 / True | none | 3663 / 1221.0 / 915.8 |

The 2026 row is the current-season counterfactual fit, trained through 2025 only. Half-life is a steady-state approximation for an uninterrupted weekly reference schedule, not an empirical universal team-memory parameter. The filter optimizes three quantities and estimates rho from a fixed training-only pilot; 63 constrained latent states are also tracked. k4/k8 add no estimated parameters. All methods retain the existing four ridge coefficients including intercept; filter parameter counts are additional to those.

The 2013 and 2014 calibration-only training records contain no effective preseason transition after the mandated 2013 reset; lambda is not separately identified in those pilot fits. The optimizer coordinate is reported without claiming otherwise. Scored 2016–2025 folds have prior preseason transitions.

## Staff data addition and limitations

`config/staff_history.json` SHA-256: `8b71ca973cc221af582c94062a224d553fa54a1bf8b0b0fb0b8e003a549f5efa`.

| Season | Team-seasons | HC | OC | DC | QB1 | Known QB1 changes |
|---|---:|---:|---:|---:|---:|---:|
| 2013 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2014 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2015 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2016 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2017 | 32 | 0 | 0 | 0 | 30 | 30 |
| 2018 | 32 | 0 | 0 | 0 | 32 | 30 |
| 2019 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2020 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2021 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2022 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2023 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2024 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2025 | 32 | 0 | 0 | 0 | 32 | 32 |
| 2026 | 32 | 0 | 0 | 0 | 32 | 32 |

PFR returned HTTP 403 for season/coaching-history probes. All 448 HC/OC/DC team-season records remain explicitly unknown, with source URLs and null retrieval timestamps; a successful coaching extraction is **not** claimed. MIA/TB 2017 did not have a Week 1 starter observation. Unknown coach changes read false independently; known QB1 changes still double preseason variance. `staff-coverage.json` enumerates every unknown team-season. No continuity weights, GM/roster fields, or PFF data were added to the model.

## Current-season issued-game comparison

AS_ISSUED baseline games; challenger forecasts are retrospective counterfactuals, not originally issued.

| Forecast | Games | Team MAE | Margin MAE | Total MAE |
|---|---:|---:|---:|---:|
| issued | 14 | 8.4277 | 11.6026 | 12.1067 |
| k4 | 14 | 8.6959 | 12.4179 | 11.8315 |
| k8 | 14 | 8.7353 | 12.4251 | 11.9274 |
| linear | 14 | 8.7085 | 12.4099 | 11.8669 |
| state_space | 14 | 8.8505 | 12.2632 | 12.1653 |

Only immutable AS_ISSUED contribution inputs are used for challenger counterfactuals. Original forecasts/grades are untouched. The two retrospective Week 1 games are excluded. All candidate fitting stops at 2025. Replay-linear follows the registered expanding-history refit and can differ from the originally issued version. Compare challengers with replay-linear to isolate the method comparison; originally issued scores remain a separate reference. Per-game before/after scores are in `current-season.json`.

## Governance and release

Phase A remains exploratory and does not count as E2. E2 is Week 3, separately registered against E1’s promoted method or the retained linear control. The computed decision is reported in the gate table; numerical output cannot activate a method or override an incomplete evidence audit. Two reviewer responses have not been received; none is fabricated. No release approval is claimed. This experiment cannot activate a method.

Gate replay: 644.6 seconds, peak process RSS 908.1 MiB, one BLAS worker. Cached fits and OOF outputs are retained; this report renderer never refits.

Least certain: the nondiagonal reference covariance and team-specific preseason injection. Their exact reference equations and PSD scaling were recorded before results; invariance, convergence, and known-strength recovery were tested.

## Extreme-game sensitivity (diagnostic only)

| Candidate | Leave-one-game-out improvement range | Omitted game at minimum / maximum |
|---|---|---|
| k4 | -0.0019999453167485193 to -0.00184421777652366 | 2021_06_BUF_TEN / 2020_09_SEA_BUF |
| k8 | -0.0039973306497838035 to -0.0037865609565241876 | 2021_06_BUF_TEN / 2020_09_SEA_BUF |
| state_space | -0.0002540868230922477 to 3.462551985133899e-05 | 2020_06_CHI_CAR / 2020_05_PHI_PIT |

Both teams remain paired. This diagnostic never changes eligibility, candidate selection or the release gate.

## Calendar correction and affected forecasts

All four candidates use the identical fixed played-kickoff-plus-four-hours convention. nflverse clock fields are Eastern regardless of venue and are converted to UTC. Four hours is an authorized availability convention, not a universal upper bound on physical game duration. No completion timestamp was invented or required; no registered game was dropped.

| Season | Games audited | Forecasts with changed available history |
|---|---:|---:|
| 2016 | 256 | 0 |
| 2017 | 256 | 0 |
| 2018 | 256 | 0 |
| 2019 | 256 | 0 |
| 2020 | 256 | 47 |
| 2021 | 272 | 18 |
| 2022 | 271 | 0 |
| 2023 | 272 | 0 |
| 2024 | 272 | 0 |
| 2025 | 272 | 0 |

Affected means a changed incorporated historical-game-ID set relative to the invalidated week-label replay; numerical downstream propagation is separate. Source-event IDs and each forecast dependency set are preserved in calendar-audit.json and calendar-lineage.json.gz.
Minimum gap from the four-hour availability mark to its next assimilation cutoff: 6.67 hours. This schedule check does not measure actual end times.

The earlier numerical rejection remains withdrawn and preserved. This corrected run is the first valid E1 result only after its independent audits pass.

## Final independent audit

PASS: `audit.json` independently reproduced paired metrics and candidate-specific calibration, verified preregistration and protected hashes, and confirmed unchanged live fit, frozen projections, grades and Phase A. `validity.json` records this run as FIRST_VALID_E1_RESULT. 312 tests passed; paid provider credits: 0. See REVIEW-PACKET.md for the four convention flags and outstanding reviewer responses.
